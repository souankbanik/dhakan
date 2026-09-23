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
    .setName('aboutgoku')
    .setDescription('Learn about GOKU and available modules'),

  async execute(interaction) {
    await interaction.deferReply();

    const targetChannel =
      interaction.guild?.channels?.cache?.find((c) => c.isTextBased() && c.name === 'ai-news') ||
      (config.channels?.aiNews ? interaction.client.channels.cache.get(config.channels.aiNews) : null);
    const aiNewsChannelText = targetChannel ? `<#${targetChannel.id}>` : (config.channels?.aiNews ? `<#${config.channels.aiNews}>` : '`#ai-news`');

    const mainEmbed = new EmbedBuilder()
      .setTitle('⚡ GOKU (Utility OS)')
      .setColor(0x5865f2)
      .setDescription(
        'GOKU is an all-in-one utility bot created by **master pusher**. Built to empower developers, vibe coders, and indie hackers with real-time intelligence, domain tooling, and builder matchmaking.'
      )
      .addFields(
        {
          name: '📡 AI News Radar',
          value:
            `Live curated updates across Hugging Face, research preprints, and AI releases in ${aiNewsChannelText}. Trigger scans or browse top drops anytime via \`/ai-news\`.`,
          inline: false,
        },
        {
          name: '🌐 Domain Availability (`/check-domain`)',
          value:
            'Check real-time domain availability and DNS status for project names, brand ideas, and TLDs powered by Cloudflare DNS-over-HTTPS.',
          inline: false,
        },
        {
          name: '🤝 Builder Connect (`/connect`)',
          value:
            'Build your public builder profile and connect with community developers with 1-click private DM handshakes.',
          inline: false,
        },
        {
          name: '🏓 Latency & Heartbeat (`/ping`)',
          value:
            'Check real-time response latency and Discord API WebSocket heartbeat.',
          inline: false,
        }
      )
      .setFooter({ text: 'GOKU Utility OS • Created by master pusher' })
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
        .setTitle('📖 GOKU Command Directory')
        .setColor(0x5865f2)
        .setDescription('All active slash commands across the GOKU platform:')
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
            name: '🏓 Latency',
            value: '`/ping` • Check realtime response latency and WebSocket heartbeat',
            inline: false,
          },
          {
            name: 'ℹ️ Information',
            value: '`/aboutgoku` • System overview, modules directory, and credits',
            inline: false,
          }
        )
        .setFooter({ text: 'GOKU Utility OS • Created by master pusher' });

      return interaction.reply({ embeds: [commandsEmbed], ephemeral: true });
    }

    if (interaction.customId === 'btn_about_stack') {
      const stackEmbed = new EmbedBuilder()
        .setTitle('⚡ Tech & Architecture')
        .setColor(0x57f287)
        .setDescription('Underlying runtime, database, and infrastructure stack powering GOKU:')
        .addFields(
          {
            name: 'Engine',
            value: 'Node.js 22+, Discord.js v14',
            inline: false,
          },
          {
            name: 'Storage',
            value: 'Persistent SQLite (better-sqlite3) for news deduplication',
            inline: false,
          },
          {
            name: 'Network & Intelligence',
            value: 'Cloudflare DoH, Hugging Face Trends API, arXiv RSS, Hacker News API, Node-Cron',
            inline: false,
          },
          {
            name: 'Creator',
            value: '**master pusher**',
            inline: false,
          }
        )
        .setFooter({ text: 'GOKU System Architecture • Created by master pusher' });

      return interaction.reply({ embeds: [stackEmbed], ephemeral: true });
    }
  },
};
