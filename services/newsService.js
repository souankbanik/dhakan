/**
 * News Ingestion Engine (AI News Radar Service)
 * Direct news broadcaster targeting designated channel with permission checks
 */

const radarService = require('./radarService');

/**
 * Broadcasts an AI news embed directly to the designated AI News channel.
 * @param {import('discord.js').Client} client - The Discord Client instance.
 * @param {import('discord.js').EmbedBuilder} embed - The formatted news embed payload.
 */
async function dispatchNewsToTargetChannel(client, embed) {
  const targetChannelId = process.env.CHANNEL_AI_NEWS || '1551259324762947716';

  try {
    const channel = await client.channels.fetch(targetChannelId);

    if (!channel || !channel.isTextBased()) {
      console.error(`[AI RADAR ERROR] Channel ${targetChannelId} not found or is not a text channel.`);
      return;
    }

    // Verify write permissions
    const permissions = channel.permissionsFor(client.user);
    const required = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
    const missing = required.filter((perm) => !permissions || !permissions.has(perm));
    if (missing.length > 0) {
      console.warn(
        `[AI RADAR NOTICE] Bot lacks [${missing.join(', ')}] permissions in #${channel.name} (${targetChannelId}). ` +
        `In read-only channels, please add a channel permission override for the GOKU role with 'Send Messages' and 'Embed Links' enabled so it can broadcast drops.`
      );
      return;
    }

    await channel.send({ embeds: [embed] });
    console.log(`[AI RADAR] Successfully dispatched news update to #${channel.name} (${targetChannelId}).`);
  } catch (error) {
    console.error(`[AI RADAR ERROR] Failed to send news to channel ${targetChannelId}:`, error.message);
  }
}

/**
 * Fetches latest AI news drops and dispatches formatted embeds to the designated target channel.
 * @param {import('discord.js').Client} client - The Discord Client instance.
 */
async function fetchAndDispatchLatestNews(client) {
  const drops = await radarService.getLatestDrops();
  let unposted = await radarService.getUnpostedDrops();

  // If all drops were already posted, use the freshest drop for startup verification
  if (unposted.length === 0 && drops.length > 0) {
    unposted = [drops[0]];
  }

  if (unposted.length === 0) {
    console.log('[AI RADAR] No news drops available to dispatch.');
    return;
  }

  // Dispatch the latest news item
  const drop = unposted[0];
  const embed = radarService.buildRadarEmbed(drop);

  await dispatchNewsToTargetChannel(client, embed);

  radarService.recordDrop(drop.id);
  if (drop.rawId) {
    radarService.recordDrop(drop.rawId);
  }
}

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
  dispatchNewsToTargetChannel,
  fetchAndDispatchLatestNews,
  resolveAiNewsChannel,
};
