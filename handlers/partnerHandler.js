const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/db');

/**
 * Shows the partnership application modal when the user clicks "Apply for Partnership".
 */
async function handlePartnerApplyButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('partner_modal')
    .setTitle('Partnership Application');

  const serverNameInput = new TextInputBuilder()
    .setCustomId('partner_server_name')
    .setLabel('Server Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter your server name')
    .setRequired(true)
    .setMaxLength(100);

  const inviteInput = new TextInputBuilder()
    .setCustomId('partner_invite')
    .setLabel('Invite Link')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://discord.gg/your-invite')
    .setRequired(true)
    .setMaxLength(100);

  const memberCountInput = new TextInputBuilder()
    .setCustomId('partner_member_count')
    .setLabel('Member Count')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 500')
    .setRequired(true)
    .setMaxLength(10);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('partner_description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Briefly describe your community and niche...')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(serverNameInput),
    new ActionRowBuilder().addComponents(inviteInput),
    new ActionRowBuilder().addComponents(memberCountInput),
    new ActionRowBuilder().addComponents(descriptionInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handles submission of the partnership application modal.
 */
async function handlePartnerModalSubmit(interaction) {
  const serverName = interaction.fields.getTextInputValue('partner_server_name').trim();
  const inviteLink = interaction.fields.getTextInputValue('partner_invite').trim();
  const memberCountStr = interaction.fields.getTextInputValue('partner_member_count').trim();
  const description = interaction.fields.getTextInputValue('partner_description').trim();

  const memberCount = parseInt(memberCountStr, 10);
  if (isNaN(memberCount) || memberCount <= 0) {
    return interaction.reply({
      content: '❌ Please provide a valid positive number for Member Count.',
      ephemeral: true,
    });
  }

  const now = Math.floor(Date.now() / 1000);

  // 1. Insert application into SQLite
  let appId;
  try {
    const insert = db.prepare(`
      INSERT INTO partner_applications (guildId, userId, serverName, inviteLink, memberCount, description, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `);
    const result = insert.run(
      interaction.guild.id,
      interaction.user.id,
      serverName,
      inviteLink,
      memberCount,
      description,
      now
    );
    appId = result.lastInsertRowid;
  } catch (err) {
    console.error('[PARTNER DB ERROR] Failed to record application:', err);
    return interaction.reply({
      content: '❌ Database error while submitting your application.',
      ephemeral: true,
    });
  }

  // 2. Fetch log channel
  let logChannelId = null;
  try {
    const settings = db
      .prepare('SELECT partnerChannel FROM guild_settings WHERE guildId = ?')
      .get(interaction.guild.id);
    logChannelId = settings?.partnerChannel || process.env.CHANNEL_STAFF_LOGS;
  } catch (err) {
    console.error('[PARTNER DB ERROR] Failed to fetch settings:', err);
    logChannelId = process.env.CHANNEL_STAFF_LOGS;
  }

  // Fallback: search channels for "partner-logs" or "partner"
  const logChannel = logChannelId
    ? interaction.guild.channels.cache.get(logChannelId) ||
      (await interaction.guild.channels.fetch(logChannelId).catch(() => null))
    : interaction.guild.channels.cache.find(
        (c) => c.isTextBased() && (c.name.includes('partner-log') || c.name.includes('partner'))
      );

  // 3. Build staff review embed and buttons
  const embed = new EmbedBuilder()
    .setTitle('🤝 New Partnership Application')
    .setColor(0x9b59b6)
    .addFields(
      { name: 'Server Name', value: serverName, inline: true },
      { name: 'Member Count', value: `${memberCount.toLocaleString()}`, inline: true },
      { name: 'Applicant', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
      { name: 'Invite Link', value: inviteLink },
      { name: 'Description', value: description },
      { name: 'Status', value: '⏳ **PENDING**', inline: true },
      { name: 'Submitted At', value: `<t:${now}:F>`, inline: true }
    )
    .setFooter({ text: `Application ID: #${appId}` })
    .setTimestamp();

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`partner_accept_${appId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`partner_decline_${appId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  if (logChannel && logChannel.isTextBased()) {
    try {
      await logChannel.send({ embeds: [embed], components: [actionRow] });
    } catch (sendErr) {
      console.error('[PARTNER ERROR] Failed to post application to log channel:', sendErr);
    }
  } else {
    console.warn(`[PARTNER WARN] No partner log channel found for guild ${interaction.guild.id}.`);
  }

  await interaction.reply({
    content: '✅ Your partnership application has been submitted to management for review.',
    ephemeral: true,
  });
}

/**
 * Handles Accept and Decline buttons for partner applications.
 */
async function handlePartnerButton(interaction) {
  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    return interaction.reply({
      content: '❌ You must have Manage Server or Administrator permissions to review partnership applications.',
      ephemeral: true,
    });
  }

  const match = interaction.customId.match(/^partner_(accept|decline)_(\d+)$/);
  if (!match) return;

  const action = match[1]; // 'accept' or 'decline'
  const appId = parseInt(match[2], 10);
  const newStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';

  let app;
  try {
    app = db.prepare('SELECT * FROM partner_applications WHERE id = ?').get(appId);
  } catch (err) {
    console.error('[PARTNER DB ERROR] Failed to fetch application:', err);
    return interaction.reply({
      content: '❌ Database error while retrieving application record.',
      ephemeral: true,
    });
  }

  if (!app) {
    return interaction.reply({
      content: '❌ Partnership application record not found.',
      ephemeral: true,
    });
  }

  if (app.status !== 'PENDING') {
    return interaction.reply({
      content: `❌ This application has already been reviewed (Status: **${app.status}**).`,
      ephemeral: true,
    });
  }

  // Update DB status
  try {
    db.prepare('UPDATE partner_applications SET status = ?, reviewedBy = ? WHERE id = ?').run(
      newStatus,
      interaction.user.tag,
      appId
    );
  } catch (err) {
    console.error('[PARTNER DB ERROR] Failed to update application:', err);
    return interaction.reply({
      content: '❌ Database error while updating application status.',
      ephemeral: true,
    });
  }

  const isAccepted = action === 'accept';
  const color = isAccepted ? 0x57f287 : 0xed4245;

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`partner_accept_${appId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`partner_decline_${appId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
      .setDisabled(true)
  );

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(color)
    .setFields(
      { name: 'Server Name', value: app.serverName, inline: true },
      { name: 'Member Count', value: `${app.memberCount.toLocaleString()}`, inline: true },
      { name: 'Applicant', value: `<@${app.userId}>`, inline: true },
      { name: 'Invite Link', value: app.inviteLink },
      { name: 'Description', value: app.description },
      { name: 'Status', value: isAccepted ? '✅ **ACCEPTED**' : '❌ **DECLINED**', inline: true },
      { name: 'Reviewed By', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true }
    );

  await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

  // DM the applicant
  try {
    const applicant = await interaction.client.users.fetch(app.userId).catch(() => null);
    if (applicant) {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Partnership Application ${newStatus}`)
        .setColor(color)
        .setDescription(
          isAccepted
            ? `Congratulations! Your partnership application for **${app.serverName}** has been **ACCEPTED**!`
            : `Thank you for your interest. Unfortunately, your partnership application for **${app.serverName}** has been **DECLINED**.`
        )
        .addFields(
          { name: 'Reviewed By', value: interaction.user.tag },
          { name: 'Server', value: interaction.guild?.name || 'Community Server' }
        )
        .setTimestamp();

      await applicant.send({ embeds: [dmEmbed] });
    }
  } catch (dmErr) {
    console.warn(`[PARTNER DM WARN] Could not send DM to user ${app.userId}:`, dmErr.message);
  }
}

module.exports = {
  handlePartnerApplyButton,
  handlePartnerModalSubmit,
  handlePartnerButton,
};
