const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');

/**
 * Calculates log streak status based on elapsed time since previous log.
 * @param {number|null} lastLogTimestamp - UNIX timestamp in seconds of previous log.
 * @param {number} [currentStreak=0] - Active streak count.
 * @param {number} [now] - Current UNIX timestamp in seconds.
 * @returns {{ allowed: boolean, newStreak?: number, reset?: boolean, remainingHours?: number, hoursElapsed?: number }}
 */
function calculateLogStreak(lastLogTimestamp, currentStreak = 0, now = Math.floor(Date.now() / 1000)) {
  if (!lastLogTimestamp || lastLogTimestamp <= 0) {
    return {
      allowed: true,
      newStreak: 1,
      reset: true,
      hoursElapsed: Infinity,
    };
  }

  const elapsedSeconds = now - lastLogTimestamp;
  const elapsedHours = elapsedSeconds / 3600;

  // Under 24 hours: Cooldown active
  if (elapsedHours < 24) {
    return {
      allowed: false,
      remainingHours: Math.max(1, Math.ceil(24 - elapsedHours)),
      hoursElapsed: elapsedHours,
    };
  }

  // Between 24 and 48 hours: Consecutive streak incremented
  if (elapsedHours <= 48) {
    return {
      allowed: true,
      newStreak: (currentStreak || 0) + 1,
      reset: false,
      hoursElapsed: elapsedHours,
    };
  }

  // Greater than 48 hours: Streak reset to 1
  return {
    allowed: true,
    newStreak: 1,
    reset: true,
    hoursElapsed: elapsedHours,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log what you shipped today to maintain your build streak and earn VibePoints')
    .addStringOption((opt) =>
      opt
        .setName('text')
        .setDescription('Brief summary of what you built or shipped today')
        .setRequired(true)
        .setMaxLength(300)
    ),

  calculateLogStreak,

  async execute(interaction) {
    const updateText = interaction.options.getString('text').trim();
    const userId = interaction.user.id;
    const now = Math.floor(Date.now() / 1000);

    // Fetch user record
    const user = db
      .prepare('SELECT lastLogTimestamp, logStreak, vibePoints FROM users WHERE userId = ?')
      .get(userId);

    const lastLog = user ? user.lastLogTimestamp : 0;
    const currentStreak = user ? user.logStreak : 0;

    const streakResult = calculateLogStreak(lastLog, currentStreak, now);

    if (!streakResult.allowed) {
      return interaction.reply({
        content: "You've already logged your build progress today! Next log available tomorrow.",
        ephemeral: true,
      });
    }

    const newStreak = streakResult.newStreak;

    // Update database atomically
    try {
      db.prepare(`
        INSERT INTO users (userId, lastLogTimestamp, logStreak, vibePoints, weeklyPoints)
        VALUES (?, ?, ?, 10, 10)
        ON CONFLICT(userId) DO UPDATE SET
          lastLogTimestamp = excluded.lastLogTimestamp,
          logStreak = excluded.logStreak,
          vibePoints = vibePoints + 10,
          weeklyPoints = weeklyPoints + 10
      `).run(userId, now, newStreak);
    } catch (dbErr) {
      console.error('[LOG DB ERROR] Failed to record log update:', dbErr);
      return interaction.reply({
        content: '❌ Database error recording your build log.',
        ephemeral: true,
      });
    }

    const logMessage = `🔨 <@${userId}> shipped an update (Streak: ${newStreak} days): \`${updateText}\``;

    // Resolve target channel (#general / CHANNEL_GENERAL)
    const targetChannelId =
      config.channels?.general || process.env.CHANNEL_GENERAL;
    let targetChannel = targetChannelId
      ? interaction.guild?.channels.cache.get(targetChannelId)
      : null;

    if (!targetChannel && interaction.guild?.channels?.cache) {
      const channels = Array.from(interaction.guild.channels.cache.values());
      targetChannel = channels.find(
        (c) =>
          c.isTextBased() &&
          (c.name?.toLowerCase() === 'general' ||
            c.name?.toLowerCase().includes('general'))
      );
    }

    // If interaction occurs directly in target channel, reply with public log message
    if (!targetChannel || interaction.channelId === targetChannel.id) {
      return interaction.reply({ content: logMessage });
    }

    // Otherwise dispatch to target channel and acknowledge ephemerally
    try {
      await targetChannel.send({ content: logMessage });
    } catch (sendErr) {
      console.error('[LOG DISPATCH ERROR]:', sendErr);
    }

    return interaction.reply({
      content: `✅ Your build log was posted to <#${targetChannel.id}>! +10 VibePoints awarded (Streak: **${newStreak} days**).`,
      ephemeral: true,
    });
  },
};
