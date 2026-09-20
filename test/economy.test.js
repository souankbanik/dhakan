const test = require('node:test');
const assert = require('node:assert');
const db = require('../database/db');
const dailyCommand = require('../commands/economy/daily');
const dailyStreakCommand = require('../commands/economy/dailyStreak');
const balanceCommand = require('../commands/economy/balance');
const leaderboardCommand = require('../commands/economy/leaderboard');

test('Builder XP & Ship Streak System Suite', async (t) => {
  require('../database/init').initDatabase();

  const testUser1Id = 'builder_user_001';
  const testUser2Id = 'builder_user_002';
  const testUser3Id = 'builder_user_003';
  const testTzUserId = 'builder_tz_user_004';

  // Clean up any existing test records
  db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?, ?)').run(
    testUser1Id,
    testUser2Id,
    testUser3Id,
    testTzUserId
  );

  await t.test('1. /daily-streak: First ship log grants 50 Vibe Credits and starts streak at 1', async () => {
    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testUser1Id,
        tag: 'BuilderOne#0001',
        displayAvatarURL: () => 'https://example.com/avatar1.png',
      },
      options: {
        getString: (name) => (name === 'progress' ? 'Shipped 1 feature today' : null),
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    assert.ok(replyPayload, 'Should reply to user');
    const embed = replyPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '🚀 Ship Streak Logged!');
    assert.ok(embed.description.includes('Shipped 1 feature today'));
    assert.ok(embed.description.includes('+50 Vibe Credits'));
    assert.ok(embed.description.includes('1 day'));

    // Verify DB fields
    const record = db
      .prepare('SELECT vibeCredits, currentStreak, lastStreakTimestamp FROM users WHERE userId = ?')
      .get(testUser1Id);
    assert.strictEqual(record.vibeCredits, 50);
    assert.strictEqual(record.currentStreak, 1);
    assert.ok(record.lastStreakTimestamp > 0);
  });

  await t.test('2. /daily-streak: Immediate second claim is blocked by 20h cooldown', async () => {
    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testUser1Id,
        tag: 'BuilderOne#0001',
        displayAvatarURL: () => 'https://example.com/avatar1.png',
      },
      options: {
        getString: (name) => (name === 'progress' ? 'Shipped second feature' : null),
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    assert.ok(replyPayload.ephemeral, 'Cooldown message should be ephemeral');
    const embed = replyPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '⏳ Ship Streak Cooldown');
    assert.ok(embed.description.includes('already logged your ship streak'));

    // DB remains unchanged
    const record = db
      .prepare('SELECT vibeCredits, currentStreak FROM users WHERE userId = ?')
      .get(testUser1Id);
    assert.strictEqual(record.vibeCredits, 50);
    assert.strictEqual(record.currentStreak, 1);
  });

  await t.test('3. /daily-streak: Claim after 24h increments streak to 2 and adds 50 credits', async () => {
    // Fast-forward lastStreakTimestamp by 24 hours into past
    const pastTime = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    db.prepare('UPDATE users SET lastStreakTimestamp = ?, lastDaily = ? WHERE userId = ?').run(
      pastTime,
      pastTime,
      testUser1Id
    );

    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testUser1Id,
        tag: 'BuilderOne#0001',
        displayAvatarURL: () => 'https://example.com/avatar1.png',
      },
      options: {
        getString: (name) => (name === 'progress' ? 'Integrated sqlite vector search' : null),
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    const embed = replyPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '🚀 Ship Streak Logged!');
    assert.ok(embed.description.includes('2 days'));
    assert.ok(embed.description.includes('100'));

    const record = db
      .prepare('SELECT vibeCredits, currentStreak FROM users WHERE userId = ?')
      .get(testUser1Id);
    assert.strictEqual(record.vibeCredits, 100);
    assert.strictEqual(record.currentStreak, 2);
  });

  await t.test('4. /daily-streak: Missing 48 hours resets streak to 0 and restarts at 1', async () => {
    // Fast-forward lastStreakTimestamp by 50 hours into past (> 48h limit)
    const pastTime = Math.floor(Date.now() / 1000) - 50 * 60 * 60;
    db.prepare('UPDATE users SET lastStreakTimestamp = ?, lastDaily = ? WHERE userId = ?').run(
      pastTime,
      pastTime,
      testUser1Id
    );

    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testUser1Id,
        tag: 'BuilderOne#0001',
        displayAvatarURL: () => 'https://example.com/avatar1.png',
      },
      options: {
        getString: (name) => (name === 'progress' ? 'Back after weekend break' : null),
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    const embed = replyPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '🚀 Ship Streak Logged!');
    // Alert should inform about the reset
    assert.ok(embed.description.includes('Streak Reset'));
    assert.ok(embed.description.includes('1 day'));

    const record = db
      .prepare('SELECT vibeCredits, currentStreak FROM users WHERE userId = ?')
      .get(testUser1Id);
    assert.strictEqual(record.vibeCredits, 150);
    assert.strictEqual(record.currentStreak, 1);
  });

  await t.test('5. Timezone Edge Case 1: Westward travel (36h elapsed) preserves streak', async () => {
    // Scenario: User logs in London (UTC), boards long-haul flight to SF (UTC-8).
    // Elapsed real time is 36 hours (which on calendar spans multiple days due to timezone shift).
    // Because elapsed time (36h) is < 48h and >= 20h cooldown, streak must continue!
    const past36h = Math.floor(Date.now() / 1000) - 36 * 60 * 60;
    db.prepare(`
      INSERT OR REPLACE INTO users (userId, vibeCredits, currentStreak, lastStreakTimestamp)
      VALUES (?, 100, 5, ?)
    `).run(testTzUserId, past36h);

    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testTzUserId,
        tag: 'Globetrotter#0004',
        displayAvatarURL: () => 'https://example.com/avatar4.png',
      },
      options: {
        getString: () => 'Shipped offline sync while flying over Greenland',
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    const embed = replyPayload.embeds[0].toJSON();
    assert.ok(!embed.description.includes('Streak Reset'), 'Streak should NOT reset');
    assert.ok(embed.description.includes('6 days'), 'Streak should advance from 5 to 6');

    const record = db
      .prepare('SELECT currentStreak, vibeCredits FROM users WHERE userId = ?')
      .get(testTzUserId);
    assert.strictEqual(record.currentStreak, 6);
    assert.strictEqual(record.vibeCredits, 150);
  });

  await t.test('6. Timezone Edge Case 2: Eastward travel across date line (26h elapsed) preserves streak', async () => {
    // Scenario: User logs in SF (UTC-8), travels to Tokyo (UTC+9, +17 hours calendar jump).
    // Elapsed real time is 26 hours.
    // Streak must increment without resetting.
    const past26h = Math.floor(Date.now() / 1000) - 26 * 60 * 60;
    db.prepare('UPDATE users SET lastStreakTimestamp = ?, currentStreak = 6 WHERE userId = ?').run(
      past26h,
      testTzUserId
    );

    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testTzUserId,
        tag: 'Globetrotter#0004',
        displayAvatarURL: () => 'https://example.com/avatar4.png',
      },
      options: {
        getString: () => 'Shipped Tokyo localized landing page',
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    const embed = replyPayload.embeds[0].toJSON();
    assert.ok(!embed.description.includes('Streak Reset'), 'Streak should NOT reset');
    assert.ok(embed.description.includes('7 days'), 'Streak should advance from 6 to 7');

    const record = db.prepare('SELECT currentStreak FROM users WHERE userId = ?').get(testTzUserId);
    assert.strictEqual(record.currentStreak, 7);
  });

  await t.test('7. Timezone Edge Case 3: Near-deadline ship (47h 50m elapsed) preserves streak', async () => {
    // Scenario: User was busy or delayed across timezones, logs with 10 minutes remaining in 48h grace period.
    const past47h50m = Math.floor(Date.now() / 1000) - (47 * 60 * 60 + 50 * 60);
    db.prepare('UPDATE users SET lastStreakTimestamp = ?, currentStreak = 7 WHERE userId = ?').run(
      past47h50m,
      testTzUserId
    );

    let replyPayload = null;
    const mockInteraction = {
      user: {
        id: testTzUserId,
        tag: 'Globetrotter#0004',
        displayAvatarURL: () => 'https://example.com/avatar4.png',
      },
      options: {
        getString: () => 'Clutch ship right before deadline',
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await dailyStreakCommand.execute(mockInteraction);

    const embed = replyPayload.embeds[0].toJSON();
    assert.ok(!embed.description.includes('Streak Reset'), 'Streak should NOT reset under 48 hours');
    assert.ok(embed.description.includes('8 days'), 'Streak should advance from 7 to 8');

    const record = db.prepare('SELECT currentStreak FROM users WHERE userId = ?').get(testTzUserId);
    assert.strictEqual(record.currentStreak, 8);
  });

  await t.test('8. /balance: Displays Builder Profile with Vibe Credits, Streak, and Projects', async () => {
    // Set user profile with projects submitted
    db.prepare(`
      UPDATE users 
      SET vibeCredits = 350, 
          balance = 350, 
          currentStreak = 4, 
          totalProjectsSubmitted = 3 
      WHERE userId = ?
    `).run(testUser1Id);

    let selfPayload = null;
    const mockSelfInteraction = {
      user: {
        id: testUser1Id,
        username: 'BuilderOne',
        displayAvatarURL: () => 'https://example.com/avatar1.png',
      },
      options: {
        getUser: () => null,
      },
      reply: async (payload) => {
        selfPayload = payload;
      },
    };

    await balanceCommand.execute(mockSelfInteraction);
    const selfEmbed = selfPayload.embeds[0].toJSON();
    assert.strictEqual(selfEmbed.title, "💳 BuilderOne's Builder Profile");

    const creditsField = selfEmbed.fields.find((f) => f.name.includes('Vibe Credits'));
    assert.ok(creditsField.value.includes('350'));

    const streakField = selfEmbed.fields.find((f) => f.name.includes('Ship Streak'));
    assert.ok(streakField.value.includes('4 days'));

    const projectsField = selfEmbed.fields.find((f) => f.name.includes('Shipped Projects'));
    assert.ok(projectsField.value.includes('3'));
  });

  await t.test('9. /leaderboard: Displays sorted rankings by Vibe Credits and by Streak', async () => {
    // Populate balances and streaks
    db.prepare(`
      INSERT OR REPLACE INTO users (userId, vibeCredits, currentStreak, balance)
      VALUES (?, 1000, 3, 1000)
    `).run(testUser2Id);

    db.prepare(`
      INSERT OR REPLACE INTO users (userId, vibeCredits, currentStreak, balance)
      VALUES (?, 500, 15, 500)
    `).run(testUser3Id);

    // Test default sorting (by Vibe Credits)
    let creditsLbPayload = null;
    await leaderboardCommand.execute({
      user: { tag: 'TestAdmin#0001' },
      options: {
        getString: (name) => (name === 'sort' ? 'credits' : null),
      },
      reply: async (payload) => {
        creditsLbPayload = payload;
      },
    });

    const creditsEmbed = creditsLbPayload.embeds[0].toJSON();
    assert.strictEqual(creditsEmbed.title, '🏆 Builder Leaderboard');
    // Top 1 by credits should be UserTwo with 1000 credits (🥇)
    assert.ok(creditsEmbed.description.includes(`🥇 <@${testUser2Id}> — **1,000** Vibe Credits`));
    // Top 2 by credits should be UserThree with 500 credits (🥈)
    assert.ok(creditsEmbed.description.includes(`🥈 <@${testUser3Id}> — **500** Vibe Credits`));

    // Test streak sorting
    let streakLbPayload = null;
    await leaderboardCommand.execute({
      user: { tag: 'TestAdmin#0001' },
      options: {
        getString: (name) => (name === 'sort' ? 'streak' : null),
      },
      reply: async (payload) => {
        streakLbPayload = payload;
      },
    });

    const streakEmbed = streakLbPayload.embeds[0].toJSON();
    assert.strictEqual(streakEmbed.title, '🏆 Builder Leaderboard (Ship Streaks)');
    // Top 1 by streak should be UserThree with 15 days (🥇)
    assert.ok(streakEmbed.description.includes(`🥇 <@${testUser3Id}> — 🔥 **15d** streak`));
  });

  await t.test('10. /daily: Legacy daily check-in compatibility', async () => {
    // Fast-forward lastDaily by 25 hours
    const pastTime = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    db.prepare('UPDATE users SET lastDaily = ?, lastStreakTimestamp = ? WHERE userId = ?').run(
      pastTime,
      pastTime,
      testUser1Id
    );

    let replyPayload = null;
    await dailyCommand.execute({
      user: {
        id: testUser1Id,
        tag: 'BuilderOne#0001',
        displayAvatarURL: () => 'https://example.com/avatar1.png',
      },
      reply: async (p) => {
        replyPayload = p;
      },
    });

    assert.ok(replyPayload);
    const embed = replyPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '💰 Daily Reward Claimed!');
  });

  // Clean up
  db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?, ?)').run(
    testUser1Id,
    testUser2Id,
    testUser3Id,
    testTzUserId
  );
});
