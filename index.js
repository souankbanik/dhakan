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
          wsStatus: client.ws ? client.ws.status : null,
          wsPing: client.ws ? Math.round(client.ws.ping) : null,
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

// 2. Initialize Command Collection & Command Definitions for Global Deployment
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// 3. Dynamically Load Command Files
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    // Clear require cache to guarantee latest changes are loaded
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      console.log(`[BOOT LOADER] Registered /${command.data.name} from ${file}`);
    } else {
      console.warn(`[BOOT WARNING] The command at ${file} is missing required "data" or "execute" properties.`);
    }
  }
} else {
  console.error(`[BOOT ERROR] Commands directory not found at: ${commandsPath}`);
}

// Load events dynamically from events directory
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
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
}

// 4. Interaction Gateway Listener
client.on('interactionCreate', async (interaction) => {
  // Only handle Chat Input (slash) commands
  if (interaction.isChatInputCommand()) {
    console.log(`[INTERACTION RECEIVED] /${interaction.commandName} invoked by ${interaction.user.tag} in channel ${interaction.channelId}`);

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`[INTERACTION MISMATCH] No matching command file found in client.commands for /${interaction.commandName}`);
      return interaction.reply({
        content: 'This command is not recognized or is temporarily unavailable.',
        ephemeral: true,
      }).catch(() => {});
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[EXECUTION CRASH] Error executing /${interaction.commandName}:`, error);

      const errorResponse = {
        content: 'An unexpected internal error occurred while executing this command.',
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorResponse).catch((err) => console.error('[FOLLOWUP FAILED]:', err));
      } else {
        await interaction.reply(errorResponse).catch((err) => console.error('[REPLY FAILED]:', err));
      }
    }
    return;
  }

  // Modals & Buttons handling
  try {
    if (interaction.isModalSubmit()) {
      if (
        interaction.customId === 'modal_connect' ||
        interaction.customId === 'connect_modal'
      ) {
        const { handleConnectModalSubmit } = require('./handlers/connectHandler');
        await handleConnectModalSubmit(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith('collab_connect_') ||
        interaction.customId.startsWith('connect_builder_')
      ) {
        const { handleConnectButton } = require('./handlers/connectHandler');
        await handleConnectButton(interaction);
        return;
      }

      if (
        interaction.customId === 'btn_about_commands' ||
        interaction.customId === 'btn_about_stack'
      ) {
        const { handleAboutButtons } = require('./commands/aboutgoku');
        await handleAboutButtons(interaction);
        return;
      }
    }
  } catch (componentError) {
    console.error('[INTERACTION ERROR] Component interaction error:', componentError);
  }
});

// Instant Guild Command Synchronization on Startup
client.once(Events.ClientReady, async () => {
  console.log(`[GOKU OS] Bot logged in as ${client.user.tag}`);
  console.log(`[GOKU OS] System online as ${client.user.tag}. Ready to process interactions.`);

  // Build the command payload array from loaded commands
  const commandPayload = [];
  client.commands.forEach((command) => {
    if ('data' in command && 'execute' in command) {
      commandPayload.push(command.data.toJSON());
    }
  });

  const token = process.env.DISCORD_TOKEN || config.token;
  const clientId = process.env.CLIENT_ID || config.clientId;

  if (!token || !clientId) {
    console.warn('[DEPLOY WARN] Skipping slash command sync: DISCORD_TOKEN or CLIENT_ID is missing.');
  } else {
    const rest = new REST({ version: '10' }).setToken(token);

    // Register commands directly to every joined server for instant 0s sync
    try {
      console.log(`[DEPLOY] Instant-syncing ${commandPayload.length} slash commands across all joined servers...`);

      for (const [guildId, guild] of client.guilds.cache) {
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commandPayload }
        );
        console.log(`[DEPLOY] Successfully synced commands instantly to guild: ${guild.name} (${guildId})`);
      }

      console.log('[DEPLOY] All server-level slash commands are now live and visible.');
    } catch (error) {
      console.error('[DEPLOY ERROR] Failed to push guild commands:', error);
    }
  }

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

// Instant sync commands if joining a new server
client.on(Events.GuildCreate, async (guild) => {
  console.log(`[GOKU OS] Joined new server: ${guild.name} (${guild.id}). Instant-syncing slash commands...`);
  const token = process.env.DISCORD_TOKEN || config.token;
  const clientId = process.env.CLIENT_ID || config.clientId;
  if (!token || !clientId) return;

  try {
    const commandPayload = [];
    client.commands.forEach((command) => {
      if ('data' in command && 'execute' in command) {
        commandPayload.push(command.data.toJSON());
      }
    });

    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationGuildCommands(clientId, guild.id),
      { body: commandPayload }
    );
    console.log(`[DEPLOY] Successfully synced commands instantly to guild: ${guild.name} (${guild.id})`);
  } catch (err) {
    console.error(`[DEPLOY ERROR] Failed to sync guild commands for new server ${guild.name}:`, err.message);
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
