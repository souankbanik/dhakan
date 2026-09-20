const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('showcase-setup')
    .setDescription('Deploy the project showcase submission panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where the submission button panel will be sent')
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
        content: '❌ You must have Manage Server or Administrator permissions to configure showcases.',
        ephemeral: true,
      });
    }

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    const embed = new EmbedBuilder()
      .setTitle('🚀 Community Project Submissions')
      .setDescription(
        'Built something cool with code or AI?\n\n' +
        'Click the button below to submit your creation to our community showcase!\n' +
        '• Approved projects will be featured in `#community-builds`.\n' +
        '• Accepted creators will automatically receive the **Verified Builder** role.'
      )
      .setColor(0x5865f2)
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('showcase_submit_button')
        .setLabel('Submit Project')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛠️')
    );

    await targetChannel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
      content: `✅ Project submission panel deployed in <#${targetChannel.id}>.`,
      ephemeral: true,
    });
  },
};
