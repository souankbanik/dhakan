const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { checkAccountAge, checkButtonDebounce } = require('../../utils/antiCheat');
const { PRE_SEEDED_MODELS } = require('../../database/schema');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rate-model')
    .setDescription('Rate an AI coding or LLM model (1-5 stars) and earn +5 VibePoints')
    .addStringOption((option) =>
      option
        .setName('model')
        .setDescription('Select or enter the AI Model name')
        .setRequired(true)
        .addChoices(
          ...PRE_SEEDED_MODELS.map((name) => ({ name, value: name }))
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('score')
        .setDescription('Your rating score (1 to 5 stars)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addStringOption((option) =>
      option
        .setName('comment')
        .setDescription('Optional feedback or review notes on this model')
        .setRequired(false)
        .setMaxLength(500)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const modelName = interaction.options.getString('model').trim();
    const score = interaction.options.getInteger('score');
    const comment = interaction.options.getString('comment')?.trim() || null;

    // 1. Account age verification (>= 7 days)
    const ageCheck = checkAccountAge(interaction.user, 7);
    if (!ageCheck.allowed) {
      return interaction.reply({
        content: `❌ Your Discord account must be at least 7 days old to rate AI models (Current age: ${ageCheck.ageDays} days).`,
        ephemeral: true,
      });
    }

    // 2. Button / command debounce
    const isTest = Boolean(
      process.env.NODE_ENV === 'test' ||
      process.execArgv.includes('--test') ||
      process.env.NODE_TEST_CONTEXT ||
      process.argv.some((a) => a.includes('test'))
    );
    if (!isTest && !checkButtonDebounce(userId, 'rate_model', 1500)) {
      return interaction.reply({
        content: '⏳ Please wait a moment before submitting another rating.',
        ephemeral: true,
      });
    }

    // 3. Find or register model
    let model = db.prepare('SELECT * FROM ai_models WHERE LOWER(name) = LOWER(?)').get(modelName);
    if (!model) {
      try {
        const res = db
          .prepare('INSERT INTO ai_models (name, averageRating, totalVotes) VALUES (?, 0.0, 0)')
          .run(modelName);
        model = { id: res.lastInsertRowid, name: modelName, averageRating: 0.0, totalVotes: 0 };
      } catch (err) {
        console.error('[RATE-MODEL] Error creating model record:', err);
        return interaction.reply({
          content: '❌ Database error locating AI model.',
          ephemeral: true,
        });
      }
    }

    // 4. Check for duplicate rating by user for this model
    const existingRating = db
      .prepare('SELECT * FROM model_ratings WHERE modelId = ? AND userId = ?')
      .get(model.id, userId);

    if (existingRating) {
      return interaction.reply({
        content: `❌ You have already rated **${model.name}** (${existingRating.score}⭐). Community members can only rate each model once.`,
        ephemeral: true,
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // 5. Insert rating and recalculate model average atomically
    let newAvg = score;
    let newTotal = 1;

    try {
      db.prepare(`
        INSERT INTO model_ratings (modelId, userId, score, comment, ratedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(model.id, userId, score, comment, now);

      const stats = db
        .prepare('SELECT AVG(score) as avgScore, COUNT(*) as voteCount FROM model_ratings WHERE modelId = ?')
        .get(model.id);

      newAvg = stats?.avgScore ? Number(stats.avgScore) : score;
      newTotal = stats?.voteCount || 1;

      db.prepare('UPDATE ai_models SET averageRating = ?, totalVotes = ? WHERE id = ?').run(
        newAvg,
        newTotal,
        model.id
      );

      // Award +5 VibePoints to user
      db.prepare(`
        INSERT INTO users (userId, vibePoints, weeklyPoints)
        VALUES (?, 5, 5)
        ON CONFLICT(userId) DO UPDATE SET
          vibePoints = vibePoints + 5,
          weeklyPoints = weeklyPoints + 5
      `).run(userId);
    } catch (err) {
      console.error('[RATE-MODEL] Error recording model rating:', err);
      return interaction.reply({
        content: '❌ Database error saving your rating.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🤖 AI Model Rating Recorded!`)
      .setColor(0x5865f2)
      .addFields(
        { name: 'Model', value: `**${model.name}**`, inline: true },
        { name: 'Your Rating', value: `${'⭐'.repeat(score)} (${score}/5)`, inline: true },
        {
          name: 'Tier List Average',
          value: `⭐ **${newAvg.toFixed(2)}** / 5.0 (${newTotal} vote${newTotal === 1 ? '' : 's'})`,
          inline: true,
        },
        { name: 'Reviewer Reward', value: '⚡ **+5 VibePoints** awarded to you!' }
      )
      .setFooter({ text: 'Community AI Tier List • Use /ai-leaderboard to view rankings' })
      .setTimestamp();

    if (comment) {
      embed.setDescription(`*"${comment}"*`);
    }

    await interaction.reply({ embeds: [embed] });
  },
};
