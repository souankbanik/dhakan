const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const loaCommand = require('../commands/staff/loa');
const { handleLoaModalSubmit, handleLoaButton } = require('../handlers/loaHandler');

test('Staff LOA Workflow Suite', async (t) => {
  // Ensure tables are ready
  require('../database/init').initDatabase();

  await t.test('1. Command: /loa structure and modal trigger', async () => {
    assert.strictEqual(loaCommand.data.name, 'loa');
    assert.strictEqual(loaCommand.data.dm_permission, false);

    let modalShown = null;
    let replyPayload = null;

    const mockInteractionGuild = {
      inGuild: () => true,
      showModal: async (modal) => {
        modalShown = modal;
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await loaCommand.execute(mockInteractionGuild);

    assert.ok(modalShown, 'Modal should be shown to user');
    const modalData = modalShown.toJSON();
    assert.strictEqual(modalData.custom_id, 'loa_modal');
    assert.strictEqual(modalData.title, 'Staff Leave of Absence Request');
    assert.strictEqual(modalData.components.length, 2);

    const firstInput = modalData.components[0].components[0];
    const secondInput = modalData.components[1].components[0];
    assert.strictEqual(firstInput.custom_id, 'loa_days');
    assert.strictEqual(secondInput.custom_id, 'loa_reason');
  });

  await t.test('2. Modal: Validates invalid days input', async () => {
    let replyMessage = null;
    const mockInteraction = {
      fields: {
        getTextInputValue: (id) => (id === 'loa_days' ? 'not-a-number' : 'Need rest'),
      },
      reply: async (options) => {
        replyMessage = options;
      },
    };

    await handleLoaModalSubmit(mockInteraction);
    assert.ok(replyMessage.content.includes('valid positive number of days'));
    assert.strictEqual(replyMessage.ephemeral, true);
  });

  let createdRequestId = null;
  const testStaffId = '987654321012345678';
  const testGuildId = '112233445566778899';
  const testLogChannelId = '556677889900112233';

  await t.test('3. Modal: Saves request to DB, sends embed to log channel, replies ephemerally', async () => {
    // Configure log channel in DB
    db.prepare('INSERT OR REPLACE INTO guild_settings (guildId, loaLogChannel) VALUES (?, ?)').run(
      testGuildId,
      testLogChannelId
    );

    let channelSentPayload = null;
    let ephemeralReply = null;

    const mockLogChannel = {
      isTextBased: () => true,
      send: async (payload) => {
        channelSentPayload = payload;
      },
    };

    const mockInteraction = {
      guild: {
        id: testGuildId,
        channels: {
          cache: new Map([[testLogChannelId, mockLogChannel]]),
          fetch: async () => mockLogChannel,
        },
      },
      user: {
        id: testStaffId,
        tag: 'StaffMember#1111',
      },
      fields: {
        getTextInputValue: (id) => (id === 'loa_days' ? '14' : 'Family medical leave'),
      },
      reply: async (payload) => {
        ephemeralReply = payload;
      },
    };

    await handleLoaModalSubmit(mockInteraction);

    assert.strictEqual(ephemeralReply.content, 'Your LOA request has been submitted to management.');
    assert.strictEqual(ephemeralReply.ephemeral, true);

    // Verify DB insertion
    const record = db
      .prepare('SELECT * FROM loa_requests WHERE userId = ? ORDER BY id DESC LIMIT 1')
      .get(testStaffId);

    assert.ok(record, 'Record should exist in database');
    assert.strictEqual(record.days, 14);
    assert.strictEqual(record.reason, 'Family medical leave');
    assert.strictEqual(record.status, 'PENDING');
    createdRequestId = record.id;

    // Verify Log Channel message payload
    assert.ok(channelSentPayload, 'Log channel should receive message');
    assert.strictEqual(channelSentPayload.embeds.length, 1);
    const embed = channelSentPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '📋 Staff Leave of Absence Request');
    assert.strictEqual(channelSentPayload.components.length, 1);

    const buttons = channelSentPayload.components[0].components;
    assert.strictEqual(buttons[0].data.custom_id, `loa_approve_${createdRequestId}`);
    assert.strictEqual(buttons[0].data.label, 'Approve Request');
    assert.strictEqual(buttons[0].data.style, ButtonStyle.Success);

    assert.strictEqual(buttons[1].data.custom_id, `loa_decline_${createdRequestId}`);
    assert.strictEqual(buttons[1].data.label, 'Decline Request');
    assert.strictEqual(buttons[1].data.style, ButtonStyle.Danger);
  });

  await t.test('4. Button: Rejects users lacking Manage Guild or Admin permissions', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `loa_approve_${createdRequestId}`,
      memberPermissions: {
        has: () => false,
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handleLoaButton(mockInteraction);
    assert.ok(replyPayload.content.includes('Manage Server'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('5. Button: Approves request, updates DB, disables buttons, DMs applicant', async () => {
    let updatePayload = null;
    let dmPayload = null;

    const mockApplicantUser = {
      send: async (payload) => {
        dmPayload = payload;
      },
    };

    const mockInteraction = {
      customId: `loa_approve_${createdRequestId}`,
      memberPermissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild || perm === PermissionFlagsBits.Administrator,
      },
      user: {
        id: '999888777666555444',
        tag: 'Admin#0001',
      },
      guild: {
        id: testGuildId,
        name: 'Test Guild',
      },
      client: {
        users: {
          fetch: async (id) => {
            if (id === testStaffId) return mockApplicantUser;
            return null;
          },
        },
      },
      update: async (payload) => {
        updatePayload = payload;
      },
    };

    await handleLoaButton(mockInteraction);

    // Verify DB updated
    const updatedRecord = db.prepare('SELECT * FROM loa_requests WHERE id = ?').get(createdRequestId);
    assert.strictEqual(updatedRecord.status, 'APPROVED');
    assert.strictEqual(updatedRecord.reviewedBy, 'Admin#0001');

    // Verify message update
    assert.ok(updatePayload, 'Message should be updated');
    const embedData = updatePayload.embeds[0].toJSON();
    assert.strictEqual(embedData.color, 0x57f287); // Green for Approved

    const buttons = updatePayload.components[0].components;
    assert.strictEqual(buttons[0].data.disabled, true);
    assert.strictEqual(buttons[1].data.disabled, true);

    // Verify DM was sent to applicant
    assert.ok(dmPayload, 'DM should be sent to applicant');
    const dmEmbedData = dmPayload.embeds[0].toJSON();
    assert.ok(dmEmbedData.title.includes('APPROVED'));
    assert.strictEqual(dmEmbedData.color, 0x57f287);
  });

  await t.test('6. Button: Prevents duplicate review of already approved/declined request', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `loa_decline_${createdRequestId}`,
      memberPermissions: {
        has: () => true,
      },
      user: {
        id: '999888777666555444',
        tag: 'Admin#0001',
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handleLoaButton(mockInteraction);
    assert.ok(replyPayload.content.includes('already been reviewed'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('7. Modal: Automatically falls back to channel named #staff-logs', async () => {
    // Clear guild settings so no loaLogChannel is configured
    db.prepare('DELETE FROM guild_settings WHERE guildId = ?').run(testGuildId);

    let sentToStaffLogs = null;
    const mockStaffLogsChannel = {
      id: 'staff_logs_99999',
      name: 'staff-logs',
      isTextBased: () => true,
      send: async (p) => {
        sentToStaffLogs = p;
      },
    };

    const mockChannels = new Map([['staff_logs_99999', mockStaffLogsChannel]]);

    const mockInteraction = {
      guild: {
        id: testGuildId,
        channels: {
          cache: mockChannels,
          fetch: async () => null,
        },
      },
      user: {
        id: testStaffId,
        tag: 'StaffMember#1111',
      },
      fields: {
        getTextInputValue: (id) => (id === 'loa_days' ? '5' : 'Attending tech conference'),
      },
      reply: async () => {},
    };

    await handleLoaModalSubmit(mockInteraction);

    assert.ok(sentToStaffLogs, 'Should send to channel named staff-logs');
    assert.strictEqual(sentToStaffLogs.embeds.length, 1);
    const embed = sentToStaffLogs.embeds[0].toJSON();
    assert.ok(embed.title.includes('Staff Leave of Absence Request'));
    assert.strictEqual(sentToStaffLogs.components.length, 1);
  });

  // Cleanup test records
  db.prepare('DELETE FROM loa_requests WHERE id = ?').run(createdRequestId);
  db.prepare('DELETE FROM guild_settings WHERE guildId = ?').run(testGuildId);
});

