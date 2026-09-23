require('dotenv').config();
const path = require('node:path');

const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missingVars.length > 0) {
  throw new Error(
    `[STARTUP ERROR] Missing required environment variables: ${missingVars.join(', ')}. Please check your .env file.`
  );
}

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID || '1549348976841723974',
  guildId: process.env.GUILD_ID || '1547976915628068975',
  rounitUserId: process.env.ROUNIT_USER_ID || '1517531053789544499',
  channels: {
    general: process.env.CHANNEL_GENERAL || '1547976917125177417',
    botCommands: process.env.CHANNEL_BOT_COMMANDS || '1549346668359716924',
    aiNews: process.env.CHANNEL_AI_NEWS || '1551629280604332053',
  },
  databasePath: process.env.DB_PATH || process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite'),
};

module.exports = config;
