const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const config = require('../config');
const {
  normalizeUrl,
  normalizeTitle,
  checkAccountAge,
  checkSubmissionRateLimit,
  checkButtonDebounce,
  clearDebounceCache,
  checkDuplicateProject,
  isSelfVote,
} = require('../utils/antiCheat');
const rateModelCommand = require('../commands/utility/rateModel');
const aiLeaderboardCommand = require('../commands/utility/aiLeaderboard');
const {
  handleShowcaseModalSubmit,
  handleShowcaseReviewButton,
  handleShowcaseFlagButton,
  handleShowcaseUpvoteButton,
  handleFeedbackModalSubmit,
  handleBountyHelpfulButton,
} = require('../handlers/showcaseHandler');

test('Anti-Cheat, Curation Pipeline, AI Tier List & Bounties Suite', async (t) => {
  require('../database/init').initDatabase();

  const mockGuildId = 'guild_ac_101';
  const authorUserId = 'ac_author_111';
  const reviewerUserId = 'ac_reviewer_222';
  const youngUserId = 'ac_young_333';
  const rounitId = config.rounitUserId || '1517531053789544499';

  // Cleanup helper
  function cleanup() {
    db.prepare('DELETE FROM users WHERE userId IN (?, ?, ?, ?)').run(
      authorUserId,
      reviewerUserId,
      youngUserId,
      rounitId
    );
    db.prepare("DELETE FROM projects WHERE title LIKE '%AntiCheat%'").run();
    db.prepare("DELETE FROM project_showcases WHERE projectName LIKE '%AntiCheat%'").run();
    db.prepare('DELETE FROM model_ratings WHERE userId IN (?, ?)').run(reviewerUserId, authorUserId);
    db.prepare('DELETE FROM bounties WHERE reviewerId IN (?, ?)').run(reviewerUserId, authorUserId);
    clearDebounceCache();
  }

  cleanup();

  await t.test('1. Normalization: URLs and Titles are standardized accurately', () => {
    // URL Normalization tests
    const rawUrl1 = 'https://www.GitHub.com/Owner/CoolRepo/?utm_source=twitter#readme';
    const normUrl1 = normalizeUrl(rawUrl1);
    assert.strictEqual(normUrl1, 'github.com/owner/coolrepo');

    const rawUrl2 = 'http://MySubDomain.App.io/path/to/demo///?ref=123';
    const normUrl2 = normalizeUrl(rawUrl2);
    assert.strictEqual(normUrl2, 'mysubdomain.app.io/path/to/demo');

    // Title Normalization tests
    const rawTitle = '  🚀 Super--Cool AI-Native App!! (v2.0)  ';
    const normTitle = normalizeTitle(rawTitle);
    assert.strictEqual(normTitle, 'super cool ai native app v2 0');
  });

  await t.test('2. Account Age Guard: Blocks accounts younger than 7 days', () => {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    const youngUser = {
      id: youngUserId,
      createdTimestamp: threeDaysAgo,
    };
    const matureUser = {
      id: authorUserId,
      createdTimestamp: tenDaysAgo,
    };

    const youngResult = checkAccountAge(youngUser, 7);
    assert.strictEqual(youngResult.allowed, false);
    assert.strictEqual(youngResult.ageDays, 3);

    const matureResult = checkAccountAge(matureUser, 7);
    assert.strictEqual(matureResult.allowed, true);
    assert.strictEqual(matureResult.ageDays, 10);
  });

  await t.test('3. Button Debounce: Blocks rapid button mashing within window', () => {
    clearDebounceCache();
    const testUser = 'user_debouncer';
    const action = 'upvote_mash';

    // First click allowed
    assert.strictEqual(checkButtonDebounce(testUser, action, 2000), true);
    // Rapid immediate click blocked
    assert.strictEqual(checkButtonDebounce(testUser, action, 2000), false);
    // Another immediate click blocked
    assert.strictEqual(checkButtonDebounce(testUser, action, 2000), false);

    // Different user or different action is allowed
    assert.strictEqual(checkButtonDebounce('different_user', action, 2000), true);
    assert.strictEqual(checkButtonDebounce(testUser, 'different_action', 2000), true);
  });

  let createdProjectId = null;

  await t.test('4. Showcase Submission: Rejects duplicate URLs and normalized titles', async () => {
    let replyPayload = null;
    const mockChannel = {
      id: 'chan_1',
      name: 'review-queue',
      isTextBased: () => true,
      send: async () => {},
    };

    const submitInteraction = {
      guild: {
        id: mockGuildId,
        channels: { cache: new Map([['chan_1', mockChannel]]) },
      },
      user: {
        id: authorUserId,
        tag: 'Author#0001',
        createdTimestamp: Date.now() - 30 * 86400 * 1000, // 30 days old
      },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'showcase_name') return 'AntiCheat AI Studio';
          if (id === 'showcase_link') return 'https://www.anticheat-studio.io/demo/?ref=discord';
          if (id === 'showcase_tech') return 'Antigravity, SQLite';
          if (id === 'showcase_description') return 'AI agent verifying clean code submissions.';
          return '';
        },
      },
      reply: async (p) => {
        replyPayload = p;
      },
    };

    // First submission: Success
    await handleShowcaseModalSubmit(submitInteraction);
    assert.ok(replyPayload.content.includes('staff review queue'));

    // Retrieve project ID
    const proj = db
      .prepare("SELECT id FROM projects WHERE title = 'AntiCheat AI Studio'")
      .get();
    assert.ok(proj);
    createdProjectId = proj.id;

    // Second submission with same URL (different query / formatting): Blocked as duplicate
    let dupReply = null;
    const duplicateUrlInteraction = {
      ...submitInteraction,
      user: {
        id: reviewerUserId,
        tag: 'Spammer#0002',
        createdTimestamp: Date.now() - 20 * 86400 * 1000,
      },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'showcase_name') return 'Different Name';
          if (id === 'showcase_link') return 'http://anticheat-studio.io/demo'; // Same normalized URL
          if (id === 'showcase_tech') return 'React';
          if (id === 'showcase_description') return 'Another description text.';
          return '';
        },
      },
      reply: async (p) => {
        dupReply = p;
      },
    };

    await handleShowcaseModalSubmit(duplicateUrlInteraction);
    assert.ok(dupReply.content.includes('already been submitted'));
    assert.strictEqual(dupReply.ephemeral, true);

    // Third submission with same title (different casing/punctuation): Blocked as duplicate
    let titleDupReply = null;
    const duplicateTitleInteraction = {
      ...submitInteraction,
      user: {
        id: reviewerUserId,
        tag: 'Spammer#0002',
        createdTimestamp: Date.now() - 20 * 86400 * 1000,
      },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'showcase_name') return '  anticheat-ai-studio!  '; // Same normalized title
          if (id === 'showcase_link') return 'https://different-url.com/app';
          if (id === 'showcase_tech') return 'Vue';
          if (id === 'showcase_description') return 'Third description text.';
          return '';
        },
      },
      reply: async (p) => {
        titleDupReply = p;
      },
    };

    await handleShowcaseModalSubmit(duplicateTitleInteraction);
    assert.ok(titleDupReply.content.includes('already been submitted'));
  });

  await t.test('5. Submission Rate Limit: Blocks user submitting more than 1 project in 7 days', async () => {
    let rateReply = null;
    const rapidSecondSubmit = {
      guild: { id: mockGuildId, channels: { cache: new Map() } },
      user: {
        id: authorUserId, // Same author who just submitted
        tag: 'Author#0001',
        createdTimestamp: Date.now() - 30 * 86400 * 1000,
      },
      fields: {
        getTextInputValue: (id) => {
          if (id === 'showcase_name') return 'Brand New Project';
          if (id === 'showcase_link') return 'https://brand-new-project.org';
          if (id === 'showcase_tech') return 'Python';
          if (id === 'showcase_description') return 'Brand new description.';
          return '';
        },
      },
      reply: async (p) => {
        rateReply = p;
      },
    };

    await handleShowcaseModalSubmit(rapidSecondSubmit);
    assert.ok(rateReply.content.includes('1 project every 7 days'));
    assert.strictEqual(rateReply.ephemeral, true);
  });

  await t.test('6. Self-Vote Guard: Author cannot upvote their own project', async () => {
    let voteReply = null;
    await handleShowcaseUpvoteButton({
      customId: `showcase_upvote_${createdProjectId}`,
      user: {
        id: authorUserId, // Same as project creator
        tag: 'Author#0001',
        createdTimestamp: Date.now() - 30 * 86400 * 1000,
      },
      reply: async (p) => {
        voteReply = p;
      },
    });

    assert.ok(voteReply.content.includes('cannot vote for your own project'));
    assert.strictEqual(voteReply.ephemeral, true);
  });

  let publicMessage = null;

  await t.test('7. Curation 1-5⭐ Pipeline: Restricted to Rounit/Admin, awards Score*50 VP, reveals Video Flag', async () => {
    // Unauthorized attempt
    let unauthReply = null;
    await handleShowcaseReviewButton({
      customId: `showcase_rate_4_${createdProjectId}`,
      user: { id: 'random_user_999' },
      memberPermissions: { has: () => false },
      reply: async (p) => {
        unauthReply = p;
      },
    });
    assert.ok(unauthReply.content.includes('Manage Server or Administrator'));

    // Authorized rating by Rounit / Admin: 4 ⭐ rating
    let updatePayload = null;
    const mockBuildsChannel = {
      id: 'chan_builds_pub',
      name: 'community-builds',
      isTextBased: () => true,
      send: async (p) => {
        publicMessage = {
          id: 'pub_msg_555',
          embeds: p.embeds,
          components: p.components,
          edit: async () => {},
        };
        return publicMessage;
      },
    };

    const rateInteraction = {
      customId: `showcase_rate_4_${createdProjectId}`,
      user: { id: rounitId, tag: 'Rounit#0001' },
      memberPermissions: { has: () => true },
      guild: {
        id: mockGuildId,
        channels: { cache: new Map([['chan_builds_pub', mockBuildsChannel]]) },
        roles: { cache: new Map() },
        members: { fetch: async () => null },
      },
      client: {
        users: { fetch: async () => null },
      },
      message: {
        embeds: [{ data: { title: 'Review Embed' } }],
      },
      update: async (p) => {
        updatePayload = p;
      },
    };

    await handleShowcaseReviewButton(rateInteraction);

    // Verify DB updated with score 4
    const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(createdProjectId);
    assert.strictEqual(proj.status, 'APPROVED');
    assert.strictEqual(proj.rounitScore, 4);

    // Author awarded 4 * 50 = 200 VibePoints
    const userRow = db.prepare('SELECT vibePoints, weeklyPoints FROM users WHERE userId = ?').get(authorUserId);
    assert.strictEqual(userRow.vibePoints, 200);
    assert.strictEqual(userRow.weeklyPoints, 200);

    // Review message updated and reveals "Flag for Video" button since score >= 4
    assert.ok(updatePayload);
    const actionRows = updatePayload.components;
    assert.strictEqual(actionRows.length, 2); // Disabled row + Video flag row
    const videoButton = actionRows[1].components[0].data;
    assert.strictEqual(videoButton.custom_id, `showcase_flag_video_${createdProjectId}`);
    assert.strictEqual(videoButton.label, '⭐ Flag for Video');

    // Public showcase card has 3 buttons: Link, Upvote, Feedback
    assert.ok(publicMessage);
    const cardButtons = publicMessage.components[0].components;
    assert.strictEqual(cardButtons.length, 3);
    assert.strictEqual(cardButtons[0].data.style, ButtonStyle.Link);
    assert.strictEqual(cardButtons[1].data.custom_id, `showcase_upvote_${createdProjectId}`);
    assert.strictEqual(cardButtons[2].data.custom_id, `showcase_feedback_${createdProjectId}`);
  });

  await t.test('8. Video Flagging: Dispatches metadata to #staff-logs', async () => {
    let logsMessage = null;
    const mockLogsChannel = {
      id: 'logs_chan',
      name: 'staff-logs',
      isTextBased: () => true,
      send: async (p) => {
        logsMessage = p;
      },
    };

    const flagInteraction = {
      customId: `showcase_flag_video_${createdProjectId}`,
      user: { id: rounitId, tag: 'Rounit#0001' },
      memberPermissions: { has: () => true },
      guild: {
        channels: { cache: new Map([['logs_chan', mockLogsChannel]]) },
      },
      message: {
        components: [
          {
            components: [
              { customId: `showcase_flag_video_${createdProjectId}`, label: '⭐ Flag for Video', style: ButtonStyle.Primary },
            ],
          },
        ],
      },
      update: async () => {},
      reply: async () => {},
    };

    await handleShowcaseFlagButton(flagInteraction);

    assert.ok(logsMessage);
    const embed = logsMessage.embeds[0].toJSON();
    assert.ok(embed.title.includes('Video Feature Candidate'));
    assert.ok(embed.fields.some((f) => f.name === 'Curation Score' && f.value.includes('4/5')));
  });

  await t.test('9. Feedback Bounties: User submits feedback and author marks as helpful (+25 VP, max 3)', async () => {
    // Reviewer submits constructive feedback via modal
    let feedbackReply = null;
    let authorDmMessage = null;

    const mockAuthorUser = {
      id: authorUserId,
      send: async (p) => {
        authorDmMessage = p;
      },
    };

    const feedbackInteraction = {
      customId: `feedback_modal_${createdProjectId}`,
      user: {
        id: reviewerUserId,
        tag: 'Reviewer#0001',
        createdTimestamp: Date.now() - 20 * 86400 * 1000,
      },
      fields: {
        getTextInputValue: (id) =>
          id === 'feedback_text'
            ? 'Great AI agent architecture! One bug: handle offline reconnects in SQLite pool.'
            : '',
      },
      client: {
        users: { fetch: async (id) => (id === authorUserId ? mockAuthorUser : null) },
      },
      reply: async (p) => {
        feedbackReply = p;
      },
    };

    await handleFeedbackModalSubmit(feedbackInteraction);
    assert.ok(feedbackReply.content.includes('feedback has been sent'));

    // Verify bounty saved in DB
    const bounty = db
      .prepare('SELECT * FROM bounties WHERE projectId = ? AND reviewerId = ?')
      .get(createdProjectId, reviewerUserId);
    assert.ok(bounty);
    assert.strictEqual(bounty.status, 'PENDING');

    // Verify author received DM with "Mark as Helpful" button
    assert.ok(authorDmMessage);
    const helpfulButton = authorDmMessage.components[0].components[0].data;
    assert.strictEqual(helpfulButton.custom_id, `bounty_helpful_${bounty.id}`);

    // Author clicks "Mark as Helpful"
    let helpfulReply = null;
    let authorDmUpdated = false;

    await handleBountyHelpfulButton({
      customId: `bounty_helpful_${bounty.id}`,
      user: { id: authorUserId }, // Author
      client: { users: { fetch: async () => null } },
      update: async () => {
        authorDmUpdated = true;
      },
      reply: async (p) => {
        helpfulReply = p;
      },
    });

    assert.ok(authorDmUpdated || helpfulReply);

    // Verify reviewer awarded +25 VibePoints
    const revRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(reviewerUserId);
    assert.strictEqual(revRow.vibePoints, 25);

    // Verify bountiesClaimed incremented
    const updatedProj = db.prepare('SELECT bountiesClaimed FROM projects WHERE id = ?').get(createdProjectId);
    assert.strictEqual(updatedProj.bountiesClaimed, 1);

    // Verify second attempt on same bounty is rejected
    let secondHelpfulReply = null;
    await handleBountyHelpfulButton({
      customId: `bounty_helpful_${bounty.id}`,
      user: { id: authorUserId },
      client: { users: { fetch: async () => null } },
      update: async () => {},
      reply: async (p) => {
        secondHelpfulReply = p;
      },
    });
    assert.ok(secondHelpfulReply.content.includes('already been marked as helpful'));
  });

  await t.test('10. AI Model Tier List: /rate-model deduplicates, updates average, awards +5 VP', async () => {
    // Seed model check
    const model = db.prepare("SELECT * FROM ai_models WHERE name = 'Claude 3.5 Sonnet'").get();
    assert.ok(model);

    let rateReply = null;
    const rateInteraction = {
      user: {
        id: reviewerUserId,
        tag: 'Reviewer#0001',
        createdTimestamp: Date.now() - 20 * 86400 * 1000,
      },
      options: {
        getString: (name) => {
          if (name === 'model') return 'Claude 3.5 Sonnet';
          if (name === 'comment') return 'Best code generation and reasoning!';
          return null;
        },
        getInteger: (name) => (name === 'score' ? 5 : null),
      },
      reply: async (p) => {
        rateReply = p;
      },
    };

    await rateModelCommand.execute(rateInteraction);

    assert.ok(rateReply.embeds);
    const embed = rateReply.embeds[0].toJSON();
    assert.strictEqual(embed.title, '🤖 AI Model Rating Recorded!');

    // Check DB updated
    const updatedModel = db.prepare("SELECT * FROM ai_models WHERE name = 'Claude 3.5 Sonnet'").get();
    assert.strictEqual(updatedModel.averageRating, 5.0);
    assert.strictEqual(updatedModel.totalVotes, 1);

    // Check +5 VibePoints awarded to reviewer (25 from bounty + 5 = 30)
    const reviewerRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(reviewerUserId);
    assert.strictEqual(reviewerRow.vibePoints, 30);

    // Duplicate rating attempt on same model by same user: blocked
    let dupRateReply = null;
    await rateModelCommand.execute({
      ...rateInteraction,
      reply: async (p) => {
        dupRateReply = p;
      },
    });

    assert.ok(dupRateReply.content.includes('already rated'));
    assert.strictEqual(dupRateReply.ephemeral, true);
  });

  await t.test('11. AI Leaderboard: /ai-leaderboard renders model rankings', async () => {
    let lbReply = null;
    await aiLeaderboardCommand.execute({
      reply: async (p) => {
        lbReply = p;
      },
    });

    assert.ok(lbReply.embeds);
    const embed = lbReply.embeds[0].toJSON();
    assert.strictEqual(embed.title, '🤖 AI Coding & LLM Model Tier List');
    assert.ok(embed.description.includes('Claude 3.5 Sonnet'));
    assert.ok(embed.description.includes('5.00'));
  });

  cleanup();
});
