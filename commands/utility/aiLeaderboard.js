const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai-leaderboard')
    .setDescription('View the community-rated AI Models & LLM Tier List rankings'),

  async execute(interaction) {
    let models = [];
    try {
      models = db
        .prepare(`
          SELECT name, averageRating, totalVotes
          FROM ai_models
          ORDER BY averageRating DESC, totalVotes DESC, name ASC
        `)
        .all();
    } catch (err) {
      console.error('[AI-LEADERBOARD] DB error querying models:', err);
      return interaction.reply({
        content: '❌ Database error while retrieving AI model tier list.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Coding & LLM Model Tier List')
      .setColor(0x9b59b6)
      .setTimestamp();

    if (models.length === 0) {
      embed.setDescription(
        '*No AI models are currently listed. Use `/rate-model` to submit the first rating!*'
      );
      return interaction.reply({ embeds: [embed] });
    }

    const text = models
      .map((model, index) => {
        const rank = index < 3 ? MEDALS[index] : `**${index + 1}.**`;
        const rating = Number(model.averageRating) || 0.0;
        const votes = model.totalVotes || 0;
        const starCount = Math.min(5, Math.max(0, Math.round(rating)));
        const stars = starCount > 0 ? '⭐'.repeat(starCount) : '—';

        if (votes === 0) {
          return `${rank} **${model.name}**\n   ${stars} *Unranked* (0 votes) — Be the first to vote!`;
        }

        return `${rank} **${model.name}**\n   ${stars} **${rating.toFixed(2)}** / 5.0 (${votes} community vote${votes === 1 ? '' : 's'})`;
      })
      .join('\n\n');

    embed.setDescription(text);
    embed.setFooter({
      text: 'Vote on any model with /rate-model to earn +5 VibePoints! • Rounit HQ',
    });

    await interaction.reply({ embeds: [embed] });
  },
};
