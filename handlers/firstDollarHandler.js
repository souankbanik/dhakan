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
 * Handles submission of First Dollar modal.
 */
async function handleFirstDollarModalSubmit(interaction) {
  const productName = interaction.fields.getTextInputValue('first_dollar_product').trim();
  const proofLink = interaction.fields.getTextInputValue('first_dollar_link').trim();
  const lessons = interaction.fields.getTextInputValue('first_dollar_lessons').trim();

  // Basic URL validation
  if (!/^https?:\/\/.+/i.test(proofLink)) {
    return interaction.reply({
      content: '❌ Please provide a valid screenshot URL starting with http:// or https://',
      ephemeral: true,
    });
  }

  // Update DB with proof link
  try {
    db.prepare(`
      INSERT INTO users (userId, firstDollarProof)
      VALUES (?, ?)
      ON CONFLICT(userId) DO UPDATE SET firstDollarProof = excluded.firstDollarProof
    `).run(interaction.user.id, proofLink);
  } catch (err) {
    console.error('[FIRST DOLLAR DB ERROR] Failed to save proof:', err);
  }

  // Route to #product-test / #staff-review
  const productTestChannelId =
    config.channels?.productTest ||
    process.env.CHANNEL_PRODUCT_TEST ||
    config.channels?.staffReview ||
    process.env.CHANNEL_STAFF_REVIEW;

  let reviewChannel = productTestChannelId
    ? interaction.guild?.channels?.cache?.get(productTestChannelId)
    : null;

  if (!reviewChannel && interaction.guild) {
    const channels = Array.from(interaction.guild.channels.cache.values());
    reviewChannel = channels.find(
      (c) =>
        c.isTextBased() &&
        (c.name.toLowerCase() === 'product-test' ||
          c.name.toLowerCase().includes('review') ||
          c.name.toLowerCase().includes('staff'))
    );
  }

  if (reviewChannel && reviewChannel.isTextBased()) {
    const reviewEmbed = new EmbedBuilder()
      .setTitle('💰 First Dollar Verification Request')
      .setColor(0xf1c40f)
      .setDescription(
        `Builder <@${interaction.user.id}> has requested First Dollar Club verification!`
      )
      .addFields(
        { name: 'Product Name', value: `**${productName}**`, inline: true },
        { name: 'Submitter', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Revenue Proof', value: `[View Screenshot](${proofLink})`, inline: false },
        { name: 'Lessons Learned', value: lessons, inline: false },
        { name: 'Status', value: '⏳ **PENDING REVIEW**', inline: true }
      )
      .setFooter({ text: `User ID: ${interaction.user.id}` })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`first_dollar_approve_${interaction.user.id}`)
        .setLabel('Approve & Celebrate')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`first_dollar_reject_${interaction.user.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
  }

  await interaction.reply({
    content:
      '✅ **Your First Dollar proof has been submitted to staff review in `#product-test`!**\n' +
      'Once approved, a celebratory announcement will be posted in `#general`. Congratulations on making revenue!',
    ephemeral: true,
  });
}

/**
 * Handles staff Approve / Reject button clicks for First Dollar submissions.
 */
async function handleFirstDollarReviewButton(interaction) {
  // Permission guard: Must have ManageGuild or Administrator or staff
  const isStaff =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.roles?.cache?.some((r) =>
      ['staff', 'admin', 'moderator', 'product lead'].includes(r.name.toLowerCase())
    );

  if (!isStaff) {
    return interaction.reply({
      content: '❌ Only staff and admins can review First Dollar submissions.',
      ephemeral: true,
    });
  }

  const isApprove = interaction.customId.startsWith('first_dollar_approve_');
  const targetUserId = interaction.customId.replace(
    isApprove ? 'first_dollar_approve_' : 'first_dollar_reject_',
    ''
  );

  const originalEmbed = interaction.message.embeds[0];
  const productNameField = originalEmbed?.fields?.find((f) => f.name === 'Product Name');
  const productName = productNameField?.value?.replace(/\*\*/g, '') || 'their product';
  const lessonsField = originalEmbed?.fields?.find((f) => f.name === 'Lessons Learned');
  const lessons = lessonsField?.value || 'Hard work and continuous iteration!';
  const proofField = originalEmbed?.fields?.find((f) => f.name === 'Revenue Proof');
  const proofLinkMatch = proofField?.value?.match(/\[View Screenshot\]\((https?:\/\/[^\s]+)\)/);
  const proofLink = proofLinkMatch ? proofLinkMatch[1] : null;

  // Disable buttons
  const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
  disabledRow.components.forEach((c) => c.setDisabled(true));

  if (isApprove) {
    // 1. Update database: firstDollarVerified = 1, +100 VP
    try {
      db.prepare(`
        INSERT INTO users (userId, firstDollarVerified, vibePoints, weeklyPoints)
        VALUES (?, 1, 100, 100)
        ON CONFLICT(userId) DO UPDATE SET
          firstDollarVerified = 1,
          vibePoints = vibePoints + 100,
          weeklyPoints = weeklyPoints + 100
      `).run(targetUserId);

      // Trigger role sync
      if (interaction.guild) {
        await syncUserRoles(interaction.guild, targetUserId);
      }
    } catch (dbErr) {
      console.error('[FIRST DOLLAR DB ERROR] Failed to approve user in DB:', dbErr);
    }

    // 2. Update review card
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x2ecc71)
      .spliceFields(4, 1, {
        name: 'Status',
        value: `✅ **APPROVED** by <@${interaction.user.id}>`,
        inline: true,
      });

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

    // 3. Fire celebration embed in #general
    const generalChannelId = config.channels?.general || process.env.CHANNEL_GENERAL;
    let generalChannel = generalChannelId
      ? interaction.guild.channels.cache.get(generalChannelId)
      : null;

    if (!generalChannel) {
      const channels = Array.from(interaction.guild.channels.cache.values());
      generalChannel = channels.find(
        (c) =>
          c.isTextBased() &&
          ((generalChannelId && c.id === generalChannelId) ||
            c.name.toLowerCase() === 'general' ||
            c.name.toLowerCase().includes('general'))
      );
    }

    if (generalChannel && generalChannel.isTextBased()) {
      const celebEmbed = new EmbedBuilder()
        .setTitle('🎉 FIRST DOLLAR CELEBRATION! 🎉')
        .setDescription(
          `Massive congratulations to <@${targetUserId}> on making their very first dollar on the internet!\n\n` +
          `📦 **Product:** **${productName}**\n\n` +
          `💡 **Lessons Learned:**\n> ${lessons}\n\n` +
          `🏆 **Welcome to the First Dollar Club!** (+100 VibePoints awarded)\n` +
          (proofLink ? `🔗 [View Revenue Proof](${proofLink})` : '')
        )
        .setColor(0xf1c40f)
        .setFooter({ text: 'Rounit HQ • Building real products that generate real revenue' })
        .setTimestamp();

      await generalChannel.send({ embeds: [celebEmbed] });
    }
  } else {
    // Rejected
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0xed4245)
      .spliceFields(4, 1, {
        name: 'Status',
        value: `❌ **REJECTED** by <@${interaction.user.id}>`,
        inline: true,
      });

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
  }
}

module.exports = {
  handleFirstDollarModalSubmit,
  handleFirstDollarReviewButton,
};
