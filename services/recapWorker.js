/**
 * Sunday Midnight Recap Worker
 * Posts the top 3 projects and top 3 builders of the week to #general every Sunday at 00:00 UTC,
 * then resets weeklyPoints for the next cycle.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../config');

/**
 * Runs the weekly Sunday recap, posting top ships and top builders to #general.
 *
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ posted: boolean, topProjects: Array, topBuilders: Array }>}
 */
async function runSundayRecap(client) {
  if (!client) return { posted: false, topProjects: [], topBuilders: [] };

  try {
    const guild = client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
    if (!guild) return { posted: false, topProjects: [], topBuilders: [] };

    // Query Top 3 Projects
    let topProjects = [];
    try {
      topProjects = db
        .prepare(`
          SELECT id, title, userId, upvoteCount, techStack, description
          FROM projects
          WHERE status = 'APPROVED'
          ORDER BY upvoteCount DESC, id DESC
          LIMIT 3
        `)
        .all();
    } catch {
      topProjects = db
        .prepare(`
          SELECT id, projectName AS title, userId, upvoteCount, techStack, description
          FROM project_showcases
          WHERE status = 'APPROVED'
          ORDER BY upvoteCount DESC, id DESC
          LIMIT 3
        `)
        .all();
    }

    // Query Top 3 Builders by weeklyPoints
    const topBuilders = db
      .prepare(`
        SELECT userId, weeklyPoints, vibePoints
        FROM users
        WHERE weeklyPoints > 0
        ORDER BY weeklyPoints DESC
        LIMIT 3
      `)
      .all();

    // Build Recap Embed
    const recapEmbed = new EmbedBuilder()
      .setTitle('🌟 Rounit HQ Weekly Recap — Top Ships & Builders!')
      .setDescription(
        'Another massive week of shipping, vibe coding, and building! Here are this week\'s standout creators and projects:'
      )
      .setColor(0xf1c40f)
      .setTimestamp();

    // Add Projects Field
    if (topProjects.length > 0) {
      const projectLines = topProjects.map((p, idx) => {
        const medal = ['🥇', '🥈', '🥉'][idx] || '⭐';
        return `${medal} **${p.title}** by <@${p.userId}>\n   🔥 Upvotes: \`${p.upvoteCount || 0}\` • Stack: \`${p.techStack || 'N/A'}\``;
      });
      recapEmbed.addFields({
        name: '🚀 Top Projects of the Week',
        value: projectLines.join('\n\n'),
      });
    } else {
      recapEmbed.addFields({
        name: '🚀 Top Projects of the Week',
        value: '*No projects submitted this week. Be the first to ship via `/showcase`!*',
      });
    }

    // Add Builders Field
    if (topBuilders.length > 0) {
      const builderLines = topBuilders.map((b, idx) => {
        const medal = ['👑', '⚡', '✨'][idx] || '🔹';
        return `${medal} <@${b.userId}> — **${b.weeklyPoints} VP** earned this week (Total: \`${b.vibePoints} VP\`)`;
      });
      recapEmbed.addFields({
        name: '🏆 Top Builders of the Week',
        value: builderLines.join('\n'),
      });
    } else {
      recapEmbed.addFields({
        name: '🏆 Top Builders of the Week',
        value: '*No points earned this week. Start logging via `/log` or rating models via `/rate-model`!*',
      });
    }

    recapEmbed.setFooter({
      text: 'Weekly points have been reset for the new week • Keep shipping!',
    });

    // Post to #general
    const generalChannelId = config.channels?.general || process.env.CHANNEL_GENERAL;
    let targetChannel = generalChannelId ? guild.channels.cache.get(generalChannelId) : null;

    if (!targetChannel) {
      const channels = Array.from(guild.channels.cache.values());
      targetChannel = channels.find(
        (c) =>
          c.isTextBased() &&
          ((generalChannelId && c.id === generalChannelId) ||
            c.name.toLowerCase() === 'general' ||
            c.name.toLowerCase().includes('announcement'))
      );
    }

    if (targetChannel && targetChannel.isTextBased()) {
      await targetChannel.send({ embeds: [recapEmbed] });
      console.log('[RECAP WORKER] Posted weekly Sunday recap to general channel.');
    }

    // Reset weeklyPoints for all users
    try {
      db.prepare('UPDATE users SET weeklyPoints = 0').run();
      console.log('[RECAP WORKER] Reset weeklyPoints for all users.');
    } catch (resetErr) {
      console.error('[RECAP WORKER] Failed to reset weeklyPoints:', resetErr);
    }

    return { posted: true, topProjects, topBuilders };
  } catch (err) {
    console.error('[RECAP WORKER ERROR] Failed to run Sunday recap:', err);
    return { posted: false, topProjects: [], topBuilders: [] };
  }
}

/**
 * Calculates milliseconds until next Sunday 00:00:00 UTC.
 *
 * @returns {number}
 */
function msUntilNextSundayUTC() {
  const now = new Date();
  const nextSunday = new Date(now);
  // Sunday is day 0 in UTC
  const daysUntilSunday = (7 - now.getUTCDay()) % 7;
  nextSunday.setUTCDate(now.getUTCDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
  nextSunday.setUTCHours(0, 0, 0, 0);

  const diff = nextSunday.getTime() - now.getTime();
  return diff > 0 ? diff : 7 * 24 * 60 * 60 * 1000;
}

/**
 * Starts the weekly Sunday recap scheduler.
 *
 * @param {import('discord.js').Client} client
 * @returns {NodeJS.Timeout}
 */
function startRecapWorker(client) {
  console.log('[RECAP WORKER] Initializing Sunday midnight UTC recap scheduler.');

  // Poller checking every minute if Sunday 00:00 UTC has arrived
  let lastRanWeekNumber = -1;

  const interval = setInterval(() => {
    const now = new Date();
    // Sunday is 0, hour 0, minute 0-2
    if (now.getUTCDay() === 0 && now.getUTCHours() === 0 && now.getUTCMinutes() < 3) {
      // Calculate week number to prevent duplicate triggers in the same window
      const weekNumber = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
      if (lastRanWeekNumber !== weekNumber) {
        lastRanWeekNumber = weekNumber;
        runSundayRecap(client).catch((err) =>
          console.error('[RECAP WORKER] Error running weekly recap:', err)
        );
      }
    }
  }, 60 * 1000); // check once per minute

  if (interval.unref) interval.unref();
  return interval;
}

module.exports = {
  runSundayRecap,
  startRecapWorker,
  msUntilNextSundayUTC,
};
