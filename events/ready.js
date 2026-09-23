const { Events, ActivityType } = require('discord.js');

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
  },
};
