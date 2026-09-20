const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const db = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partner-setup')
    .setDescription('Deploy the partnership application panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('log-channel')
        .setDescription('Channel where partnership applications will be sent for staff review')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: '❌ This command can only be used within a server.',
        ephemeral: true,
      });
    }

    const hasPermission =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

    if (!hasPermission) {
      return interaction.reply({
        content: '❌ You must have Manage Server or Administrator permissions to configure partnerships.',
        ephemeral: true,
      });
    }

    const logChannel = interaction.options.getChannel('log-channel');
    if (logChannel) {
      try {
        db.prepare(`
          INSERT INTO guild_settings (guildId, partnerChannel)
          VALUES (?, ?)
          ON CONFLICT(guildId) DO UPDATE SET partnerChannel = excluded.partnerChannel
        `).run(interaction.guild.id, logChannel.id);
      } catch (err) {
        console.error('[PARTNER DB ERROR] Failed to save partnerChannel:', err);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🤝 Server Partnership Applications')
      .setDescription(
        'Interested in partnering with our server?\n\n' +
        'Click the button below to fill out our partnership application form. ' +
        'Our management team will review your server details and respond shortly.'
      )
      .setColor(0x9b59b6)
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('partner_apply_button')
        .setLabel('Apply for Partnership')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🤝')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
      content: `✅ Partnership application panel deployed.${
        logChannel ? ` Submissions will be sent to <#${logChannel.id}>.` : ''
      }`,
      ephemeral: true,
    });
  },
};
