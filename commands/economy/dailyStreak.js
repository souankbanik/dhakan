const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

const COOLDOWN_SECONDS = 20 * 60 * 60; // 20 hours to prevent spam while accommodating timezone jitter
const MAX_STREAK_INTERVAL = 48 * 60 * 60; // 48 hours maximum between ship logs
const STREAK_REWARD = 50; // 50 Vibe Credits

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily-streak')
    .setDescription('Log your daily shipping progress, maintain your ship streak, and earn Vibe Credits')
    .addStringOption((option) =>
      option
        .setName('progress')
        .setDescription('What did you build or ship today? (e.g., Shipped 1 feature today)')
        .setRequired(true)
        .setMaxLength(300)
    ),

  COOLDOWN_SECONDS,
  MAX_STREAK_INTERVAL,
  STREAK_REWARD,

  async execute(interaction) {
    const userId = interaction.user.id;
    const progress = interaction.options.getString('progress').trim();
    const now = Math.floor(Date.now() / 1000);

    // Fetch user record
    let user;
    try {
      user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
      if (!user) {
        db.prepare(`
          INSERT INTO users (userId, vibeCredits, currentStreak, lastStreakTimestamp, balance, lastDaily)
          VALUES (?, 0, 0, 0, 0, 0)
        `).run(userId);
        user = {
          userId,
          vibeCredits: 0,
          currentStreak: 0,
          lastStreakTimestamp: 0,
          totalProjectsSubmitted: 0,
          balance: 0,
          lastDaily: 0,
        };
      }
    } catch (err) {
      console.error('[ECONOMY DB ERROR] Failed to fetch user for /daily-streak:', err);
      return interaction.reply({
        content: '❌ Database error while retrieving builder profile.',
        ephemeral: true,
      });
    }

    const lastLog = user.lastStreakTimestamp || user.lastDaily || 0;
    const timePassed = lastLog === 0 ? MAX_STREAK_INTERVAL + 1 : now - lastLog;

    // Check if cooldown has elapsed
    if (lastLog > 0 && timePassed < COOLDOWN_SECONDS) {
      const nextAvailable = lastLog + COOLDOWN_SECONDS;
      const deadline = lastLog + MAX_STREAK_INTERVAL;
      const cooldownEmbed = new EmbedBuilder()
        .setTitle('⏳ Ship Streak Cooldown')
        .setColor(0xe67e22)
        .setDescription(
          `You have already logged your ship streak for today!\n\n` +
          `• **Next log available**: <t:${nextAvailable}:R> (<t:${nextAvailable}:t>)\n` +
          `• **Streak deadline**: <t:${deadline}:R> (Keep within 48 hours to preserve your streak!)`
        )
        .addFields(
          { name: '🔥 Current Streak', value: `\`${user.currentStreak || 0} days\``, inline: true },
          { name: '💳 Vibe Credits', value: `\`${(user.vibeCredits || user.balance || 0).toLocaleString()}\``, inline: true }
        );

      return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
    }

    // Determine streak progression
    let newStreak = 1;
    let streakReset = false;

    if (lastLog === 0) {
      // First time logging
      newStreak = 1;
    } else if (timePassed > MAX_STREAK_INTERVAL) {
      // Missed 48-hour window -> reset streak to 0, this log starts it back at 1
      streakReset = true;
      newStreak = 1;
    } else {
      // Consecutive streak within 48 hours
      newStreak = (user.currentStreak || 0) + 1;
    }

    const newCredits = (user.vibeCredits || user.balance || 0) + STREAK_REWARD;
    const newBalance = (user.balance || 0) + STREAK_REWARD;

    try {
      db.prepare(`
        UPDATE users
        SET vibeCredits = ?,
            currentStreak = ?,
            lastStreakTimestamp = ?,
            balance = ?,
            lastDaily = ?
        WHERE userId = ?
      `).run(newCredits, newStreak, now, newBalance, now, userId);
    } catch (err) {
      console.error('[ECONOMY DB ERROR] Failed to update daily streak:', err);
      return interaction.reply({
        content: '❌ Database error while logging your ship streak.',
        ephemeral: true,
      });
    }

    const nextAvailable = now + COOLDOWN_SECONDS;
    const nextDeadline = now + MAX_STREAK_INTERVAL;

    const streakEmbed = new EmbedBuilder()
      .setTitle('🚀 Ship Streak Logged!')
      .setColor(streakReset ? 0xf39c12 : 0x2ecc71)
      .setDescription(
        `> *" ${progress} "*\n\n` +
        (streakReset
          ? '⚠️ **Streak Reset**: More than 48 hours elapsed since your last ship log. Your streak was reset to 0 and has now restarted at 1!\n\n'
          : '') +
        `🔥 **Ship Streak:** \`${newStreak} day${newStreak === 1 ? '' : 's'}\`\n` +
        `⚡ **Reward:** \`+${STREAK_REWARD} Vibe Credits\`\n` +
        `💳 **Total Vibe Credits:** \`${newCredits.toLocaleString()}\``
      )
      .addFields(
        { name: '⏰ Next Log Available', value: `<t:${nextAvailable}:R>`, inline: true },
        { name: '⏳ Next Deadline (48h)', value: `<t:${nextDeadline}:R>`, inline: true }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [streakEmbed] });
  },
};
