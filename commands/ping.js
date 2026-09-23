const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and gateway connection'),
  async execute(interaction) {
    const sent = await interaction.reply({
      content: 'Pinging...',
      fetchReply: true,
    });

    const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const websocketLatency = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor('#70a6ff')
      .setTitle('Pong')
      .setDescription(`**Roundtrip Latency:** ${roundtripLatency}ms\n**WebSocket Heartbeat:** ${websocketLatency}ms`)
      .setFooter({ text: 'GOKU OS • Built by master pusher' });

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
