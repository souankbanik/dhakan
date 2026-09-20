const { Events, ActivityType } = require('discord.js');
const { startYouTubePoller } = require('../services/youtubePoller');
const { startBountyWorker } = require('../services/bountyWorker');
const { startStatsChannelWorker } = require('../services/statsChannelWorker');
const { startRecapWorker } = require('../services/recapWorker');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[READY] Logged in as ${client.user.tag} (ID: ${client.user.id})`);
    console.log(`[READY] Serving ${client.guilds.cache.size} guild(s) and ${client.users.cache.size} cached user(s).`);

    client.user.setPresence({
      activities: [{ name: 'over the server', type: ActivityType.Watching }],
      status: 'online',
    });

    // Start YouTube RSS upload poller (runs every 3 minutes)
    try {
      startYouTubePoller(client);
    } catch (pollerErr) {
      console.error('[READY] Failed to initialize YouTube poller:', pollerErr);
    }

    // Start Anti-Ghosting Bounty Worker (runs every 6 hours)
    try {
      startBountyWorker(client);
    } catch (bountyErr) {
      console.error('[READY] Failed to initialize Bounty worker:', bountyErr);
    }

    // Start Dynamic Stats Channel Worker (runs every 15 minutes)
    try {
      startStatsChannelWorker(client);
    } catch (statsErr) {
      console.error('[READY] Failed to initialize Stats Channel worker:', statsErr);
    }

    // Start Sunday Midnight Recap Worker (runs every Sunday at 00:00 UTC)
    try {
      startRecapWorker(client);
    } catch (recapErr) {
      console.error('[READY] Failed to initialize Recap worker:', recapErr);
    }
  },
};

