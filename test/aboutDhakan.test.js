const test = require('node:test');
const assert = require('node:assert');
const aboutDhakan = require('../commands/utility/aboutDhakan');
const aboutDhakanAlias = require('../commands/utility/aboutDhakanAlias');

test('Slash Command: /aboutdhakan and /about-dhakan Suite', async (t) => {
  await t.test('1. Command builder exports correct names and descriptions', () => {
    assert.strictEqual(aboutDhakan.data.name, 'aboutdhakan');
    assert.strictEqual(aboutDhakanAlias.data.name, 'about-dhakan');
    assert.ok(aboutDhakan.data.description.includes('DHAKAN'));
  });

  await t.test('2. buildAboutEmbed returns accurate copy with updated modules and commands', () => {
    const embed = aboutDhakan.buildAboutEmbed().toJSON();
    assert.strictEqual(embed.title, 'About DHAKAN — Community & Builder OS');
    assert.ok(embed.description);

    // Verify markdown headers and dividers
    assert.ok(embed.description.includes('**What is DHAKAN?**'));
    assert.ok(embed.description.includes('**🚀 Builder Showcase & Economy**'));
    assert.ok(embed.description.includes('**🤖 AI Benchmarks & Server Intelligence**'));
    assert.ok(embed.description.includes('**Directory & Modules:**'));

    // Verify key command & module references in description
    assert.ok(embed.description.includes('/showcase'));
    assert.ok(embed.description.includes('#curation-queue'));
    assert.ok(embed.description.includes('/log'));
    assert.ok(embed.description.includes('/profile'));
    assert.ok(embed.description.includes('/leaderboard'));
    assert.ok(embed.description.includes('/rate-model'));
    assert.ok(embed.description.includes('/ai-leaderboard'));
    assert.ok(embed.description.includes('/share-prompt'));
    assert.ok(embed.description.includes('/prompts'));
    assert.ok(embed.description.includes('/collab'));
    assert.ok(embed.description.includes('/tip'));
    assert.ok(embed.description.includes('/calc-tokens'));
    assert.ok(embed.description.includes('/check-domain'));
    assert.ok(embed.description.includes('/docs'));
    assert.ok(embed.description.includes('/ping'));

    // Verify footer
    assert.ok(embed.footer.text.includes('DHAKAN Community Bot • Click below to explore the interactive command directory.'));
  });

  await t.test('3. buildAboutActionRow provides interactive /commands button', () => {
    const row = aboutDhakan.buildAboutActionRow().toJSON();
    assert.strictEqual(row.components.length, 1);
    assert.strictEqual(row.components[0].custom_id, 'about_open_commands');
    assert.ok(row.components[0].label.includes('/commands'));
  });

  await t.test('4. Execution replies with embed and interactive button component', async () => {
    let replyPayload = null;
    const mockInteraction = {
      user: { tag: 'Tester#0001', id: 'usr_test_123' },
      reply: async (payload) => {
        replyPayload = payload;
        return {
          createMessageComponentCollector: () => ({
            on: () => {},
          }),
        };
      },
    };

    await aboutDhakan.execute(mockInteraction);

    assert.ok(replyPayload);
    assert.ok(replyPayload.embeds);
    assert.strictEqual(replyPayload.embeds.length, 1);
    assert.strictEqual(replyPayload.embeds[0].data.title, 'About DHAKAN — Community & Builder OS');
    assert.ok(replyPayload.components);
    assert.strictEqual(replyPayload.components.length, 1);
  });
});
