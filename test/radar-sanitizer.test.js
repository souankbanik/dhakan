/**
 * Automated Verification Suite for GOKU Radar Sanitizer & Spec Extraction Pipeline
 * Run with: node test/radar-sanitizer.test.js
 */

const assert = require('node:assert');
const {
  sanitizeTitle,
  extractSpecs,
  formatRadarTitle,
  formatExecutiveDescription,
  HN_KEYWORD_REGEX,
  fetchHackerNewsAI,
  RADAR_CATEGORIES,
} = require('../services/radarService');

console.log('🧪 Running GOKU Radar Sanitizer & Metadata Extraction Test Suite...\n');

let passedTests = 0;
const totalTests = 5;

// ==============================================================================
// Check 1: Architecture & Spec Extraction Regex (70B, 128K, GGUF, MoE)
// ==============================================================================
try {
  const sampleText1 = 'NousResearch/Hermes-3-Llama-3.1-70B-128K-GGUF';
  const specs1 = extractSpecs(sampleText1);
  assert.ok(specs1.includes('70B'), `Expected 70B in specs, got: ${specs1}`);
  assert.ok(specs1.includes('128K'), `Expected 128K in specs, got: ${specs1}`);
  assert.ok(specs1.includes('GGUF'), `Expected GGUF in specs, got: ${specs1}`);
  assert.strictEqual(specs1, '[70B | 128K | GGUF]');

  const sampleText2 = 'DeepSeek-V3 671B MoE FP8 Checkpoint with 32K context';
  const specs2 = extractSpecs(sampleText2);
  assert.ok(specs2.includes('671B'), `Expected 671B in specs, got: ${specs2}`);
  assert.ok(specs2.includes('MoE'), `Expected MoE in specs, got: ${specs2}`);
  assert.ok(specs2.includes('FP8'), `Expected FP8 in specs, got: ${specs2}`);
  assert.ok(specs2.includes('32K'), `Expected 32K in specs, got: ${specs2}`);

  passedTests++;
  console.log('  ✓ Check 1 Passed: Specs regex accurately extracts Parameter count, Context, MoE, and Quantization.');
} catch (err) {
  console.error('  ✗ Check 1 Failed:', err.message);
  process.exit(1);
}

// ==============================================================================
// Check 2: Title Cleaning & HTML/Bracket Tag Stripping
// ==============================================================================
try {
  // Test stripping Reddit tags like [D], [R], [Release], [News], and raw HTML
  const dirtyTitle1 = '[D] Rumors point to imminent multi-modal Grok 3 training completion &amp; drop';
  const cleaned1 = sanitizeTitle(dirtyTitle1);
  assert.strictEqual(
    cleaned1,
    'Rumors point to imminent multi-modal Grok 3 training completion & drop',
    `Expected cleaned title without [D] and unescaped &, got: "${cleaned1}"`
  );

  const dirtyTitle2 = '[Release] <p>NousResearch/Hermes-3-Llama-3.1-70B</p> &quot;Official&quot;';
  const cleaned2 = sanitizeTitle(dirtyTitle2);
  assert.strictEqual(
    cleaned2,
    'NousResearch/Hermes-3-Llama-3.1-70B "Official"',
    `Expected stripped [Release], stripped <p> tags, and unescaped quotes, got: "${cleaned2}"`
  );

  passedTests++;
  console.log('  ✓ Check 2 Passed: Reddit tags ([D], [Release]) and raw HTML tags/entities are cleanly sanitized.');
} catch (err) {
  console.error('  ✗ Check 2 Failed:', err.message);
  process.exit(1);
}

// ==============================================================================
// Check 3: Title Assembly with Badges and Specs
// ==============================================================================
try {
  const categoryBadge = RADAR_CATEGORIES.WEIGHTS.tag;
  const specs = '[70B | GGUF]';
  const title = 'NousResearch/Hermes-3-Llama-3.1-70B Released';

  const assembled = formatRadarTitle(categoryBadge, specs, title);
  assert.strictEqual(
    assembled,
    '[📦 WEIGHTS] [70B | GGUF] | NousResearch/Hermes-3-Llama-3.1-70B Released',
    `Title assembly mismatch: "${assembled}"`
  );

  // Test when no specs are detected
  const leakBadge = RADAR_CATEGORIES.LEAK_CHATTER.tag;
  const leakTitle = 'Grok 3 imminent multi-modal checkpoint finish';
  const leakAssembled = formatRadarTitle(leakBadge, '', leakTitle);
  assert.strictEqual(
    leakAssembled,
    '[👀 LEAK / CHATTER] | Grok 3 imminent multi-modal checkpoint finish',
    `Title assembly mismatch when no specs: "${leakAssembled}"`
  );

  passedTests++;
  console.log('  ✓ Check 3 Passed: Title assembly formats {Category_Badge} {Extracted_Specs} | {Cleaned_Title}.');
} catch (err) {
  console.error('  ✗ Check 3 Failed:', err.message);
  process.exit(1);
}

// ==============================================================================
// Check 4: Nous Research / Hermes Keyword Ingestion on Hacker News
// ==============================================================================
(async () => {
  try {
    const hermesMatch = HN_KEYWORD_REGEX.test('Nous Research releases Hermes 3 open-weights');
    assert.strictEqual(hermesMatch, true, 'Hermes and Nous must match keyword filter');

    const unrelatedMatch = HN_KEYWORD_REGEX.test('PostgreSQL 17 released with new indexing');
    assert.strictEqual(unrelatedMatch, false, 'Unrelated software should not match keyword filter');

    const mockHN = [
      { id: 201, title: 'Hermes 3: Frontier Open-Weight LLM by Nous Research', score: 140, url: 'https://nousresearch.com/hermes3' },
      { id: 202, title: 'Rust 1.85 released', score: 250, url: 'https://rust-lang.org' },
      { id: 203, title: 'DeepSeek-V3 vs GPT-4o Reasoning Analysis', score: 95, url: 'https://example.com/deepseek' },
      {
        id: 49803863,
        title: 'Claude Opus 5.5',
        score: 73,
        descendants: 42,
        url: 'https://github.com/anthropics/ClaudeForFoundationModels/commit/e62fc06b7470c86ffb088e5d6d376eb1c750e359',
        text: '<a href="https:&#x2F;&#x2F;github.com&#x2F;anthropics&#x2F;ClaudeForFoundationModels&#x2F;commit&#x2F;e62fc06b7470c86ffb088e5d6d376eb1c750e359">https:&#x2F;&#x2F;github.com&#x2F;anthropics&#x2F;ClaudeForFoundationModels&#x2F;comm...</a>',
      },
    ];

    const drops = await fetchHackerNewsAI(mockHN);
    assert.strictEqual(drops.length, 3, 'Expected 3 AI-related drops (Hermes, DeepSeek, Claude Opus 5.5)');
    assert.strictEqual(drops[0].id, 'hn_201');
    assert.ok(drops[0].title.includes('Hermes 3'));
    assert.strictEqual(drops[1].id, 'hn_203');
    assert.strictEqual(drops[2].id, 'hn_49803863');

    // Ensure no unescaped &#x2F; or raw URL quoting in description
    const claudeDesc = drops[2].executiveDescription;
    assert.ok(!claudeDesc.includes('&#x2F;'), 'Must not contain raw &#x2F;');
    assert.ok(!claudeDesc.includes('"https://github.com'), 'Must not quote raw URL as story details');
    assert.ok(claudeDesc.includes('Repository & Codebase Tracking'), 'Must synthesize repository tracking section');

    passedTests++;
    console.log('  ✓ Check 4 Passed: Nous Research, Hermes, and Claude keywords pass filter with clean sanitization.');
  } catch (err) {
    console.error('  ✗ Check 4 Failed:', err.message);
    process.exit(1);
  }

  // ==============================================================================
  // Check 5: Executive Embed Description Formatting (2-line quote + bullets)
  // ==============================================================================
  try {
    const summary = 'Flagship open weights with advanced agentic function calling and system prompt adherence.';
    const sourceLab = 'Nous Research';
    const metrics = '🔥 840 likes';
    const specs = '70B | GGUF';
    const url = 'https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-70B';

    const desc = formatExecutiveDescription(summary, sourceLab, metrics, specs, url);

    assert.ok(desc.startsWith('> '), 'Description must start with a blockquote');
    assert.ok(desc.includes('• 🏛️ Source / Lab: Nous Research'), 'Missing Source/Lab field');
    assert.ok(desc.includes('• 📊 Signal Metrics: 🔥 840 likes'), 'Missing Signal Metrics field');
    assert.ok(desc.includes('• ⚙️ Specs Detected: 70B | GGUF'), 'Missing Specs Detected field');
    assert.ok(desc.includes('• 🔗 Link: [Direct Access / Checkpoint]'), 'Missing direct access link field');

    passedTests++;
    console.log('  ✓ Check 5 Passed: Executive description formats clean 2-line quote and bullet metrics.');
  } catch (err) {
    console.error('  ✗ Check 5 Failed:', err.message);
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! (100% Pass Rate)`);
  console.log(`==================================================\n`);
  process.exit(0);
})();
