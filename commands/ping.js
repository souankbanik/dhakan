const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check GOKU response latency and Discord API heartbeat'),

  async execute(interaction) {
    // Acknowledge interaction immediately (<50ms) to satisfy Discord's 3-second window
    await interaction.deferReply();

    const latency = Date.now() - interaction.createdTimestamp;
    const wsPing = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(latency < 300 ? 0x57f287 : latency < 700 ? 0xfee75c : 0xed4245)
      .addFields(
        { name: '⚡ Roundtrip Latency', value: `\`${latency} ms\``, inline: true },
        { name: '💓 WebSocket Heartbeat', value: `\`${wsPing >= 0 ? wsPing : 0} ms\``, inline: true },
        { name: '🛰️ Service Status', value: '`GOKU Utility OS • Active`', inline: true }
      )
      .setFooter({ text: 'GOKU System Health • Realtime Latency' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
