const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config');

/**
 * Handles submission of the /connect modal (modal_connect).
 */
async function handleConnectModalSubmit(interaction) {
  const pitch = (
    interaction.fields.getTextInputValue('project_pitch') ||
    interaction.fields.getTextInputValue('connect_pitch')
  ).trim();

  const seeking = (
    interaction.fields.getTextInputValue('role_needed') ||
    interaction.fields.getTextInputValue('connect_role')
  ).trim();

  const offering = (
    interaction.fields.getTextInputValue('role_offered') ||
    interaction.fields.getTextInputValue('connect_offer')
  ).trim();

  // Resolve target channel: configured ID -> named 'general'/'collab'/'connect' -> interaction.channel
  const configuredGeneralId = config.channels?.general || process.env.CHANNEL_GENERAL;
  const generalChannel =
    (configuredGeneralId && interaction.guild?.channels.cache.get(configuredGeneralId)) ||
    interaction.guild?.channels.cache.find(
      (c) => c.isTextBased() && (c.name === 'general' || c.name === 'collab' || c.name === 'connect')
    ) ||
    interaction.channel;

  if (!generalChannel || !generalChannel.isTextBased()) {
    return interaction.reply({
      content: '❌ Could not find a text channel to dispatch your collaboration request.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🤝 Builder Collab Search')
    .setColor(0x57f287)
    .setDescription(`**<@${interaction.user.id}>** is looking for builders to collaborate with!`)
    .addFields(
      { name: 'Initiator', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
      { name: 'Seeking', value: `\`${seeking}\``, inline: true },
      { name: 'Building', value: pitch, inline: false },
      { name: 'Offering', value: offering, inline: false }
    )
    .setFooter({ text: 'GOKU Matchmaker • Click below to connect with initiator' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`collab_connect_${interaction.user.id}`)
      .setLabel('📬 Connect with Builder')
      .setStyle(ButtonStyle.Primary)
  );

  try {
    await generalChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[CONNECT ERROR] Failed to dispatch matchmaker card:', err);
    return interaction.reply({
      content: '❌ Failed to send connection card to `#general`.',
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: `✅ Your matchmaker request has been posted in <#${generalChannel.id}>! Builders can connect with you directly.`,
    ephemeral: true,
  });
}

/**
 * Handles the "📬 Connect with Builder" button click (collab_connect_{userId}).
 */
async function handleConnectButton(interaction) {
  const match = interaction.customId.match(/^collab_connect_(\d+)$/);
  if (!match) return;

  const targetUserId = match[1];

  // Self connect check
  if (interaction.user.id === targetUserId) {
    return interaction.reply({
      content: '❌ You cannot connect with your own collaboration request.',
      ephemeral: true,
    });
  }

  // Notify initiator via DM
  try {
    const initiator = await interaction.client.users.fetch(targetUserId).catch(() => null);
    if (initiator) {
      const fromChannelText = interaction.channelId ? `<#${interaction.channelId}>` : 'the server';
      await initiator.send({
        content: `📬 **New Connection Request!**\n<@${interaction.user.id}> (${interaction.user.tag}) wants to collaborate on your build from ${fromChannelText}! Reach out to them to start building.`,
      }).catch(() => null);
    }
  } catch (dmErr) {
    console.warn('[CONNECT WARN] Failed to DM initiator:', dmErr.message);
  }

  return interaction.reply({
    content: `📬 **Connection alert sent!** We notified <@${targetUserId}> that you would like to collaborate. You can reach out directly to <@${targetUserId}> via DM!`,
    ephemeral: true,
  });
}

module.exports = {
  handleConnectModalSubmit,
  handleConnectButton,
};
