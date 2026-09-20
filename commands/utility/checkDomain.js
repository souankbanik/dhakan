const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkDomain } = require('../../utils/checkDomain');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check-domain')
    .setDescription('Check if a domain is registered and inspect DNS resolution status via Cloudflare DoH')
    .addStringOption((option) =>
      option
        .setName('domain')
        .setDescription('Domain name to check (e.g. example.com, mycoolapp.io)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawDomain = interaction.options.getString('domain');
    await interaction.deferReply();

    const result = await checkDomain(rawDomain);

    const embed = new EmbedBuilder()
      .setTitle(`🌐 Domain Check: ${result.domain || rawDomain}`)
      .setTimestamp();

    if (result.status === -1) {
      embed
        .setColor(0xed4245)
        .setDescription(`❌ **Error:** ${result.statusText}\nPlease provide a valid domain name (e.g. \`myapp.com\`).`);
    } else if (result.registered) {
      embed
        .setColor(0x3498db)
        .setDescription(`🔒 **Domain is REGISTERED / ACTIVE**\nThis domain name is currently claimed and configured.`)
        .addFields(
          { name: 'Domain', value: `\`${result.domain}\``, inline: true },
          { name: 'DNS Status', value: `\`${result.statusText}\``, inline: true },
          {
            name: 'Resolved IPs (A Records)',
            value:
              result.ips.length > 0
                ? result.ips.map((ip) => `\`${ip}\``).join(', ')
                : '*No direct A records (may use CNAME / Cloudflare proxy / Nameservers)*',
            inline: false,
          }
        );
    } else {
      embed
        .setColor(0x2ecc71)
        .setDescription(`🟢 **Domain appears AVAILABLE / UNREGISTERED!**\nNo active DNS records found (NXDOMAIN). Go grab it before someone else does!`)
        .addFields(
          { name: 'Domain', value: `\`${result.domain}\``, inline: true },
          { name: 'DNS Status', value: `\`${result.statusText}\``, inline: true }
        );
    }

    embed.setFooter({ text: 'Powered by Cloudflare DNS-over-HTTPS (DoH)' });

    await interaction.editReply({ embeds: [embed] });
  },
};
