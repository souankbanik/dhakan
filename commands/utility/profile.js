const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { xpForLevel } = require('../../services/levelService');

function generateProgressBar(current, target, length = 10) {
  if (target <= 0) return '`[██████████]` 100%';
  const ratio = Math.min(1, Math.max(0, current / target));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = Math.round(ratio * 100);
  return `\`[${bar}]\` ${percent}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View builder profile: Level, VibePoints, Projects Shipped, Streak, and Badges')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Target user to view (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Fetch user stats
    let userRow = db
      .prepare(`
        SELECT
          userId,
          vibePoints,
          weeklyPoints,
          xp,
          level,
          totalProjects,
          totalProjectsSubmitted,
          currentStreak,
          logStreak,
          roleTier,
          firstDollarVerified
        FROM users
        WHERE userId = ?
      `)
      .get(targetUser.id);

    if (!userRow) {
      userRow = {
        userId: targetUser.id,
        vibePoints: 0,
        weeklyPoints: 0,
        xp: 0,
        level: 1,
        totalProjects: 0,
        totalProjectsSubmitted: 0,
        currentStreak: 0,
        logStreak: 0,
        roleTier: 'Member',
        firstDollarVerified: 0,
      };
    }

    // Shipped projects count from projects table
    let shippedCount = 0;
    try {
      const projRow = db
        .prepare("SELECT COUNT(*) AS count FROM projects WHERE userId = ? AND status = 'APPROVED'")
        .get(targetUser.id);
      shippedCount = projRow?.count || userRow.totalProjects || userRow.totalProjectsSubmitted || 0;
    } catch {
      shippedCount = userRow.totalProjects || userRow.totalProjectsSubmitted || 0;
    }

    // Active streak
    const streak = Math.max(userRow.logStreak || 0, userRow.currentStreak || 0);

    // Badges determination
    const badges = [];
    if (userRow.vibePoints >= 1500 || userRow.roleTier === 'Product Lead') {
      badges.push('👑 **Product Lead** (1500+ VP)');
    } else if (userRow.vibePoints >= 500 || userRow.roleTier === 'Vibe Architect') {
      badges.push('🔮 **Vibe Architect** (500+ VP)');
    } else if (userRow.vibePoints >= 100 || userRow.roleTier === 'Shipper') {
      badges.push('🚀 **Shipper** (100+ VP)');
    }

    if (userRow.firstDollarVerified) {
      badges.push('💰 **First Dollar Club** (Verified Revenue)');
    }

    if (streak >= 7) {
      badges.push(`🔥 **Streak Master** (${streak}-day streak)`);
    } else if (streak >= 3) {
      badges.push(`⚡ **Active Shipper** (${streak}-day streak)`);
    }

    if (shippedCount >= 3) {
      badges.push(`🛠️ **Master Builder** (${shippedCount} shipped projects)`);
    } else if (shippedCount >= 1) {
      badges.push('📦 **Verified Builder** (Shipped a project)');
    }

    if (badges.length === 0) {
      badges.push('🌱 **Newcomer** (Start shipping to unlock badges!)');
    }

    // Level progress
    const currentLevel = userRow.level || 1;
    const currentXp = userRow.xp || 0;
    const nextLevelXp = xpForLevel(currentLevel + 1);
    const thisLevelXp = xpForLevel(currentLevel);
    const xpIntoLevel = Math.max(0, currentXp - thisLevelXp);
    const xpNeededForNext = Math.max(1, nextLevelXp - thisLevelXp);
    const progressBar = generateProgressBar(xpIntoLevel, xpNeededForNext);

    const embed = new EmbedBuilder()
      .setTitle(`🛠️ Builder Profile: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .setColor(userRow.firstDollarVerified ? 0xf1c40f : 0x5865f2)
      .setDescription(
        `**Role Tier:** \`${userRow.roleTier || 'Member'}\`\n` +
        `**Current Level:** **Level ${currentLevel}** \`(${currentXp.toLocaleString()} XP)\`\n` +
        `**Level Progress:** ${progressBar}\n` +
        `\`${xpIntoLevel.toLocaleString()} / ${xpNeededForNext.toLocaleString()} XP to Level ${currentLevel + 1}\``
      )
      .addFields(
        {
          name: '⚡ VibePoints',
          value: `💎 **${(userRow.vibePoints || 0).toLocaleString()} VP**\n*(This week: +${userRow.weeklyPoints || 0} VP)*`,
          inline: true,
        },
        {
          name: '🚀 Projects Shipped',
          value: `📦 **${shippedCount}** approved`,
          inline: true,
        },
        {
          name: '🔥 Log Streak',
          value: `📅 **${streak} days**`,
          inline: true,
        },
        {
          name: '🏆 Earned Badges',
          value: badges.join('\n'),
          inline: false,
        }
      )
      .setFooter({ text: 'Rounit HQ Builder Network • Use /showcase and /log to rank up' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
