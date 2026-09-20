const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database/db');

/**
 * Handles creation of a private ticket channel when the user clicks "Create Support Ticket".
 */
async function handleTicketCreateButton(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  // 1. Prevent duplicate active tickets
  const existingTicket = db
    .prepare("SELECT channelId FROM tickets WHERE guildId = ? AND userId = ? AND status = 'OPEN'")
    .get(guildId, userId);

  if (existingTicket) {
    const channel = interaction.guild.channels.cache.get(existingTicket.channelId);
    if (channel) {
      return interaction.reply({
        content: `⚠️ You already have an open ticket in <#${existingTicket.channelId}>.`,
        ephemeral: true,
      });
    }
  }

  // 2. Fetch and increment ticket counter
  let settings = db.prepare('SELECT * FROM ticket_settings WHERE guildId = ?').get(guildId);
  if (!settings) {
    settings = { ticketCounter: 0, ticketCategoryId: null, supportRoleId: null };
  }

  const newTicketNumber = (settings.ticketCounter || 0) + 1;
  try {
    db.prepare(`
      INSERT INTO ticket_settings (guildId, ticketCounter)
      VALUES (?, ?)
      ON CONFLICT(guildId) DO UPDATE SET ticketCounter = ?
    `).run(guildId, newTicketNumber, newTicketNumber);
  } catch (err) {
    console.error('[TICKET DB ERROR] Failed to increment ticketCounter:', err);
  }

  // 3. Configure strict permission overwrites
  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (settings.supportRoleId) {
    overwrites.push({
      id: settings.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  // 4. Create isolated private channel under the same category as the support-tickets channel (channel.parentId)
  const categoryId = interaction.channel?.parentId || settings.ticketCategoryId || null;
  const channelName = `ticket-${String(newTicketNumber).padStart(4, '0')}`;
  let ticketChannel;
  try {
    ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
      reason: `Support ticket #${newTicketNumber} created by ${interaction.user.tag}`,
    });
  } catch (createErr) {
    console.error('[TICKET ERROR] Failed to create channel:', createErr);
    return interaction.reply({
      content: '❌ Failed to create private ticket channel. Please contact an administrator.',
      ephemeral: true,
    });
  }

  // 5. Store ticket in database
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(`
      INSERT INTO tickets (guildId, channelId, userId, ticketNumber, status, createdAt)
      VALUES (?, ?, ?, ?, 'OPEN', ?)
    `).run(guildId, ticketChannel.id, userId, newTicketNumber, now);
  } catch (err) {
    console.error('[TICKET DB ERROR] Failed to record ticket:', err);
  }

  // 6. Post welcome embed and Close Ticket button inside channel
  const welcomeEmbed = new EmbedBuilder()
    .setTitle(`Support Ticket #${newTicketNumber}`)
    .setColor(0x5865f2)
    .setDescription(
      `Welcome <@${userId}>!\n\n` +
      'Please explain your issue or question in detail. A member of our support team will be with you shortly.\n\n' +
      'When your inquiry is resolved, click the **Close Ticket** button below.'
    )
    .setFooter({ text: 'Support Team' })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_button')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );

  const mentionContent = `<@${userId}>${
    settings.supportRoleId ? ` <@&${settings.supportRoleId}>` : ''
  }`;

  await ticketChannel.send({
    content: mentionContent,
    embeds: [welcomeEmbed],
    components: [closeRow],
  });

  // 7. Acknowledge user ephemerally with channel link
  await interaction.reply({
    content: `✅ Your support ticket has been created: <#${ticketChannel.id}>.`,
    ephemeral: true,
  });
}

/**
 * Prompts user with confirmation buttons to close the ticket.
 */
async function handleTicketCloseButton(interaction) {
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_confirm_close')
      .setLabel('Confirm Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId('ticket_cancel_close')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    content: '⚠️ Are you sure you want to close and delete this ticket?',
    components: [confirmRow],
    ephemeral: true,
  });
}

/**
 * Confirms ticket closure, archives status in SQLite, and deletes the channel after a brief countdown.
 */
async function handleTicketConfirmClose(interaction) {
  const now = Math.floor(Date.now() / 1000);

  // 1. Archive in SQLite
  try {
    db.prepare(`
      UPDATE tickets
      SET status = 'CLOSED', closedAt = ?, closedById = ?
      WHERE channelId = ? AND status = 'OPEN'
    `).run(now, interaction.user.id, interaction.channel.id);
  } catch (err) {
    console.error('[TICKET DB ERROR] Failed to archive ticket:', err);
  }

  // 2. Post countdown notice in the channel
  await interaction.reply({
    content: `🔒 Ticket closed by <@${interaction.user.id}>. Archiving and deleting channel in 5 seconds...`,
  });

  // 3. Delete channel after 5 seconds
  setTimeout(async () => {
    try {
      if (interaction.channel && interaction.channel.deletable) {
        await interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`);
      }
    } catch (delErr) {
      console.error('[TICKET ERROR] Failed to delete ticket channel:', delErr);
    }
  }, 5000);
}

/**
 * Cancels ticket closure prompt.
 */
async function handleTicketCancelClose(interaction) {
  await interaction.update({
    content: '✅ Ticket closure cancelled.',
    components: [],
  });
}

module.exports = {
  handleTicketCreateButton,
  handleTicketCloseButton,
  handleTicketConfirmClose,
  handleTicketCancelClose,
};
