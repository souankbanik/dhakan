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
    .setName('rules-setup')
    .setDescription('Deploy the persistent rules agreement and onboarding panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where the rules panel will be deployed (defaults to #welcome-rules)')
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
        content: '❌ You must have Manage Server or Administrator permissions to deploy the rules panel.',
        ephemeral: true,
      });
    }

    // Determine target channel: specified channel option, or search for channel named 'welcome-rules', or current channel
    let targetChannel = interaction.options.getChannel('channel');
    if (!targetChannel) {
      const channels = interaction.guild?.channels?.cache
        ? Array.from(interaction.guild.channels.cache.values())
        : [];
      targetChannel =
        channels.find(
          (ch) => ch.name.toLowerCase() === 'welcome-rules' && ch.type === ChannelType.GuildText
        ) || interaction.channel;
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Welcome to Rounit's Discord & Community Rules")
      .setDescription(
        "Welcome to the community! Before exploring channels and building together, please review and accept our core rules:\n\n" +
        "**1. AI & Engineering Focus**\n" +
        "Keep discussions focused on AI building, coding, developer tooling, and modern tech stacks.\n\n" +
        "**2. Respect Member Projects**\n" +
        "Give constructive feedback, support fellow builders, and check out projects in `#community-builds`.\n\n" +
        "**3. Zero Unsolicited Spam**\n" +
        "No unsolicited advertisements, cold DMs, or disruptive behavior.\n\n" +
        "Click **Accept & Join Server** below to confirm agreement, obtain the **@Member** role, and access the server!"
      )
      .setColor(0x57f287) // Discord Green
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rules_accept_button')
        .setLabel('Accept & Join Server')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    await targetChannel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
      content: `✅ Rules agreement onboarding panel deployed successfully in <#${targetChannel.id}>.`,
      ephemeral: true,
    });
  },
};
