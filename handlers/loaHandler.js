const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/db');
const config = require('../config');

/**
 * Handles modal submission for Staff LOA requests.
 */
async function handleLoaModalSubmit(interaction) {
  const daysInput = interaction.fields.getTextInputValue('loa_days').trim();
  const reason = interaction.fields.getTextInputValue('loa_reason').trim();

  // Validate days input
  const days = parseInt(daysInput, 10);
  if (isNaN(days) || days <= 0 || days > 365) {
    return interaction.reply({
      content: '❌ Please provide a valid positive number of days (1-365).',
      ephemeral: true,
    });
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);

  // 1. Save request to SQLite database with status 'PENDING'
  let requestId;
  try {
    const insertStmt = db.prepare(`
      INSERT INTO loa_requests (userId, days, reason, status, timestamp)
      VALUES (?, ?, ?, 'PENDING', ?)
    `);
    const result = insertStmt.run(interaction.user.id, days, reason, currentTimestamp);
    requestId = result.lastInsertRowid;
  } catch (err) {
    console.error('[LOA DB ERROR] Failed to record LOA request:', err);
    return interaction.reply({
      content: '❌ A database error occurred while processing your request. Please contact an administrator.',
      ephemeral: true,
    });
  }

  // 2. Fetch configured LOA log channel
  let logChannelId = null;
  try {
    const settings = db
      .prepare('SELECT loaLogChannel FROM guild_settings WHERE guildId = ?')
      .get(interaction.guild.id);
    logChannelId = settings?.loaLogChannel || config.channels?.staffLogs || process.env.CHANNEL_STAFF_LOGS;
  } catch (err) {
    console.error('[LOA DB ERROR] Failed to fetch guild_settings:', err);
    logChannelId = config.channels?.staffLogs || process.env.CHANNEL_STAFF_LOGS;
  }

  // 3. Build management review embed and action buttons
  const logEmbed = new EmbedBuilder()
    .setTitle('📋 Staff Leave of Absence Request')
    .setColor(0x3498db) // Blue for pending
    .addFields(
      { name: 'Staff Member', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
      { name: 'User ID', value: interaction.user.id, inline: true },
      { name: 'Duration', value: `${days} day(s)`, inline: true },
      { name: 'Reason', value: reason },
      { name: 'Status', value: '⏳ **PENDING**', inline: true },
      { name: 'Submitted At', value: `<t:${currentTimestamp}:F>`, inline: true }
    )
    .setFooter({ text: `Request ID: #${requestId}` })
    .setTimestamp();

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`loa_approve_${requestId}`)
      .setLabel('Approve Request')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`loa_decline_${requestId}`)
      .setLabel('Decline Request')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  // 4. Send embed to configured log channel or search for #staff-logs channel
  let targetChannel = null;
  if (logChannelId) {
    try {
      targetChannel =
        interaction.guild.channels.cache.get(logChannelId) ||
        (await interaction.guild.channels.fetch(logChannelId).catch(() => null));
    } catch (fetchErr) {
      console.error(`[LOA ERROR] Failed to fetch configured log channel ${logChannelId}:`, fetchErr);
    }
  }

  if (!targetChannel) {
    const channels = interaction.guild?.channels?.cache
      ? Array.from(interaction.guild.channels.cache.values())
      : [];
    targetChannel = channels.find(
      (c) =>
        c.isTextBased?.() &&
        (c.name?.toLowerCase() === 'staff-logs' ||
          c.name?.toLowerCase() === 'staff-log' ||
          c.name?.toLowerCase().includes('staff-log') ||
          c.name?.toLowerCase().includes('loa-log'))
    );
  }

  if (targetChannel && targetChannel.isTextBased()) {
    try {
      await targetChannel.send({ embeds: [logEmbed], components: [actionRow] });
    } catch (channelErr) {
      console.error(`[LOA ERROR] Failed to send message to log channel:`, channelErr);
    }
  } else {
    console.warn(`[LOA WARN] No suitable staff-logs or loaLogChannel found in guild ${interaction.guild.id}.`);
  }

  // 5. Respond ephemerally to the requesting user
  await interaction.reply({
    content: 'Your LOA request has been submitted to management.',
    ephemeral: true,
  });
}

/**
 * Handles button interactions for approving or declining an LOA request.
 */
async function handleLoaButton(interaction) {
  // 1. Permission check: Manage Guild or Administrator required
  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    return interaction.reply({
      content: '❌ You must have **Manage Server** or **Administrator** permissions to review LOA requests.',
      ephemeral: true,
    });
  }

  // 2. Parse action and requestId from customId
  const match = interaction.customId.match(/^loa_(approve|decline)_(\d+)$/);
  if (!match) return;

  const action = match[1]; // 'approve' or 'decline'
  const requestId = parseInt(match[2], 10);
  const newStatus = action === 'approve' ? 'APPROVED' : 'DECLINED';

  // 3. Query existing request
  let request;
  try {
    request = db.prepare('SELECT * FROM loa_requests WHERE id = ?').get(requestId);
  } catch (err) {
    console.error('[LOA DB ERROR] Failed to fetch request:', err);
    return interaction.reply({
      content: '❌ A database error occurred while fetching the request.',
      ephemeral: true,
    });
  }

  if (!request) {
    return interaction.reply({
      content: '❌ LOA request record not found in the database.',
      ephemeral: true,
    });
  }

  if (request.status !== 'PENDING' && request.status !== 'pending') {
    return interaction.reply({
      content: `❌ This LOA request has already been reviewed (Current Status: **${request.status}**).`,
      ephemeral: true,
    });
  }

  // 4. Update request status in database
  const reviewerTag = interaction.user.tag;
  try {
    db.prepare('UPDATE loa_requests SET status = ?, reviewedBy = ? WHERE id = ?').run(
      newStatus,
      reviewerTag,
      requestId
    );
  } catch (err) {
    console.error('[LOA DB ERROR] Failed to update request:', err);
    return interaction.reply({
      content: '❌ A database error occurred while updating the request status.',
      ephemeral: true,
    });
  }

  // 5. Update log message: disable buttons and color-code embed
  const isApproved = action === 'approve';
  const verdictColor = isApproved ? 0x57f287 : 0xed4245; // Green for Approved, Red for Declined
  const reviewTimestamp = Math.floor(Date.now() / 1000);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`loa_approve_${requestId}`)
      .setLabel('Approve Request')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`loa_decline_${requestId}`)
      .setLabel('Decline Request')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
      .setDisabled(true)
  );

  const updatedEmbed = new EmbedBuilder()
    .setTitle('📋 Staff Leave of Absence Request')
    .setColor(verdictColor)
    .addFields(
      { name: 'Staff Member', value: `<@${request.userId}> (${request.userId})`, inline: true },
      { name: 'Duration', value: `${request.days} day(s)`, inline: true },
      { name: 'Status', value: isApproved ? '✅ **APPROVED**' : '❌ **DECLINED**', inline: true },
      { name: 'Reason', value: request.reason },
      { name: 'Reviewed By', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
      { name: 'Reviewed At', value: `<t:${reviewTimestamp}:F>`, inline: true }
    )
    .setFooter({ text: `Request ID: #${requestId}` })
    .setTimestamp();

  await interaction.update({
    embeds: [updatedEmbed],
    components: [disabledRow],
  });

  // 6. Direct Message notification to requesting staff member
  try {
    const applicant = await interaction.client.users.fetch(request.userId).catch(() => null);
    if (applicant) {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Staff LOA Request Verdict: ${newStatus}`)
        .setColor(verdictColor)
        .setDescription(
          isApproved
            ? `Your Leave of Absence request for **${request.days} day(s)** has been **APPROVED**.`
            : `Your Leave of Absence request for **${request.days} day(s)** has been **DECLINED**.`
        )
        .addFields(
          { name: 'Duration', value: `${request.days} day(s)`, inline: true },
          { name: 'Reviewed By', value: interaction.user.tag, inline: true },
          { name: 'Reason Given', value: request.reason }
        )
        .setFooter({ text: interaction.guild?.name || 'Staff Management' })
        .setTimestamp();

      await applicant.send({ embeds: [dmEmbed] });
    }
  } catch (dmErr) {
    console.warn(`[LOA DM WARN] Could not send verdict DM to user ${request.userId}:`, dmErr.message);
  }
}

module.exports = {
  handleLoaModalSubmit,
  handleLoaButton,
};
