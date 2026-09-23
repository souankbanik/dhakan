const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const token = process.env.DISCORD_TOKEN || config.token;
const clientId = process.env.CLIENT_ID || config.clientId;
const guildId = process.env.GUILD_ID || config.guildId;

if (!token || !clientId) {
  console.warn('[DEPLOY WARN] Skipping slash command deployment: DISCORD_TOKEN or CLIENT_ID is missing.');
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

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    // If a legacy guild ID was previously used, clean its guild-scoped commands to prevent duplicates
    if (guildId) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log(`[DEPLOY] Cleaned up legacy guild-scoped commands for guild ${guildId}.`);
      } catch (cleanErr) {
        console.warn(`[DEPLOY WARN] Notice: Could not clear guild-scoped commands for guild ${guildId}:`, cleanErr.message);
      }
    }

    console.log(`[DEPLOY] Registering ${commands.length} application (/) commands globally...`);

    // Register globally across all guilds
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log(`[DEPLOY] Successfully reloaded ${data.length} application (/) commands globally (HTTP 200 OK):`);
    for (const cmd of data) {
      console.log(`  ✓ /${cmd.name} (ID: ${cmd.id})`);
    }
  } catch (error) {
    console.error('[DEPLOY] Global deployment failed:', error);
    process.exit(1);
  }
})();
