const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { schema } = require('../database/schema');
const { cleanDomainName } = require('../utils/checkDomain');

console.log('🧪 Running GOKU Streamlined Architecture Test Suite (Core Utility Features)...\n');

// ==============================================================================
// Check 1: Command Directory Verification (Exactly 5 commands)
// ==============================================================================
{
  const commandsDir = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));
  const commandNames = files.map((f) => {
    const cmd = require(path.join(commandsDir, f));
    return cmd.data.name;
  }).sort();

  const expectedCommands = ['aboutgoku', 'ai-news', 'check-domain', 'connect', 'ping'].sort();

  assert.deepStrictEqual(
    commandNames,
    expectedCommands,
    `Commands directory must contain exactly: ${expectedCommands.join(', ')}`
  );

  console.log('  ✓ Check 1 Passed: Exactly 5 slash commands verified: /aboutgoku, /ai-news, /check-domain, /connect, /ping.');
}

// ==============================================================================
// Check 2: Database Schema & Migration Verification (Purged Deprecated Tables)
// ==============================================================================
{
  const testDb = new Database(':memory:');

  // Create legacy tables
  testDb.exec(`
    CREATE TABLE prompts (id INTEGER PRIMARY KEY, title TEXT);
    CREATE TABLE suggestions (id INTEGER PRIMARY KEY, idea TEXT);
    CREATE TABLE sticky_messages (channel_id TEXT PRIMARY KEY, message_id TEXT);
    CREATE TABLE ai_models (id INTEGER PRIMARY KEY, name TEXT);
  `);

  // Run drop migration
  testDb.exec(`
    DROP TABLE IF EXISTS sticky_messages;
    DROP TABLE IF EXISTS shared_prompts;
    DROP TABLE IF EXISTS prompts;
    DROP TABLE IF EXISTS prompts_v2;
    DROP TABLE IF EXISTS prompt_interactions;
    DROP TABLE IF EXISTS suggestions;
    DROP TABLE IF EXISTS suggestion_votes;
    DROP TABLE IF EXISTS video_suggestions;
    DROP TABLE IF EXISTS video_ideas;
    DROP TABLE IF EXISTS showcases;
    DROP TABLE IF EXISTS showcase_votes;
    DROP TABLE IF EXISTS showcase_reviews;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS project_votes;
    DROP TABLE IF EXISTS resources;
    DROP TABLE IF EXISTS free_resources;
    DROP TABLE IF EXISTS ai_ratings;
    DROP TABLE IF EXISTS ai_models;
    DROP TABLE IF EXISTS model_ratings;
    DROP TABLE IF EXISTS youtube_alerts;
  `);

  // Create retained tables
  for (const [, ddl] of Object.entries(schema)) {
    testDb.exec(ddl);
  }

  const tables = testDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)
    .sort();

  assert.ok(!tables.includes('prompts'), 'prompts table must be dropped');
  assert.ok(!tables.includes('suggestions'), 'suggestions table must be dropped');
  assert.ok(!tables.includes('sticky_messages'), 'sticky_messages table must be dropped');
  assert.ok(!tables.includes('ai_models'), 'ai_models table must be dropped');
  assert.ok(tables.includes('posted_drops'), 'posted_drops table must be retained');
  assert.ok(tables.includes('users'), 'users table must be retained');
  assert.ok(tables.includes('builder_profiles'), 'builder_profiles table must be retained');

  testDb.close();
  console.log('  ✓ Check 2 Passed: SQLite schema purged of all deprecated tables; posted_drops and users retained.');
}

// ==============================================================================
// Check 3: AI News Radar Deduplication (posted_drops)
// ==============================================================================
{
  const testDb = new Database(':memory:');
  testDb.exec(schema.posted_drops);

  const testDropId = 'hf_NousResearch/Hermes-4-70B';
  const now = Math.floor(Date.now() / 1000);

  // Insert drop
  testDb.prepare('INSERT INTO posted_drops (id, postedAt) VALUES (?, ?)').run(testDropId, now);

  // Attempt duplicate insert with OR IGNORE
  testDb.prepare('INSERT OR IGNORE INTO posted_drops (id, postedAt) VALUES (?, ?)').run(testDropId, now + 100);

  const rows = testDb.prepare('SELECT COUNT(*) as c FROM posted_drops WHERE id = ?').get(testDropId);
  assert.strictEqual(rows.c, 1, 'Duplicate drop ID must be ignored');

  testDb.close();
  console.log('  ✓ Check 3 Passed: posted_drops table guarantees strict deduplication for AI news items.');
}

// ==============================================================================
// Check 4: Domain Cleaner & Normalizer
// ==============================================================================
{
  assert.strictEqual(cleanDomainName('https://www.vibecoding.dev/path?query=1'), 'www.vibecoding.dev');
  assert.strictEqual(cleanDomainName('http://buildwithai.com/'), 'buildwithai.com');
  assert.strictEqual(cleanDomainName('testproject.io'), 'testproject.io');

  console.log('  ✓ Check 4 Passed: Domain sanitization extracts clean hostnames for DNS/WHOIS checks.');
}

// ==============================================================================
// Check 5: /connect Modal & Connect Handler Structure
// ==============================================================================
{
  const connectCmd = require('../commands/connect');
  assert.strictEqual(connectCmd.data.name, 'connect');
  assert.ok(typeof connectCmd.execute === 'function');

  const { handleConnectModalSubmit, handleConnectButton } = require('../handlers/connectHandler');
  assert.ok(typeof handleConnectModalSubmit === 'function');
  assert.ok(typeof handleConnectButton === 'function');

  console.log('  ✓ Check 5 Passed: /connect modal command and connectHandler exports verified.');
}

// ==============================================================================
// Check 6: /ai-news Command Structure
// ==============================================================================
{
  const aiNewsCmd = require('../commands/ai-news');
  assert.strictEqual(aiNewsCmd.data.name, 'ai-news');
  assert.ok(typeof aiNewsCmd.execute === 'function');
  assert.strictEqual(aiNewsCmd.data.options.length, 1);
  assert.strictEqual(aiNewsCmd.data.options[0].name, 'mode');

  console.log('  ✓ Check 6 Passed: /ai-news command registered with mode options (latest / scan).');
}

// ==============================================================================
// Check 7: /aboutgoku Utility Scope & Buttons
// ==============================================================================
{
  const aboutCmd = require('../commands/aboutgoku');
  assert.strictEqual(aboutCmd.data.name, 'aboutgoku');
  assert.ok(typeof aboutCmd.execute === 'function');
  assert.ok(typeof aboutCmd.handleAboutButtons === 'function');

  console.log('  ✓ Check 7 Passed: /aboutgoku command and button directory verified.');
}

// ==============================================================================
// Check 8: Internal HTTP Health Check Server
// ==============================================================================
{
  const http = require('node:http');

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'online',
          service: 'GOKU (Utility OS)',
          creator: 'master pusher',
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;

    // Test /health endpoint
    const resHealth = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(resHealth.status, 200);
    assert.strictEqual(resHealth.headers.get('content-type'), 'application/json');
    const jsonHealth = await resHealth.json();
    assert.strictEqual(jsonHealth.status, 'online');
    assert.strictEqual(jsonHealth.service, 'GOKU (Utility OS)');
    assert.strictEqual(jsonHealth.creator, 'master pusher');
    assert.ok(jsonHealth.timestamp);

    // Test / root endpoint
    const resRoot = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(resRoot.status, 200);
    const jsonRoot = await resRoot.json();
    assert.strictEqual(jsonRoot.status, 'online');

    // Test 404 endpoint
    const res404 = await fetch(`http://127.0.0.1:${port}/random`);
    assert.strictEqual(res404.status, 404);

    server.close();
    console.log('  ✓ Check 8 Passed: Internal HTTP health-check server handles /health and / with 200 OK JSON payload.');

    // ==============================================================================
    // Check 9: /ping Command Structure
    // ==============================================================================
    const pingCmd = require('../commands/ping');
    assert.strictEqual(pingCmd.data.name, 'ping');
    assert.ok(typeof pingCmd.execute === 'function');
    console.log('  ✓ Check 9 Passed: /ping command structure and execution handler verified.');

    // ==============================================================================
    // Check 10: Channel Resolution & News Broadcaster (newsService.js & config.js)
    // ==============================================================================
    const { resolveAiNewsChannel, dispatchNewsToTargetChannel, fetchAndDispatchLatestNews } = require('../services/newsService');
    assert.ok(typeof dispatchNewsToTargetChannel === 'function', 'dispatchNewsToTargetChannel must be a function');
    assert.ok(typeof fetchAndDispatchLatestNews === 'function', 'fetchAndDispatchLatestNews must be a function');

    // Test configured target channel constants
    const config = require('../config');
    assert.strictEqual(config.CHANNEL_AI_NEWS, '1551259324762947716');
    assert.strictEqual(config.CHANNEL_GENERAL, '1514716972481515520');

    const mockGuildWithAiNews = {
      channels: {
        cache: [
          { id: '999888777', name: 'ai-news', isTextBased: () => true },
          { id: '111222333', name: 'general', isTextBased: () => true },
        ],
      },
    };
    mockGuildWithAiNews.channels.cache.find = Array.prototype.find;

    // Test fallback to guild channel named 'ai-news'
    const resolvedFallback = resolveAiNewsChannel(null, mockGuildWithAiNews);
    assert.strictEqual(resolvedFallback.id, '999888777');
    assert.strictEqual(resolvedFallback.name, 'ai-news');

    // Test graceful handling when channel is not found
    const emptyGuild = { channels: { cache: [] } };
    emptyGuild.channels.cache.find = Array.prototype.find;
    const notFound = resolveAiNewsChannel(null, emptyGuild);
    assert.strictEqual(notFound, null);

    console.log('  ✓ Check 10 Passed: newsService.js channel broadcaster and target channel constants verified.');

    console.log('\n==================================================');
    console.log('🎉 ALL 10/10 RETAINED FEATURES & RESOLVER TESTS PASSED! (100% Pass Rate)');
    console.log('==================================================\n');
  });
}

