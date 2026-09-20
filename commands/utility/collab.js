const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab')
    .setDescription('Find a co-builder, developer, or designer to build projects together')
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: '❌ This command can only be used within a server.',
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('collab_modal')
      .setTitle('Builder Matchmaker');

    const onelinerInput = new TextInputBuilder()
      .setCustomId('collab_oneliner')
      .setLabel('Project One-Liner')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('What are you building? e.g., AI-powered newsletter generator')
      .setRequired(true)
      .setMaxLength(150);

    const roleInput = new TextInputBuilder()
      .setCustomId('collab_role')
      .setLabel('Role Looking For (Frontend/Backend/AI/UI)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Frontend Engineer, AI Prompt Engineer, UI/UX Designer, etc.')
      .setRequired(true)
      .setMaxLength(100);

    const techInput = new TextInputBuilder()
      .setCustomId('collab_tech')
      .setLabel('Tech Stack Involved')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Next.js, Python, Supabase, Tailwind, Cursor, etc.')
      .setRequired(true)
      .setMaxLength(150);

    modal.addComponents(
      new ActionRowBuilder().addComponents(onelinerInput),
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(techInput)
    );

    await interaction.showModal(modal);
  },
};
