require('dotenv').config();
const path = require('node:path');

const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missingVars.length > 0) {
  console.warn(
    `[CONFIG WARN] Missing environment variables: ${missingVars.join(', ')}.`
  );
  console.warn(
    '[CONFIG WARN] If deploying on Render, please add these in your Render Dashboard -> Service -> Environment tab.'
  );
}

const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '1549348976841723974',
  guildId: process.env.GUILD_ID || '',
  rounitUserId: process.env.ROUNIT_USER_ID || '1517531053789544499',
  channels: {
    general: process.env.CHANNEL_GENERAL || '1514716972481515520',
    botCommands: process.env.CHANNEL_BOT_COMMANDS || '',
    aiNews: process.env.CHANNEL_AI_NEWS || '1551259324762947716',
  },
  CHANNEL_AI_NEWS: process.env.CHANNEL_AI_NEWS || '1551259324762947716',
  CHANNEL_GENERAL: process.env.CHANNEL_GENERAL || '1514716972481515520',
  databasePath: process.env.DB_PATH || process.env.DATABASE_PATH || path.join(__dirname, 'goku.sqlite'),
  missingVars,
};

module.exports = config;
