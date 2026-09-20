const Parser = require('rss-parser');
const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');

const CHANNEL_ID = 'UCDnkDKFlSYfwSPwTtZtgHyQ';
const DEFAULT_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const DEFAULT_POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

const defaultParser = new Parser({
  timeout: 10000, // 10-second network timeout to prevent hanging connections
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.js.org)',
  },
  customFields: {
    item: [
      ['yt:videoId', 'videoId'],
      ['yt:channelId', 'channelId'],
      ['media:group', 'mediaGroup'],
    ],
  },
});

/**
 * Checks the YouTube RSS feed for new video uploads and posts announcements.
 * Handles timeouts and network errors gracefully without crashing.
 *
 * @param {import('discord.js').Client} client
 * @param {object} options
 * @param {object} [options.parser] - Optional custom or mock parser
 * @param {string} [options.feedUrl] - Optional feed URL override
 * @param {boolean} [options.forceNotifyFirstRun] - If true, notify even on initial run (for testing)
 * @returns {Promise<{ newVideo: boolean, videoId?: string, title?: string, seeded?: boolean } | null>}
 */
async function checkYouTubeFeed(client, options = {}) {
  const parserInstance = options.parser || defaultParser;
  const feedUrl = options.feedUrl || DEFAULT_FEED_URL;

  let feed;
  try {
    feed = await parserInstance.parseURL(feedUrl);
  } catch (networkError) {
    console.warn(
      `[YOUTUBE POLL WARN] Network or timeout issue while checking YouTube feed: ${
        networkError.message || networkError
      }`
    );
    return null;
  }

  if (!feed || !feed.items || feed.items.length === 0) {
    return null;
  }

  const latest = feed.items[0];
  const videoId =
    latest.videoId ||
    (latest.id ? latest.id.replace(/^yt:video:/, '') : null) ||
    (latest.link ? new URL(latest.link).searchParams.get('v') : null);

  if (!videoId) {
    console.warn('[YOUTUBE POLL WARN] No valid videoId found in latest feed item.');
    return null;
  }

  const videoTitle = latest.title || 'New Video';
  const videoLink = latest.link || `https://www.youtube.com/watch?v=${videoId}`;
  const channelUrl = `https://www.youtube.com/channel/${CHANNEL_ID}`;
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const now = Math.floor(Date.now() / 1000);

  // 1. Check SQLite cache
  let cached;
  try {
    cached = db.prepare('SELECT lastVideoId FROM youtube_cache WHERE channelId = ?').get(CHANNEL_ID);
  } catch (dbErr) {
    console.error('[YOUTUBE DB ERROR] Failed to query youtube_cache:', dbErr);
    return null;
  }

  // 2. Initial run / Cold start: seed cache without sending notifications
  if (!cached) {
    try {
      db.prepare(`
        INSERT INTO youtube_cache (channelId, lastVideoId, title, publishedAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(CHANNEL_ID, videoId, videoTitle, latest.pubDate || new Date().toISOString(), now);
      console.log(`[YOUTUBE] Initialized video cache with latest videoId: ${videoId} ("${videoTitle}")`);
    } catch (insertErr) {
      console.error('[YOUTUBE DB ERROR] Failed to initialize youtube_cache:', insertErr);
    }

    if (!options.forceNotifyFirstRun) {
      return { seeded: true, videoId };
    }
  } else if (cached.lastVideoId === videoId) {
    // No new video uploaded
    return { newVideo: false, videoId };
  }

  // 3. New video detected! Construct notification payload
  console.log(`[YOUTUBE] New video upload detected: "${videoTitle}" (${videoId})`);

  const mention = process.env.YOUTUBE_NOTIFICATION_ROLE_ID
    ? `<@&${process.env.YOUTUBE_NOTIFICATION_ROLE_ID}>`
    : '@everyone';

  const messageText = `${mention} 🚀 New drop from Rounit! Stop typing, start building. Watch here:\n${videoLink}`;

  const embed = new EmbedBuilder()
    .setTitle(videoTitle)
    .setURL(videoLink)
    .setColor(0xff0000)
    .setAuthor({
      name: 'Rounieee',
      url: channelUrl,
      iconURL: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
    })
    .setImage(thumbnailUrl)
    .setDescription(`[Watch Video on YouTube](${videoLink})`)
    .setFooter({ text: 'YouTube Upload Notification' })
    .setTimestamp(latest.pubDate ? new Date(latest.pubDate) : new Date());

  // 4. Dispatch announcement to target channels
  if (client && client.guilds && client.guilds.cache) {
    for (const guild of client.guilds.cache.values()) {
      let targetChannel = null;

      if (process.env.YOUTUBE_NOTIFICATION_CHANNEL_ID) {
        targetChannel =
          guild.channels.cache.get(process.env.YOUTUBE_NOTIFICATION_CHANNEL_ID) || null;
      }

      if (!targetChannel) {
        const channels = Array.from(guild.channels.cache.values());
        targetChannel = channels.find(
          (c) =>
            c.isTextBased() &&
            (c.name.toLowerCase() === 'announcements' ||
              c.name.toLowerCase() === 'youtube-uploads' ||
              c.name.toLowerCase().includes('announcement') ||
              c.name.toLowerCase().includes('youtube'))
        );
      }

      if (targetChannel && targetChannel.isTextBased()) {
        try {
          await targetChannel.send({
            content: messageText,
            embeds: [embed],
          });
          console.log(`[YOUTUBE] Sent announcement to #${targetChannel.name} in guild: ${guild.name}`);
        } catch (sendErr) {
          console.error(
            `[YOUTUBE ERROR] Failed to send announcement to channel ${targetChannel.id}:`,
            sendErr.message
          );
        }
      }
    }
  }

  // 5. Update cache in SQLite
  try {
    db.prepare(`
      INSERT INTO youtube_cache (channelId, lastVideoId, title, publishedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channelId) DO UPDATE SET
        lastVideoId = excluded.lastVideoId,
        title = excluded.title,
        publishedAt = excluded.publishedAt,
        updatedAt = excluded.updatedAt
    `).run(CHANNEL_ID, videoId, videoTitle, latest.pubDate || new Date().toISOString(), now);
  } catch (updateErr) {
    console.error('[YOUTUBE DB ERROR] Failed to update youtube_cache:', updateErr);
  }

  return { newVideo: true, videoId, title: videoTitle, embed, messageText };
}

/**
 * Starts the recurring polling loop.
 *
 * @param {import('discord.js').Client} client
 * @param {object} [options]
 * @param {number} [options.intervalMs] - Polling interval in ms (defaults to 3 mins)
 * @returns {NodeJS.Timeout}
 */
function startYouTubePoller(client, options = {}) {
  const intervalMs = options.intervalMs || DEFAULT_POLL_INTERVAL_MS;

  console.log(
    `[YOUTUBE POLLER] Starting YouTube upload poller for channel ${CHANNEL_ID} (interval: ${
      intervalMs / 1000
    }s).`
  );

  // Initial check on startup
  checkYouTubeFeed(client, options).catch((err) => {
    console.warn('[YOUTUBE STARTUP WARN] Error during initial feed check:', err.message || err);
  });

  // Recurring check
  const timer = setInterval(() => {
    checkYouTubeFeed(client, options).catch((err) => {
      console.warn('[YOUTUBE INTERVAL WARN] Error during recurring feed check:', err.message || err);
    });
  }, intervalMs);

  return timer;
}

module.exports = {
  checkYouTubeFeed,
  startYouTubePoller,
  CHANNEL_ID,
  DEFAULT_FEED_URL,
  DEFAULT_POLL_INTERVAL_MS,
};
