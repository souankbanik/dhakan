/**
 * News Ingestion Engine (AI News Radar Service)
 * Provides channel resolution fallbacks and news radar dispatching
 */

const radarService = require('./radarService');

/**
 * Resolves the target AI news channel by checking configured ID first,
 * then falling back to finding a text channel named 'ai-news' by name.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} [guild]
 * @returns {import('discord.js').TextBasedChannel|null}
 */
function resolveAiNewsChannel(client, guild) {
  const targetChannel =
    (process.env.CHANNEL_AI_NEWS && client?.channels?.cache?.get(process.env.CHANNEL_AI_NEWS)) ||
    (guild?.channels?.cache?.find((c) => c.isTextBased() && c.name === 'ai-news')) ||
    (client?.channels?.cache?.find((c) => c.isTextBased() && c.name === 'ai-news')) ||
    null;

  if (!targetChannel) {
    console.warn('[RADAR] Warning: Target channel not found via CHANNEL_AI_NEWS or #ai-news by name.');
  }

  return targetChannel;
}

module.exports = {
  ...radarService,
  resolveAiNewsChannel,
};
