const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../config');

// Builder Tier Roles unlocked at specific level milestones
const TIER_ROLES = {
  5: 'Shipper',
  10: 'Product Lead',
  20: 'Master Builder',
};

/**
 * Calculate user level from total XP using the formula:
 * Level = floor(0.1 * sqrt(XP)) + 1
 *
 * XP Milestone Examples:
 * - 0 XP       -> Level 1
 * - 100 XP     -> Level 2
 * - 400 XP     -> Level 3
 * - 900 XP     -> Level 4
 * - 1,600 XP   -> Level 5 (Unlocks "Shipper")
 * - 8,100 XP   -> Level 10 (Unlocks "Product Lead")
 * - 36,100 XP  -> Level 20 (Unlocks "Master Builder")
 */
function calculateLevel(xp) {
  if (!xp || xp <= 0) return 1;
  return Math.floor(0.1 * Math.sqrt(xp)) + 1;
}

/**
 * Invert formula to find required XP for a given level.
 */
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(((level - 1) / 0.1) ** 2);
}

/**
 * Check which tier role milestone (if any) corresponds to a given level.
 */
function getTierRole(level) {
  return TIER_ROLES[level] || null;
}

/**
 * Check if a level transition unlocked a new builder tier role.
 */
function checkTierUnlocked(oldLevel, newLevel) {
  for (const milestone of [5, 10, 20]) {
    if (newLevel >= milestone && oldLevel < milestone) {
      return TIER_ROLES[milestone];
    }
  }
  return null;
}

/**
 * Get total XP earned today from voting (reason = 'CAST_VOTE') for daily cap check (25 XP max/day).
 */
function getTodayVotingXP(userId) {
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = now - (now % 86400); // Midnight UTC

  try {
    const row = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM xp_transactions
        WHERE userId = ? AND reason = 'CAST_VOTE' AND timestamp >= ?
      `)
      .get(userId, startOfDay);

    return row?.total || 0;
  } catch (err) {
    console.error('[LEVEL SERVICE] Error fetching today voting XP:', err);
    return 0;
  }
}

/**
 * Atomically awards or deducts XP, updates user levels, records transactions,
 * and handles tier role unlocks and celebratory notifications.
 *
 * @param {string} userId
 * @param {number} amount (positive or negative)
 * @param {string} reason ('PROJECT_APPROVED', 'UPVOTE_RECEIVED', 'CAST_VOTE', 'UPVOTE_REMOVED', 'VOTE_RESCINDED')
 * @param {Object} options ({ client, guildId, guild, member })
 */
async function awardXP(userId, amount, reason, options = {}) {
  const now = Math.floor(Date.now() / 1000);

  // Execute database updates inside a synchronous transaction
  const result = db.transaction(() => {
    // 1. Ensure user record exists
    db.prepare(`
      INSERT INTO users (userId, xp, level, totalUpvotesReceived, totalProjects)
      VALUES (?, 0, 1, 0, 0)
      ON CONFLICT(userId) DO NOTHING
    `).run(userId);

    const user = db
      .prepare('SELECT xp, level, totalUpvotesReceived, totalProjects FROM users WHERE userId = ?')
      .get(userId);

    const oldXp = user.xp || 0;
    const oldLevel = user.level || 1;

    // Hard floor at 0: prevents negative XP bugs
    const newXp = Math.max(0, oldXp + amount);
    const newLevel = calculateLevel(newXp);

    // 2. Record ledger transaction
    db.prepare(`
      INSERT INTO xp_transactions (userId, amount, reason, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(userId, amount, reason, now);

    // 3. Dynamic metric updates
    let upvotesReceivedDelta = 0;
    if (reason === 'UPVOTE_RECEIVED' && amount > 0) upvotesReceivedDelta = 1;
    if (reason === 'UPVOTE_REMOVED' && amount < 0) upvotesReceivedDelta = -1;

    let projectApprovedDelta = 0;
    if (reason === 'PROJECT_APPROVED' && amount > 0) projectApprovedDelta = 1;

    db.prepare(`
      UPDATE users
      SET xp = ?,
          level = ?,
          totalUpvotesReceived = MAX(0, totalUpvotesReceived + ?),
          totalProjects = MAX(0, totalProjects + ?)
      WHERE userId = ?
    `).run(newXp, newLevel, upvotesReceivedDelta, projectApprovedDelta, userId);

    const leveledUp = newLevel > oldLevel;
    const newTierRole = checkTierUnlocked(oldLevel, newLevel);

    return {
      userId,
      oldXp,
      newXp,
      oldLevel,
      newLevel,
      leveledUp,
      newTierRole,
      amount,
      reason,
    };
  })();

  // Handle side-effects (role assignment & level-up celebration) outside the DB transaction
  if (result.leveledUp && (options.guild || options.client)) {
    try {
      await handleLevelUpSideEffects(result, options);
    } catch (sideEffectErr) {
      console.error('[LEVEL SERVICE] Error during level-up side effects:', sideEffectErr);
    }
  }

  return result;
}

/**
 * Assigns tier roles and posts celebratory message upon level up.
 */
async function handleLevelUpSideEffects(result, options) {
  const guild =
    options.guild ||
    (options.guildId && options.client?.guilds?.cache?.get(options.guildId)) ||
    options.client?.guilds?.cache?.first();

  if (!guild) return;

  // 1. Assign unlocked builder tier role if applicable
  if (result.newTierRole) {
    try {
      const roles = Array.from(guild.roles.cache.values());
      let tierRole = roles.find((r) => r.name.toLowerCase() === result.newTierRole.toLowerCase());

      if (!tierRole && guild.roles.create) {
        tierRole = await guild.roles.create({
          name: result.newTierRole,
          color: result.newLevel >= 10 ? 0xf1c40f : 0x9b59b6,
          reason: `Auto-unlocked builder tier at Level ${result.newLevel}`,
        });
      }

      if (tierRole) {
        let member = options.member;
        if (!member && guild.members?.fetch) {
          member = await guild.members.fetch(result.userId).catch(() => null);
        }
        if (member?.roles?.add) {
          await member.roles.add(tierRole);
          console.log(`[LEVEL SERVICE] Assigned tier role "${result.newTierRole}" to ${member.user?.tag || result.userId}`);
        }
      }
    } catch (roleErr) {
      console.error('[LEVEL SERVICE] Failed to assign tier role:', roleErr);
    }
  }

  // 2. Announce level up in general channel (or #level-ups channel)
  try {
    const generalChannelId = config.channels?.general || process.env.CHANNEL_GENERAL;
    let levelUpChannel = generalChannelId ? guild.channels.cache.get(generalChannelId) : null;

    if (!levelUpChannel) {
      const channels = Array.from(guild.channels.cache.values());
      levelUpChannel = channels.find(
        (c) =>
          c.isTextBased?.() &&
          ((generalChannelId && c.id === generalChannelId) ||
            c.name.toLowerCase() === 'level-ups' ||
            c.name.toLowerCase() === 'general' ||
            c.name.toLowerCase().includes('level-up') ||
            c.name.toLowerCase().includes('levels'))
      );
    }

    const levelEmbed = new EmbedBuilder()
      .setTitle('🎉 Level Up!')
      .setDescription(
        `Congratulations <@${result.userId}>! You advanced to **Level ${result.newLevel}**!\n\n` +
        `⚡ **Total XP:** \`${result.newXp.toLocaleString()} XP\`\n` +
        (result.newTierRole
          ? `🏆 **New Tier Unlocked:** **${result.newTierRole}** role assigned!\n`
          : '') +
        `🚀 Keep building, shipping, and upvoting community creations!`
      )
      .setColor(result.newTierRole ? 0xf1c40f : 0x2ecc71)
      .setTimestamp();

    if (levelUpChannel) {
      await levelUpChannel.send({ embeds: [levelEmbed] });
    } else if (options.client) {
      // Fallback to DM if no level-ups channel exists
      const user = await options.client.users.fetch(result.userId).catch(() => null);
      if (user) {
        await user.send({ embeds: [levelEmbed] }).catch(() => null);
      }
    }
  } catch (msgErr) {
    console.warn('[LEVEL SERVICE] Could not dispatch level up notification:', msgErr.message);
  }
}

// VibePoints auto-role tiers
const VIBE_TIERS = [
  { minPoints: 1500, roleName: 'Product Lead', color: 0xe67e22 },
  { minPoints: 500, roleName: 'Vibe Architect', color: 0x9b59b6 },
  { minPoints: 100, roleName: 'Shipper', color: 0x3498db },
];

/**
 * Returns the highest role tier name corresponding to the given VibePoints.
 *
 * @param {number} points
 * @returns {'Product Lead' | 'Vibe Architect' | 'Shipper' | 'Member'}
 */
function getVibePointsTier(points) {
  if (typeof points !== 'number') return 'Member';
  for (const tier of VIBE_TIERS) {
    if (points >= tier.minPoints) {
      return tier.roleName;
    }
  }
  return 'Member';
}

/**
 * Checks user VibePoints, updates roleTier in database, and synchronizes Discord roles:
 * - 100+ points -> @Shipper
 * - 500+ points -> @Vibe Architect
 * - 1500+ points -> @Product Lead
 *
 * @param {import('discord.js').Guild} guild
 * @param {string|import('discord.js').GuildMember} memberOrUserId
 * @param {number} [vibePoints]
 * @returns {Promise<{ userId: string, vibePoints: number, roleTier: string, addedRoles: string[] }>}
 */
async function syncUserRoles(guild, memberOrUserId, vibePoints) {
  const userId = typeof memberOrUserId === 'string' ? memberOrUserId : memberOrUserId?.id;
  if (!userId) return null;

  let points = vibePoints;
  if (typeof points !== 'number') {
    const userRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(userId);
    points = userRow?.vibePoints || 0;
  }

  const roleTier = getVibePointsTier(points);

  // Update roleTier column in database
  try {
    db.prepare('UPDATE users SET roleTier = ? WHERE userId = ?').run(roleTier, userId);
  } catch (dbErr) {
    console.warn('[LEVEL SERVICE] Failed to update roleTier in DB:', dbErr.message);
  }

  const addedRoles = [];

  if (guild) {
    try {
      let member =
        typeof memberOrUserId === 'object' && memberOrUserId.roles
          ? memberOrUserId
          : await guild.members?.fetch?.(userId).catch(() => null);

      if (member?.roles) {
        for (const tier of VIBE_TIERS) {
          if (points >= tier.minPoints) {
            let role = guild.roles.cache.find(
              (r) => r.name.toLowerCase() === tier.roleName.toLowerCase()
            );

            if (!role && guild.roles.create) {
              role = await guild.roles.create({
                name: tier.roleName,
                color: tier.color,
                reason: `Auto-created for VibePoints tier (${tier.minPoints}+ VP)`,
              }).catch(() => null);
            }

            if (role && !member.roles.cache.has(role.id) && member.roles.add) {
              await member.roles.add(role).catch(() => null);
              addedRoles.push(tier.roleName);
            }
          }
        }
      }
    } catch (roleErr) {
      console.warn('[LEVEL SERVICE] Error syncing roles in guild:', roleErr.message);
    }
  }

  return {
    userId,
    vibePoints: points,
    roleTier,
    addedRoles,
  };
}

module.exports = {
  calculateLevel,
  xpForLevel,
  getTierRole,
  checkTierUnlocked,
  getTodayVotingXP,
  awardXP,
  TIER_ROLES,
  VIBE_TIERS,
  getVibePointsTier,
  syncUserRoles,
};
