const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLatestDrops, dispatchRadarDrops } = require('../services/radarService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai-news')
    .setDescription('Access real-time AI intelligence radar or trigger immediate pipeline scan')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Choose between viewing latest headlines or triggering a fresh radar scan')
        .setRequired(false)
        .addChoices(
          { name: 'Latest Headlines (View top drops)', value: 'latest' },
          { name: 'Trigger Scan (Dispatch new drops to #ai-news)', value: 'scan' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const mode = interaction.options.getString('mode') || 'latest';
    const aiNewsChannelId = config.channels.aiNews;

    if (mode === 'scan') {
      try {
        const postedCount = await dispatchRadarDrops(interaction.client);
        return interaction.editReply({
          content: `✅ **Radar Scan Complete:** Dispatched **${postedCount || 0}** new drop(s) to <#${aiNewsChannelId}>!`,
        });
      } catch (err) {
        console.error('[AI NEWS COMMAND ERROR] Scan error:', err);
        return interaction.editReply({
          content: '❌ An error occurred while executing the AI radar scan.',
        });
      }
    }

    // Default 'latest' mode: Fetch top drops from radar
    try {
      const drops = await getLatestDrops();
      const topDrops = (drops || []).slice(0, 5);

      if (topDrops.length === 0) {
        return interaction.editReply({
          content: '📡 No recent AI news drops found at this moment. Please check back shortly!',
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🛰️ Full-Spectrum AI Intelligence Radar')
        .setColor(0x5865f2)
        .setDescription(
          `Real-time tracking across Hugging Face, Reddit leaks, lab releases, arXiv preprints, and Hacker News.\nContinuous feed streams 24/7 in <#${aiNewsChannelId}>.`
        )
        .setFooter({ text: 'DHAKAN AI Radar • 5-Pipeline Intelligence' })
        .setTimestamp();

      for (const drop of topDrops) {
        const title = drop.title || 'AI Intelligence Drop';
        const url = drop.url || 'https://huggingface.co';
        const source = drop.source || 'AI Radar';
        const summary = drop.summary ? (drop.summary.length > 200 ? drop.summary.slice(0, 197) + '...' : drop.summary) : 'No summary provided.';
        const typeTag = drop.type || '[AI INTEL]';

        embed.addFields({
          name: `${typeTag} ${title.length > 80 ? title.slice(0, 77) + '...' : title}`,
          value: `${summary}\n🔗 [View Source / Release](${url}) • *Source: ${source}*`,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[AI NEWS COMMAND ERROR] Fetch error:', err);
      return interaction.editReply({
        content: '❌ Failed to retrieve latest radar intelligence. Please try again later.',
      });
    }
  },
};
