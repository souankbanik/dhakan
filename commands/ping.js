const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check GOKU response latency and Discord API heartbeat'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(roundtrip < 250 ? 0x57f287 : roundtrip < 500 ? 0xfee75c : 0xed4245)
      .addFields(
        { name: '⚡ Roundtrip Latency', value: `\`${roundtrip} ms\``, inline: true },
        { name: '💓 WebSocket Heartbeat', value: `\`${wsPing >= 0 ? wsPing : 0} ms\``, inline: true },
        { name: '🛰️ Service Status', value: '`GOKU Utility OS • Active`', inline: true }
      )
      .setFooter({ text: 'GOKU System Health • Realtime Latency' })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
