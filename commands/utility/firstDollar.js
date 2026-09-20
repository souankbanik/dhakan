const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('first-dollar')
    .setDescription('Submit proof of your first dollar/revenue earned with an app for verification'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('first_dollar_modal')
      .setTitle('First Dollar Verification');

    const productInput = new TextInputBuilder()
      .setCustomId('first_dollar_product')
      .setLabel('Product Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. PromptSaaS, DevKit CLI')
      .setRequired(true)
      .setMaxLength(100);

    const linkInput = new TextInputBuilder()
      .setCustomId('first_dollar_link')
      .setLabel('Stripe / Revenue Screenshot Link')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://imgur.com/... or https://i.postimg.cc/...')
      .setRequired(true);

    const lessonsInput = new TextInputBuilder()
      .setCustomId('first_dollar_lessons')
      .setLabel('Lessons Learned / Advice for Builders')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('How did you acquire your first customer? What worked and what did not?')
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(productInput),
      new ActionRowBuilder().addComponents(linkInput),
      new ActionRowBuilder().addComponents(lessonsInput)
    );

    await interaction.showModal(modal);
  },
};
