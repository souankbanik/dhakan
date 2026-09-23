const { Events, ActivityType } = require('discord.js');
const { startRadarCron } = require('../services/radarService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[GOKU OS] Logged in successfully as ${client.user.tag} (ID: ${client.user.id})`);
    console.log(`[GOKU OS] Serving ${client.guilds.cache.size} guild(s) and ${client.users.cache.size} cached user(s).`);

    client.user.setPresence({
      activities: [{ name: 'over builder builds', type: ActivityType.Watching }],
      status: 'online',
    });

    // Start 10-minute Full-Spectrum AI Radar cron dispatcher
    try {
      startRadarCron(client);
    } catch (cronErr) {
      console.error('[READY] Failed to initialize AI Model Radar cron service:', cronErr);
    }
  },
};
