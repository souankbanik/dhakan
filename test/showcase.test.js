const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const showcaseCommand = require('../commands/utility/showcase');
const {
  handleShowcaseSubmitButton,
  handleShowcaseModalSubmit,
  handleShowcaseReviewButton,
  handleShowcaseUpvoteButton,
} = require('../handlers/showcaseHandler');

test('Community Project Showcase Suite', async (t) => {
  require('../database/init').initDatabase();

  const testGuildId = 'guild_showcase_111';
  const creatorId = 'creator_user_222';
  const voter1Id = 'voter_user_333';
  const voter2Id = 'voter_user_444';

  let createdProjectId = null;

  // Clean test records before suite runs
  db.prepare("DELETE FROM projects WHERE title = 'Antigravity Studio' OR link LIKE '%antigravity-studio%'").run();
  db.prepare("DELETE FROM project_showcases WHERE projectName = 'Antigravity Studio' OR projectLink LIKE '%antigravity-studio%'").run();
  db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?)').run(creatorId, voter1Id, voter2Id);

  await t.test('1. /showcase: Renders 4-field modal', async () => {
    assert.strictEqual(showcaseCommand.data.name, 'showcase');

    let modalShown = null;
    const mockInteraction = {
      inGuild: () => true,
      showModal: async (m) => {
        modalShown = m;
      },
    };

    await showcaseCommand.execute(mockInteraction);
    assert.ok(modalShown);

    const modalData = modalShown.toJSON();
    assert.strictEqual(modalData.custom_id, 'showcase_modal');
    assert.strictEqual(modalData.title, 'Community Project Showcase');
    assert.strictEqual(modalData.components.length, 4);

    const ids = modalData.components.map((row) => row.components[0].custom_id);
    assert.deepStrictEqual(ids, [
      'showcase_name',
      'showcase_link',
      'showcase_tech',
      'showcase_description',
    ]);
  });

  await t.test('2. Modal: Validates invalid URL format', async () => {
    let replyPayload = null;
    const mockInteraction = {
      fields: {
        getTextInputValue: (id) => {
          if (id === 'showcase_name') return 'My App';
          if (id === 'showcase_link') return 'not-a-valid-url';
          if (id === 'showcase_tech') return 'Next.js, Cursor';
          if (id === 'showcase_description') return 'An awesome web application.';
          return '';
        },
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleShowcaseModalSubmit(mockInteraction);
    assert.ok(replyPayload.content.includes('valid URL'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  await t.test('3. Modal: Saves project in DB and sends review card to #review-queue', async () => {
    let reviewMessage = null;
    let ephemeralReply = null;

    const mockReviewQueue = {
      name: 'review-queue',
      isTextBased: () => true,
      send: async (p) => {
        reviewMessage = p;
      },
    };

    const mockInteraction = {
      guild: {
        id: testGuildId,
        channels: {
          cache: new Map([['queue_chan_id', mockReviewQueue]]),
        },
      },
      user: { id: creatorId, tag: 'Builder#1234' },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'showcase_name') return 'Antigravity Studio';
          if (id === 'showcase_link') return 'https://github.com/developer/antigravity-studio';
          if (id === 'showcase_tech') return 'Cursor, Antigravity, Next.js';
          if (id === 'showcase_description') return 'A modern developer canvas for building AI-native apps.';
          return '';
        },
      },
      reply: async (p) => {
        ephemeralReply = p;
      },
    };

    await handleShowcaseModalSubmit(mockInteraction);

    assert.ok(ephemeralReply.content.includes('staff review queue'));

    // Check DB record
    const record = db
      .prepare('SELECT * FROM project_showcases WHERE userId = ? ORDER BY id DESC LIMIT 1')
      .get(creatorId);
    assert.ok(record);
    assert.strictEqual(record.projectName, 'Antigravity Studio');
    assert.strictEqual(record.status, 'PENDING');
    assert.strictEqual(record.upvoteCount, 0);
    createdProjectId = record.id;

    // Check review queue message
    assert.ok(reviewMessage);
    const embed = reviewMessage.embeds[0].toJSON();
    assert.ok(embed.title.includes('Antigravity Studio'));
    const buttons = reviewMessage.components[0].components;
    assert.strictEqual(buttons[0].data.custom_id, `showcase_approve_${createdProjectId}`);
    assert.strictEqual(buttons[0].data.style, ButtonStyle.Success);
    assert.strictEqual(buttons[1].data.custom_id, `showcase_reject_${createdProjectId}`);
    assert.strictEqual(buttons[1].data.style, ButtonStyle.Danger);
  });

  await t.test('4. Button: Rejects unauthorized user on review buttons', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `showcase_approve_${createdProjectId}`,
      memberPermissions: { has: () => false },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleShowcaseReviewButton(mockInteraction);
    assert.ok(replyPayload.content.includes('Manage Server'));
    assert.strictEqual(replyPayload.ephemeral, true);
  });

  // Track the public showcase card message
  let publicShowcaseMessage = null;
  let publicMessageId = 'msg_showcase_12345';
  let memberRoleAdded = null;
  let creatorDmMessage = null;

  await t.test('5. Button: Approve publishes to #community-builds, assigns Verified Builder, DMs author', async () => {
    const mockBuildsChannel = {
      id: 'chan_builds_999',
      name: 'community-builds',
      isTextBased: () => true,
      send: async (p) => {
        publicShowcaseMessage = {
          id: publicMessageId,
          embeds: p.embeds,
          components: p.components,
          edit: async (update) => {
            if (update.embeds) publicShowcaseMessage.embeds = update.embeds;
            if (update.components) publicShowcaseMessage.components = update.components;
          },
        };
        return publicShowcaseMessage;
      },
    };

    const mockVerifiedBuilderRole = {
      id: 'role_verified_builder',
      name: 'Verified Builder',
    };

    const mockCreatorMember = {
      user: { tag: 'Builder#1234' },
      roles: {
        add: async (role) => {
          memberRoleAdded = role;
        },
      },
    };

    const mockCreatorUser = {
      send: async (p) => {
        creatorDmMessage = p;
      },
    };

    let reviewUpdatePayload = null;
    const mockInteraction = {
      customId: `showcase_approve_${createdProjectId}`,
      user: { id: 'admin_777', tag: 'LeadStaff#0001' },
      memberPermissions: { has: () => true },
      guild: {
        channels: {
          cache: new Map([['chan_builds_999', mockBuildsChannel]]),
        },
        roles: {
          cache: new Map([[mockVerifiedBuilderRole.id, mockVerifiedBuilderRole]]),
        },
        members: {
          fetch: async (id) => (id === creatorId ? mockCreatorMember : null),
        },
      },
      client: {
        users: {
          fetch: async (id) => (id === creatorId ? mockCreatorUser : null),
        },
      },
      message: {
        embeds: [{ data: { title: '🛠️ New Project Submission: Antigravity Studio' } }],
      },
      update: async (p) => {
        reviewUpdatePayload = p;
      },
    };

    await handleShowcaseReviewButton(mockInteraction);

    // Verify DB updated
    const project = db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(createdProjectId);
    assert.strictEqual(project.status, 'APPROVED');
    assert.strictEqual(project.reviewedBy, 'LeadStaff#0001');
    assert.strictEqual(project.publicMessageId, publicMessageId);

    // Verify review message updated
    assert.ok(reviewUpdatePayload);
    assert.strictEqual(reviewUpdatePayload.embeds[0].data.color, 0x57f287); // Green

    // Verify public card in #community-builds
    assert.ok(publicShowcaseMessage);
    const cardEmbed = publicShowcaseMessage.embeds[0].toJSON();
    assert.ok(cardEmbed.title.includes('Antigravity Studio'));

    const buttons = publicShowcaseMessage.components[0].components;
    // Button 1: Link button
    assert.strictEqual(buttons[0].data.style, ButtonStyle.Link);
    assert.strictEqual(buttons[0].data.url, 'https://github.com/developer/antigravity-studio');
    // Button 2: Upvote button
    assert.strictEqual(buttons[1].data.custom_id, `showcase_upvote_${createdProjectId}`);
    assert.strictEqual(buttons[1].data.label, '🔥 Upvote (0)');

    // Verify role assigned
    assert.ok(memberRoleAdded);
    assert.strictEqual(memberRoleAdded.name, 'Verified Builder');

    // Verify DM sent to creator
    assert.ok(creatorDmMessage);
    assert.ok(creatorDmMessage.embeds[0].data.title.includes('Approved'));
  });

  await t.test('6. Button: Upvote records vote, updates counter button and embed', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `showcase_upvote_${createdProjectId}`,
      user: { id: voter1Id, tag: 'FanOne#0001' },
      message: publicShowcaseMessage,
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleShowcaseUpvoteButton(mockInteraction);

    assert.ok(replyPayload.content.includes('Upvote recorded'));
    assert.strictEqual(replyPayload.ephemeral, true);

    // Verify DB count
    const project = db.prepare('SELECT upvoteCount FROM project_showcases WHERE id = ?').get(createdProjectId);
    assert.strictEqual(project.upvoteCount, 1);

    // Verify message updated with new count
    const updatedButton = publicShowcaseMessage.components[0].components[1].data;
    assert.strictEqual(updatedButton.label, '🔥 Upvote (1)');

    const updatedEmbed = publicShowcaseMessage.embeds[0].toJSON();
    const upvoteField = updatedEmbed.fields.find((f) => f.name === 'Upvotes');
    assert.ok(upvoteField.value.includes('1'));
  });

  await t.test('7. Button: Toggles vote off (unvote) when clicking again', async () => {
    let replyPayload = null;
    const mockInteraction = {
      customId: `showcase_upvote_${createdProjectId}`,
      user: { id: voter1Id, tag: 'FanOne#0001' },
      message: publicShowcaseMessage,
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleShowcaseUpvoteButton(mockInteraction);

    assert.ok(replyPayload.content.includes('Upvote removed'));
    assert.strictEqual(replyPayload.ephemeral, true);

    // Count in DB must be 0 after unvote
    const count = db
      .prepare('SELECT COUNT(*) as count FROM project_votes WHERE projectId = ?')
      .get(createdProjectId).count;
    assert.strictEqual(count, 0);

    const updatedButton = publicShowcaseMessage.components[0].components[1].data;
    assert.strictEqual(updatedButton.label, '🔥 Upvote (0)');
  });

  await t.test('8. Button: Users upvote and count advances to 2', async () => {
    // Re-vote as voter1
    await handleShowcaseUpvoteButton({
      customId: `showcase_upvote_${createdProjectId}`,
      user: { id: voter1Id, tag: 'FanOne#0001' },
      message: publicShowcaseMessage,
      reply: async () => {},
    });

    // Now voter2 upvotes
    let replyPayload = null;
    const mockInteraction = {
      customId: `showcase_upvote_${createdProjectId}`,
      user: { id: voter2Id, tag: 'FanTwo#0002' },
      message: publicShowcaseMessage,
      reply: async (p) => {
        replyPayload = p;
      },
    };

    await handleShowcaseUpvoteButton(mockInteraction);

    assert.ok(replyPayload.content.includes('Upvote recorded'));

    // Verify count in DB is 2
    const count = db
      .prepare('SELECT COUNT(*) as count FROM project_votes WHERE projectId = ?')
      .get(createdProjectId).count;
    assert.strictEqual(count, 2);

    const updatedButton = publicShowcaseMessage.components[0].components[1].data;
    assert.strictEqual(updatedButton.label, '🔥 Upvote (2)');
  });

  // Clean up
  db.prepare('DELETE FROM project_votes WHERE projectId = ?').run(createdProjectId);
  db.prepare('DELETE FROM project_upvotes WHERE projectId = ?').run(createdProjectId);
  db.prepare('DELETE FROM projects WHERE id = ?').run(createdProjectId);
  db.prepare('DELETE FROM project_showcases WHERE id = ?').run(createdProjectId);
  db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?)').run(creatorId, voter1Id, voter2Id);
});
