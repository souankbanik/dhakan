const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config');

/**
 * Handles the /collab modal submission and publishes a matchmaker card to the community channel.
 */
async function handleCollabModalSubmit(interaction) {
  const oneliner = interaction.fields.getTextInputValue('collab_oneliner').trim();
  const role = interaction.fields.getTextInputValue('collab_role').trim();
  const tech = interaction.fields.getTextInputValue('collab_tech').trim();

  if (!oneliner || !role || !tech) {
    return interaction.reply({
      content: '❌ All fields are required to post a collaboration request.',
      ephemeral: true,
    });
  }

  // Resolve community channel (#general / CHANNEL_GENERAL)
  const targetChannelId =
    config.channels?.general || process.env.CHANNEL_GENERAL;
  let targetChannel = targetChannelId
    ? interaction.guild?.channels.cache.get(targetChannelId)
    : null;

  if (!targetChannel && interaction.guild?.channels?.cache) {
    const channels = Array.from(interaction.guild.channels.cache.values());
    targetChannel = channels.find(
      (c) =>
        c.isTextBased() &&
        (c.name?.toLowerCase() === 'general' ||
          c.name?.toLowerCase().includes('general') ||
          c.name?.toLowerCase().includes('bot-command'))
    );
  }

  if (!targetChannel) {
    targetChannel = interaction.channel;
  }

  const embed = new EmbedBuilder()
    .setTitle('🤝 Builder Matchmaker: Collaboration Request')
    .setColor(0x57f287)
    .setDescription(
      `**Builder**: <@${interaction.user.id}> (${interaction.user.tag})\n\n` +
      `**Project Concept**:\n${oneliner}\n\n` +
      `**Role Needed**: \`${role}\`\n` +
      `**Tech Stack**: \`${tech}\``
    )
    .setFooter({ text: 'Looking to build? Click Connect below to team up!' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`collab_connect_${interaction.user.id}`)
      .setLabel('🤝 Connect')
      .setStyle(ButtonStyle.Success)
  );

  try {
    await targetChannel.send({ embeds: [embed], components: [row] });
  } catch (sendErr) {
    console.error('[COLLAB SEND ERROR] Failed to dispatch matchmaker card:', sendErr);
  }

  return interaction.reply({
    content: `✅ Your collaboration request has been posted to ${
      targetChannel ? `<#${targetChannel.id}>` : '#general'
    }!`,
    ephemeral: true,
  });
}

/**
 * Handles the "🤝 Connect" button click on matchmaker cards.
 */
async function handleCollabConnectButton(interaction) {
  if (!interaction.customId.startsWith('collab_connect_')) return;

  const authorId = interaction.customId.replace('collab_connect_', '');

  if (interaction.user.id === authorId) {
    return interaction.reply({
      content: '🤝 This is your own collaboration post! Wait for fellow builders to reach out to you.',
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: `🤝 Connect with <@${authorId}> to start building together! Send them a direct message or mention them in <#${interaction.channelId}> to coordinate.`,
    ephemeral: true,
  });
}

module.exports = {
  handleCollabModalSubmit,
  handleCollabConnectButton,
};
