const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View builder and project leaderboards')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('builders')
        .setDescription('Ranks members by total XP, level, and projects shipped')
        .addStringOption((option) =>
          option
            .setName('sort')
            .setDescription('Sort rankings by XP/Level, Ship Streak, or Vibe Credits')
            .setRequired(false)
            .addChoices(
              { name: 'Total XP & Level', value: 'xp' },
              { name: 'Highest Ship Streak', value: 'streak' },
              { name: 'Total Vibe Credits', value: 'credits' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('projects')
        .setDescription('Ranks top-voted projects, displaying author name, upvote count, and XP generated')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('models')
        .setDescription('Ranks AI coding models and LLMs by community ratings')
    ),

  async execute(interaction) {
    let subcommand = 'builders';
    try {
      subcommand = interaction.options?.getSubcommand?.(false) || 'builders';
    } catch {
      subcommand = 'builders';
    }

    if (subcommand === 'projects') {
      return executeProjectsLeaderboard(interaction);
    }

    if (subcommand === 'models') {
      return executeModelsLeaderboard(interaction);
    }

    return executeBuildersLeaderboard(interaction);
  },
};

/**
 * Executes /leaderboard builders
 */
async function executeBuildersLeaderboard(interaction) {
  const sortBy = interaction.options?.getString?.('sort') || 'xp';

  let orderClause = 'ORDER BY xp DESC, level DESC, totalProjects DESC, vibeCredits DESC';
  let title = '🏆 Builder XP & Level Leaderboard';

  if (sortBy === 'streak') {
    orderClause = 'ORDER BY currentStreak DESC, xp DESC, vibeCredits DESC';
    title = '🏆 Builder Leaderboard (Ship Streaks)';
  } else if (sortBy === 'credits') {
    orderClause = 'ORDER BY vibeCredits DESC, xp DESC, currentStreak DESC';
    title = '🏆 Builder Leaderboard';
  }

  let topUsers = [];
  try {
    topUsers = db
      .prepare(`
        SELECT userId, xp, level, totalProjects, totalProjectsSubmitted, vibeCredits, currentStreak, balance
        FROM users
        WHERE xp > 0 OR totalProjects > 0 OR vibeCredits > 0 OR currentStreak > 0 OR balance > 0
        ${orderClause}
        LIMIT 10
      `)
      .all();
  } catch (err) {
    console.error('[LEADERBOARD DB ERROR] Failed to fetch builder leaderboard:', err);
    return interaction.reply({
      content: '❌ Database error while retrieving builder leaderboard.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xf1c40f) // Gold
    .setTimestamp();

  if (topUsers.length === 0) {
    embed.setDescription(
      '*No builders have accumulated XP yet. Be the first by shipping a project with `/showcase` or voting!*'
    );
    return interaction.reply({ embeds: [embed] });
  }

  const leaderboardText = topUsers
    .map((row, index) => {
      const rank = index < 3 ? MEDALS[index] : `**${index + 1}.**`;
      const xp = row.xp || 0;
      const level = row.level || 1;
      const projects = row.totalProjects || row.totalProjectsSubmitted || 0;
      const streak = row.currentStreak || 0;
      const credits = row.vibeCredits || row.balance || 0;

      if (sortBy === 'streak') {
        return `${rank} <@${row.userId}> — 🔥 **${streak}d** streak | **Level ${level}** (${xp.toLocaleString()} XP) | ⚡ **${credits.toLocaleString()}** credits`;
      }
      if (sortBy === 'credits') {
        return `${rank} <@${row.userId}> — **${credits.toLocaleString()}** Vibe Credits (💰 ${credits.toLocaleString()} coins) | **Level ${level}** (${xp.toLocaleString()} XP) | 🔥 **${streak}d** streak`;
      }
      return `${rank} <@${row.userId}> — **Level ${level}** (${xp.toLocaleString()} XP) | 🛠️ ${projects} projects | 🔥 **${streak}d** streak`;
    })
    .join('\n\n');

  embed.setDescription(leaderboardText);
  embed.setFooter({
    text: `Sorted by ${sortBy.toUpperCase()} • Requested by ${interaction.user.tag}`,
  });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Executes /leaderboard projects
 */
async function executeProjectsLeaderboard(interaction) {
  let topProjects = [];
  try {
    topProjects = db
      .prepare(`
        SELECT id, title, link, userId, upvoteCount
        FROM projects
        WHERE upvoteCount > 0
        ORDER BY upvoteCount DESC, id ASC
        LIMIT 10
      `)
      .all();

    if (topProjects.length === 0) {
      // Fallback to project_showcases
      topProjects = db
        .prepare(`
          SELECT id, projectName as title, projectLink as link, userId, upvoteCount
          FROM project_showcases
          WHERE upvoteCount > 0
          ORDER BY upvoteCount DESC, id ASC
          LIMIT 10
        `)
        .all();
    }
  } catch (err) {
    console.error('[LEADERBOARD DB ERROR] Failed to fetch projects leaderboard:', err);
    return interaction.reply({
      content: '❌ Database error while retrieving projects leaderboard.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🚀 Top Community Projects Leaderboard')
    .setColor(0x5865f2) // Blurple
    .setTimestamp();

  if (topProjects.length === 0) {
    embed.setDescription(
      '*No projects have received upvotes yet. Browse `#community-builds` and upvote your favorite creations!*'
    );
    return interaction.reply({ embeds: [embed] });
  }

  const leaderboardText = topProjects
    .map((row, index) => {
      const rank = index < 3 ? MEDALS[index] : `**${index + 1}.**`;
      const upvotes = row.upvoteCount || 0;
      const xpGenerated = upvotes * 25; // 25 XP awarded to author per upvote
      const projectTitle = row.link ? `**[${row.title}](${row.link})**` : `**${row.title}**`;

      return `${rank} ${projectTitle} by <@${row.userId}>\n` +
             `   🔥 **${upvotes} upvote${upvotes === 1 ? '' : 's'}** (⚡ **${xpGenerated.toLocaleString()} XP generated**)`;
    })
    .join('\n\n');

  embed.setDescription(leaderboardText);
  embed.setFooter({
    text: `Ranked by community upvotes • Requested by ${interaction.user.tag}`,
  });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Executes /leaderboard models
 */
async function executeModelsLeaderboard(interaction) {
  let topModels = [];
  try {
    topModels = db
      .prepare(`
        SELECT name, averageRating, totalVotes
        FROM ai_models
        ORDER BY averageRating DESC, totalVotes DESC, name ASC
        LIMIT 10
      `)
      .all();
  } catch (err) {
    console.error('[LEADERBOARD DB ERROR] Failed to fetch AI models leaderboard:', err);
    return interaction.reply({
      content: '❌ Database error while retrieving AI models leaderboard.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🤖 AI Coding & LLM Model Tier List')
    .setColor(0x9b59b6)
    .setTimestamp();

  if (topModels.length === 0) {
    embed.setDescription(
      '*No AI models rated yet. Use `/rate-model` to submit ratings and earn +5 VibePoints!*'
    );
    return interaction.reply({ embeds: [embed] });
  }

  const leaderboardText = topModels
    .map((model, index) => {
      const rank = index < 3 ? MEDALS[index] : `**${index + 1}.**`;
      const rating = Number(model.averageRating) || 0.0;
      const votes = model.totalVotes || 0;
      const stars = rating > 0 ? '⭐'.repeat(Math.min(5, Math.max(1, Math.round(rating)))) : '—';

      if (votes === 0) {
        return `${rank} **${model.name}** — *Unranked* (0 votes)`;
      }

      return `${rank} **${model.name}** — ${stars} **${rating.toFixed(2)}** / 5.0 (${votes} vote${votes === 1 ? '' : 's'})`;
    })
    .join('\n\n');

  embed.setDescription(leaderboardText);
  embed.setFooter({
    text: `Ranked by community AI rating • Requested by ${interaction.user.tag}`,
  });

  await interaction.reply({ embeds: [embed] });
}

