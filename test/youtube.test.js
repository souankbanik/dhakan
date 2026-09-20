const test = require('node:test');
const assert = require('node:assert');
const db = require('../database/db');
const { checkYouTubeFeed, CHANNEL_ID } = require('../services/youtubePoller');

test('YouTube RSS Poller Suite', async (t) => {
  require('../database/init').initDatabase();

  // Reset YouTube cache for clean test environment
  db.prepare('DELETE FROM youtube_cache WHERE channelId = ?').run(CHANNEL_ID);

  const initialVideoId = 'vid_initial_123';
  const initialTitle = 'Building an AI Agent from Scratch';
  const initialLink = `https://www.youtube.com/watch?v=${initialVideoId}`;

  const mockFeed1 = {
    title: 'Rounieee',
    items: [
      {
        videoId: initialVideoId,
        title: initialTitle,
        link: initialLink,
        pubDate: '2026-09-14T12:00:00.000Z',
      },
    ],
  };

  let mockParser = {
    parseURL: async () => mockFeed1,
  };

  let sentMessages = [];
  const mockTargetChannel = {
    id: 'announcements_channel_id',
    name: 'announcements',
    isTextBased: () => true,
    send: async (payload) => {
      sentMessages.push(payload);
    },
  };

  const mockClient = {
    guilds: {
      cache: new Map([
        [
          'guild_001',
          {
            name: 'Dev Community',
            channels: {
              cache: new Map([[mockTargetChannel.id, mockTargetChannel]]),
            },
          },
        ],
      ]),
    },
  };

  await t.test('1. Initial run seeds cache without dispatching duplicate pings', async () => {
    sentMessages = [];
    const result = await checkYouTubeFeed(mockClient, { parser: mockParser });

    assert.ok(result);
    assert.strictEqual(result.seeded, true);
    assert.strictEqual(result.videoId, initialVideoId);
    assert.strictEqual(sentMessages.length, 0, 'Should not broadcast on cold-start seeding');

    // Check DB was populated
    const cached = db.prepare('SELECT * FROM youtube_cache WHERE channelId = ?').get(CHANNEL_ID);
    assert.ok(cached);
    assert.strictEqual(cached.lastVideoId, initialVideoId);
    assert.strictEqual(cached.title, initialTitle);
  });

  await t.test('2. Deduplication: Same video on subsequent check produces no ping', async () => {
    sentMessages = [];
    const result = await checkYouTubeFeed(mockClient, { parser: mockParser });

    assert.ok(result);
    assert.strictEqual(result.newVideo, false);
    assert.strictEqual(result.videoId, initialVideoId);
    assert.strictEqual(sentMessages.length, 0, 'No ping on duplicate check');
  });

  const newVideoId = 'vid_new_456';
  const newTitle = 'Vibe Coding With GPT 6 Astra';
  const newLink = `https://www.youtube.com/watch?v=${newVideoId}`;

  const mockFeed2 = {
    title: 'Rounieee',
    items: [
      {
        videoId: newVideoId,
        title: newTitle,
        link: newLink,
        pubDate: '2026-09-15T00:00:00.000Z',
      },
    ],
  };

  await t.test('3. New upload detected: sends announcement embed and updates cache', async () => {
    sentMessages = [];
    mockParser.parseURL = async () => mockFeed2;

    const result = await checkYouTubeFeed(mockClient, { parser: mockParser });

    assert.ok(result);
    assert.strictEqual(result.newVideo, true);
    assert.strictEqual(result.videoId, newVideoId);
    assert.strictEqual(result.title, newTitle);

    // Verify sent notification
    assert.strictEqual(sentMessages.length, 1);
    const sent = sentMessages[0];

    // Check message text requirements
    assert.ok(sent.content.includes('@everyone'));
    assert.ok(sent.content.includes('🚀 New drop from Rounit! Stop typing, start building. Watch here:'));
    assert.ok(sent.content.includes(newLink));

    // Check Embed details
    const embed = sent.embeds[0].toJSON();
    assert.strictEqual(embed.title, newTitle);
    assert.strictEqual(embed.url, newLink);
    assert.strictEqual(embed.color, 0xff0000); // Red
    assert.strictEqual(embed.image.url, `https://i.ytimg.com/vi/${newVideoId}/hqdefault.jpg`);
    assert.strictEqual(embed.author.name, 'Rounieee');
    assert.strictEqual(embed.author.url, `https://www.youtube.com/channel/${CHANNEL_ID}`);

    // Check DB updated
    const cached = db.prepare('SELECT * FROM youtube_cache WHERE channelId = ?').get(CHANNEL_ID);
    assert.strictEqual(cached.lastVideoId, newVideoId);
    assert.strictEqual(cached.title, newTitle);
  });

  await t.test('4. Configured role mention: Uses custom role ID if present', async () => {
    process.env.YOUTUBE_NOTIFICATION_ROLE_ID = '999888777';

    const testVideoId3 = 'vid_brand_new_789';
    const mockFeed3 = {
      title: 'Rounieee',
      items: [
        {
          videoId: testVideoId3,
          title: 'Full Stack Claude 3.7 Agent Architecture',
          link: `https://www.youtube.com/watch?v=${testVideoId3}`,
        },
      ],
    };
    mockParser.parseURL = async () => mockFeed3;
    sentMessages = [];

    await checkYouTubeFeed(mockClient, { parser: mockParser });

    assert.strictEqual(sentMessages.length, 1);
    assert.ok(sentMessages[0].content.includes('<@&999888777>'));

    delete process.env.YOUTUBE_NOTIFICATION_ROLE_ID;
  });

  await t.test('5. Network timeout: Handles network failures gracefully without unhandled rejections', async () => {
    const timeoutParser = {
      parseURL: async () => {
        const error = new Error('Connection timed out after 10000ms');
        error.code = 'ECONNABORTED';
        throw error;
      },
    };

    sentMessages = [];

    // Should resolve safely to null and not throw an unhandled promise rejection
    const result = await checkYouTubeFeed(mockClient, { parser: timeoutParser });
    assert.strictEqual(result, null);
    assert.strictEqual(sentMessages.length, 0);
  });

  // Clean up
  db.prepare('DELETE FROM youtube_cache WHERE channelId = ?').run(CHANNEL_ID);
});
