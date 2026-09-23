const { Events } = require('discord.js');
const {
  handleConnectModalSubmit,
  handleConnectButton,
} = require('../handlers/connectHandler');
const { handleAboutButtons } = require('../commands/aboutgoku');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // 1. Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`[WARN] No command matching '${interaction.commandName}' was found.`);
          return;
        }
        await command.execute(interaction);
        return;
      }

      // 2. Modals
      if (interaction.isModalSubmit()) {
        if (
          interaction.customId === 'modal_connect' ||
          interaction.customId === 'connect_modal'
        ) {
          await handleConnectModalSubmit(interaction);
          return;
        }
      }

      // 3. Buttons
      if (interaction.isButton()) {
        // Builder Matchmaker connect button
        if (
          interaction.customId.startsWith('collab_connect_') ||
          interaction.customId.startsWith('connect_builder_')
        ) {
          await handleConnectButton(interaction);
          return;
        }

        // About GOKU overview buttons
        if (
          interaction.customId === 'btn_about_commands' ||
          interaction.customId === 'btn_about_stack'
        ) {
          await handleAboutButtons(interaction);
          return;
        }
      }
    } catch (error) {
      console.error('[ERROR] Error processing interaction:', error);

      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      const errorMessage = {
        content: 'There was an error while executing this interaction!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => null);
      } else {
        await interaction.reply(errorMessage).catch(() => null);
      }
    }
  },
};
