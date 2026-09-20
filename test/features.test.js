const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const db = require('../database/db');
const { initDatabase } = require('../database/init');
const { verifyUrl } = require('../utils/verifyUrl');
const { calculateLogStreak } = require('../commands/economy/log');
const logCommand = require('../commands/economy/log');
const {
  handleSharePromptModalSubmit,
  handlePromptBookmarkButton,
} = require('../handlers/promptHandler');
const promptsCommand = require('../commands/utility/prompts');
const {
  handleCollabModalSubmit,
  handleCollabConnectButton,
} = require('../handlers/collabHandler');

// Ensure DB is initialized
initDatabase();

test('Feature Suite: Link Health Guard, Vibe Logs, Prompts & Collab', async (t) => {
  // -------------------------------------------------------------
  // 1. Link Health Guard (verifyUrl)
  // -------------------------------------------------------------
  await t.test('1. URL validator: returns false for invalid and fake domains', async () => {
    // Malformed syntax
    assert.strictEqual(await verifyUrl(''), false);
    assert.strictEqual(await verifyUrl('not-a-url'), false);
    assert.strictEqual(await verifyUrl('ftp://invalid-protocol.com'), false);

    // Fake domain (ENOTFOUND / DNS failure)
    const fakeUrl = 'http://this-does-not-exist-xyz.com';
    const result = await verifyUrl(fakeUrl, 3000);
    assert.strictEqual(result, false, 'Expected fake domain to return false');
  });

  await t.test('2. URL validator: returns true for valid reachable URL', async () => {
    // Reachable domain
    const reachable = await verifyUrl('https://github.com', 5000);
    assert.strictEqual(reachable, true);
  });

  // -------------------------------------------------------------
  // 2. Daily Vibe Log Streak Logic (calculateLogStreak)
  // -------------------------------------------------------------
  await t.test('3. Streak calculation: behaves accurately across 23h, 36h, and 50h', () => {
    const baseTime = 1700000000;

    // Case A: 23 hours elapsed (< 24h) -> Cooldown active, disallowed
    const time23h = baseTime + 23 * 3600;
    const res23h = calculateLogStreak(baseTime, 3, time23h);
    assert.strictEqual(res23h.allowed, false);
    assert.strictEqual(res23h.remainingHours, 1);

    // Case B: 36 hours elapsed (24h - 48h) -> Streak incremented by 1
    const time36h = baseTime + 36 * 3600;
    const res36h = calculateLogStreak(baseTime, 3, time36h);
    assert.strictEqual(res36h.allowed, true);
    assert.strictEqual(res36h.newStreak, 4);
    assert.strictEqual(res36h.reset, false);

    // Case C: 50 hours elapsed (> 48h) -> Streak expired and reset to 1
    const time50h = baseTime + 50 * 3600;
    const res50h = calculateLogStreak(baseTime, 7, time50h);
    assert.strictEqual(res50h.allowed, true);
    assert.strictEqual(res50h.newStreak, 1);
    assert.strictEqual(res50h.reset, true);

    // Case D: First time log (no timestamp)
    const resFirst = calculateLogStreak(0, 0, baseTime);
    assert.strictEqual(resFirst.allowed, true);
    assert.strictEqual(resFirst.newStreak, 1);
    assert.strictEqual(resFirst.reset, true);
  });

  // -------------------------------------------------------------
  // 3. /log command execution and SQLite updates
  // -------------------------------------------------------------
  await t.test('4. /log execution: updates user streak and awards +10 VibePoints', async () => {
    const testUserId = 'usr_log_tester_' + Date.now();
    let replyPayload = null;

    const mockInteraction = {
      user: { id: testUserId },
      options: {
        getString: (name) => (name === 'text' ? 'Finished OAuth2 integration' : null),
      },
      channelId: 'general_chan_123',
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await logCommand.execute(mockInteraction);

    assert.ok(replyPayload);
    assert.ok(replyPayload.content.includes('shipped an update'));
    assert.ok(replyPayload.content.includes('Streak: 1 days'));

    // Verify DB
    const userRec = db
      .prepare('SELECT logStreak, vibePoints FROM users WHERE userId = ?')
      .get(testUserId);
    assert.ok(userRec);
    assert.strictEqual(userRec.logStreak, 1);
    assert.strictEqual(userRec.vibePoints, 10);

    // Attempt logging again immediately (cooldown check)
    let cooldownReply = null;
    const mockCooldown = {
      user: { id: testUserId },
      options: {
        getString: () => 'Another quick fix',
      },
      channelId: 'general_chan_123',
      reply: async (p) => {
        cooldownReply = p;
      },
    };

    await logCommand.execute(mockCooldown);
    assert.ok(cooldownReply);
    assert.ok(cooldownReply.content.includes('already logged'));
  });

  // -------------------------------------------------------------
  // 4. Community Prompt Library (/share-prompt, bookmarks, /prompts)
  // -------------------------------------------------------------
  await t.test('5. Prompt Library: /share-prompt stores prompt and allows bookmarking', async () => {
    const authorId = 'usr_author_' + Date.now();
    const bookmarkUserId = 'usr_reader_' + Date.now();
    let cardSent = null;

    const mockChannel = {
      id: 'bot_cmd_chan_1',
      name: 'bot-commands',
      isTextBased: () => true,
      send: async (p) => {
        cardSent = p;
      },
    };

    const mockModalSubmit = {
      user: { id: authorId, tag: 'Author#1234' },
      guild: {
        channels: {
          cache: new Map([['bot_cmd_chan_1', mockChannel]]),
        },
      },
      fields: {
        getTextInputValue: (name) => {
          if (name === 'prompt_title') return 'FastAPI Claude System Prompt';
          if (name === 'prompt_category') return 'Claude';
          if (name === 'prompt_content') return 'You are an expert FastAPI architect. Write clean modular routers.';
          return '';
        },
      },
      reply: async () => {},
    };

    await handleSharePromptModalSubmit(mockModalSubmit);

    // Verify prompt in DB
    const prompt = db
      .prepare('SELECT * FROM prompts WHERE userId = ? ORDER BY id DESC LIMIT 1')
      .get(authorId);
    assert.ok(prompt);
    assert.strictEqual(prompt.title, 'FastAPI Claude System Prompt');
    assert.strictEqual(prompt.bookmarks, 0);

    // Verify dispatched card
    assert.ok(cardSent);
    assert.ok(cardSent.embeds);
    assert.strictEqual(cardSent.components[0].components[0].data.custom_id, `prompt_bookmark_${prompt.id}`);

    // Reader bookmarks the prompt
    let updatePayload = null;
    let followUpPayload = null;
    const mockBookmarkBtn = {
      customId: `prompt_bookmark_${prompt.id}`,
      user: { id: bookmarkUserId },
      update: async (p) => {
        updatePayload = p;
      },
      followUp: async (p) => {
        followUpPayload = p;
      },
      reply: async () => {},
    };

    await handlePromptBookmarkButton(mockBookmarkBtn);

    // Verify updated counter and author awarded +15 VibePoints
    const updatedPrompt = db.prepare('SELECT bookmarks FROM prompts WHERE id = ?').get(prompt.id);
    assert.strictEqual(updatedPrompt.bookmarks, 1);

    const authorUser = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(authorId);
    assert.ok(authorUser);
    assert.strictEqual(authorUser.vibePoints, 15);

    // Duplicate bookmark attempt
    let dupReply = null;
    const mockDupBookmark = {
      customId: `prompt_bookmark_${prompt.id}`,
      user: { id: bookmarkUserId },
      reply: async (p) => {
        dupReply = p;
      },
    };

    await handlePromptBookmarkButton(mockDupBookmark);
    assert.ok(dupReply.content.includes('already bookmarked'));
  });

  await t.test('6. /prompts command: returns top 3 highest-rated matching prompts', async () => {
    let replyPayload = null;
    const mockInteraction = {
      options: {
        getString: () => 'FastAPI',
      },
      deferReply: async () => {},
      deferred: true,
      editReply: async (p) => {
        replyPayload = p;
      },
      reply: async () => {},
    };

    await promptsCommand.execute(mockInteraction);

    assert.ok(replyPayload);
    assert.ok(replyPayload.embeds);
    assert.strictEqual(replyPayload.embeds.length, 1);
    const embed = replyPayload.embeds[0].toJSON();
    assert.ok(embed.title.includes('FastAPI'));
    assert.ok(embed.fields.length >= 1);
    assert.ok(embed.fields[0].name.includes('FastAPI Claude'));
  });

  // -------------------------------------------------------------
  // 5. Builder Matchmaker (/collab)
  // -------------------------------------------------------------
  await t.test('7. /collab matchmaker: posts card and connect button', async () => {
    const builderId = 'usr_builder_' + Date.now();
    const connectorId = 'usr_connector_' + Date.now();
    let cardSent = null;

    const mockGeneralChannel = {
      id: 'general_chan_1',
      name: 'general',
      isTextBased: () => true,
      send: async (p) => {
        cardSent = p;
      },
    };

    const mockCollabModal = {
      user: { id: builderId, tag: 'LeadDev#9999' },
      guild: {
        channels: {
          cache: new Map([['general_chan_1', mockGeneralChannel]]),
        },
      },
      fields: {
        getTextInputValue: (name) => {
          if (name === 'collab_oneliner') return 'Autonomous AI coding agent with voice interface';
          if (name === 'collab_role') return 'Frontend (Next.js / Tailwind)';
          if (name === 'collab_tech') return 'Next.js, Python, WebSocket';
          return '';
        },
      },
      reply: async () => {},
    };

    await handleCollabModalSubmit(mockCollabModal);

    assert.ok(cardSent);
    assert.ok(cardSent.embeds);
    const embed = cardSent.embeds[0].toJSON();
    assert.ok(embed.title.includes('Builder Matchmaker'));
    assert.strictEqual(cardSent.components[0].components[0].data.custom_id, `collab_connect_${builderId}`);

    // Connector clicks 🤝 Connect button
    let connectReply = null;
    const mockConnectBtn = {
      customId: `collab_connect_${builderId}`,
      user: { id: connectorId },
      channelId: 'general_chan_1',
      reply: async (p) => {
        connectReply = p;
      },
    };

    await handleCollabConnectButton(mockConnectBtn);
    assert.ok(connectReply);
    assert.ok(connectReply.content.includes(builderId));
    assert.ok(connectReply.content.includes('start building together'));
  });
});
