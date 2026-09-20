/**
 * Dynamic Stats Channel Worker
 * Periodically updates a dedicated stats channel/voice name with the total approved projects count.
 * Runs every 15 minutes to stay well within Discord API rate limits.
 */

const db = require('../database/db');
const config = require('../config');

const STATS_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Counts total approved projects and updates channel name.
 *
 * @param {import('discord.js').Client} client
 */
async function updateDynamicStatsChannel(client) {
  if (!client || !client.guilds) return;

  try {
    const guild = client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
    if (!guild) return;

    // Count approved projects
    let count = 0;
    try {
      const row = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE status = 'APPROVED'").get();
      count = row?.count || 0;
    } catch {
      const altRow = db.prepare("SELECT COUNT(*) AS count FROM project_showcases WHERE status = 'APPROVED'").get();
      count = altRow?.count || 0;
    }

    const targetName = `📦 Projects: ${count}`;

    // Find stats channel
    const channels = Array.from(guild.channels.cache.values());
    const statsChannel = channels.find(
      (c) =>
        c.name.startsWith('📦 Projects:') ||
        c.name.startsWith('📊 Shipped:') ||
        c.name.startsWith('📦 Shipped:') ||
        (process.env.CHANNEL_STATS && c.id === process.env.CHANNEL_STATS)
    );

    if (statsChannel) {
      if (statsChannel.name !== targetName && statsChannel.setName) {
        await statsChannel.setName(targetName, 'Periodic dynamic stats update');
        console.log(`[STATS WORKER] Updated stats channel to "${targetName}"`);
      }
    }
  } catch (err) {
    console.warn('[STATS WORKER WARN] Could not update stats channel:', err.message);
  }
}

/**
 * Starts the dynamic stats channel background worker.
 *
 * @param {import('discord.js').Client} client
 * @returns {NodeJS.Timeout}
 */
function startStatsChannelWorker(client) {
  console.log('[STATS WORKER] Initializing dynamic stats channel worker (interval: 15m).');

  // Initial update
  updateDynamicStatsChannel(client).catch(() => {});

  const interval = setInterval(() => {
    updateDynamicStatsChannel(client).catch(() => {});
  }, STATS_INTERVAL_MS);

  if (interval.unref) interval.unref();
  return interval;
}

module.exports = {
  updateDynamicStatsChannel,
  startStatsChannelWorker,
  STATS_INTERVAL_MS,
};
