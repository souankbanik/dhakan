const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

/**
 * Community Project Showcase Command
 * Routes submissions directly to CHANNEL_CURATION_QUEUE (Curation Review Queue).
 * Note: CHANNEL_PRODUCT_TEST is kept strictly isolated for the Google Play testing system.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('showcase')
    .setDescription('Submit your project to the community showcase')
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: '❌ This command can only be used within a server.',
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('showcase_modal')
      .setTitle('Community Project Showcase');

    const nameInput = new TextInputBuilder()
      .setCustomId('showcase_name')
      .setLabel('Project / App Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter the title of your project')
      .setRequired(true)
      .setMaxLength(100);

    const linkInput = new TextInputBuilder()
      .setCustomId('showcase_link')
      .setLabel('Live Demo / Repo Link')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://github.com/... or https://myapp.com')
      .setRequired(true)
      .setMaxLength(200);

    const techInput = new TextInputBuilder()
      .setCustomId('showcase_tech')
      .setLabel('Tech Stack / AI Tools Used')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Cursor, Antigravity, Next.js, FastAPI')
      .setRequired(true)
      .setMaxLength(150);

    const descInput = new TextInputBuilder()
      .setCustomId('showcase_description')
      .setLabel('What does it do?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what your app does, its features, and how you built it...')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(linkInput),
      new ActionRowBuilder().addComponents(techInput),
      new ActionRowBuilder().addComponents(descInput)
    );

    await interaction.showModal(modal);
  },
};
