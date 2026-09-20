const test = require('node:test');
const assert = require('node:assert');
const { ChannelType, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const config = require('../config');
const { initDatabase } = require('../database/init');
const { handleShowcaseReviewButton } = require('../handlers/showcaseHandler');
const { handleTicketCreateButton } = require('../handlers/ticketHandler');
const voiceStateUpdate = require('../events/voiceStateUpdate');

test('Forum Channel Compatibility, Voice Greeting ID, and Thread Tracking Suite', async (t) => {
  initDatabase();

  const testGuildId = 'guild_forum_test_101';
  const creatorId = 'builder_forum_user_202';
  const reviewerId = 'reviewer_forum_user_303';
  const testForumChannelId = 'forum_chan_789';
  const testTextChannelId = 'text_chan_456';
  const testParentCategoryId = 'category_tickets_999';

  // Helper to create a dummy project in DB
  function insertTestProject(title, link) {
    const res = db.prepare(`
      INSERT INTO projects (guildId, userId, title, link, techStack, description, status)
      VALUES (?, ?, ?, ?, 'React, Cursor', 'A next-gen AI builder tool', 'PENDING')
    `).run(testGuildId, creatorId, title, link);

    const projectId = Number(res.lastInsertRowid);
    db.prepare(`
      INSERT INTO project_showcases (id, guildId, userId, projectName, projectLink, techStack, description, status)
      VALUES (?, ?, ?, ?, ?, 'React, Cursor', 'A next-gen AI builder tool', 'PENDING')
    `).run(projectId, testGuildId, creatorId, title, link);

    return projectId;
  }

  // Clean test records before suite
  db.prepare('DELETE FROM projects WHERE guildId = ?').run(testGuildId);
  db.prepare('DELETE FROM project_showcases WHERE guildId = ?').run(testGuildId);
  db.prepare('DELETE FROM users WHERE userId IN (?, ?)').run(creatorId, reviewerId);
  db.prepare('DELETE FROM tickets WHERE guildId = ?').run(testGuildId);

  await t.test('1. Config & Environment: Voice Greeting ID and coworkingVoice', () => {
    assert.ok(config.channels.coworkingVoice, 'config.channels.coworkingVoice should be defined');
    assert.strictEqual(
      config.channels.coworkingVoice,
      '1550590435922280629',
      'coworkingVoice must equal 1550590435922280629'
    );
    assert.strictEqual(voiceStateUpdate.name, 'voiceStateUpdate');
  });

  await t.test('2. Forum Channel: Creates thread post via channel.threads.create and saves thread.id & thread.message.id', async () => {
    const projectId = insertTestProject('VibeStudio AI', 'https://vibestudio.ai');
    let threadCreateParams = null;
    let starterMessageId = 'msg_starter_999';
    let createdThreadId = 'thread_forum_post_888';

    const mockForumChannel = {
      id: testForumChannelId,
      name: 'community-builds',
      type: ChannelType.GuildForum, // 15
      isTextBased: () => false,
      threads: {
        create: async (params) => {
          threadCreateParams = params;
          return {
            id: createdThreadId,
            message: { id: starterMessageId },
            fetchStarterMessage: async () => ({ id: starterMessageId }),
          };
        },
      },
    };

    const mockCreatorMember = {
      user: { tag: 'VibeBuilder#0001' },
      roles: { add: async () => {} },
    };

    const mockInteraction = {
      customId: `showcase_approve_${projectId}`,
      user: { id: reviewerId, tag: 'StaffReviewer#0001' },
      memberPermissions: { has: () => true },
      guild: {
        id: testGuildId,
        channels: {
          cache: new Map([[testForumChannelId, mockForumChannel]]),
          fetch: async (id) => (id === testForumChannelId ? mockForumChannel : null),
        },
        roles: {
          cache: new Map([['role_vb', { id: 'role_vb', name: 'Verified Builder' }]]),
          create: async () => ({ id: 'role_vb', name: 'Verified Builder' }),
        },
        members: {
          fetch: async (id) => (id === creatorId ? mockCreatorMember : null),
        },
      },
      client: {
        users: {
          fetch: async () => ({ send: async () => {} }),
        },
      },
      message: {
        embeds: [{ data: { title: '🛠️ New Project Submission: VibeStudio AI' } }],
      },
      update: async () => {},
    };

    // Override config channel to point to mock forum
    const originalCommunityBuilds = config.channels.communityBuilds;
    config.channels.communityBuilds = testForumChannelId;

    try {
      await handleShowcaseReviewButton(mockInteraction);

      // Verify thread creation params
      assert.ok(threadCreateParams, 'channel.threads.create should be called for GuildForum');
      assert.strictEqual(threadCreateParams.name, 'VibeStudio AI');
      assert.ok(threadCreateParams.message.embeds.length > 0);
      assert.ok(threadCreateParams.message.components.length > 0);

      // Verify SQLite records: thread.id and thread.message.id stored
      const projectRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      assert.ok(projectRow, 'Project record should exist in projects table');
      assert.strictEqual(projectRow.status, 'APPROVED');
      assert.strictEqual(projectRow.messageId, starterMessageId, 'messageId should match thread.message.id');
      assert.strictEqual(projectRow.threadId, createdThreadId, 'threadId should match thread.id');

      const showcaseRow = db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(projectId);
      assert.ok(showcaseRow, 'Showcase record should exist in project_showcases table');
      assert.strictEqual(showcaseRow.publicMessageId, starterMessageId);
      assert.strictEqual(showcaseRow.publicChannelId, createdThreadId);
    } finally {
      config.channels.communityBuilds = originalCommunityBuilds;
    }
  });

  await t.test('3. GuildText Fallback: Sends standard message and spawns discussion thread', async () => {
    const projectId = insertTestProject('PromptForge Web', 'https://promptforge.dev');
    let sentPayload = null;
    let spawnedThreadParams = null;
    let standardMsgId = 'msg_text_channel_111';
    let spawnedThreadId = 'thread_discussion_222';

    const mockTextChannel = {
      id: testTextChannelId,
      name: 'community-builds',
      type: ChannelType.GuildText, // 0
      isTextBased: () => true,
      send: async (payload) => {
        sentPayload = payload;
        return {
          id: standardMsgId,
          startThread: async (params) => {
            spawnedThreadParams = params;
            return { id: spawnedThreadId };
          },
        };
      },
    };

    const mockCreatorMember = {
      user: { tag: 'PromptForgeBuilder#0001' },
      roles: { add: async () => {} },
    };

    const mockInteraction = {
      customId: `showcase_approve_${projectId}`,
      user: { id: reviewerId, tag: 'StaffReviewer#0001' },
      memberPermissions: { has: () => true },
      guild: {
        id: testGuildId,
        channels: {
          cache: new Map([[testTextChannelId, mockTextChannel]]),
          fetch: async (id) => (id === testTextChannelId ? mockTextChannel : null),
        },
        roles: {
          cache: new Map([['role_vb', { id: 'role_vb', name: 'Verified Builder' }]]),
          create: async () => ({ id: 'role_vb', name: 'Verified Builder' }),
        },
        members: {
          fetch: async (id) => (id === creatorId ? mockCreatorMember : null),
        },
      },
      client: {
        users: {
          fetch: async () => ({ send: async () => {} }),
        },
      },
      message: {
        embeds: [{ data: { title: '🛠️ New Project Submission: PromptForge Web' } }],
      },
      update: async () => {},
    };

    const originalCommunityBuilds = config.channels.communityBuilds;
    config.channels.communityBuilds = testTextChannelId;

    try {
      await handleShowcaseReviewButton(mockInteraction);

      // Verify standard message sent & thread spawned
      assert.ok(sentPayload, 'channel.send should be called for GuildText');
      assert.ok(spawnedThreadParams, 'msg.startThread should be called for GuildText');
      assert.ok(spawnedThreadParams.name.includes('PromptForge Web'));

      // Verify SQLite records
      const projectRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      assert.ok(projectRow);
      assert.strictEqual(projectRow.status, 'APPROVED');
      assert.strictEqual(projectRow.messageId, standardMsgId);
      assert.strictEqual(projectRow.threadId, spawnedThreadId);
    } finally {
      config.channels.communityBuilds = originalCommunityBuilds;
    }
  });

  await t.test('4. Ticket Creation: Creates private channel under support-tickets parent category (channel.parentId)', async () => {
    let createdChannelOptions = null;
    const mockCreatedChannel = {
      id: 'ticket_chan_555',
      send: async () => {},
    };

    const mockInteraction = {
      guild: {
        id: testGuildId,
        roles: { everyone: { id: 'everyone_role' } },
        channels: {
          cache: new Map(),
          create: async (options) => {
            createdChannelOptions = options;
            return mockCreatedChannel;
          },
        },
      },
      channel: {
        id: 'support_tickets_panel_chan',
        parentId: testParentCategoryId, // parent category ID
      },
      client: {
        user: { id: 'bot_id' },
      },
      user: { id: 'user_ticket_requester', tag: 'Requester#1234' },
      reply: async () => {},
    };

    await handleTicketCreateButton(mockInteraction);

    assert.ok(createdChannelOptions, 'Channel creation options must be recorded');
    assert.strictEqual(
      createdChannelOptions.parent,
      testParentCategoryId,
      'Created ticket channel must inherit interaction.channel.parentId'
    );
  });

  // Clean up test data
  db.prepare('DELETE FROM projects WHERE guildId = ?').run(testGuildId);
  db.prepare('DELETE FROM project_showcases WHERE guildId = ?').run(testGuildId);
  db.prepare('DELETE FROM users WHERE userId IN (?, ?)').run(creatorId, reviewerId);
  db.prepare('DELETE FROM tickets WHERE guildId = ?').run(testGuildId);
});
