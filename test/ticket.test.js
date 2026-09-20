const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db');
const ticketSetupCommand = require('../commands/admin/ticketSetup');
const {
  handleTicketCreateButton,
  handleTicketCloseButton,
  handleTicketConfirmClose,
  handleTicketCancelClose,
} = require('../handlers/ticketHandler');

test('Support Ticket System Suite', async (t) => {
  require('../database/init').initDatabase();

  const testGuildId = 'ticket_guild_111';
  const testCategoryId = 'cat_12345';
  const testSupportRoleId = 'role_support_6789';
  const requesterId = 'requester_user_555';
  let createdChannelId = null;

  await t.test('1. /ticket-setup: Permission check and panel deployment', async () => {
    assert.strictEqual(ticketSetupCommand.data.name, 'ticket-setup');

    // Unauthorized rejection
    let rejectedReply = null;
    const mockNonAdmin = {
      inGuild: () => true,
      memberPermissions: { has: () => false },
      reply: async (p) => {
        rejectedReply = p;
      },
    };
    await ticketSetupCommand.execute(mockNonAdmin);
    assert.ok(rejectedReply.content.includes('Manage Server'));

    // Authorized setup
    let sentMessage = null;
    const mockAdmin = {
      inGuild: () => true,
      guild: { id: testGuildId, name: 'Test Guild' },
      channel: {
        send: async (p) => {
          sentMessage = p;
        },
      },
      options: {
        getChannel: () => ({ id: testCategoryId }),
        getRole: () => ({ id: testSupportRoleId }),
      },
      memberPermissions: {
        has: () => true,
      },
      reply: async () => {},
    };

    await ticketSetupCommand.execute(mockAdmin);
    assert.ok(sentMessage);
    assert.strictEqual(sentMessage.embeds[0].data.title, '🎫 Support Ticket System');
    assert.strictEqual(sentMessage.components[0].components[0].data.custom_id, 'ticket_create_button');

    // Verify DB settings
    const settings = db.prepare('SELECT * FROM ticket_settings WHERE guildId = ?').get(testGuildId);
    assert.strictEqual(settings.ticketCategoryId, testCategoryId);
    assert.strictEqual(settings.supportRoleId, testSupportRoleId);
  });

  await t.test('2. Button: Creates private ticket channel with strict isolation', async () => {
    let channelCreatedOptions = null;
    let channelSentMessage = null;
    let ephemeralReply = null;

    const mockCreatedChannel = {
      id: 'channel_ticket_0001',
      send: async (payload) => {
        channelSentMessage = payload;
      },
    };

    const mockInteraction = {
      guild: {
        id: testGuildId,
        roles: { everyone: { id: 'everyone_role_id' } },
        channels: {
          cache: new Map(),
          create: async (options) => {
            channelCreatedOptions = options;
            return mockCreatedChannel;
          },
        },
      },
      client: {
        user: { id: 'bot_user_id' },
      },
      user: { id: requesterId, tag: 'Requester#0001' },
      reply: async (payload) => {
        ephemeralReply = payload;
      },
    };

    await handleTicketCreateButton(mockInteraction);

    // Verify channel creation parameters
    assert.ok(channelCreatedOptions, 'Channel create should be called');
    assert.strictEqual(channelCreatedOptions.name, 'ticket-0001');
    assert.strictEqual(channelCreatedOptions.type, ChannelType.GuildText);
    assert.strictEqual(channelCreatedOptions.parent, testCategoryId);

    // Verify permission isolation
    const overwrites = channelCreatedOptions.permissionOverwrites;
    const everyoneRule = overwrites.find((o) => o.id === 'everyone_role_id');
    const userRule = overwrites.find((o) => o.id === requesterId);
    const botRule = overwrites.find((o) => o.id === 'bot_user_id');
    const staffRule = overwrites.find((o) => o.id === testSupportRoleId);

    assert.ok(everyoneRule.deny.includes(PermissionFlagsBits.ViewChannel), '@everyone must be denied ViewChannel');
    assert.ok(userRule.allow.includes(PermissionFlagsBits.ViewChannel), 'User must be allowed ViewChannel');
    assert.ok(botRule.allow.includes(PermissionFlagsBits.ManageChannels), 'Bot must have ManageChannels');
    assert.ok(staffRule.allow.includes(PermissionFlagsBits.ViewChannel), 'Staff must be allowed ViewChannel');

    // Verify welcome message inside channel
    assert.ok(channelSentMessage);
    const welcomeEmbed = channelSentMessage.embeds[0].toJSON();
    assert.strictEqual(welcomeEmbed.title, 'Support Ticket #1');
    assert.strictEqual(channelSentMessage.components[0].components[0].data.custom_id, 'ticket_close_button');

    // Verify user received ephemeral channel link
    assert.ok(ephemeralReply.content.includes('<#channel_ticket_0001>'));
    createdChannelId = 'channel_ticket_0001';

    // Verify SQLite tickets entry
    const ticketRecord = db.prepare('SELECT * FROM tickets WHERE channelId = ?').get(createdChannelId);
    assert.ok(ticketRecord);
    assert.strictEqual(ticketRecord.status, 'OPEN');
    assert.strictEqual(ticketRecord.ticketNumber, 1);
  });

  await t.test('3. Button: Prevents duplicate active open tickets', async () => {
    let replyPayload = null;
    const mockInteraction = {
      guild: {
        id: testGuildId,
        channels: {
          cache: new Map([[createdChannelId, { id: createdChannelId }]]),
        },
      },
      user: { id: requesterId, tag: 'Requester#0001' },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handleTicketCreateButton(mockInteraction);
    assert.ok(replyPayload.content.includes('already have an open ticket'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('4. Button: Close ticket prompts confirmation with buttons', async () => {
    let replyPayload = null;
    const mockInteraction = {
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handleTicketCloseButton(mockInteraction);
    assert.ok(replyPayload.content.includes('Are you sure you want to close and delete'));
    assert.strictEqual(replyPayload.ephemeral, true);

    const buttons = replyPayload.components[0].components;
    assert.strictEqual(buttons[0].data.custom_id, 'ticket_confirm_close');
    assert.strictEqual(buttons[1].data.custom_id, 'ticket_cancel_close');
  });

  await t.test('5. Button: Cancel close leaves ticket open', async () => {
    let updatePayload = null;
    const mockInteraction = {
      update: async (payload) => {
        updatePayload = payload;
      },
    };

    await handleTicketCancelClose(mockInteraction);
    assert.ok(updatePayload.content.includes('cancelled'));

    // Status in DB must still be OPEN
    const ticket = db.prepare('SELECT status FROM tickets WHERE channelId = ?').get(createdChannelId);
    assert.strictEqual(ticket.status, 'OPEN');
  });

  await t.test('6. Button: Confirm close updates DB to CLOSED and schedules deletion', async () => {
    let replyPayload = null;
    let channelDeleted = false;

    const mockChannel = {
      id: createdChannelId,
      deletable: true,
      delete: async () => {
        channelDeleted = true;
      },
    };

    const mockInteraction = {
      channel: mockChannel,
      user: { id: 'staff_close_user', tag: 'Support#0001' },
      reply: async (payload) => {
        replyPayload = payload;
      },
    };

    await handleTicketConfirmClose(mockInteraction);

    assert.ok(replyPayload.content.includes('Archiving and deleting'));

    // DB record must be updated to CLOSED
    const ticket = db.prepare('SELECT status, closedById FROM tickets WHERE channelId = ?').get(createdChannelId);
    assert.strictEqual(ticket.status, 'CLOSED');
    assert.strictEqual(ticket.closedById, 'staff_close_user');
  });

  // Clean up
  db.prepare('DELETE FROM tickets WHERE channelId = ?').run(createdChannelId);
  db.prepare('DELETE FROM ticket_settings WHERE guildId = ?').run(testGuildId);
});
