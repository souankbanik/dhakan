const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkDomain, cleanDomainName } = require('../utils/checkDomain');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check-domain')
    .setDescription('Check if a domain name is available or registered')
    .addStringOption((option) =>
      option
        .setName('domain')
        .setDescription('Domain to inspect (e.g. vibestudio.dev)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawDomain = interaction.options.getString('domain', true);
    const domain = cleanDomainName(rawDomain);

    if (!domain || !domain.includes('.')) {
      return interaction.reply({
        content: '❌ Please provide a valid domain name with a TLD (e.g., `buildwithai.com`).',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const result = await checkDomain(domain);

    if (result.status === 3) {
      // Status 3 = NXDOMAIN: Domain is available
      const embed = new EmbedBuilder()
        .setTitle(`🌐 Domain Available: ${result.domain}`)
        .setColor(0x57f287)
        .setDescription(`✅ \`${result.domain}\` appears to be unregistered and available!`)
        .addFields(
          { name: 'DNS Status', value: '`NXDOMAIN (Status 3)`', inline: true },
          { name: 'Checked Via', value: 'Cloudflare DNS-over-HTTPS (DoH)', inline: true },
          {
            name: 'Quick Registrar Links',
            value:
              `• [Register on Namecheap](https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(result.domain)})\n` +
              `• [Register on Porkbun](https://porkbun.com/checkout/search?q=${encodeURIComponent(result.domain)})\n` +
              `• [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)`,
            inline: false,
          }
        )
        .setFooter({ text: 'GOKU Domain Scout • Verified via Cloudflare DoH' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (result.registered || result.status === 0) {
      // Domain is already taken
      const nsRecords = (result.answers || [])
        .map((a) => a.data)
        .filter(Boolean)
        .slice(0, 5);

      const embed = new EmbedBuilder()
        .setTitle(`🔒 Domain Taken: ${result.domain}`)
        .setColor(0xed4245)
        .setDescription(`❌ \`${result.domain}\` is registered.`)
        .addFields(
          { name: 'DNS Status', value: `\`${result.statusText}\``, inline: true },
          ...(nsRecords.length > 0
            ? [{ name: 'Resolved Nameservers (NS)', value: nsRecords.map((ns) => `• \`${ns}\``).join('\n'), inline: false }]
            : [{ name: 'Status', value: 'Zone authority active / DNS records found', inline: false }])
        )
        .setFooter({ text: 'GOKU Domain Scout' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // Error or unresolved
    const errorEmbed = new EmbedBuilder()
      .setTitle(`⚠️ Domain Check Inconclusive: ${result.domain}`)
      .setColor(0xfee75c)
      .setDescription(`Could not definitively resolve status for \`${result.domain}\`.\nReason: ${result.statusText}`)
      .setFooter({ text: 'GOKU Domain Scout' })
      .setTimestamp();

    return interaction.editReply({ embeds: [errorEmbed] });
  },
};
