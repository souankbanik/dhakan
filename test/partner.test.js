const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const partnerSetupCommand = require('../commands/admin/partnerSetup');
const {
  handlePartnerApplyButton,
  handlePartnerModalSubmit,
  handlePartnerButton,
} = require('../handlers/partnerHandler');

test('Partner Application Workflow Suite', async (t) => {
  require('../database/init').initDatabase();

  const testGuildId = 'partner_guild_111';
  const testLogChannelId = 'partner_log_channel_222';
  const applicantId = 'applicant_user_333';
  let createdAppId = null;

  await t.test('1. /partner-setup: Permission check and panel deployment', async () => {
    assert.strictEqual(partnerSetupCommand.data.name, 'partner-setup');

    // Rejects unauthorized user
    let rejectedReply = null;
    const mockNonAdmin = {
      inGuild: () => true,
      memberPermissions: {
        has: () => false,
      },
      reply: async (payload) => {
        rejectedReply = payload;
      },
    };
    await partnerSetupCommand.execute(mockNonAdmin);
    assert.ok(rejectedReply.content.includes('Manage Server'));

    // Authorized setup
    let sentMessage = null;
    let replySuccess = null;
    const mockAdmin = {
      inGuild: () => true,
      guild: { id: testGuildId, name: 'Test Guild' },
      channel: {
        send: async (payload) => {
          sentMessage = payload;
        },
      },
      options: {
        getChannel: () => ({ id: testLogChannelId }),
      },
      memberPermissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild,
      },
      reply: async (payload) => {
        replySuccess = payload;
      },
    };

    await partnerSetupCommand.execute(mockAdmin);
    assert.ok(sentMessage, 'Should send panel message to channel');
    assert.strictEqual(sentMessage.embeds[0].data.title, '🤝 Server Partnership Applications');

    const button = sentMessage.components[0].components[0].data;
    assert.strictEqual(button.custom_id, 'partner_apply_button');
    assert.strictEqual(button.label, 'Apply for Partnership');

    // Verify DB saved log channel
    const settings = db.prepare('SELECT partnerChannel FROM guild_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.partnerChannel, testLogChannelId);
  });

  await t.test('2. Button: Apply button renders 4-field partnership modal', async () => {
    let modalShown = null;
    const mockInteraction = {
      showModal: async (modal) => {
        modalShown = modal;
      },
    };

    await handlePartnerApplyButton(mockInteraction);
    assert.ok(modalShown);
    const modalJson = modalShown.toJSON();
    assert.strictEqual(modalJson.custom_id, 'partner_modal');
    assert.strictEqual(modalJson.title, 'Partnership Application');
    assert.strictEqual(modalJson.components.length, 4);

    const fieldIds = modalJson.components.map((row) => row.components[0].custom_id);
    assert.deepStrictEqual(fieldIds, [
      'partner_server_name',
      'partner_invite',
      'partner_member_count',
      'partner_description',
    ]);
  });

  await t.test('3. Modal: Rejects non-numeric member count', async () => {
    let replyPayload = null;
    const mockInteraction = {
      fields: {
        getTextInputValue: (id) => {
          if (id === 'partner_server_name') return 'My Server';
          if (id === 'partner_invite') return 'https://discord.gg/test';
          if (id === 'partner_member_count') return 'not-a-number';
          if (id === 'partner_description') return 'A very cool gaming community!';
          return '';
        },
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handlePartnerModalSubmit(mockInteraction);
    assert.ok(replyPayload.content.includes('valid positive number'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('4. Modal: Valid submission inserts to DB and posts review embed with buttons', async () => {
    let channelMessage = null;
    let ephemeralReply = null;

    const mockLogChannel = {
      isTextBased: () => true,
      send: async (payload) => {
        channelMessage = payload;
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
      user: { id: applicantId, tag: 'PartnerOwner#1234' },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'partner_server_name') return 'Awesome Community';
          if (id === 'partner_invite') return 'https://discord.gg/awesome';
          if (id === 'partner_member_count') return '750';
          if (id === 'partner_description') return 'The best coding and gaming Discord server!';
          return '';
        },
      },
      reply: async (payload) => {
        ephemeralReply = payload;
      },
    };

    await handlePartnerModalSubmit(mockInteraction);
    assert.ok(ephemeralReply.content.includes('submitted to management'));

    // Check DB insertion
    const appRecord = db
      .prepare('SELECT * FROM partner_applications WHERE userId = ? ORDER BY id DESC LIMIT 1')
      .get(applicantId);
    assert.ok(appRecord);
    assert.strictEqual(appRecord.serverName, 'Awesome Community');
    assert.strictEqual(appRecord.memberCount, 750);
    assert.strictEqual(appRecord.status, 'PENDING');
    createdAppId = appRecord.id;

    // Check review embed in log channel
    assert.ok(channelMessage);
    const embed = channelMessage.embeds[0].toJSON();
    assert.strictEqual(embed.title, '🤝 New Partnership Application');
    const buttons = channelMessage.components[0].components;
    assert.strictEqual(buttons[0].data.custom_id, `partner_accept_${createdAppId}`);
    assert.strictEqual(buttons[0].data.style, ButtonStyle.Success);
    assert.strictEqual(buttons[1].data.custom_id, `partner_decline_${createdAppId}`);
    assert.strictEqual(buttons[1].data.style, ButtonStyle.Danger);
  });

  await t.test('5. Button: Rejects unauthorized user on review buttons', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `partner_accept_${createdAppId}`,
      memberPermissions: {
        has: () => false,
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handlePartnerButton(mockInteraction);
    assert.ok(replyPayload.content.includes('Manage Server'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('6. Button: Accepts application, updates DB, updates embed, DMs applicant', async () => {
    let updatePayload = null;
    let dmPayload = null;

    const mockApplicant = {
      send: async (payload) => {
        dmPayload = payload;
      },
    };

    const mockInteraction = {
      customId: `partner_accept_${createdAppId}`,
      user: { id: 'admin_999', tag: 'Manager#0001' },
      guild: { name: 'Test Guild' },
      memberPermissions: {
        has: () => true,
      },
      client: {
        users: {
          fetch: async (id) => (id === applicantId ? mockApplicant : null),
        },
      },
      message: {
        embeds: [{ data: { title: '🤝 New Partnership Application' } }],
      },
      update: async (payload) => {
        updatePayload = payload;
      },
    };

    await handlePartnerButton(mockInteraction);

    // Verify DB updated
    const app = db.prepare('SELECT * FROM partner_applications WHERE id = ?').get(createdAppId);
    assert.strictEqual(app.status, 'ACCEPTED');
    assert.strictEqual(app.reviewedBy, 'Manager#0001');

    // Verify message updated
    assert.ok(updatePayload);
    const embed = updatePayload.embeds[0].toJSON();
    assert.strictEqual(embed.color, 0x57f287); // Green
    const statusField = embed.fields.find((f) => f.name === 'Status');
    assert.ok(statusField.value.includes('ACCEPTED'));
    const buttons = updatePayload.components[0].components;
    assert.strictEqual(buttons[0].data.disabled, true);
    assert.strictEqual(buttons[1].data.disabled, true);

    // Verify DM sent to applicant
    assert.ok(dmPayload);
    const dmEmbed = dmPayload.embeds[0].toJSON();
    assert.ok(dmEmbed.title.includes('ACCEPTED'));
  });

  await t.test('7. Button: Prevents duplicate review of already accepted/declined application', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `partner_decline_${createdAppId}`,
      memberPermissions: {
        has: () => true,
      },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handlePartnerButton(mockInteraction);
    assert.ok(replyPayload.content.includes('already been reviewed'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  // Clean up
  db.prepare('DELETE FROM partner_applications WHERE id = ?').run(createdAppId);
  db.prepare('DELETE FROM guild_settings WHERE guildId = ?').run(testGuildId);
});
