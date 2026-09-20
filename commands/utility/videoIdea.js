const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('video-idea')
    .setDescription('Pitch a YouTube video topic or tutorial idea directly to Rounit'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('video_idea_modal')
      .setTitle('Pitch YouTube Video Idea');

    const titleInput = new TextInputBuilder()
      .setCustomId('idea_title')
      .setLabel('Video Title / Topic')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. Building an Autonomous AI Dev Agent with Claude 3.7 & MCP')
      .setRequired(true)
      .setMaxLength(100);

    const descInput = new TextInputBuilder()
      .setCustomId('idea_description')
      .setLabel('Why It Fits Rounit / Core Value')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Why would community builders love this? What is the main problem it solves?')
      .setRequired(true)
      .setMaxLength(1000);

    const outlineInput = new TextInputBuilder()
      .setCustomId('idea_outline')
      .setLabel('Key Takeaways / Outline (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Step 1: ..., Step 2: ..., Key tools used...')
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(outlineInput)
    );

    await interaction.showModal(modal);
  },
};
