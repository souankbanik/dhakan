const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loa')
    .setDescription('Submit a staff Leave of Absence (LOA) request')
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used within a server.',
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('loa_modal')
      .setTitle('Staff Leave of Absence Request');

    // Input 1: Duration (Number of Days)
    const daysInput = new TextInputBuilder()
      .setCustomId('loa_days')
      .setLabel('Duration (Number of Days)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., 7')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(3);

    // Input 2: Reason for Leave
    const reasonInput = new TextInputBuilder()
      .setCustomId('loa_reason')
      .setLabel('Reason for Leave')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide the reason for your leave of absence...')
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(1000);

    const firstActionRow = new ActionRowBuilder().addComponents(daysInput);
    const secondActionRow = new ActionRowBuilder().addComponents(reasonInput);

    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);
  },
};
