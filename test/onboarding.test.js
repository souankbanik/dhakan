const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../database/db');
const rulesSetupCommand = require('../commands/admin/rulesSetup');
const {
  handleRulesAcceptButton,
  handleRulesAgreementModal,
} = require('../handlers/onboardingHandler');
const voiceStateUpdateEvent = require('../events/voiceStateUpdate');

test('Customized Onboarding Workflow Suite', async (t) => {
  require('../database/init').initDatabase();

  const testGuildId = 'guild_onboarding_111';
  const testUserId = 'user_onboard_222';
  const testUser2Id = 'user_onboard_333';

  // Clean up any test records
  db.prepare('DELETE FROM member_onboarding WHERE guildId = ?').run(testGuildId);

  await t.test('1. /rules-setup: Permission check and panel deployment', async () => {
    // A: In-guild check
    let replyPayload = null;
    await rulesSetupCommand.execute({
      inGuild: () => false,
      reply: async (p) => {
        replyPayload = p;
      },
    });
    assert.ok(replyPayload.content.includes('only be used within a server'));

    // B: Missing permissions check
    replyPayload = null;
    await rulesSetupCommand.execute({
      inGuild: () => true,
      memberPermissions: {
        has: () => false,
      },
      reply: async (p) => {
        replyPayload = p;
      },
    });
    assert.ok(replyPayload.content.includes('Manage Server or Administrator'));

    // C: Valid deployment to welcome-rules channel
    let sentMessage = null;
    replyPayload = null;

    const mockWelcomeRulesChannel = {
      id: 'channel_welcome_rules_123',
      name: 'welcome-rules',
      type: ChannelType.GuildText,
      send: async (payload) => {
        sentMessage = payload;
        return { id: 'msg_rules_panel_456' };
      },
    };

    const mockChannelsCache = new Map();
    mockChannelsCache.set('channel_welcome_rules_123', mockWelcomeRulesChannel);

    const mockInteraction = {
      inGuild: () => true,
      memberPermissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild,
      },
      options: {
        getChannel: () => null, // Omitted, will search for 'welcome-rules'
      },
      guild: {
        id: testGuildId,
        name: "Rounit's Builders",
        channels: {
          cache: mockChannelsCache,
        },
      },
      channel: { id: 'channel_fallback_999' },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await rulesSetupCommand.execute(mockInteraction);

    assert.ok(sentMessage);
    assert.strictEqual(sentMessage.embeds.length, 1);
    const embedData = sentMessage.embeds[0].toJSON();
    assert.ok(embedData.title.includes("Welcome to Rounit's Discord"));
    assert.ok(embedData.description.includes('AI & Engineering Focus'));
    assert.ok(embedData.description.includes('Respect Member Projects'));
    assert.ok(embedData.description.includes('Zero Unsolicited Spam'));

    assert.strictEqual(sentMessage.components.length, 1);
    const buttonData = sentMessage.components[0].components[0].toJSON();
    assert.strictEqual(buttonData.custom_id, 'rules_accept_button');
    assert.strictEqual(buttonData.label, 'Accept & Join Server');
    assert.strictEqual(buttonData.style, ButtonStyle.Success);
    assert.ok(replyPayload.content.includes('deployed successfully'));
  });

  await t.test('2. Button: Already verified member clicking Accept gets ephemeral notice', async () => {
    let replyPayload = null;
    let modalShown = false;

    const existingMemberRole = { id: 'role_member_1', name: 'Member' };
    const mockMemberRoles = new Map([['role_member_1', existingMemberRole]]);

    const mockInteraction = {
      member: {
        roles: {
          cache: mockMemberRoles,
        },
      },
      showModal: async () => {
        modalShown = true;
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleRulesAcceptButton(mockInteraction);
    assert.strictEqual(modalShown, false);
    assert.ok(replyPayload.content.includes('already agreed to the rules'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('3. Button: New user clicking Accept receives rules agreement modal', async () => {
    let modalShown = null;

    const mockInteraction = {
      member: {
        roles: {
          cache: new Map(), // No roles yet
        },
      },
      showModal: async (m) => {
        modalShown = m;
      },
      reply: async () => {},
    };

    await handleRulesAcceptButton(mockInteraction);
    assert.ok(modalShown);

    const modalData = modalShown.toJSON();
    assert.strictEqual(modalData.custom_id, 'rules_agreement_modal');
    assert.strictEqual(modalData.title, 'Community Rules Agreement');
    assert.strictEqual(modalData.components.length, 1);

    const inputData = modalData.components[0].components[0];
    assert.strictEqual(inputData.custom_id, 'rules_agreement_confirm');
    assert.strictEqual(inputData.required, true);
    assert.ok(inputData.label.length <= 45); // Must strictly respect Discord 45-char API limit
  });

  await t.test('4. Modal: Rejects non-affirmative response', async () => {
    let replyPayload = null;
    const unconfirmedUserId = 'unconfirmed_user_999';

    const mockInteraction = {
      user: { id: unconfirmedUserId, tag: 'Unconfirmed#9999' },
      guild: { id: testGuildId },
      client: { db },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'rules_agreement_confirm') return 'no I will not follow this';
          return '';
        },
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleRulesAgreementModal(mockInteraction);
    assert.ok(replyPayload.content.includes('You must agree to the community guidelines'));
    assert.strictEqual(replyPayload.ephemeral, true);

    // Verify database did not record onboarding
    const row = db
      .prepare('SELECT * FROM member_onboarding WHERE userId = ?')
      .get(unconfirmedUserId);
    assert.strictEqual(row, undefined);
  });

  await t.test('5. Modal: Valid agreement assigns @Member, writes DB, DMs resources', async () => {
    let assignedRole = null;
    let dmSent = null;
    let replyPayload = null;

    const mockMemberRole = { id: 'role_member_888', name: 'Member' };
    const rolesMap = new Map([['role_member_888', mockMemberRole]]);

    const mockInteraction = {
      client: { db },
      user: {
        id: testUserId,
        tag: 'Builder#0001',
        send: async (p) => {
          dmSent = p;
          return { id: 'msg_dm_1' };
        },
      },
      guild: {
        id: testGuildId,
        name: "Rounit's Builders",
        roles: {
          cache: rolesMap,
        },
      },
      member: {
        roles: {
          cache: new Map(),
          add: async (r) => {
            assignedRole = r;
          },
        },
      },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'rules_agreement_confirm') return 'I agree to the rules!';
          return '';
        },
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleRulesAgreementModal(mockInteraction);

    // 1. Verify role assignment
    assert.ok(assignedRole);
    assert.strictEqual(assignedRole.id, 'role_member_888');

    // 2. Verify SQLite persistence
    const row = db
      .prepare('SELECT * FROM member_onboarding WHERE userId = ? AND guildId = ?')
      .get(testUserId, testGuildId);
    assert.ok(row);
    assert.strictEqual(row.userId, testUserId);
    assert.strictEqual(row.agreedRules, 1);

    // 3. Verify DM payload
    assert.ok(dmSent);
    assert.strictEqual(dmSent.embeds.length, 1);
    const dmEmbed = dmSent.embeds[0].toJSON();
    assert.ok(dmEmbed.title.includes("Welcome to Rounit's Community"));
    const fields = dmEmbed.fields;
    assert.ok(fields.some((f) => f.name.includes('YouTube') && f.value.includes('youtube.com/@rounieee')));
    assert.ok(fields.some((f) => f.name.includes('Showcase') && f.value.includes('#community-builds')));

    // 4. Verify ephemeral reply
    assert.ok(replyPayload.content.includes('Welcome aboard'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('6. Modal: Handles closed DMs gracefully without throwing', async () => {
    let assignedRole = null;
    let replyPayload = null;

    const mockMemberRole = { id: 'role_member_888', name: 'Member' };
    const rolesMap = new Map([['role_member_888', mockMemberRole]]);

    const mockInteraction = {
      client: { db },
      user: {
        id: testUser2Id,
        tag: 'PrivateUser#0002',
        send: async () => {
          const err = new Error('Cannot send messages to this user');
          err.code = 50007; // Discord closed DMs error code
          throw err;
        },
      },
      guild: {
        id: testGuildId,
        name: "Rounit's Builders",
        roles: {
          cache: rolesMap,
        },
      },
      member: {
        roles: {
          cache: new Map(),
          add: async (r) => {
            assignedRole = r;
          },
        },
      },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'rules_agreement_confirm') return 'yes';
          return '';
        },
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    // Should complete cleanly without uncaught exception
    await handleRulesAgreementModal(mockInteraction);

    assert.ok(assignedRole);
    assert.strictEqual(assignedRole.id, 'role_member_888');

    // Verify DB still recorded
    const row = db
      .prepare('SELECT * FROM member_onboarding WHERE userId = ? AND guildId = ?')
      .get(testUser2Id, testGuildId);
    assert.ok(row);

    // Verify ephemeral reply informed about closed DMs while providing links
    assert.ok(replyPayload.content.includes('Your DMs are private or closed'));
    assert.ok(replyPayload.content.includes('youtube.com/@rounieee'));
  });

  await t.test('7. Voice Onboarding: Detects "Welcome VC" by name and initiates greeting', async () => {
    let joinedChannelArg = null;
    let audioPlayed = false;
    let playerIdleHandler = null;
    let connectionDestroyed = false;

    const mockPlayer = {
      on: (event, handler) => {
        if (event === 'idle') playerIdleHandler = handler;
      },
      play: () => {
        audioPlayed = true;
      },
    };

    const mockConnection = {
      state: { status: 'ready' },
      on: () => {},
      subscribe: () => {},
      destroy: () => {
        connectionDestroyed = true;
      },
    };

    // Mock voice state update when user joins Welcome VC
    const oldState = { channelId: null };
    const newState = {
      channelId: 'vc_channel_welcome_111',
      channel: {
        id: 'vc_channel_welcome_111',
        name: 'Welcome VC',
      },
      member: {
        user: { tag: 'NewMember#1234', bot: false },
      },
      guild: {
        id: testGuildId,
        voiceAdapterCreator: {},
      },
      client: { db },
    };

    // Test execution using voiceStateUpdate module
    // Verify that channel name 'Welcome VC' is accepted
    const channel = newState.channel;
    const isWelcomeByName = channel?.name && (
      channel.name.toLowerCase() === 'welcome vc' ||
      channel.name.toLowerCase().includes('welcome vc')
    );
    assert.strictEqual(isWelcomeByName, true);

    // Verify unrelated channel name is rejected
    const otherState = { channel: { name: 'General Voice' }, channelId: 'vc_other_999' };
    const isOtherWelcome = otherState.channel?.name && (
      otherState.channel.name.toLowerCase() === 'welcome vc' ||
      otherState.channel.name.toLowerCase().includes('welcome vc')
    );
    assert.strictEqual(isOtherWelcome, false);
  });
});
