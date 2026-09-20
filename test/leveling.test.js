const test = require('node:test');
const assert = require('node:assert');
const db = require('../database/db');
const {
  calculateLevel,
  xpForLevel,
  getTierRole,
  checkTierUnlocked,
  getTodayVotingXP,
  awardXP,
  TIER_ROLES,
} = require('../services/levelService');
const leaderboardCommand = require('../commands/economy/leaderboard');
const { handleShowcaseUpvoteButton } = require('../handlers/showcaseHandler');

test('Builder XP, Leveling & Upvote Integration Suite', async (t) => {
  require('../database/init').initDatabase();

  const authorId = 'lvl_author_111';
  const voterId = 'lvl_voter_222';
  const projectId = 8888;

  // Clean test records
  db.prepare('DELETE FROM users WHERE userId IN (?, ?)').run(authorId, voterId);
  db.prepare('DELETE FROM xp_transactions WHERE userId IN (?, ?)').run(authorId, voterId);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM project_showcases WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM project_votes WHERE projectId = ?').run(projectId);

  // Setup project
  db.prepare(`
    INSERT INTO projects (id, guildId, channelId, messageId, userId, title, link, techStack, description, upvoteCount)
    VALUES (?, 'guild_lvl', 'ch_lvl', 'msg_lvl', ?, 'Super App', 'https://example.com', 'Next.js', 'App description', 0)
  `).run(projectId, authorId);

  db.prepare(`
    INSERT INTO project_showcases (id, guildId, userId, projectName, projectLink, techStack, description, upvoteCount)
    VALUES (?, 'guild_lvl', ?, 'Super App', 'https://example.com', 'Next.js', 'App description', 0)
  `).run(projectId, authorId);

  await t.test('1. Formula: Calculates levels and XP thresholds correctly', () => {
    assert.strictEqual(calculateLevel(0), 1);
    assert.strictEqual(calculateLevel(99), 1);
    assert.strictEqual(calculateLevel(100), 2);
    assert.strictEqual(calculateLevel(399), 2);
    assert.strictEqual(calculateLevel(400), 3);
    assert.strictEqual(calculateLevel(1600), 5);
    assert.strictEqual(calculateLevel(8100), 10);
    assert.strictEqual(calculateLevel(36100), 20);

    assert.strictEqual(xpForLevel(1), 0);
    assert.strictEqual(xpForLevel(2), 100);
    assert.strictEqual(xpForLevel(5), 1600);
    assert.strictEqual(xpForLevel(10), 8100);
  });

  await t.test('2. Tier Roles: Identifies milestone role unlocks', () => {
    assert.strictEqual(getTierRole(5), 'Shipper');
    assert.strictEqual(getTierRole(10), 'Product Lead');
    assert.strictEqual(getTierRole(20), 'Master Builder');
    assert.strictEqual(getTierRole(4), null);

    assert.strictEqual(checkTierUnlocked(4, 5), 'Shipper');
    assert.strictEqual(checkTierUnlocked(5, 6), null);
    assert.strictEqual(checkTierUnlocked(9, 10), 'Product Lead');
  });

  await t.test('3. awardXP: Atomically adds XP, records transaction, handles role unlock and level-up', async () => {
    let roleAssigned = null;
    let announcementSent = null;

    const mockRole = { id: 'role_shipper_id', name: 'Shipper' };
    const mockGuild = {
      id: 'guild_lvl',
      roles: {
        cache: new Map([['role_shipper_id', mockRole]]),
      },
      channels: {
        cache: new Map([
          [
            'ch_lvl_up',
            {
              isTextBased: () => true,
              name: 'level-ups',
              send: async (payload) => {
                announcementSent = payload;
              },
            },
          ],
        ]),
      },
    };

    const mockMember = {
      user: { tag: 'Author#0001' },
      roles: {
        add: async (role) => {
          roleAssigned = role;
        },
      },
    };

    // Jump user directly to Level 5 (1,600 XP)
    const result = await awardXP(authorId, 1600, 'PROJECT_APPROVED', {
      guild: mockGuild,
      member: mockMember,
    });

    assert.strictEqual(result.newXp, 1600);
    assert.strictEqual(result.newLevel, 5);
    assert.strictEqual(result.leveledUp, true);
    assert.strictEqual(result.newTierRole, 'Shipper');

    // Verify role assignment & channel announcement
    assert.ok(roleAssigned, 'Shipper tier role should be assigned');
    assert.strictEqual(roleAssigned.name, 'Shipper');
    assert.ok(announcementSent, 'Level up announcement should be sent');

    // Verify database record
    const userRow = db.prepare('SELECT xp, level, totalProjects FROM users WHERE userId = ?').get(authorId);
    assert.strictEqual(userRow.xp, 1600);
    assert.strictEqual(userRow.level, 5);
    assert.strictEqual(userRow.totalProjects, 1);

    const txRow = db.prepare('SELECT amount, reason FROM xp_transactions WHERE userId = ? ORDER BY id DESC LIMIT 1').get(authorId);
    assert.strictEqual(txRow.amount, 1600);
    assert.strictEqual(txRow.reason, 'PROJECT_APPROVED');
  });

  await t.test('4. Upvote Flow: Blocks self-votes, awards author +25 XP and voter +5 XP', async () => {
    // A: Block self-vote
    let selfReply = null;
    await handleShowcaseUpvoteButton({
      customId: `showcase_upvote_${projectId}`,
      user: { id: authorId, tag: 'Author#0001' },
      message: { embeds: [{ data: { fields: [] } }] },
      reply: async (p) => {
        selfReply = p;
      },
    });
    assert.ok(selfReply.content.includes('cannot vote for your own project'));
    assert.strictEqual(selfReply.ephemeral, true);

    // B: Valid vote by voter
    let voterReply = null;
    const mockMessage = {
      embeds: [{ data: { fields: [{ name: 'Upvotes', value: '🔥 `0`' }] } }],
      components: [{ components: [{ data: {} }, { data: {} }] }],
      edit: async () => {},
    };

    await handleShowcaseUpvoteButton({
      customId: `showcase_upvote_${projectId}`,
      user: { id: voterId, tag: 'Voter#0002' },
      message: mockMessage,
      reply: async (p) => {
        voterReply = p;
      },
    });

    assert.ok(voterReply.content.includes('+25 XP awarded to author'));
    assert.ok(voterReply.content.includes('+5 XP awarded to you'));

    // Check author gained 25 XP (1600 + 25 = 1625)
    const authorRow = db.prepare('SELECT xp, totalUpvotesReceived FROM users WHERE userId = ?').get(authorId);
    assert.strictEqual(authorRow.xp, 1625);
    assert.strictEqual(authorRow.totalUpvotesReceived, 1);

    // Check voter gained 5 XP
    const voterRow = db.prepare('SELECT xp FROM users WHERE userId = ?').get(voterId);
    assert.strictEqual(voterRow.xp, 5);

    // Check project upvote count
    const projRow = db.prepare('SELECT upvoteCount FROM projects WHERE id = ?').get(projectId);
    assert.strictEqual(projRow.upvoteCount, 1);
  });

  await t.test('5. Unvoting (Toggle Off): Decrements count and accurately deducts XP', async () => {
    let unvoteReply = null;
    const mockMessage = {
      embeds: [{ data: { fields: [{ name: 'Upvotes', value: '🔥 `1`' }] } }],
      components: [{ components: [{ data: {} }, { data: {} }] }],
      edit: async () => {},
    };

    // Clicking upvote again on same project
    await handleShowcaseUpvoteButton({
      customId: `showcase_upvote_${projectId}`,
      user: { id: voterId, tag: 'Voter#0002' },
      message: mockMessage,
      reply: async (p) => {
        unvoteReply = p;
      },
    });

    assert.ok(unvoteReply.content.includes('Upvote removed'));

    // Author deducted 25 XP (1625 - 25 = 1600)
    const authorRow = db.prepare('SELECT xp, totalUpvotesReceived FROM users WHERE userId = ?').get(authorId);
    assert.strictEqual(authorRow.xp, 1600);
    assert.strictEqual(authorRow.totalUpvotesReceived, 0);

    // Voter deducted 5 XP (5 - 5 = 0)
    const voterRow = db.prepare('SELECT xp FROM users WHERE userId = ?').get(voterId);
    assert.strictEqual(voterRow.xp, 0);

    // Project upvote count back to 0
    const projRow = db.prepare('SELECT upvoteCount FROM projects WHERE id = ?').get(projectId);
    assert.strictEqual(projRow.upvoteCount, 0);
  });

  await t.test('6. Negative XP Protection: XP has a strict zero floor', async () => {
    const result = await awardXP(voterId, -50, 'TEST_DEDUCTION');
    assert.strictEqual(result.newXp, 0);
    assert.strictEqual(result.newLevel, 1);

    const row = db.prepare('SELECT xp, level FROM users WHERE userId = ?').get(voterId);
    assert.strictEqual(row.xp, 0);
    assert.strictEqual(row.level, 1);
  });

  await t.test('7. /leaderboard builders & /leaderboard projects subcommands', async () => {
    // Populate stats
    db.prepare('UPDATE users SET xp = 2500, level = 6, totalProjects = 4 WHERE userId = ?').run(authorId);
    db.prepare('UPDATE projects SET upvoteCount = 12 WHERE id = ?').run(projectId);

    // A: /leaderboard builders
    let buildersReply = null;
    await leaderboardCommand.execute({
      user: { tag: 'Admin#0001' },
      options: {
        getSubcommand: () => 'builders',
        getString: (name) => (name === 'sort' ? 'xp' : null),
      },
      reply: async (p) => {
        buildersReply = p;
      },
    });

    assert.ok(buildersReply);
    const buildersEmbed = buildersReply.embeds[0].toJSON();
    assert.ok(buildersEmbed.title.includes('Builder XP & Level Leaderboard'));
    assert.ok(buildersEmbed.description.includes('Level 6'));
    assert.ok(buildersEmbed.description.includes('2,500 XP'));
    assert.ok(buildersEmbed.description.includes('4 projects'));

    // B: /leaderboard projects
    let projectsReply = null;
    await leaderboardCommand.execute({
      user: { tag: 'Admin#0001' },
      options: {
        getSubcommand: () => 'projects',
      },
      reply: async (p) => {
        projectsReply = p;
      },
    });

    assert.ok(projectsReply);
    const projectsEmbed = projectsReply.embeds[0].toJSON();
    assert.ok(projectsEmbed.title.includes('Top Community Projects Leaderboard'));
    assert.ok(projectsEmbed.description.includes('Super App'));
    assert.ok(projectsEmbed.description.includes('12 upvotes'));
    assert.ok(projectsEmbed.description.includes('300 XP generated')); // 12 * 25 = 300 XP
  });

  // Clean up
  db.prepare('DELETE FROM users WHERE userId IN (?, ?)').run(authorId, voterId);
  db.prepare('DELETE FROM xp_transactions WHERE userId IN (?, ?)').run(authorId, voterId);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM project_showcases WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM project_votes WHERE projectId = ?').run(projectId);
});
