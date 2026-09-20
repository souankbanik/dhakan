const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/db');
const config = require('../config');
const { syncUserRoles } = require('../services/levelService');

/**
 * Handles modal submission for YouTube video ideas.
 */
async function handleVideoIdeaModalSubmit(interaction) {
  const title = interaction.fields.getTextInputValue('idea_title').trim();
  const description = interaction.fields.getTextInputValue('idea_description').trim();
  const outline = interaction.fields.getTextInputValue('idea_outline')?.trim() || '';

  // Save to database
  let ideaId = 0;
  try {
    const res = db
      .prepare(`
        INSERT INTO video_ideas (userId, title, description, status)
        VALUES (?, ?, ?, 'PENDING')
      `)
      .run(interaction.user.id, title, outline ? `${description}\n\nOutline:\n${outline}` : description);

    ideaId = res.lastInsertRowid;
  } catch (dbErr) {
    console.error('[VIDEO IDEA DB ERROR] Failed to save video idea:', dbErr);
  }

  // Route to #video-pipeline
  const pipelineChannelId =
    config.channels?.videoPipeline ||
    process.env.CHANNEL_VIDEO_PIPELINE ||
    config.channels?.staffLogs;

  let pipelineChannel = pipelineChannelId
    ? interaction.guild?.channels?.cache?.get(pipelineChannelId)
    : null;

  if (!pipelineChannel && interaction.guild) {
    const channels = Array.from(interaction.guild.channels.cache.values());
    pipelineChannel = channels.find(
      (c) =>
        c.isTextBased() &&
        (c.name.toLowerCase().includes('video') ||
          c.name.toLowerCase().includes('pipeline') ||
          c.name.toLowerCase().includes('staff'))
    );
  }

  if (pipelineChannel && pipelineChannel.isTextBased()) {
    const ideaEmbed = new EmbedBuilder()
      .setTitle(`🎬 Video Idea Pitch #${ideaId}: ${title}`)
      .setColor(0xe74c3c)
      .setDescription(description)
      .addFields(
        { name: 'Pitched By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Status', value: '⏳ **PENDING REVIEW**', inline: true },
        ...(outline ? [{ name: 'Proposed Outline / Key Points', value: outline, inline: false }] : [])
      )
      .setFooter({ text: `Video Idea ID: ${ideaId} • Submitter ID: ${interaction.user.id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`video_idea_accept_${ideaId}`)
        .setLabel('Accept Idea (+25 VP)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎬'),
      new ButtonBuilder()
        .setCustomId(`video_idea_decline_${ideaId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

    await pipelineChannel.send({ embeds: [ideaEmbed], components: [row] });
  }

  await interaction.reply({
    content:
      '🎬 **Your video idea has been submitted directly to Rounit\'s video pipeline!**\n' +
      'If selected for production, you\'ll receive a confirmation and **+25 VibePoints**.',
    ephemeral: true,
  });
}

/**
 * Handles Accept / Decline review buttons on video idea cards.
 */
async function handleVideoIdeaButton(interaction) {
  // Permission guard: Must have ManageGuild or Administrator or staff
  const isStaff =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.roles?.cache?.some((r) =>
      ['staff', 'admin', 'moderator', 'product lead'].includes(r.name.toLowerCase())
    );

  if (!isStaff) {
    return interaction.reply({
      content: '❌ Only staff and content curators can review video ideas.',
      ephemeral: true,
    });
  }

  const isAccept = interaction.customId.startsWith('video_idea_accept_');
  const ideaId = interaction.customId.replace(
    isAccept ? 'video_idea_accept_' : 'video_idea_decline_',
    ''
  );

  const ideaRow = db.prepare('SELECT * FROM video_ideas WHERE id = ?').get(ideaId);
  if (!ideaRow) {
    return interaction.reply({ content: '❌ Video idea not found in database.', ephemeral: true });
  }

  // Disable buttons
  const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
  disabledRow.components.forEach((c) => c.setDisabled(true));

  const originalEmbed = interaction.message.embeds[0];

  if (isAccept) {
    // 1. Update database: status = 'ACCEPTED'
    try {
      db.prepare("UPDATE video_ideas SET status = 'ACCEPTED' WHERE id = ?").run(ideaId);

      // Award +25 VibePoints to submitter
      db.prepare(`
        INSERT INTO users (userId, vibePoints, weeklyPoints)
        VALUES (?, 25, 25)
        ON CONFLICT(userId) DO UPDATE SET
          vibePoints = vibePoints + 25,
          weeklyPoints = weeklyPoints + 25
      `).run(ideaRow.userId);

      if (interaction.guild) {
        syncUserRoles(interaction.guild, ideaRow.userId).catch(() => {});
      }
    } catch (dbErr) {
      console.error('[VIDEO IDEA DB ERROR] Failed to update accepted status:', dbErr);
    }

    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x2ecc71)
      .spliceFields(1, 1, {
        name: 'Status',
        value: `✅ **ACCEPTED** by <@${interaction.user.id}> (+25 VP awarded)`,
        inline: true,
      });

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

    // DM Submitter if possible
    try {
      const submitter = await interaction.client.users.fetch(ideaRow.userId).catch(() => null);
      if (submitter) {
        await submitter.send({
          content: `🎉 **Great news!** Rounit has accepted your video idea: **"${ideaRow.title}"** for production! You've been awarded **+25 VibePoints**! Keep pitching!`,
        }).catch(() => {});
      }
    } catch {
      // ignore DM errors
    }
  } else {
    // Decline
    try {
      db.prepare("UPDATE video_ideas SET status = 'DECLINED' WHERE id = ?").run(ideaId);
    } catch {
      // if column check constrains to PENDING/ACCEPTED, can fallback or leave pending
    }

    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x95a5a6)
      .spliceFields(1, 1, {
        name: 'Status',
        value: `❌ **DECLINED** by <@${interaction.user.id}>`,
        inline: true,
      });

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
  }
}

module.exports = {
  handleVideoIdeaModalSubmit,
  handleVideoIdeaButton,
};
