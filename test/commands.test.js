const test = require('node:test');
const assert = require('node:assert');
const commandsCommand = require('../commands/utility/commands');

test('Slash Command: /commands Suite', async (t) => {
  await t.test('1. Default execution: Renders complete directory and select menu', async () => {
    let replyPayload = null;
    const mockInteraction = {
      user: { tag: 'Tester#0001', id: 'usr_test_123' },
      options: {
        getString: () => null,
      },
      reply: async (payload) => {
        replyPayload = payload;
        return {
          createMessageComponentCollector: () => ({
            on: () => {},
          }),
        };
      },
    };

    await commandsCommand.execute(mockInteraction);

    assert.ok(replyPayload);
    assert.ok(replyPayload.embeds);
    assert.strictEqual(replyPayload.embeds.length, 1);

    const embed = replyPayload.embeds[0].toJSON();
    assert.strictEqual(embed.title, '📚 Bot Commands & Features Directory');
    assert.ok(embed.description.includes('DHAKAN'));

    // Check presence of key command listings
    const fieldNames = embed.fields.map((f) => f.name);
    assert.ok(fieldNames.some((f) => f.includes('Showcase')));
    assert.ok(fieldNames.some((f) => f.includes('Economy')));
    assert.ok(fieldNames.some((f) => f.includes('Staff')));
    assert.ok(fieldNames.some((f) => f.includes('Admin')));
    assert.ok(fieldNames.some((f) => f.includes('Utility')));

    // Check select menu component
    assert.ok(replyPayload.components);
    const row = replyPayload.components[0].toJSON();
    assert.strictEqual(row.components[0].custom_id, 'commands_select_category');
    assert.strictEqual(row.components[0].options.length, 6);
  });

  await t.test('2. Filter: showcase category returns in-depth specs', async () => {
    const embed = commandsCommand.buildCategoryEmbed('showcase', 'Tester#0001').toJSON();
    assert.ok(embed.title.includes('Project Showcase'));
    assert.ok(embed.fields.some((f) => f.name.includes('/showcase')));
    assert.ok(embed.fields.some((f) => f.name.includes('/leaderboard projects')));
    assert.ok(embed.fields.some((f) => f.name.includes('Upvote & Unvote')));
    assert.ok(embed.fields.some((f) => f.name.includes('Tier Roles')));
  });

  await t.test('3. Filter: economy category returns in-depth specs', async () => {
    const embed = commandsCommand.buildCategoryEmbed('economy', 'Tester#0001').toJSON();
    assert.ok(embed.title.includes('Builder XP, Ship Streaks'));
    assert.ok(embed.fields.some((f) => f.name.includes('/daily-streak')));
    assert.ok(embed.fields.some((f) => f.name.includes('/leaderboard builders')));
    assert.ok(embed.fields.some((f) => f.name.includes('/balance')));
    assert.ok(embed.fields.some((f) => f.name.includes('/daily')));
  });

  await t.test('4. Filter: staff category returns in-depth specs', async () => {
    const embed = commandsCommand.buildCategoryEmbed('staff', 'Tester#0001').toJSON();
    assert.ok(embed.title.includes('Staff Management'));
    assert.ok(embed.fields.some((f) => f.name.includes('/loa')));
  });

  await t.test('5. Filter: admin category returns in-depth specs', async () => {
    const embed = commandsCommand.buildCategoryEmbed('admin', 'Tester#0001').toJSON();
    assert.ok(embed.title.includes('Admin & Setup Panels'));
    assert.ok(embed.fields.some((f) => f.name.includes('/rules-setup')));
    assert.ok(embed.fields.some((f) => f.name.includes('/showcase-setup')));
    assert.ok(embed.fields.some((f) => f.name.includes('/ticket-setup')));
    assert.ok(embed.fields.some((f) => f.name.includes('/partner-setup')));
  });

  await t.test('6. Filter: utility category returns in-depth specs', async () => {
    const embed = commandsCommand.buildCategoryEmbed('utility', 'Tester#0001').toJSON();
    assert.ok(embed.title.includes('Utility & System'));
    assert.ok(embed.fields.some((f) => f.name.includes('/ping')));
    assert.ok(embed.fields.some((f) => f.name.includes('/commands')));
    assert.ok(embed.fields.some((f) => f.name.includes('Welcome Voice')));
    assert.ok(embed.fields.some((f) => f.name.includes('YouTube')));
  });
});
