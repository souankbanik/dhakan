const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Post a builder matchmaker request to find co-founders, devs, or contributors'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('modal_connect')
      .setTitle('Builder Collab Search');

    const pitchInput = new TextInputBuilder()
      .setCustomId('project_pitch')
      .setLabel('Project Pitch & What You Are Building')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('What are you building and what problem does it solve?')
      .setMinLength(15)
      .setMaxLength(600)
      .setRequired(true);

    const roleInput = new TextInputBuilder()
      .setCustomId('role_needed')
      .setLabel('Role or Skillset Needed')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. Fullstack Next.js dev, UI/UX Designer, LLM Engineer, Co-founder')
      .setMinLength(3)
      .setMaxLength(100)
      .setRequired(true);

    const offerInput = new TextInputBuilder()
      .setCustomId('role_offered')
      .setLabel('What You Offer')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('e.g. Equity, 50/50 revenue split, reciprocating dev work, mentorship')
      .setMinLength(5)
      .setMaxLength(300)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(pitchInput),
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(offerInput)
    );

    await interaction.showModal(modal);
  },
};
