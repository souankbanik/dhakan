const test = require('node:test');
const assert = require('node:assert');
const db = require('../database/db');
const { initDatabase } = require('../database/init');
const { checkDomain, cleanDomainName } = require('../utils/checkDomain');
const { getVibePointsTier, syncUserRoles } = require('../services/levelService');
const tipCommand = require('../commands/economy/tip');
const { processOverdueBounties } = require('../services/bountyWorker');
const messageCreateEvent = require('../events/messageCreate');

// Initialize database schema
initDatabase();

test('Expansion Suite: 20-Feature Expansion Systems', async (t) => {
  // -------------------------------------------------------------
  // 1. Domain Lookup Mocking & Sanitization Tests
  // -------------------------------------------------------------
  await t.test('1. cleanDomainName: sanitizes urls, protocols, ports, and paths', () => {
    assert.strictEqual(cleanDomainName('https://www.MySite.com/some/path?query=1'), 'www.mysite.com');
    assert.strictEqual(cleanDomainName('http://localhost:3000/api'), 'localhost');
    assert.strictEqual(cleanDomainName('  EXAMPLE.ORG/test  '), 'example.org');
    assert.strictEqual(cleanDomainName(''), '');
  });

  await t.test('2. checkDomain: accurately detects registered domain via mock DoH', async () => {
    const mockFetchRegistered = async (url) => {
      assert.ok(url.includes('example.com'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Status: 0, // NOERROR
          Answer: [
            { name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' },
          ],
        }),
      };
    };

    const result = await checkDomain('https://example.com/docs', { fetchFn: mockFetchRegistered });
    assert.strictEqual(result.domain, 'example.com');
    assert.strictEqual(result.registered, true);
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(result.ips, ['93.184.216.34']);
  });

  await t.test('3. checkDomain: accurately identifies unregistered/available domain (NXDOMAIN)', async () => {
    const mockFetchUnregistered = async (url) => {
      assert.ok(url.includes('nonexistent-domain-xyz12345.com'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Status: 3, // NXDOMAIN
          Answer: [],
          Authority: [],
        }),
      };
    };

    const result = await checkDomain('nonexistent-domain-xyz12345.com', { fetchFn: mockFetchUnregistered });
    assert.strictEqual(result.domain, 'nonexistent-domain-xyz12345.com');
    assert.strictEqual(result.registered, false);
    assert.strictEqual(result.status, 3);
    assert.ok(result.statusText.includes('NXDOMAIN'));
  });

  await t.test('4. checkDomain: handles invalid format gracefully', async () => {
    const result = await checkDomain('notadomain');
    assert.strictEqual(result.registered, false);
    assert.strictEqual(result.status, -1);
    assert.strictEqual(result.statusText, 'Invalid domain format');
  });

  // -------------------------------------------------------------
  // 2. Auto-Role Threshold Checks
  // -------------------------------------------------------------
  await t.test('5. getVibePointsTier: maps points to correct role tier milestones', () => {
    // Member: < 100
    assert.strictEqual(getVibePointsTier(0), 'Member');
    assert.strictEqual(getVibePointsTier(50), 'Member');
    assert.strictEqual(getVibePointsTier(99), 'Member');

    // Shipper: 100 - 499
    assert.strictEqual(getVibePointsTier(100), 'Shipper');
    assert.strictEqual(getVibePointsTier(250), 'Shipper');
    assert.strictEqual(getVibePointsTier(499), 'Shipper');

    // Vibe Architect: 500 - 1499
    assert.strictEqual(getVibePointsTier(500), 'Vibe Architect');
    assert.strictEqual(getVibePointsTier(1000), 'Vibe Architect');
    assert.strictEqual(getVibePointsTier(1499), 'Vibe Architect');

    // Product Lead: 1500+
    assert.strictEqual(getVibePointsTier(1500), 'Product Lead');
    assert.strictEqual(getVibePointsTier(5000), 'Product Lead');
  });

  await t.test('6. syncUserRoles: updates roleTier in DB and applies guild roles', async () => {
    const testUserId = 'usr_autorole_' + Date.now();
    db.prepare('INSERT INTO users (userId, vibePoints) VALUES (?, 600)').run(testUserId);

    const addedRoles = [];
    const mockMember = {
      id: testUserId,
      roles: {
        cache: new Map(),
        add: async (role) => {
          addedRoles.push(role.name);
        },
      },
    };

    const mockGuild = {
      roles: {
        cache: [
          { id: 'role_shipper', name: 'Shipper' },
          { id: 'role_architect', name: 'Vibe Architect' },
          { id: 'role_lead', name: 'Product Lead' },
        ],
      },
    };

    const syncResult = await syncUserRoles(mockGuild, mockMember, 600);
    assert.strictEqual(syncResult.roleTier, 'Vibe Architect');

    // Verify DB updated
    const userRow = db.prepare('SELECT roleTier FROM users WHERE userId = ?').get(testUserId);
    assert.strictEqual(userRow.roleTier, 'Vibe Architect');

    // Verify member received Shipper and Vibe Architect roles
    assert.ok(addedRoles.includes('Shipper'), 'Expected member to receive Shipper role');
    assert.ok(addedRoles.includes('Vibe Architect'), 'Expected member to receive Vibe Architect role');
    assert.ok(!addedRoles.includes('Product Lead'), 'Member should not receive Product Lead yet');
  });

  // -------------------------------------------------------------
  // 3. VibePoints Tipping Logic (/tip)
  // -------------------------------------------------------------
  await t.test('7. /tip: self-tipping guard blocks self transfers', async () => {
    const senderId = 'usr_tip_sender_' + Date.now();
    let replyPayload = null;

    const mockInteraction = {
      user: { id: senderId },
      options: {
        getUser: () => ({ id: senderId, bot: false }),
        getInteger: () => 50,
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await tipCommand.execute(mockInteraction);
    assert.ok(replyPayload?.content.includes('cannot tip yourself'));
  });

  await t.test('8. /tip: bot target guard blocks transfers to bots', async () => {
    const senderId = 'usr_tip_sender_' + Date.now();
    let replyPayload = null;

    const mockInteraction = {
      user: { id: senderId },
      options: {
        getUser: () => ({ id: 'usr_bot_999', bot: true }),
        getInteger: () => 20,
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await tipCommand.execute(mockInteraction);
    assert.ok(replyPayload?.content.includes('cannot tip bot accounts'));
  });

  await t.test('9. /tip: insufficient balance check rejects transfer', async () => {
    const senderId = 'usr_broke_sender_' + Date.now();
    const recipientId = 'usr_recipient_' + Date.now();

    // Give sender only 10 VP
    db.prepare('INSERT INTO users (userId, vibePoints) VALUES (?, 10)').run(senderId);

    let replyPayload = null;
    const mockInteraction = {
      user: { id: senderId },
      options: {
        getUser: () => ({ id: recipientId, bot: false }),
        getInteger: () => 50,
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await tipCommand.execute(mockInteraction);
    assert.ok(replyPayload?.content.includes('Insufficient balance'));

    // Check balance remained unchanged
    const senderRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(senderId);
    assert.strictEqual(senderRow.vibePoints, 10);
  });

  await t.test('10. /tip: successfully transfers VibePoints atomically', async () => {
    const senderId = 'usr_wealthy_sender_' + Date.now();
    const recipientId = 'usr_lucky_recipient_' + Date.now();

    // Sender: 100 VP, Recipient: 20 VP
    db.prepare('INSERT INTO users (userId, vibePoints, weeklyPoints) VALUES (?, 100, 100)').run(senderId);
    db.prepare('INSERT INTO users (userId, vibePoints, weeklyPoints) VALUES (?, 20, 20)').run(recipientId);

    let replyPayload = null;
    const mockInteraction = {
      user: { id: senderId },
      options: {
        getUser: () => ({ id: recipientId, bot: false }),
        getInteger: () => 35,
      },
      guild: null,
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await tipCommand.execute(mockInteraction);
    assert.ok(replyPayload?.embeds?.length > 0);

    // Verify sender: 100 - 35 = 65 VP
    const senderRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(senderId);
    assert.strictEqual(senderRow.vibePoints, 65);

    // Verify recipient: 20 + 35 = 55 VP, weekly: 20 + 35 = 55
    const recipientRow = db.prepare('SELECT vibePoints, weeklyPoints FROM users WHERE userId = ?').get(recipientId);
    assert.strictEqual(recipientRow.vibePoints, 55);
    assert.strictEqual(recipientRow.weeklyPoints, 55);
  });

  // -------------------------------------------------------------
  // 4. Anti-Ghosting Bounty Worker Test
  // -------------------------------------------------------------
  await t.test('11. Anti-Ghosting Worker: refunds 50 VP on bounties older than 7 days', async () => {
    const authorId = 'usr_bounty_author_' + Date.now();
    const reviewerId = 'usr_bounty_reviewer_' + Date.now();

    // Author starts with 0 VP
    db.prepare('INSERT INTO users (userId, vibePoints) VALUES (?, 0)').run(authorId);

    // Create project
    const projRes = db.prepare(`
      INSERT INTO projects (userId, title, link, techStack, description, status)
      VALUES (?, 'Ghosted Project', 'https://example.com', 'Next.js, Tailwind', 'A great app waiting for review', 'APPROVED')
    `).run(authorId);
    const projectId = projRes.lastInsertRowid;

    // Create overdue bounty (8 days old)
    const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    const bountyRes = db.prepare(`
      INSERT INTO bounties (projectId, reviewerId, feedbackText, status, createdAt, refunded)
      VALUES (?, ?, 'Pending feedback', 'PENDING', ?, 0)
    `).run(projectId, reviewerId, eightDaysAgo);
    const bountyId = bountyRes.lastInsertRowid;

    // Run worker
    const refunded = processOverdueBounties(null);
    const match = refunded.find((r) => r.bountyId === bountyId);
    assert.ok(match, 'Expected overdue bounty to be refunded');
    assert.strictEqual(match.authorId, authorId);
    assert.strictEqual(match.refundedAmount, 50);

    // Verify bounty status updated in DB
    const bountyRow = db.prepare('SELECT status, refunded FROM bounties WHERE id = ?').get(bountyId);
    assert.strictEqual(bountyRow.status, 'EXPIRED');
    assert.strictEqual(bountyRow.refunded, 1);

    // Verify author received +50 VP refund
    const authorRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(authorId);
    assert.strictEqual(authorRow.vibePoints, 50);

    // Running worker again should NOT double-refund
    const secondRun = processOverdueBounties(null);
    const duplicate = secondRun.find((r) => r.bountyId === bountyId);
    assert.strictEqual(duplicate, undefined, 'Bounty should not be refunded twice');
  });

  // -------------------------------------------------------------
  // 5. Anti-Spam Link Shield Tests
  // -------------------------------------------------------------
  await t.test('12. Anti-Spam: deletes invite link and times out <7d account', async () => {
    let deleted = false;
    let timeoutDuration = 0;
    let timeoutReason = '';

    const youngAccountTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days old

    const mockMessage = {
      author: {
        id: 'usr_spammer_1',
        bot: false,
        createdTimestamp: youngAccountTimestamp,
        tag: 'Spammer#0001',
      },
      guild: {
        id: 'guild_123',
        channels: { cache: new Map() },
      },
      channel: { id: 'chan_general' },
      content: 'Hey join my cool server: https://discord.gg/free-nitro-12345',
      deletable: true,
      delete: async () => {
        deleted = true;
      },
      member: {
        timeout: async (duration, reason) => {
          timeoutDuration = duration;
          timeoutReason = reason;
        },
      },
      mentions: { everyone: false },
    };

    await messageCreateEvent.execute(mockMessage);

    assert.strictEqual(deleted, true, 'Message should have been deleted');
    assert.strictEqual(timeoutDuration, 3600000, 'Should timeout for 1 hour');
    assert.ok(timeoutReason.includes('Discord invite'), 'Reason should cite Discord invite');
  });

  await t.test('13. Anti-Spam: deletes @everyone mention and times out <7d account', async () => {
    let deleted = false;
    let timeoutDuration = 0;

    const youngAccountTimestamp = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day old

    const mockMessage = {
      author: {
        id: 'usr_spammer_2',
        bot: false,
        createdTimestamp: youngAccountTimestamp,
        tag: 'MassMentioner#0002',
      },
      guild: {
        id: 'guild_123',
        channels: { cache: new Map() },
      },
      channel: { id: 'chan_general' },
      content: '@everyone check out this crypto coin!',
      deletable: true,
      delete: async () => {
        deleted = true;
      },
      member: {
        timeout: async (duration) => {
          timeoutDuration = duration;
        },
      },
      mentions: { everyone: true },
    };

    await messageCreateEvent.execute(mockMessage);

    assert.strictEqual(deleted, true, 'Message should have been deleted');
    assert.strictEqual(timeoutDuration, 3600000, 'Should timeout for 1 hour');
  });

  await t.test('14. Anti-Spam: allows mature accounts (>7d) without deletion or timeout', async () => {
    let deleted = false;
    let timeoutCalled = false;

    const matureAccountTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days old

    const mockMessage = {
      author: {
        id: 'usr_veteran_1',
        bot: false,
        createdTimestamp: matureAccountTimestamp,
        tag: 'Veteran#0003',
      },
      guild: {
        id: 'guild_123',
        channels: { cache: new Map() },
      },
      channel: { id: 'chan_not_counting' },
      content: 'Here is our sister server invite: https://discord.gg/community',
      deletable: true,
      delete: async () => {
        deleted = true;
      },
      member: {
        timeout: async () => {
          timeoutCalled = true;
        },
      },
      mentions: { everyone: false },
    };

    await messageCreateEvent.execute(mockMessage);

    assert.strictEqual(deleted, false, 'Message from mature account should not be deleted by shield');
    assert.strictEqual(timeoutCalled, false, 'Mature account should not be timed out');
  });
});
