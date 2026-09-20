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
    .setName('ticket-setup')
    .setDescription('Deploy the support ticket creation panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('category')
        .setDescription('Category under which private ticket channels will be created')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName('support-role')
        .setDescription('Role that has access to view and respond to support tickets')
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
        content: '❌ You must have Manage Server or Administrator permissions to configure tickets.',
        ephemeral: true,
      });
    }

    const category = interaction.options.getChannel('category');
    const supportRole = interaction.options.getRole('support-role');
    const categoryId = category ? category.id : (interaction.channel?.parentId || null);

    try {
      db.prepare(`
        INSERT INTO ticket_settings (guildId, ticketCategoryId, supportRoleId)
        VALUES (?, ?, ?)
        ON CONFLICT(guildId) DO UPDATE SET
          ticketCategoryId = COALESCE(excluded.ticketCategoryId, ticket_settings.ticketCategoryId),
          supportRoleId = COALESCE(excluded.supportRoleId, ticket_settings.supportRoleId)
      `).run(interaction.guild.id, categoryId, supportRole ? supportRole.id : null);
    } catch (err) {
      console.error('[TICKET DB ERROR] Failed to save ticket settings:', err);
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Ticket System')
      .setDescription(
        'Need assistance, want to report an issue, or have a question for staff?\n\n' +
        'Click the button below to open a private support ticket. ' +
        'A private channel will be created exclusively for you and our support team.'
      )
      .setColor(0x5865f2)
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_create_button')
        .setLabel('Create Support Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
      content: `✅ Support ticket panel deployed.${
        category ? ` Category: <#${category.id}>.` : ''
      }${supportRole ? ` Support Role: <@&${supportRole.id}>.` : ''}`,
      ephemeral: true,
    });
  },
};
