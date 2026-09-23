const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');

// Define port provided by Render's environment, default to 3000 locally
const PORT = process.env.PORT || 3000;

// Create lightweight HTTP server for Render port binding and UptimeRobot pings
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'DHAKAN (Builder OS)',
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

// Load commands dynamically (recursive scan)
const commandsPath = path.join(__dirname, 'commands');

function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const command = require(fullPath);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[INIT] Registered command: /${command.data.name}`);
      } else {
        console.warn(`[WARN] The command at ${fullPath} is missing required 'data' or 'execute' properties.`);
      }
    }
  }
}

loadCommands(commandsPath);

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
  console.warn('[WARN] Please populate your .env file using .env.example as a guide.');
}
