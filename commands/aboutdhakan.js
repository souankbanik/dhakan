const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aboutdhakan')
    .setDescription('Explore DHAKAN — Community & Builder OS overview and command directory.'),

  async execute(interaction) {
    await interaction.deferReply();

    const aiNewsChannelId = config.channels?.aiNews || '1551629280604332053';
    const generalChannelId = config.channels?.general || '1547976917125177417';

    const mainEmbed = new EmbedBuilder()
      .setTitle('About DHAKAN — Community & Builder OS')
      .setColor(0x5865f2)
      .setDescription(
        "DHAKAN is the streamlined engineering companion and operating system for Rounit's Developer Community. Built to empower developers, vibe coders, and indie hackers with real-time intelligence, domain tooling, and builder matchmaking."
      )
      .addFields(
        {
          name: '📡 AI News Radar (`#ai-news`)',
          value:
            `Automated multi-pipeline updates covering Hugging Face releases, arXiv research, lab drops, and tech headlines streaming 24/7 in <#${aiNewsChannelId}>. Trigger scans or browse top drops anytime via \`/ai-news\`.`,
          inline: false,
        },
        {
          name: '🌐 Domain Availability (`/check-domain`)',
          value:
            'Instant WHOIS and DNS availability lookups for project names, brand ideas, and TLDs powered by Cloudflare DNS-over-HTTPS.',
          inline: false,
        },
        {
          name: '🤝 Builder Connect (`/connect`)',
          value:
            `Community networking and builder matchmaking. Post what you are building to <#${generalChannelId}> and connect with collaborators with 1-click private DM handshakes.`,
          inline: false,
        }
      )
      .setFooter({ text: 'DHAKAN Builder OS • Built for Rounit HQ' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_about_commands')
        .setLabel('📖 View Commands Directory')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_about_stack')
        .setLabel('⚡ Tech & Architecture')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({ embeds: [mainEmbed], components: [row] });
  },

  async handleAboutButtons(interaction) {
    if (interaction.customId === 'btn_about_commands') {
      const commandsEmbed = new EmbedBuilder()
        .setTitle('📖 DHAKAN Command Directory')
        .setColor(0x5865f2)
        .setDescription('All active slash commands across the streamlined community platform:')
        .addFields(
          {
            name: '📡 AI News Radar',
            value: '`/ai-news` • View top AI drops or trigger on-demand scan',
            inline: false,
          },
          {
            name: '🌐 Domain Tools',
            value: '`/check-domain` • Fast DNS & WHOIS domain availability checker',
            inline: false,
          },
          {
            name: '🤝 Matchmaking',
            value: '`/connect` • Post builder collaboration and matchmaker request',
            inline: false,
          },
          {
            name: 'ℹ️ Information & Diagnostics',
            value: '`/aboutdhakan` • System overview & directory\n`/ping` • Realtime latency & Discord heartbeat',
            inline: false,
          }
        )
        .setFooter({ text: 'DHAKAN Builder OS • Use any command to get started' });

      return interaction.reply({ embeds: [commandsEmbed], ephemeral: true });
    }

    if (interaction.customId === 'btn_about_stack') {
      const stackEmbed = new EmbedBuilder()
        .setTitle('⚡ Tech & Architecture')
        .setColor(0x57f287)
        .setDescription('Underlying runtime, database, and infrastructure stack powering DHAKAN:')
        .addFields(
          {
            name: 'Engine',
            value: 'Node.js 20+, Discord.js v14',
            inline: false,
          },
          {
            name: 'Storage',
            value: 'Persistent SQLite (better-sqlite3) for news deduplication',
            inline: false,
          },
          {
            name: 'Intelligence & Network',
            value: 'Cloudflare DoH, Hugging Face Trends API, arXiv RSS, Hacker News API, Node-Cron',
            inline: false,
          }
        )
        .setFooter({ text: 'DHAKAN System Architecture • 24/7 Reliability' });

      return interaction.reply({ embeds: [stackEmbed], ephemeral: true });
    }
  },
};
