const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');

// Ensure database schema is initialized
const { initDatabase } = require('./database/init');
const db = require('./database/db');
initDatabase();

// Instantiate Discord client with standard intents for guilds, messages, and voice
const baseIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
];

// Privileged Gateway Intents (MessageContent, GuildMembers) require toggles in Discord Developer Portal
if (process.env.ENABLE_MESSAGE_CONTENT === 'true') {
  baseIntents.push(GatewayIntentBits.MessageContent);
}
if (process.env.ENABLE_GUILD_MEMBERS === 'true') {
  baseIntents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({
  intents: baseIntents,
  partials: [Partials.Channel, Partials.Message],
});

// Attach command collection and database reference to client
client.commands = new Collection();
client.db = db;

// Load commands dynamically from categorized subdirectories
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;

  const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(folderPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`[INIT] Registered command: /${command.data.name} (${folder})`);
    } else {
      console.warn(`[WARN] The command at ${filePath} is missing required 'data' or 'execute' properties.`);
    }
  }
}

// Load events dynamically from events directory
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[INIT] Registered event: ${event.name}`);
}

// Global process error handlers for production stability
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
});

// Graceful shutdown handling
const shutdown = () => {
  console.log('\n[SHUTDOWN] Gracefully closing connections...');
  try {
    db.close();
    console.log('[SHUTDOWN] Database connection closed.');
  } catch (err) {
    console.error('[SHUTDOWN ERROR] Error closing database:', err);
  }

  client.destroy();
  console.log('[SHUTDOWN] Discord client destroyed. Exiting process.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Bot login
if (config.token) {
  client.login(config.token).catch(err => {
    console.error('[FATAL] Failed to login to Discord:', err);
  });
} else {
  console.warn('[WARN] No DISCORD_TOKEN found in environment. Bot client will not log in.');
  console.warn('[WARN] Please populate your .env file using .env.example as a guide.');
}
