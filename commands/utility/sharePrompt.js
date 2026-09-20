const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('share-prompt')
    .setDescription('Share a tested AI prompt or workflow with the community')
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: '❌ This command can only be used within a server.',
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('share_prompt_modal')
      .setTitle('Share Community Prompt');

    const titleInput = new TextInputBuilder()
      .setCustomId('prompt_title')
      .setLabel('Prompt Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Next.js 15 Clean Architecture System Prompt')
      .setRequired(true)
      .setMaxLength(100);

    const categoryInput = new TextInputBuilder()
      .setCustomId('prompt_category')
      .setLabel('Tool/Category (Cursor, v0, Claude, System)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Cursor, v0, Claude, System Prompt, etc.')
      .setRequired(true)
      .setMaxLength(50);

    const contentInput = new TextInputBuilder()
      .setCustomId('prompt_content')
      .setLabel('Prompt Text')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the exact prompt text, instructions, and rules here...')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(categoryInput),
      new ActionRowBuilder().addComponents(contentInput)
    );

    await interaction.showModal(modal);
  },
};
