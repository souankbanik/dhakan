const fs = require('node:fs');
const path = require('node:path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const config = require('./config');

if (!config.token || !config.clientId || !config.guildId) {
  console.warn('[DEPLOY WARN] Skipping slash command deployment: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID is missing.');
  console.warn('[DEPLOY WARN] If running on Render, please configure your environment variables in the Render Dashboard.');
  process.exit(0);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

/**
 * Recursively scans directory for command files.
 */
function loadCommandsRecursively(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommandsRecursively(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const command = require(fullPath);
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        const relPath = path.relative(commandsPath, fullPath).replace(/\\/g, '/');
        console.log(`[LOAD] Loaded command '/${command.data.name}' from ${relPath}`);
      } else {
        console.warn(`[WARN] Command at ${fullPath} is missing required 'data' or 'execute' properties.`);
      }
    }
  }
}

loadCommandsRecursively(commandsPath);

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log(`[DEPLOY] Started refreshing ${commands.length} application (/) commands.`);
    console.log(`[DEPLOY] Target Guild ID: ${config.guildId}`);
    console.log(`[DEPLOY] Target Client ID: ${config.clientId}`);

    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );

    console.log(`[DEPLOY] Successfully reloaded ${data.length} application (/) commands (HTTP 200 OK):`);
    for (const cmd of data) {
      console.log(`  ✓ /${cmd.name} (ID: ${cmd.id})`);
    }
  } catch (error) {
    console.error('[DEPLOY ERROR] Failed to register application commands:', error);
    // Don't kill container startup in production if rate-limited
    process.exit(0);
  }
})();
