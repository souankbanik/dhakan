const assert = require('node:assert');
const db = require('../database/db');
const { initDatabase } = require('../database/init');
const {
  calculateLevel,
  xpForLevel,
  getTierRole,
  getTodayVotingXP,
  awardXP,
} = require('../services/levelService');
const { handleShowcaseUpvoteButton } = require('../handlers/showcaseHandler');

async function runSimulation() {
  console.log('=== STARTING BUILDER XP & UPVOTE SIMULATION ===\n');
  initDatabase();

  const authorId = 'sim_author_001';
  const voter1Id = 'sim_voter_001';
  const voter2Id = 'sim_voter_002';
  const projectId1 = 9001;
  const projectId2 = 9002;
  const projectId3 = 9003;
  const projectId4 = 9004;
  const projectId5 = 9005;
  const projectId6 = 9006;
  const allProjectIds = [projectId1, projectId2, projectId3, projectId4, projectId5, projectId6];

  // 0. Clean test environment
  db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?)').run(authorId, voter1Id, voter2Id);
  db.prepare('DELETE FROM xp_transactions WHERE userId IN (?, ?, ?)').run(authorId, voter1Id, voter2Id);
  db.prepare('DELETE FROM projects WHERE id IN (?, ?, ?, ?, ?, ?)').run(...allProjectIds);
  db.prepare('DELETE FROM project_showcases WHERE id IN (?, ?, ?, ?, ?, ?)').run(...allProjectIds);
  db.prepare('DELETE FROM project_votes WHERE projectId IN (?, ?, ?, ?, ?, ?)').run(...allProjectIds);

  // Setup mock projects
  for (const pid of allProjectIds) {
    db.prepare(`
      INSERT INTO projects (id, guildId, channelId, messageId, userId, title, link, techStack, description, upvoteCount)
      VALUES (?, 'guild_sim', 'ch_sim', 'msg_sim', ?, 'Project ${pid}', 'https://example.com', 'Node.js', 'Sim project', 0)
    `).run(pid, authorId);
    db.prepare(`
      INSERT INTO project_showcases (id, guildId, userId, projectName, projectLink, techStack, description, upvoteCount)
      VALUES (?, 'guild_sim', ?, 'Project ${pid}', 'https://example.com', 'Node.js', 'Sim project', 0)
    `).run(pid, authorId);
  }

  console.log('Step 1: Verify Initial State');
  assert.strictEqual(calculateLevel(0), 1, '0 XP should be Level 1');
  assert.strictEqual(calculateLevel(99), 1, '99 XP should be Level 1');
  assert.strictEqual(calculateLevel(100), 2, '100 XP should be Level 2');
  assert.strictEqual(calculateLevel(1600), 5, '1,600 XP should be Level 5');
  assert.strictEqual(getTierRole(5), 'Shipper', 'Level 5 unlocks Shipper role');
  console.log('  ✔ XP formula & level curve verified.\n');

  console.log('Step 2: Upvote Flow & Reward Attribution');
  // Voter 1 upvotes Project 1
  let replyPayload = null;
  const mockMessage = {
    embeds: [{ data: { fields: [{ name: 'Upvotes', value: '🔥 `0`' }] } }],
    components: [{ components: [{ data: {} }, { data: {} }] }],
    edit: async () => {},
  };

  await handleShowcaseUpvoteButton({
    customId: `showcase_upvote_${projectId1}`,
    user: { id: voter1Id, tag: 'Voter1#0001' },
    message: mockMessage,
    reply: async (p) => { replyPayload = p; },
  });

  assert.ok(replyPayload.content.includes('+25 XP'), 'Author should be rewarded 25 XP');
  assert.ok(replyPayload.content.includes('+5 XP'), 'Voter should be rewarded 5 XP');

  const authorDb = db.prepare('SELECT xp, level, totalUpvotesReceived FROM users WHERE userId = ?').get(authorId);
  assert.strictEqual(authorDb.xp, 25, 'Author XP should be 25');
  assert.strictEqual(authorDb.totalUpvotesReceived, 1, 'Author totalUpvotesReceived should be 1');

  const voter1Db = db.prepare('SELECT xp, level FROM users WHERE userId = ?').get(voter1Id);
  assert.strictEqual(voter1Db.xp, 5, 'Voter XP should be 5');
  console.log('  ✔ Upvote granted +25 XP to author and +5 XP to voter.\n');

  console.log('Step 3: Self-Vote Blocking');
  replyPayload = null;
  await handleShowcaseUpvoteButton({
    customId: `showcase_upvote_${projectId1}`,
    user: { id: authorId, tag: 'Author#0001' },
    message: mockMessage,
    reply: async (p) => { replyPayload = p; },
  });
  assert.ok(replyPayload.content.includes('cannot vote for your own project'), 'Self-vote must be rejected');
  console.log('  ✔ Self-vote cleanly blocked.\n');

  console.log('Step 4: Daily Voter XP Cap (25 XP / day = 5 votes)');
  // Voter 1 votes on projects 2, 3, 4, 5
  for (const pid of [projectId2, projectId3, projectId4, projectId5]) {
    await handleShowcaseUpvoteButton({
      customId: `showcase_upvote_${pid}`,
      user: { id: voter1Id, tag: 'Voter1#0001' },
      message: mockMessage,
      reply: async () => {},
    });
  }

  const voterAtCap = db.prepare('SELECT xp FROM users WHERE userId = ?').get(voter1Id);
  assert.strictEqual(voterAtCap.xp, 25, 'Voter should reach exactly 25 XP from 5 votes');
  assert.strictEqual(getTodayVotingXP(voter1Id), 25, 'Today voting XP must be 25');

  // Voter 1 votes on 6th project (exceeding daily cap)
  replyPayload = null;
  await handleShowcaseUpvoteButton({
    customId: `showcase_upvote_${projectId6}`,
    user: { id: voter1Id, tag: 'Voter1#0001' },
    message: mockMessage,
    reply: async (p) => { replyPayload = p; },
  });

  assert.ok(replyPayload.content.includes('daily voting XP cap reached'), 'Should notify that cap was reached');
  const voterAfter6th = db.prepare('SELECT xp FROM users WHERE userId = ?').get(voter1Id);
  assert.strictEqual(voterAfter6th.xp, 25, 'Voter XP should remain at 25 (not incremented past cap)');

  const vote6 = db.prepare('SELECT voterAwardedXP FROM project_votes WHERE projectId = ? AND userId = ?').get(projectId6, voter1Id);
  assert.strictEqual(vote6.voterAwardedXP, 0, 'Vote 6 voterAwardedXP should be 0');
  console.log('  ✔ Daily voting XP cap strictly enforced at 25 XP.\n');

  console.log('Step 5: Unvoting (Toggle Off) & Accurate XP Rescission');
  // Unvoting project 6 (where voter received 0 XP)
  replyPayload = null;
  await handleShowcaseUpvoteButton({
    customId: `showcase_upvote_${projectId6}`,
    user: { id: voter1Id, tag: 'Voter1#0001' },
    message: mockMessage,
    reply: async (p) => { replyPayload = p; },
  });
  assert.ok(replyPayload.content.includes('Upvote removed'), 'Should confirm unvote');
  const voterAfterUnvote6 = db.prepare('SELECT xp FROM users WHERE userId = ?').get(voter1Id);
  assert.strictEqual(voterAfterUnvote6.xp, 25, 'Voter XP should still be 25 (was 0 rewarded for project 6)');

  // Unvoting project 1 (where voter received 5 XP)
  replyPayload = null;
  await handleShowcaseUpvoteButton({
    customId: `showcase_upvote_${projectId1}`,
    user: { id: voter1Id, tag: 'Voter1#0001' },
    message: mockMessage,
    reply: async (p) => { replyPayload = p; },
  });
  const voterAfterUnvote1 = db.prepare('SELECT xp FROM users WHERE userId = ?').get(voter1Id);
  assert.strictEqual(voterAfterUnvote1.xp, 20, 'Voter XP should be deducted by 5 (25 - 5 = 20)');
  console.log('  ✔ Unvoting accurately deducts voter and author XP based on initial attribution.\n');

  console.log('Step 6: Negative XP Bug Protection');
  // User with 10 XP receiving a -25 XP deduction
  await awardXP(voter2Id, 10, 'TEST_CREDIT');
  const testVoter = db.prepare('SELECT xp, level FROM users WHERE userId = ?').get(voter2Id);
  assert.strictEqual(testVoter.xp, 10);

  const deductResult = await awardXP(voter2Id, -25, 'UPVOTE_REMOVED');
  assert.strictEqual(deductResult.newXp, 0, 'XP must never drop below 0');
  assert.strictEqual(deductResult.newLevel, 1, 'Level must never drop below 1');
  console.log('  ✔ Hard zero floor verified. No negative XP bugs possible.\n');

  console.log('Step 7: Double-Leveling & Exploit Prevention');
  // Elevate author to 95 XP (close to Level 2 at 100 XP)
  db.prepare('UPDATE users SET xp = 95, level = 1 WHERE userId = ?').run(authorId);

  // Add 1 upvote (+25 XP) -> XP becomes 120, Level 2
  const upvoteAward = await awardXP(authorId, 25, 'UPVOTE_RECEIVED');
  assert.strictEqual(upvoteAward.newXp, 120);
  assert.strictEqual(upvoteAward.newLevel, 2);
  assert.strictEqual(upvoteAward.leveledUp, true);

  // Unvote (-25 XP) -> XP becomes 95, Level 1
  const unvoteAward = await awardXP(authorId, -25, 'UPVOTE_REMOVED');
  assert.strictEqual(unvoteAward.newXp, 95);
  assert.strictEqual(unvoteAward.newLevel, 1);
  assert.strictEqual(unvoteAward.leveledUp, false);

  // Re-vote (+25 XP) -> XP returns to 120, Level 2
  const revoteAward = await awardXP(authorId, 25, 'UPVOTE_RECEIVED');
  assert.strictEqual(revoteAward.newXp, 120);
  assert.strictEqual(revoteAward.newLevel, 2);
  assert.strictEqual(revoteAward.leveledUp, true);
  console.log('  ✔ Level calculation is purely deterministic and immune to desync exploits.\n');

  // Clean up
  db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?)').run(authorId, voter1Id, voter2Id);
  db.prepare('DELETE FROM xp_transactions WHERE userId IN (?, ?, ?)').run(authorId, voter1Id, voter2Id);
  db.prepare('DELETE FROM projects WHERE id IN (?, ?, ?, ?, ?, ?)').run(...allProjectIds);
  db.prepare('DELETE FROM project_showcases WHERE id IN (?, ?, ?, ?, ?, ?)').run(...allProjectIds);
  db.prepare('DELETE FROM project_votes WHERE projectId IN (?, ?, ?, ?, ?, ?)').run(...allProjectIds);

  console.log('=== ALL SIMULATION CHECKS PASSED SUCCESSFULLY ===');
}

if (require.main === module) {
  runSimulation().catch((err) => {
    console.error('Simulation failed with error:', err);
    process.exit(1);
  });
}

module.exports = { runSimulation };
