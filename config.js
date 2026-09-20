require('dotenv').config();

const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missingVars.length > 0) {
  throw new Error(
    `[STARTUP ERROR] Missing required environment variables: ${missingVars.join(', ')}. Please check your .env file.`
  );
}

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  channels: {
    general: process.env.CHANNEL_GENERAL,
    botCommands: process.env.CHANNEL_BOT_COMMANDS,
    showcase: process.env.CHANNEL_SHOWCASE || process.env.CHANNEL_COMMUNITY_BUILDS,
    communityBuilds: process.env.CHANNEL_COMMUNITY_BUILDS || process.env.CHANNEL_SHOWCASE,
    aiLeaderboard: process.env.CHANNEL_AI_LEADERBOARD,
    coworkingVoice: process.env.CHANNEL_COWORKING_VOICE || process.env.CHANNEL_COWORKING || process.env.CHANNEL_WELCOME_VC,
    coworking: process.env.CHANNEL_COWORKING || process.env.CHANNEL_WELCOME_VC,
    welcomeVc: process.env.CHANNEL_WELCOME_VC || process.env.CHANNEL_COWORKING || process.env.WELCOME_CHANNEL_ID,
    curationQueue: process.env.CHANNEL_CURATION_QUEUE || process.env.CHANNEL_STAFF_REVIEW || process.env.CHANNEL_REVIEW_QUEUE,
    productTest: process.env.CHANNEL_PRODUCT_TEST, // Strictly isolated for Google Play testing system
    staffReview: process.env.CHANNEL_CURATION_QUEUE || process.env.CHANNEL_STAFF_REVIEW,
    videoPipeline: process.env.CHANNEL_VIDEO_PIPELINE || process.env.CHANNEL_STAFF_LOGS,
    staffLogs: process.env.CHANNEL_STAFF_LOGS || process.env.CHANNEL_VIDEO_PIPELINE,
    videoLogs: process.env.CHANNEL_VIDEO_PIPELINE || process.env.CHANNEL_STAFF_LOGS,
  },
  rounitUserId: process.env.ROUNIT_USER_ID || '1517531053789544499',
  databasePath: process.env.DB_PATH || process.env.DATABASE_PATH || './database.sqlite',
  youtube: {
    channelId: process.env.YOUTUBE_NOTIFICATION_CHANNEL_ID,
    roleId: process.env.YOUTUBE_NOTIFICATION_ROLE_ID,
  },
};

module.exports = config;
