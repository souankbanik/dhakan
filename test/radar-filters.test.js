/**
 * Automated Verification Suite for DHAKAN Full-Spectrum AI Radar
 * Run with: node test/radar-filters.test.js
 */

const assert = require('node:assert');
const Database = require('better-sqlite3');
const { schema } = require('../database/schema');
const {
  RADAR_CATEGORIES,
  HN_AI_KEYWORDS,
  fetchHFTrending,
  fetchRedditChatter,
  fetchOfficialLabFeeds,
  fetchHackerNewsAI,
  fetchArXivAI,
  isDropPosted,
  recordDrop,
} = require('../services/radarService');

console.log('🧪 Running DHAKAN Full-Spectrum AI Radar Verification Suite...\n');

let passedTests = 0;
const totalTests = 7;

// ==============================================================================
// Check 1: Category Tags & Exact Color Hex Codes
// ==============================================================================
try {
  assert.strictEqual(RADAR_CATEGORIES.FRONTIER_DROP.tag, '[🚨 FRONTIER DROP]');
  assert.strictEqual(RADAR_CATEGORIES.FRONTIER_DROP.color, 0xed4245);

  assert.strictEqual(RADAR_CATEGORIES.WEIGHTS.tag, '[📦 WEIGHTS]');
  assert.strictEqual(RADAR_CATEGORIES.WEIGHTS.color, 0x57f287);

  assert.strictEqual(RADAR_CATEGORIES.LEAK_CHATTER.tag, '[👀 LEAK / CHATTER]');
  assert.strictEqual(RADAR_CATEGORIES.LEAK_CHATTER.color, 0x9b59b6);

  assert.strictEqual(RADAR_CATEGORIES.RESEARCH_PAPER.tag, '[📄 RESEARCH BREAKTHROUGH]');
  assert.strictEqual(RADAR_CATEGORIES.RESEARCH_PAPER.color, 0x3498db);

  assert.strictEqual(RADAR_CATEGORIES.INDUSTRY_INTEL.tag, '[📰 INDUSTRY INTEL]');
  assert.strictEqual(RADAR_CATEGORIES.INDUSTRY_INTEL.color, 0xe67e22);

  passedTests++;
  console.log('  ✓ Check 1 Passed: All 5 category tags and exact color codes match specifications.');
} catch (err) {
  console.error('  ✗ Check 1 Failed:', err.message);
  process.exit(1);
}

// ==============================================================================
// Check 2: Hugging Face Trending (No Org Whitelist, Likes >= 10)
// ==============================================================================
(async () => {
  try {
    const mockHF = [
      // 1. Independent developer with >= 10 likes -> PASS (no org whitelist!)
      { repoData: { id: 'indie-developer/grok-4.7-quant', likes: 15, pipeline_tag: 'text-generation' } },
      // 2. Large lab with high likes -> PASS
      { repoData: { id: 'deepseek-ai/DeepSeek-V3', likes: 620, pipeline_tag: 'text-generation' } },
      // 3. Test repo with < 10 likes -> REJECT (noise filter)
      { repoData: { id: 'test-user/my-empty-model', likes: 3, pipeline_tag: 'text-generation' } },
    ];

    const drops = await fetchHFTrending(mockHF);
    assert.strictEqual(drops.length, 2, 'Expected 2 drops to pass likes >= 10 filter');
    assert.strictEqual(drops[0].id, 'hf_indie-developer/grok-4.7-quant');
    assert.strictEqual(drops[0].type, '[📦 WEIGHTS]');
    assert.strictEqual(drops[0].color, 0x57f287);

    passedTests++;
    console.log('  ✓ Check 2 Passed: Hugging Face accepts any organization with likes >= 10.');
  } catch (err) {
    console.error('  ✗ Check 2 Failed:', err.message);
    process.exit(1);
  }

  // ==============================================================================
  // Check 3: Reddit Chatter & Leaks (Allows rumors, leaks, score >= 25)
  // ==============================================================================
  try {
    const mockReddit = [
      // 1. Leak/Rumor title with score >= 25 -> PASS (Anti-speculation regex removed!)
      {
        data: {
          id: 'leak_01',
          title: 'Leak? Rumor has it Grok 4.7 is dropping next Tuesday with multi-modal reasoning',
          score: 85,
          subreddit: 'singularity',
          url: 'https://reddit.com/r/singularity/comments/leak_01',
        },
      },
      // 2. Discussion post with score >= 25 -> PASS
      {
        data: {
          id: 'disc_02',
          title: 'Thoughts on the new Claude 3.7 hybrid architecture?',
          score: 110,
          subreddit: 'OpenAI',
          url: 'https://reddit.com/r/OpenAI/comments/disc_02',
        },
      },
      // 3. Low score < 25 -> REJECT
      {
        data: {
          id: 'low_03',
          title: 'Check out my fine-tune',
          score: 12,
          subreddit: 'LocalLLaMA',
        },
      },
    ];

    const drops = await fetchRedditChatter(mockReddit);
    assert.strictEqual(drops.length, 2, 'Expected 2 Reddit chatter items to pass');
    assert.strictEqual(drops[0].type, '[👀 LEAK / CHATTER]');
    assert.strictEqual(drops[0].color, 0x9b59b6);
    assert.ok(drops[0].title.includes('Grok 4.7'));

    passedTests++;
    console.log('  ✓ Check 3 Passed: Reddit pipeline allows leaks, rumors, and discussions with score >= 25.');
  } catch (err) {
    console.error('  ✗ Check 3 Failed:', err.message);
    process.exit(1);
  }

  // ==============================================================================
  // Check 4: Official Frontier Lab Feeds
  // ==============================================================================
  try {
    const mockOfficialFeeds = [
      {
        name: 'OpenAI',
        items: [
          {
            title: 'Introducing GPT-5 Frontier Intelligence',
            link: 'https://openai.com/news/gpt-5',
            contentSnippet: 'Full multimodal frontier reasoning capabilities.',
          },
        ],
      },
      {
        name: 'Google DeepMind',
        items: [
          {
            title: 'Gemini 3.5 Pro Technical Report',
            link: 'https://deepmind.google/blog/gemini-3-5',
            contentSnippet: 'DeepMind breakthrough in autonomous mathematical problem solving.',
          },
        ],
      },
    ];

    const drops = await fetchOfficialLabFeeds(mockOfficialFeeds);
    assert.strictEqual(drops.length, 2, 'Expected 2 official lab drops');
    assert.strictEqual(drops[0].type, '[🚨 FRONTIER DROP]');
    assert.strictEqual(drops[0].color, 0xed4245);
    assert.ok(drops[0].title.includes('OpenAI:'));

    passedTests++;
    console.log('  ✓ Check 4 Passed: Official frontier lab RSS feeds parsed and tagged [🚨 FRONTIER DROP].');
  } catch (err) {
    console.error('  ✗ Check 4 Failed:', err.message);
    process.exit(1);
  }

  // ==============================================================================
  // Check 5: Hacker News AI Filter (AI Keywords & Score >= 50)
  // ==============================================================================
  try {
    const mockHN = [
      // 1. Matches keyword "Cursor" and score >= 50 -> PASS
      { id: 101, title: 'Show HN: Cursor Agent for Automated Code Review', score: 120, url: 'https://example.com/cursor' },
      // 2. Matches keyword "Grok" and score >= 50 -> PASS
      { id: 102, title: 'xAI announces Grok API updates for enterprise', score: 75, url: 'https://example.com/grok' },
      // 3. Score >= 50 but NO AI keywords -> REJECT
      { id: 103, title: 'PostgreSQL 17 released with faster queries', score: 200, url: 'https://example.com/pg' },
      // 4. Matches AI keyword but score < 50 -> REJECT
      { id: 104, title: 'Small LLM utility in Python', score: 18, url: 'https://example.com/llm' },
    ];

    const drops = await fetchHackerNewsAI(mockHN);
    assert.strictEqual(drops.length, 2, 'Expected 2 Hacker News AI stories to pass');
    assert.strictEqual(drops[0].id, 'hn_101');
    assert.strictEqual(drops[0].type, '[📰 INDUSTRY INTEL]');
    assert.strictEqual(drops[0].color, 0xe67e22);

    passedTests++;
    console.log('  ✓ Check 5 Passed: Hacker News AI filter requires AI keywords and score >= 50.');
  } catch (err) {
    console.error('  ✗ Check 5 Failed:', err.message);
    process.exit(1);
  }

  // ==============================================================================
  // Check 6: arXiv AI Preprints Parser & Tagging
  // ==============================================================================
  try {
    const mockArXiv = [
      {
        id: 'arxiv_2501_001',
        title: 'Deep Multi-Agent Reasoning via Latent Tree Search',
        link: 'http://arxiv.org/abs/2501.001',
        summary: 'We introduce a novel paradigm for frontier LLM reasoning.',
      },
    ];

    const drops = await fetchArXivAI(mockArXiv);
    assert.strictEqual(drops.length, 1, 'Expected 1 arXiv drop');
    assert.strictEqual(drops[0].type, '[📄 RESEARCH BREAKTHROUGH]');
    assert.strictEqual(drops[0].color, 0x3498db);

    passedTests++;
    console.log('  ✓ Check 6 Passed: arXiv AI preprints parsed and tagged [📄 RESEARCH BREAKTHROUGH].');
  } catch (err) {
    console.error('  ✗ Check 6 Failed:', err.message);
    process.exit(1);
  }

  // ==============================================================================
  // Check 7: Tier 3 SQLite Deduplication
  // ==============================================================================
  try {
    const testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    for (const [, ddl] of Object.entries(schema)) {
      testDb.exec(ddl);
    }

    const testDropId = 'rss_openai_gpt5_announcement';

    assert.strictEqual(isDropPosted(testDropId, testDb), false);
    recordDrop(testDropId, testDb);
    assert.strictEqual(isDropPosted(testDropId, testDb), true);

    // Redundant recordDrop call should be safely ignored
    recordDrop(testDropId, testDb);
    const count = testDb.prepare('SELECT COUNT(*) as c FROM posted_drops WHERE id = ?').get(testDropId);
    assert.strictEqual(count.c, 1);

    testDb.close();

    passedTests++;
    console.log('  ✓ Check 7 Passed: SQLite posted_drops deduplication prevents repeat alerts.');
  } catch (err) {
    console.error('  ✗ Check 7 Failed:', err.message);
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! (100% Pass Rate)`);
  console.log(`==================================================\n`);
  process.exit(0);
})();
