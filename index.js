const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes, Events } = require('discord.js');
const config = require('./config');
const { fetchAndDispatchLatestNews } = require('./services/newsService');

console.log('[GOKU OS] Starting up...');

// Define port provided by Render's environment, default to 3000 locally
const PORT = process.env.PORT || 3000;

// Create lightweight HTTP server for Render port binding and UptimeRobot pings
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'GOKU (Utility OS)',
        creator: 'master pusher',
        discord: {
          tokenConfigured: Boolean(config.token),
          loggedIn: Boolean(client.user),
          botTag: client.user ? client.user.tag : null,
        },
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.on('error', (err) => {
  console.error('[HealthCheck] Server error:', err.message);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HealthCheck] Web server active and listening on port ${PORT}`);
});

// Ensure database schema is initialized
const { initDatabase } = require('./database/init');
const db = require('./database/db');
initDatabase();

// Instantiate Discord client with standard intents for guilds and messages
const baseIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
];

const client = new Client({
  intents: baseIntents,
  partials: [Partials.Channel, Partials.Message],
});

// Attach command collection and database reference to client
client.commands = new Collection();
client.db = db;

// Load command files and prepare JSON payload for instant deployment
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`[LOADED] Command /${command.data.name}`);
  } else {
    console.warn(`[WARN] The command at ${filePath} is missing "data" or "execute".`);
  }
}

// Load events dynamically from events directory
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[GOKU OS] Registered event: ${event.name}`);
}

// Register Commands & Purge Duplicate Guild Registrations on Startup
client.once(Events.ClientReady, async () => {
  console.log(`[GOKU OS] Bot logged in successfully as ${client.user.tag}`);
  const token = process.env.DISCORD_TOKEN || config.token;
  const clientId = process.env.CLIENT_ID || config.clientId;

  if (!token || !clientId) {
    console.warn('[DEPLOY WARN] Skipping slash command sync: DISCORD_TOKEN or CLIENT_ID is missing.');
  } else {
    const rest = new REST({ version: '10' }).setToken(token);

    try {
      // Step 1: Wipe duplicate guild-scoped commands in every joined guild
      console.log('[DEPLOY] Purging redundant guild-level slash commands...');
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [] }
          );
          console.log(`[DEPLOY] Cleared guild commands for: ${guild.name} (${guildId})`);
        } catch (guildErr) {
          console.warn(`[DEPLOY WARN] Failed to clear guild commands for ${guild.name} (${guildId}):`, guildErr.message);
        }
      }

      // Step 2: Ensure single global registry contains the current commands
      console.log(`[DEPLOY] Registering ${commands.length} application commands globally...`);
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('[DEPLOY] Global registration complete. Duplicates resolved.');
    } catch (error) {
      console.error('[DEPLOY ERROR] Failed to clean/deploy commands:', error);
    }
  }

  console.log(`[GOKU OS] System online as ${client.user.tag}.`);

  // 1. Instant test dispatch on boot
  try {
    console.log('[AI RADAR] Triggering startup news verification...');
    await fetchAndDispatchLatestNews(client);
  } catch (err) {
    console.error('[AI RADAR STARTUP ERROR]:', err);
  }

  // 2. Schedule recurring checks (every 30 minutes)
  setInterval(async () => {
    try {
      await fetchAndDispatchLatestNews(client);
    } catch (err) {
      console.error('[AI RADAR LOOP ERROR]:', err);
    }
  }, 30 * 60 * 1000);
});

// Clean any redundant guild commands if joining a server
client.on(Events.GuildCreate, async (guild) => {
  console.log(`[GOKU OS] Joined new server: ${guild.name} (${guild.id}). Ensuring clean global slash commands...`);
  const token = process.env.DISCORD_TOKEN || config.token;
  const clientId = process.env.CLIENT_ID || config.clientId;
  if (!token || !clientId) return;

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationGuildCommands(clientId, guild.id),
      { body: [] }
    );
    console.log(`[DEPLOY] Verified clean commands for new server: ${guild.name}`);
  } catch (err) {
    console.error(`[DEPLOY ERROR] Failed to clear guild commands for new server ${guild.name}:`, err.message);
  }
});

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
    if (server && server.listening) {
      server.close();
      console.log('[SHUTDOWN] HTTP server closed.');
    }
    db.close();
    console.log('[SHUTDOWN] Database connection closed.');
  } catch (err) {
    console.error('[SHUTDOWN ERROR] Error during shutdown:', err);
  }

  client.destroy();
  console.log('[SHUTDOWN] Discord client destroyed. Exiting process.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Bot login
if (config.token) {
  client.login(config.token).catch((err) => {
    console.error('[FATAL] Failed to login to Discord:', err);
  });
} else {
  console.warn('[WARN] No DISCORD_TOKEN found in environment. Bot client will not log in.');
  console.warn('[WARN] If running on Render: Open Render Dashboard -> Your Service -> Environment -> Add DISCORD_TOKEN');
}
