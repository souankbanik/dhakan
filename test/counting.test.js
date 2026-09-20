const test = require('node:test');
const assert = require('node:assert');
const db = require('../database/db');
const messageCreateEvent = require('../events/messageCreate');

test('Counting Channel Game Suite', async (t) => {
  require('../database/init').initDatabase();

  const testGuildId = 'counting_guild_001';
  const countingChannelId = 'counting_channel_123';
  const otherChannelId = 'general_channel_456';

  const userA = 'user_aaa_111';
  const userB = 'user_bbb_222';

  // Setup guild settings
  db.prepare(`
    INSERT OR REPLACE INTO guild_settings (guildId, countingChannel, countingCurrentNumber, countingLastUser)
    VALUES (?, ?, 0, NULL)
  `).run(testGuildId, countingChannelId);

  await t.test('1. Ignores messages in non-counting channels', async () => {
    let reacted = null;
    const mockMessage = {
      author: { bot: false, id: userA },
      guild: { id: testGuildId },
      channel: { id: otherChannelId },
      content: '1',
      react: async (emoji) => {
        reacted = emoji;
      },
    };

    await messageCreateEvent.execute(mockMessage);
    assert.strictEqual(reacted, null);

    const settings = db.prepare('SELECT countingCurrentNumber FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.countingCurrentNumber, 0);
  });

  await t.test('2. Ignores or deletes non-numeric messages in counting channel', async () => {
    let deleted = false;
    const mockMessage = {
      author: { bot: false, id: userA },
      guild: { id: testGuildId },
      channel: { id: countingChannelId },
      content: 'hello world',
      deletable: true,
      delete: async () => {
        deleted = true;
      },
      react: async () => {},
    };

    await messageCreateEvent.execute(mockMessage);
    assert.strictEqual(deleted, true);

    const settings = db.prepare('SELECT countingCurrentNumber FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.countingCurrentNumber, 0);
  });

  await t.test('3. User A successfully counts 1: reacts with ✅ and updates DB', async () => {
    let reaction = null;
    const mockMessage = {
      author: { bot: false, id: userA },
      guild: { id: testGuildId },
      channel: { id: countingChannelId },
      content: '1',
      react: async (emoji) => {
        reaction = emoji;
      },
    };

    await messageCreateEvent.execute(mockMessage);
    assert.strictEqual(reaction, '✅');

    const settings = db.prepare('SELECT * FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.countingCurrentNumber, 1);
    assert.strictEqual(settings.countingLastUser, userA);
  });

  await t.test('4. User B successfully counts 2: reacts with ✅ and advances DB', async () => {
    let reaction = null;
    const mockMessage = {
      author: { bot: false, id: userB },
      guild: { id: testGuildId },
      channel: { id: countingChannelId },
      content: '2',
      react: async (emoji) => {
        reaction = emoji;
      },
    };

    await messageCreateEvent.execute(mockMessage);
    assert.strictEqual(reaction, '✅');

    const settings = db.prepare('SELECT * FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.countingCurrentNumber, 2);
    assert.strictEqual(settings.countingLastUser, userB);
  });

  await t.test('5. Consecutive turns forbidden: User B counting twice in a row ruins count', async () => {
    let reaction = null;
    let sentPayload = null;

    const mockMessage = {
      author: { bot: false, id: userB },
      guild: { id: testGuildId },
      channel: {
        id: countingChannelId,
        send: async (payload) => {
          sentPayload = payload;
        },
      },
      content: '3',
      react: async (emoji) => {
        reaction = emoji;
      },
    };

    await messageCreateEvent.execute(mockMessage);
    assert.strictEqual(reaction, '❌');

    // Counter must reset to 0 and lastUser to NULL
    const settings = db.prepare('SELECT * FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.countingCurrentNumber, 0);
    assert.strictEqual(settings.countingLastUser, null);

    // Ruined embed sent
    assert.ok(sentPayload, 'Ruined embed should be sent to channel');
    const embed = sentPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '💥 Count Ruined!');
    assert.ok(embed.description.includes(`Count ruined by <@${userB}>`));
    const reasonField = embed.fields.find((f) => f.name === 'Reason');
    assert.ok(reasonField.value.includes('cannot count twice in a row'));
  });

  await t.test('6. Wrong number ruins count: counting 5 instead of 1 resets counter', async () => {
    let reaction = null;
    let sentPayload = null;

    const mockMessage = {
      author: { bot: false, id: userA },
      guild: { id: testGuildId },
      channel: {
        id: countingChannelId,
        send: async (payload) => {
          sentPayload = payload;
        },
      },
      content: '5',
      react: async (emoji) => {
        reaction = emoji;
      },
    };

    await messageCreateEvent.execute(mockMessage);
    assert.strictEqual(reaction, '❌');

    const settings = db.prepare('SELECT * FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.countingCurrentNumber, 0);
    assert.strictEqual(settings.countingLastUser, null);

    assert.ok(sentPayload);
    const embed = sentPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '💥 Count Ruined!');
    const reasonField = embed.fields.find((f) => f.name === 'Reason');
    assert.ok(reasonField.value.includes('Expected **1**, but you sent **5**'));
  });

  // Clean up
  db.prepare('DELETE FROM guild_settings WHERE guildId = ?').run(testGuildId);
});
