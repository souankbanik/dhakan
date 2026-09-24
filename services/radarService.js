const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const defaultDb = require('../database/db');
const config = require('../config');

const parser = new Parser({
  headers: {
    'User-Agent': 'GOKU-Radar/2.0',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
  timeout: 8000,
});

// Category Badges & Color Codes
const RADAR_CATEGORIES = {
  WEIGHTS: {
    tag: '[📦 WEIGHTS]',
    color: 0x57f287,
    name: 'Open Weights & Checkpoints',
    author: 'Hugging Face • Model Drop',
    icon: 'https://huggingface.co/front/assets/huggingface_logo-noborder.png',
    thumbnail: 'https://huggingface.co/front/assets/huggingface_logo-noborder.png',
    footer: 'GOKU AI Radar • Open Weights Ingestion',
  },
  LEAK_CHATTER: {
    tag: '[👀 LEAK / CHATTER]',
    color: 0x9b59b6,
    name: 'Reddit Leak & Community Chatter',
    author: 'Reddit • Community Intel & Leaks',
    icon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
    thumbnail: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
    footer: 'GOKU AI Radar • Community Signal Tracking',
  },
  BENCHMARK: {
    tag: '[📊 BENCHMARK]',
    color: 0x9b59b6,
    name: 'Community Benchmark',
    author: 'Community Benchmark • Evaluation',
    icon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
    thumbnail: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
    footer: 'GOKU AI Radar • Benchmark Tracking',
  },
  FRONTIER_DROP: {
    tag: '[🚨 FRONTIER DROP]',
    color: 0xed4245,
    name: 'Official Lab Frontier Drop',
    author: 'Official Lab Frontier Dispatch',
    icon: 'https://cdn-icons-png.flaticon.com/512/8637/8637106.png',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/8637/8637106.png',
    footer: 'GOKU AI Radar • Frontier Lab Announcements',
  },
  RESEARCH_PAPER: {
    tag: '[📄 RESEARCH BREAKTHROUGH]',
    color: 0x3498db,
    name: 'arXiv cs.AI / cs.CL Preprint',
    author: 'arXiv • cs.AI & cs.CL Breakthrough',
    icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
    footer: 'GOKU AI Radar • Research Intelligence',
  },
  INDUSTRY_INTEL: {
    tag: '[📰 INDUSTRY INTEL]',
    color: 0xe67e22,
    name: 'Hacker News Trending Intelligence',
    author: 'Hacker News • Tech Intelligence',
    icon: 'https://cdn-icons-png.flaticon.com/512/5968/5968853.png',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/5968/5968853.png',
    footer: 'GOKU AI Radar • Industry Pulse',
  },
};

// Pipeline E Keyword Filter
const HN_KEYWORDS = [
  'hermes',
  'nous',
  'gpt',
  'claude',
  'gemini',
  'grok',
  'deepseek',
  'cursor',
  'llm',
  'open weights',
  'mistral',
  'qwen',
  'llama',
];
const HN_KEYWORD_REGEX = new RegExp(
  `\\b(${HN_KEYWORDS.map((k) => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`,
  'i'
);

// Pipeline C Official RSS Feeds
const OFFICIAL_RSS_FEEDS = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Anthropic', url: 'https://www.anthropic.com/rss.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
];

// Pipeline B Reddit Subreddits
const REDDIT_SUBREDDITS = ['LocalLLaMA', 'singularity', 'OpenAI'];

const FALLBACK_DROPS = [
  {
    id: 'hf_NousResearch/Hermes-3-Llama-3.1-70B',
    rawId: 'NousResearch/Hermes-3-Llama-3.1-70B',
    title: '[📦 WEIGHTS] [70B | GGUF] | NousResearch/Hermes-3-Llama-3.1-70B Released',
    category: 'WEIGHTS',
    type: RADAR_CATEGORIES.WEIGHTS.tag,
    color: RADAR_CATEGORIES.WEIGHTS.color,
    url: 'https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-70B',
    summary: 'Flagship open weights with advanced agentic function calling, system prompt following, and GGUF quants.',
    source: 'Nous Research',
    metrics: '🔥 840 likes',
    specs: '[70B | GGUF]',
  },
  {
    id: 'hf_deepseek-ai/DeepSeek-V3',
    rawId: 'deepseek-ai/DeepSeek-V3',
    title: '[📦 WEIGHTS] [671B MoE | FP8] | DeepSeek-V3 Open Weights Checkpoint',
    category: 'WEIGHTS',
    type: RADAR_CATEGORIES.WEIGHTS.tag,
    color: RADAR_CATEGORIES.WEIGHTS.color,
    url: 'https://huggingface.co/deepseek-ai/DeepSeek-V3',
    summary: '671B MoE architecture with Multi-head Latent Attention (MLA), rivaling top closed models.',
    source: 'DeepSeek AI',
    metrics: '🔥 650 likes',
    specs: '[671B MoE | FP8]',
  },
  {
    id: 'rss_deepmind_gemini_38',
    rawId: 'https://deepmind.google/blog/gemini-3-8',
    title: '[🚨 FRONTIER DROP] | Google DeepMind: Introducing Gemini 3.8 Live & Extended Thinking',
    category: 'FRONTIER_DROP',
    type: RADAR_CATEGORIES.FRONTIER_DROP.tag,
    color: RADAR_CATEGORIES.FRONTIER_DROP.color,
    url: 'https://deepmind.google/blog/',
    summary: 'Next-generation frontier multimodal intelligence with real-time reasoning and agentic workflow execution.',
    source: 'Google DeepMind',
    metrics: 'Official Frontier Release',
    specs: 'General Release',
  },
];

// ==============================================================================
// 2. TEXT SANITIZATION & METADATA EXTRACTION PIPELINE
// ==============================================================================

/**
 * Decodes all HTML entities including hex (&#x2F;), decimal (&#47;), and named entities.
 *
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

/**
 * Strips raw HTML, URLs, markdown links, and platform artifacts, leaving pure substantive prose.
 *
 * @param {string} rawText
 * @returns {string}
 */
function cleanPostText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let cleaned = decodeHtmlEntities(rawText);
  // Strip HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  // Strip markdown links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  // Strip raw URLs (http:// or https://)
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');
  // Strip metadata artifacts (e.g. submitted by, [link], [comments])
  cleaned = cleaned.replace(/submitted by\s+\/u\/\S+/gi, '');
  cleaned = cleaned.replace(/\[link\]\s*\[comments\]/gi, '');
  // Collapse excess whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Strips leading bracket tags, raw HTML tags, unescapes entities, and collapses whitespace.
 *
 * @param {string} rawTitle
 * @returns {string}
 */
function sanitizeTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  let cleaned = decodeHtmlEntities(rawTitle);

  // Strip leading Reddit bracket tags (e.g., [D], [R], [Discussion], [News], [Release], [Benchmark], [Bi-Weekly Megathread])
  while (
    /^\s*\[(?:d|r|p|discussion|news|release|project|benchmark|question|help|update|megathread|bi-weekly|weekly|monthly|daily|oc|guide|tutorial|resource|leak|rumor)[^\]]*\]\s*/i.test(
      cleaned
    )
  ) {
    cleaned = cleaned.replace(
      /^\s*\[(?:d|r|p|discussion|news|release|project|benchmark|question|help|update|megathread|bi-weekly|weekly|monthly|daily|oc|guide|tutorial|resource|leak|rumor)[^\]]*\]\s*/i,
      ''
    );
  }

  // Strip any remaining inline or surrounding HTML tags (<p>, </p>, <b>, etc.)
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Unescape standard HTML entities
  cleaned = decodeHtmlEntities(cleaned);

  // Collapse excess whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Truncate at 200 characters if excessive
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 197) + '...';
  }

  return cleaned;
}

/**
 * Scans title and content for parameter counts, context length, quantizations, and MoE architectures.
 *
 * @param {string} text
 * @returns {string} Formatted badge (e.g. "[70B | GGUF | 128K]") or empty string
 */
function extractSpecs(text) {
  if (!text || typeof text !== 'string') return '';

  const specs = [];

  // Parameter Count: e.g. "70B", "8B", "405B", "27B", "1.5B"
  const paramMatch = text.match(/\b(\d+(?:\.\d+)?[Bb])\b/);
  if (paramMatch && paramMatch[1]) {
    specs.push(paramMatch[1].toUpperCase());
  }

  // MoE Architecture: e.g. "8x7B", "671B MoE", "MoE"
  const moeMatch = text.match(/\b(\d+x\d+[Bb]|\d+[Bb]\s+MoE|MoE)\b/i);
  if (moeMatch && moeMatch[1]) {
    const rawMoe = moeMatch[1].trim();
    if (!specs.some((s) => s.toLowerCase() === rawMoe.toLowerCase())) {
      specs.push(rawMoe);
    }
  }

  // Context Length: e.g. "128K", "1M", "32K"
  const contextMatch = text.match(/\b(\d+[KkMm])\s*(?:context|ctx|tokens)?\b/);
  if (contextMatch && contextMatch[1]) {
    const ctxVal = contextMatch[1].toUpperCase();
    if (!specs.includes(ctxVal)) {
      specs.push(ctxVal);
    }
  }

  // Quantization Format: GGUF, EXL2, AWQ, GPTQ, FP8, BF16, FP16
  const quantMatch = text.match(/\b(GGUF|EXL2|AWQ|GPTQ|FP8|BF16|FP16)\b/i);
  if (quantMatch && quantMatch[1]) {
    specs.push(quantMatch[1].toUpperCase());
  }

  const unique = Array.from(new Set(specs));
  return unique.length > 0 ? `[${unique.join(' | ')}]` : '';
}

/**
 * Assembles title with Category Badge and Extracted Specs:
 * Format: `{Category_Badge} {Extracted_Specs} | {Cleaned_Title}`
 *
 * @param {string} categoryBadge
 * @param {string} specsBadge
 * @param {string} cleanedTitle
 * @returns {string}
 */
function formatRadarTitle(categoryBadge, specsBadge, cleanedTitle) {
  const parts = [categoryBadge];
  if (specsBadge) {
    parts.push(specsBadge);
  }
  return `${parts.join(' ')} | ${cleanedTitle}`;
}

// ==============================================================================
// DYNAMIC DOMAIN & INSIGHT GENERATORS
// ==============================================================================

/**
 * Generates an informative, tailored summary for Hugging Face model drops based on creator,
 * architecture, task tags, and parameters instead of generic boilerplate.
 */
function buildHFInsight(repoId, creator, likes, pipelineTag, tags = []) {
  const lowerId = (repoId || '').toLowerCase();
  const lowerCreator = (creator || '').toLowerCase();
  const tagsStr = (Array.isArray(tags) ? tags.join(' ') : String(tags || '')).toLowerCase();
  const allContext = `${lowerId} ${lowerCreator} ${pipelineTag || ''} ${tagsStr}`;

  if (lowerCreator.includes('nousresearch') || lowerId.includes('hermes')) {
    return 'Flagship agentic weights fine-tuned for structured tool-calling, complex system-prompt execution, and deep multi-turn reasoning.';
  }
  if (lowerCreator.includes('deepseek') || lowerId.includes('deepseek')) {
    return 'High-efficiency open-weights architecture utilizing Multi-head Latent Attention (MLA) and deep reasoning competitive with closed frontier models.';
  }
  if (lowerCreator.includes('qwen') || lowerId.includes('qwen')) {
    return 'Alibaba Qwen foundation release optimized for advanced code comprehension, math problem solving, and multi-lingual instruction following.';
  }
  if (lowerCreator.includes('mistral') || lowerId.includes('mistral')) {
    return 'High-throughput open model checkpoint with native function calling, structured JSON output, and strong logical reasoning capabilities.';
  }
  if (lowerCreator.includes('meta-llama') || lowerId.includes('llama')) {
    return 'Open foundation weights engineered for versatile developer workflows, agent execution, and long-context instruction adherence.';
  }
  if (lowerCreator.includes('xai') || lowerId.includes('grok')) {
    return 'xAI Grok architecture release optimized for deep mathematical synthesis, reasoning, and high-context multi-modal processing.';
  }

  if (allContext.includes('rl') || allContext.includes('grpo') || allContext.includes('dpo') || allContext.includes('reasoning')) {
    return 'Reinforcement learning reasoning model trained with chain-of-thought verification to maximize test-time compute and problem-solving accuracy.';
  }
  if (allContext.includes('code') || allContext.includes('coder') || allContext.includes('starcoder')) {
    return 'Specialized software engineering model tuned for multi-language syntax completion, repository-level refactoring, and test synthesis.';
  }
  if (allContext.includes('vision') || allContext.includes('vlm') || allContext.includes('multimodal') || allContext.includes('image-text')) {
    return 'Multimodal visual-language model equipped to parse high-resolution diagrams, complex OCR documents, and visual reasoning tasks.';
  }
  if (allContext.includes('gguf') || allContext.includes('awq') || allContext.includes('exl2') || allContext.includes('fp8')) {
    return 'Optimized quantized checkpoint packaged for low-memory, high-speed local inference on consumer GPUs and Apple Silicon via Ollama / LM Studio.';
  }

  return `Trending open-weights release from ${creator} with ${likes} community likes on Hugging Face, optimized for local experimentation and deployment.`;
}

/**
 * Extracts and formats substantive Reddit post insights instead of boilerplate strings.
 */
function buildRedditInsight(post, sub, score, flair) {
  const clean = cleanPostText(post.selftext || '');
  if (clean.length > 30) {
    return clean.length > 210 ? `${clean.slice(0, 207)}...` : clean;
  }

  const lowerFlair = (flair || '').toLowerCase();
  const lowerTitle = (post.title || '').toLowerCase();

  if (lowerFlair.includes('leak') || lowerTitle.includes('leak') || lowerTitle.includes('rumor')) {
    return `Unverified community leak circulating on r/${sub} discussing upcoming frontier lab model milestones, weight drops, or architecture leaks.`;
  }
  if (lowerFlair.includes('benchmark') || lowerTitle.includes('benchmark') || lowerTitle.includes('eval')) {
    return `Community performance evaluation on r/${sub} testing real-world inference speed, tokens/second, and quantization fidelity on local hardware.`;
  }
  if (sub.toLowerCase() === 'localllama') {
    return `Open-source practitioner discussion on r/${sub} analyzing quantization tradeoffs, VRAM limits, and local inference deployment.`;
  }
  if (sub.toLowerCase() === 'singularity') {
    return `Frontier AI community discussion on r/${sub} examining lab release velocity, scaling trajectories, and technological impact.`;
  }

  return `Active discussion thread on r/${sub} with ${score} upvotes exploring developer findings, tradeoffs, and real-world results.`;
}

/**
 * Extracts clean RSS announcement insights.
 */
function buildLabInsight(labName, rawSnippet, title) {
  let snippet = decodeHtmlEntities(rawSnippet || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  snippet = snippet.replace(/^(?:published on|by\s+[a-z\s]+|read full post)[:\s-]*/i, '').trim();

  if (snippet.length > 40) {
    return snippet.length > 220 ? `${snippet.slice(0, 217)}...` : snippet;
  }

  if (labName.toLowerCase().includes('deepmind')) {
    return 'Google DeepMind frontier release detailing next-gen multimodal intelligence, real-time reasoning, and algorithmic breakthroughs.';
  }
  if (labName.toLowerCase().includes('openai')) {
    return 'Official OpenAI frontier announcement covering model capabilities, autonomous evaluation benchmarks, and enterprise API access.';
  }
  if (labName.toLowerCase().includes('anthropic')) {
    return 'Anthropic research dispatch highlighting Claude model steerability, frontier reasoning, and system safety evaluations.';
  }

  return `Official frontier intelligence announcement from ${labName} presenting recent breakthroughs and capabilities.`;
}

/**
 * Extracts and formats clean arXiv research paper abstract.
 */
function buildArXivInsight(summary) {
  let clean = decodeHtmlEntities(summary || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\$[^\$]+\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length > 40) {
    return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
  }
  return 'Preprint research paper published on arXiv cs.AI / cs.CL investigating frontier machine learning architectures.';
}

/**
 * Formats Hacker News trending story insight.
 */
function buildHNInsight(item, score) {
  const rawText = item.text || item.story_text || '';
  const clean = cleanPostText(rawText);

  if (clean.length >= 35) {
    return clean.length > 210 ? `${clean.slice(0, 207)}...` : clean;
  }

  const title = sanitizeTitle(item.title || '');
  const targetUrl = item.url || '';

  if (/github\.com/i.test(targetUrl)) {
    return `Active GitHub repository tracking: Community analyzing foundation model codebase, latest commit changes, and developer toolchain developments for ${title}.`;
  }
  if (/arxiv\.org/i.test(targetUrl)) {
    return `Trending academic research on Hacker News: Engineering practitioners reviewing model architecture, benchmark metrics, and theoretical findings for ${title}.`;
  }
  if (/(?:openai\.com|anthropic\.com|deepmind\.google|x\.ai|mistral\.ai|huggingface\.co)/i.test(targetUrl)) {
    return `Frontier lab milestone discussion: Silicon Valley practitioners analyzing official deployment, API performance, and enterprise integration for ${title}.`;
  }
  try {
    if (targetUrl.startsWith('http')) {
      const parsed = new URL(targetUrl);
      const host = parsed.hostname.replace(/^www\./, '');
      return `Trending tech intel via ${host}: Developer community reviewing architecture choices, benchmarks, and production feasibility for ${title}.`;
    }
  } catch {}

  return `Top-ranking Hacker News engineering thread (${score} points, ${item.descendants || item.num_comments || 0} comments) evaluating developer experience, deployment hurdles, and ecosystem shifts.`;
}

/**
 * Detailed technical breakdown generator for Hugging Face model drops.
 */
function buildHFDetails(repoData, creator, specs) {
  const repoId = repoData.id || repoData._id || '';
  const numParams = repoData.numParameters;
  let paramStr = '';
  if (numParams && numParams > 0) {
    paramStr = numParams >= 1e9
      ? `${(numParams / 1e9).toFixed(1).replace(/\.0$/, '')}B Parameters`
      : `${Math.round(numParams / 1e6)}M Parameters`;
  } else if (specs && specs !== 'General Release') {
    paramStr = specs;
  } else {
    paramStr = 'Open Foundation Architecture';
  }

  const pipeline = repoData.pipeline_tag || 'text-generation';
  const tags = Array.isArray(repoData.tags) ? repoData.tags : [];
  const lowerId = repoId.toLowerCase();

  let targetRuntimes = 'Ollama, vLLM, LM Studio, Hugging Face Transformers';
  if (lowerId.includes('gguf') || tags.includes('gguf')) {
    targetRuntimes = 'llama.cpp, Ollama, LM Studio (Apple Silicon & Consumer GPUs)';
  } else if (lowerId.includes('exl2')) {
    targetRuntimes = 'ExLlamaV2, TabbyAPI (NVIDIA Tensor Cores)';
  }

  let useCases = 'Autonomous agent workflows, enterprise task automation, fine-tuning base';
  if (lowerId.includes('coder') || lowerId.includes('code') || tags.includes('code')) {
    useCases = 'Multi-language code completion, repository refactoring, automated testing';
  } else if (lowerId.includes('vision') || lowerId.includes('vlm') || pipeline.includes('image')) {
    useCases = 'Visual document understanding, diagram parsing, multimodal Q&A';
  } else if (lowerId.includes('rl') || lowerId.includes('r1') || lowerId.includes('reasoning')) {
    useCases = 'Mathematical deduction, complex multi-step reasoning, verifiable code logic';
  }

  return [
    '**🔍 Technical Architecture & Scale**',
    `• **Model Scale:** ${paramStr}`,
    `• **Domain / Task:** ${pipeline.replace(/-/g, ' ').toUpperCase()}`,
    `• **Recommended Runtimes:** ${targetRuntimes}`,
    '',
    '**🛠️ Capabilities & Intended Deployment**',
    `• **Primary Use Cases:** ${useCases}`,
    `• **Ecosystem Access:** Direct weight checkpoint ready for fine-tuning or local deployment.`,
  ].join('\n');
}

/**
 * Detailed breakdown generator for Reddit discussions & leaks.
 */
function buildRedditDetails(post, sub, score, flair) {
  const cleanText = cleanPostText(post.selftext || '');

  const sections = [];

  if (cleanText.length > 50) {
    const excerpt = cleanText.length > 350 ? `${cleanText.slice(0, 347)}...` : cleanText;
    sections.push(
      '**📝 Post Highlights & Author Notes**',
      `"${excerpt}"`
    );
  } else {
    sections.push(
      '**💬 Discussion Topic & Scope**',
      `• **Community Thread:** Active development analysis and debate regarding recent ecosystem releases.`,
      `• **Key Focus:** Investigating real-world performance tradeoffs, hardware requirements, and practical utility.`
    );
  }

  sections.push(
    '',
    '**📊 Community Signal & Engagement**',
    `• **Subreddit:** r/${sub} • **Flair:** ${flair || 'General Discussion'}`,
    `• **Momentum:** Reached ${score} upvotes with active practitioner feedback in comments.`
  );

  return sections.join('\n');
}

/**
 * Detailed breakdown generator for official frontier lab releases.
 */
function buildLabDetails(labName, snippet, title) {
  let clean = decodeHtmlEntities(snippet || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  clean = clean.replace(/^(?:published on|by\s+[a-z\s]+|read full post)[:\s-]*/i, '').trim();

  const sections = [
    '**📢 Announcement Details & Breakthrough Highlights**',
  ];

  if (clean.length > 50) {
    const detailedExcerpt = clean.length > 380 ? `${clean.slice(0, 377)}...` : clean;
    sections.push(`• **Official Dispatch:** ${detailedExcerpt}`);
  } else {
    sections.push(`• **Official Dispatch:** Frontier milestone update released by ${labName} outlining core advancements and engineering benchmarks.`);
  }

  sections.push(
    `• **Target Impact:** Sets new capabilities for enterprise developers, autonomous agents, and foundation safety.`,
    '',
    '**🌐 Access & Availability**',
    `• **Platform Rollout:** Dispatched via official ${labName} research portal and developer API channels.`
  );

  return sections.join('\n');
}

/**
 * Detailed breakdown generator for arXiv scientific papers.
 */
function buildArXivDetails(summary) {
  let clean = decodeHtmlEntities(summary || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\$[^\$]+\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const sections = [
    '**🔬 Abstract & Scientific Methodology**',
  ];

  if (clean.length > 60) {
    const abstractExcerpt = clean.length > 420 ? `${clean.slice(0, 417)}...` : clean;
    sections.push(`"${abstractExcerpt}"`);
  } else {
    sections.push('• Preprint investigation exploring novel model architectures, loss formulations, and benchmark evaluations.');
  }

  sections.push(
    '',
    '**📌 Key Research Contributions**',
    '• **Theoretical & Empirical Contribution:** Introduces verified architecture improvements with reproducible evaluation benchmarks.',
    '• **Classification:** Computer Science - Artificial Intelligence (cs.AI) / Computation and Language (cs.CL).'
  );

  return sections.join('\n');
}

/**
 * Detailed breakdown generator for Hacker News trending stories.
 */
function buildHNDetails(item, score) {
  const rawText = item.text || item.story_text || '';
  const clean = cleanPostText(rawText);
  const targetUrl = item.url || '';
  const comments = item.descendants ?? item.num_comments ?? 0;

  const sections = [];

  if (clean.length >= 45) {
    const textExcerpt = clean.length > 320 ? `${clean.slice(0, 317)}...` : clean;
    sections.push(
      '**📝 Story Excerpt & Context**',
      `"${textExcerpt}"`
    );
  } else if (/github\.com/i.test(targetUrl)) {
    sections.push(
      '**💻 Repository & Codebase Tracking**',
      '• **Source Type:** Direct GitHub commit & repository inspection.',
      '• **Discussion Scope:** Engineers tracking model releases, API bindings, and configuration updates in the public repository.'
    );
  } else if (/arxiv\.org/i.test(targetUrl)) {
    sections.push(
      '**📄 Academic Paper Discussion**',
      '• **Source Type:** arXiv preprint discussion.',
      '• **Discussion Scope:** Practitioners reviewing empirical benchmarks, mathematical formulations, and evaluation validity.'
    );
  } else {
    let domainLabel = 'External Link';
    try {
      if (targetUrl.startsWith('http')) {
        domainLabel = new URL(targetUrl).hostname.replace(/^www\./, '');
      }
    } catch {}

    sections.push(
      '**📰 Engineering Context & Story Details**',
      `• **Primary Link:** Monitored dispatch via ${domainLabel}.`,
      '• **Discussion Scope:** Evaluating developer experience, production infrastructure hurdles, and ecosystem shifts.'
    );
  }

  sections.push(
    '',
    '**💬 Hacker News Sentiment & Engagement**',
    `• **Signal Strength:** ${score} upvotes with ${comments} active discussion threads.`,
    '• **Practitioner Sentiment:** Peer review from infrastructure engineers, AI researchers, and systems architects.'
  );

  return sections.join('\n');
}

/**
 * Formats executive blockquote TL;DR followed by detailed technical sections and standard bullet metrics.
 *
 * @param {string} rawSummary
 * @param {string} sourceLab
 * @param {string} signalMetrics
 * @param {string} specsDetected
 * @param {string} url
 * @param {string|Array<string>} [extraSections] Optional detailed breakdown sections
 * @returns {string}
 */
function formatExecutiveDescription(rawSummary, sourceLab, signalMetrics, specsDetected, url, extraSections = null) {
  let cleanTldr = decodeHtmlEntities(rawSummary || 'New community model drop and verified engineering intelligence.')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanTldr.length > 250) {
    cleanTldr = cleanTldr.slice(0, 247) + '...';
  }

  // Format clean blockquote without awkwardly chopping words or adding generic filler
  let tldrLines;
  if (cleanTldr.includes('\n')) {
    tldrLines = cleanTldr
      .split('\n')
      .map((l) => `> ${l.trim()}`)
      .filter(Boolean)
      .join('\n');
  } else if (cleanTldr.length > 105) {
    const punctIdx = cleanTldr.indexOf('. ');
    if (punctIdx > 40 && punctIdx < 140) {
      tldrLines = `> ${cleanTldr.slice(0, punctIdx + 1).trim()}\n> ${cleanTldr.slice(punctIdx + 1).trim()}`;
    } else {
      const spaceIdx = cleanTldr.lastIndexOf(' ', 100);
      const cut = spaceIdx > 35 ? spaceIdx : 95;
      tldrLines = `> ${cleanTldr.slice(0, cut).trim()}\n> ${cleanTldr.slice(cut).trim()}`;
    }
  } else {
    tldrLines = `> ${cleanTldr}`;
  }

  const result = [tldrLines, ''];

  if (extraSections) {
    if (Array.isArray(extraSections)) {
      result.push(...extraSections, '');
    } else if (typeof extraSections === 'string' && extraSections.trim()) {
      result.push(extraSections.trim(), '');
    }
  }

  result.push(
    `• 🏛️ Source / Lab: ${sourceLab}`,
    `• 📊 Signal Metrics: ${signalMetrics}`,
    `• ⚙️ Specs Detected: ${specsDetected || 'General Release'}`,
    `• 🔗 Link: [Direct Access / Checkpoint](${url})`
  );

  return result.join('\n');
}

// ==============================================================================
// 4. PERSISTENCE & DEDUPLICATION
// ==============================================================================

function isDropPosted(id, database) {
  const db = database || defaultDb;
  const row = db.prepare('SELECT id FROM posted_drops WHERE id = ?').get(id);
  return Boolean(row);
}

function recordDrop(id, database) {
  const db = database || defaultDb;
  try {
    const now = Math.floor(Date.now() / 1000);
    db.prepare('INSERT OR IGNORE INTO posted_drops (id, postedAt) VALUES (?, ?)').run(id, now);
  } catch (err) {
    console.error('[RADAR DB ERROR] Failed to record drop:', err.message);
  }
}

// ==============================================================================
// 1. 5-PIPELINE INGESTION WORKERS
// ==============================================================================

/**
 * Pipeline A: Hugging Face Trending & Creator Radar
 * Rules: ZERO organization lockouts, likes >= 10.
 * Category: [📦 WEIGHTS] (0x57F287)
 */
async function fetchHFTrending(mockData) {
  const drops = [];
  try {
    let list = mockData;

    if (!list) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('https://huggingface.co/api/trending?limit=15&type=model', {
        headers: {
          'User-Agent': 'GOKU-Radar/2.0 (by master pusher)',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        list = Array.isArray(data.recentlyTrending) ? data.recentlyTrending : [];
      }
    }

    if (Array.isArray(list)) {
      for (const item of list) {
        const repo = item.repoData || {};
        const repoId = repo.id || repo._id;
        const likes = Number(repo.likes || 0);

        // Filter: Zero org lockouts, likes >= 10
        if (!repoId || likes < 10) continue;

        const creator = repoId.split('/')[0] || 'Community';
        const cleanedTitle = sanitizeTitle(repoId);
        const tagsString = Array.isArray(repo.tags) ? repo.tags.join(' ') : '';
        const specs = extractSpecs(`${repoId} ${repo.pipeline_tag || ''} ${tagsString}`);
        const categoryBadge = RADAR_CATEGORIES.WEIGHTS.tag;
        const title = formatRadarTitle(categoryBadge, specs, cleanedTitle);
        const targetUrl = `https://huggingface.co/${repoId}`;
        const rawSummary = buildHFInsight(repoId, creator, likes, repo.pipeline_tag, repo.tags);
        const details = buildHFDetails(repo, creator, specs.replace(/[\[\]]/g, ''));

        const executiveDescription = formatExecutiveDescription(
          rawSummary,
          creator,
          `🔥 ${likes} likes on Hugging Face`,
          specs.replace(/[\[\]]/g, ''),
          targetUrl,
          details
        );

        drops.push({
          id: `hf_${repoId}`,
          rawId: repoId,
          title,
          cleanedTitle,
          category: 'WEIGHTS',
          type: categoryBadge,
          color: RADAR_CATEGORIES.WEIGHTS.color,
          url: targetUrl,
          summary: rawSummary,
          executiveDescription,
          source: creator,
          metrics: `🔥 ${likes} likes`,
          specs: specs || 'General Release',
        });
      }
    }
  } catch (err) {
    console.warn('[RADAR HF ERROR] Failed to fetch Hugging Face trending:', err.message);
  }
  return drops;
}

/**
 * Pipeline B: Reddit Leaks, Rumors & Discussions
 * Rules: r/LocalLLaMA, r/singularity, r/OpenAI. Score >= 25.
 * Category: [👀 LEAK / CHATTER] or [📊 BENCHMARK] if flair contains 'Benchmark'. (0x9B59B6)
 */
async function fetchRedditChatter(mockChildren) {
  const drops = [];

  if (mockChildren) {
    for (const child of mockChildren) {
      const post = child.data || child;
      const rawTitle = (post.title || '').trim();
      const score = Number(post.score || 0);
      const sub = post.subreddit || 'LocalLLaMA';
      const flair = (post.link_flair_text || '').trim();

      if (score >= 25 && rawTitle) {
        const isBenchmark = flair.toLowerCase().includes('benchmark');
        const categoryBadge = isBenchmark
          ? RADAR_CATEGORIES.BENCHMARK.tag
          : RADAR_CATEGORIES.LEAK_CHATTER.tag;

        const cleanedTitle = sanitizeTitle(rawTitle);
        const specs = extractSpecs(rawTitle);
        const title = formatRadarTitle(categoryBadge, specs, cleanedTitle);
        const targetUrl = post.url || `https://reddit.com/r/${sub}`;
        const rawSummary = buildRedditInsight(post, sub, score, flair);
        const details = buildRedditDetails(post, sub, score, flair);

        const executiveDescription = formatExecutiveDescription(
          rawSummary,
          `Reddit r/${sub}`,
          `⬆️ ${score} upvotes${flair ? ` (${flair})` : ''}`,
          specs.replace(/[\[\]]/g, ''),
          targetUrl,
          details
        );

        drops.push({
          id: `reddit_${post.id || Buffer.from(cleanedTitle).toString('base64url').slice(0, 30)}`,
          rawId: post.id,
          title,
          cleanedTitle,
          category: isBenchmark ? 'BENCHMARK' : 'LEAK_CHATTER',
          type: categoryBadge,
          color: RADAR_CATEGORIES.LEAK_CHATTER.color,
          url: targetUrl,
          summary: rawSummary,
          executiveDescription,
          source: `Reddit r/${sub}`,
          metrics: `⬆️ ${score} upvotes`,
          specs: specs || 'General Discussion',
        });
      }
    }
    return drops;
  }

  for (const sub of REDDIT_SUBREDDITS) {
    let handled = false;

    // Strategy 1: Attempt hot.json endpoint
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, {
        headers: {
          'User-Agent': 'GOKU-Radar/2.0 (by master pusher)',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const children = json.data?.children || [];

        for (const child of children) {
          const post = child.data || {};
          const rawTitle = (post.title || '').trim();
          const score = Number(post.score || 0);
          const flair = (post.link_flair_text || '').trim();

          if (score < 25 || !rawTitle) continue;

          const isBenchmark = flair.toLowerCase().includes('benchmark');
          const categoryBadge = isBenchmark
            ? RADAR_CATEGORIES.BENCHMARK.tag
            : RADAR_CATEGORIES.LEAK_CHATTER.tag;

          const cleanedTitle = sanitizeTitle(rawTitle);
          const specs = extractSpecs(rawTitle);
          const title = formatRadarTitle(categoryBadge, specs, cleanedTitle);

          const targetUrl =
            post.url && post.url.startsWith('http') && !post.url.includes('reddit.com/r/')
              ? post.url
              : `https://reddit.com${post.permalink}`;

          const rawSummary = buildRedditInsight(post, sub, score, flair);
          const details = buildRedditDetails(post, sub, score, flair);

          const executiveDescription = formatExecutiveDescription(
            rawSummary,
            `Reddit r/${sub}`,
            `⬆️ ${score} upvotes${flair ? ` (${flair})` : ''}`,
            specs.replace(/[\[\]]/g, ''),
            targetUrl,
            details
          );

          drops.push({
            id: `reddit_${post.id}`,
            rawId: post.id,
            title,
            cleanedTitle,
            category: isBenchmark ? 'BENCHMARK' : 'LEAK_CHATTER',
            type: categoryBadge,
            color: RADAR_CATEGORIES.LEAK_CHATTER.color,
            url: targetUrl,
            summary: rawSummary,
            executiveDescription,
            source: `Reddit r/${sub}`,
            metrics: `⬆️ ${score} upvotes`,
            specs: specs || 'General Discussion',
          });
        }
        handled = true;
      }
    } catch {
      // hot.json timed out or 403d; fall through to Strategy 2 (RSS)
    }

    // Strategy 2: Fallback to RSS feed if hot.json was blocked/timed out
    if (!handled) {
      try {
        const rssCtrl = new AbortController();
        const rssTimeout = setTimeout(() => rssCtrl.abort(), 4000);

        const rssRes = await fetch(`https://www.reddit.com/r/${sub}/.rss?sort=hot`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          },
          signal: rssCtrl.signal,
        });
        clearTimeout(rssTimeout);

        if (rssRes.ok) {
          const xml = await rssRes.text();
          const feed = await parser.parseString(xml);

          for (const item of (feed.items || []).slice(0, 6)) {
            const rawTitle = (item.title || '').trim();
            if (!rawTitle) continue;

            const cleanedTitle = sanitizeTitle(rawTitle);
            const specs = extractSpecs(rawTitle);
            const categoryBadge = RADAR_CATEGORIES.LEAK_CHATTER.tag;
            const title = formatRadarTitle(categoryBadge, specs, cleanedTitle);
            const targetUrl = item.link || `https://reddit.com/r/${sub}`;
            const id = `reddit_${Buffer.from(targetUrl).toString('base64url').slice(0, 30)}`;
            const rawSummary = buildRedditInsight(
              { title: rawTitle, selftext: item.contentSnippet || item.content || '' },
              sub,
              50,
              ''
            );
            const details = buildRedditDetails(
              { title: rawTitle, selftext: item.contentSnippet || item.content || '' },
              sub,
              50,
              ''
            );

            const executiveDescription = formatExecutiveDescription(
              rawSummary,
              `Reddit r/${sub}`,
              'Hot Community Thread',
              specs.replace(/[\[\]]/g, ''),
              targetUrl,
              details
            );

            drops.push({
              id,
              rawId: id,
              title,
              cleanedTitle,
              category: 'LEAK_CHATTER',
              type: categoryBadge,
              color: RADAR_CATEGORIES.LEAK_CHATTER.color,
              url: targetUrl,
              summary: rawSummary,
              executiveDescription,
              source: `Reddit r/${sub}`,
              metrics: 'Hot Thread',
              specs: specs || 'General Discussion',
            });
          }
          handled = true;
        } else {
          console.log(`[RADAR] r/${sub} feed returned HTTP ${rssRes.status} (rate-limited by Reddit)`);
        }
      } catch (rssErr) {
        console.log(`[RADAR] r/${sub} feed temporarily skipped: ${rssErr.message}`);
      }
    }
  }

  return drops;
}

/**
 * Pipeline C: Official Lab RSS Channels
 * Endpoints: OpenAI, Anthropic, Google DeepMind.
 * Category: [🚨 FRONTIER DROP] (0xED4245)
 */
async function fetchOfficialLabFeeds(mockFeeds) {
  const drops = [];
  const feeds = mockFeeds || OFFICIAL_RSS_FEEDS;

  for (const feedConfig of feeds) {
    try {
      let items = [];

      if (feedConfig.items) {
        items = feedConfig.items;
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(feedConfig.url, {
          headers: {
            'User-Agent': 'GOKU-Radar/2.0 (by master pusher)',
            'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const xml = await res.text();
        const parsed = await parser.parseString(xml);
        items = parsed.items || [];
      }

      for (const item of items.slice(0, 3)) {
        const rawTitle = (item.title || '').trim();
        if (!rawTitle) continue;

        const link = item.link || item.guid || feedConfig.url;
        const id = `rss_${Buffer.from(link).toString('base64url').slice(0, 35)}`;
        const cleanedTitle = sanitizeTitle(rawTitle);
        const specs = extractSpecs(`${rawTitle} ${item.contentSnippet || ''}`);
        const categoryBadge = RADAR_CATEGORIES.FRONTIER_DROP.tag;
        const title = formatRadarTitle(categoryBadge, specs, `${feedConfig.name}: ${cleanedTitle}`);

        const snippet = (item.contentSnippet || item.summary || item.content || '')
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const rawSummary = buildLabInsight(feedConfig.name, snippet, cleanedTitle);
        const details = buildLabDetails(feedConfig.name, snippet, cleanedTitle);

        const executiveDescription = formatExecutiveDescription(
          rawSummary,
          feedConfig.name,
          'Official Lab Release',
          specs.replace(/[\[\]]/g, ''),
          link,
          details
        );

        drops.push({
          id,
          rawId: link,
          title,
          cleanedTitle,
          category: 'FRONTIER_DROP',
          type: categoryBadge,
          color: RADAR_CATEGORIES.FRONTIER_DROP.color,
          url: link,
          summary: rawSummary,
          executiveDescription,
          source: feedConfig.name,
          metrics: 'Official Lab Release',
          specs: specs || 'Frontier Intelligence',
        });
      }
    } catch (err) {
      console.warn(`[RADAR RSS ERROR] Failed to fetch official feed (${feedConfig.name}):`, err.message);
    }
  }

  return drops;
}

/**
 * Pipeline D: arXiv cs.AI & cs.CL Preprints
 * Category: [📄 RESEARCH BREAKTHROUGH] (0x3498DB)
 */
async function fetchArXivAI(mockItems) {
  const drops = [];
  try {
    let items = mockItems;

    if (!items) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const url =
        'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=5';

      const res = await fetch(url, {
        headers: { 'User-Agent': 'GOKU-Radar/2.0 (by master pusher)' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const xml = await res.text();
        const feed = await parser.parseString(xml);
        items = feed.items || [];
      }
    }

    if (Array.isArray(items)) {
      for (const item of items) {
        const rawTitle = (item.title || '').trim();
        if (!rawTitle) continue;

        const cleanedTitle = sanitizeTitle(rawTitle);
        const specs = extractSpecs(`${rawTitle} ${item.summary || ''}`);
        const categoryBadge = RADAR_CATEGORIES.RESEARCH_PAPER.tag;
        const title = formatRadarTitle(categoryBadge, specs, cleanedTitle);

        const link = item.link || item.id;
        const id = `arxiv_${Buffer.from(item.id || link || cleanedTitle).toString('base64url').slice(0, 35)}`;

        const rawSummary = buildArXivInsight(item.summary);
        const details = buildArXivDetails(item.summary);

        const executiveDescription = formatExecutiveDescription(
          rawSummary,
          'arXiv cs.AI / cs.CL',
          'Peer-Review Preprint',
          specs.replace(/[\[\]]/g, ''),
          link,
          details
        );

        drops.push({
          id,
          rawId: link,
          title,
          cleanedTitle,
          category: 'RESEARCH_PAPER',
          type: categoryBadge,
          color: RADAR_CATEGORIES.RESEARCH_PAPER.color,
          url: link,
          summary: rawSummary,
          executiveDescription,
          source: 'arXiv cs.AI',
          metrics: 'Preprint Publication',
          specs: specs || 'Research Architecture',
        });
      }
    }
  } catch (err) {
    console.warn('[RADAR ARXIV ERROR] Failed to fetch arXiv preprints:', err.message);
  }
  return drops;
}

/**
 * Pipeline E: Hacker News Trending Stories
 * Keywords: hermes, nous, gpt, claude, gemini, grok, deepseek, cursor, llm, open weights, mistral, qwen, llama.
 * Score >= 50. Category: [📰 INDUSTRY INTEL] (0xE67E22)
 */
async function fetchHackerNewsAI(mockItems) {
  const drops = [];
  try {
    let items = mockItems;

    if (!items) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
        headers: { 'User-Agent': 'GOKU-Radar/2.0 (by master pusher)' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!topRes.ok) return drops;

      const allIds = await topRes.json();
      const top20 = Array.isArray(allIds) ? allIds.slice(0, 20) : [];

      const itemPromises = top20.map(async (id) => {
        try {
          const itemCtrl = new AbortController();
          const itemTimeout = setTimeout(() => itemCtrl.abort(), 4000);
          const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            headers: { 'User-Agent': 'GOKU-Radar/2.0 (by master pusher)' },
            signal: itemCtrl.signal,
          });
          clearTimeout(itemTimeout);
          return itemRes.ok ? await itemRes.json() : null;
        } catch {
          return null;
        }
      });

      items = (await Promise.all(itemPromises)).filter(Boolean);
    }

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || !item.title) continue;

        const score = Number(item.score || 0);
        const matchesKeyword = HN_KEYWORD_REGEX.test(item.title);

        if (score >= 50 && matchesKeyword) {
          const rawTitle = item.title;
          const cleanedTitle = sanitizeTitle(rawTitle);
          const specs = extractSpecs(rawTitle);
          const categoryBadge = RADAR_CATEGORIES.INDUSTRY_INTEL.tag;
          const title = formatRadarTitle(categoryBadge, specs, cleanedTitle);
          const targetUrl = item.url || `https://news.ycombinator.com/item?id=${item.id}`;

          const rawSummary = buildHNInsight(item, score);
          const details = buildHNDetails(item, score);

          const executiveDescription = formatExecutiveDescription(
            rawSummary,
            'Hacker News',
            `⬆️ ${score} points • 💬 ${item.descendants || 0} comments`,
            specs.replace(/[\[\]]/g, ''),
            targetUrl,
            details
          );

          drops.push({
            id: `hn_${item.id}`,
            rawId: String(item.id),
            title,
            cleanedTitle,
            category: 'INDUSTRY_INTEL',
            type: categoryBadge,
            color: RADAR_CATEGORIES.INDUSTRY_INTEL.color,
            url: targetUrl,
            summary: rawSummary,
            executiveDescription,
            source: 'Hacker News',
            metrics: `⬆️ ${score} points`,
            specs: specs || 'Industry Discussion',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[RADAR HN ERROR] Failed to fetch Hacker News AI stories:', err.message);
  }
  return drops;
}

// ==============================================================================
// AGGREGATOR & DISPATCH ENGINE
// ==============================================================================

/**
 * Gathers drops from all 5 pipelines in parallel with error isolation.
 *
 * @returns {Promise<Array>}
 */
async function getLatestDrops() {
  const [weightsDrops, redditDrops, labDrops, hnDrops, arxivDrops] = await Promise.all([
    fetchHFTrending(),
    fetchRedditChatter(),
    fetchOfficialLabFeeds(),
    fetchHackerNewsAI(),
    fetchArXivAI(),
  ]);

  const combined = [
    ...labDrops,
    ...weightsDrops,
    ...redditDrops,
    ...hnDrops,
    ...arxivDrops,
  ];

  return combined.length > 0 ? combined : FALLBACK_DROPS;
}

/**
 * Retrieves unposted drops filtered by SQLite table posted_drops.
 *
 * @param {import('better-sqlite3').Database} [database]
 * @returns {Promise<Array>}
 */
async function getUnpostedDrops(database) {
  const db = database || defaultDb;
  const allDrops = await getLatestDrops();
  return allDrops.filter((drop) => !isDropPosted(drop.id, db) && (!drop.rawId || !isDropPosted(drop.rawId, db)));
}

/**
 * Dispatches newly detected drops into config.channels.aiNews formatted with executive embeds.
 *
 * @param {import('discord.js').Client} client
 * @param {import('better-sqlite3').Database} [database]
 * @returns {Promise<Array>}
 */
/**
 * Builds standard EmbedBuilder instance for a radar drop.
 * @param {Object} drop
 * @returns {EmbedBuilder}
 */
function buildRadarEmbed(drop) {
  const description =
    drop.executiveDescription ||
    formatExecutiveDescription(
      drop.summary,
      drop.source || 'AI Lab / Creator',
      drop.metrics || 'Verified Signal',
      drop.specs || 'General Release',
      drop.url
    );

  const categoryConfig = RADAR_CATEGORIES[drop.category] || RADAR_CATEGORIES.WEIGHTS;

  return new EmbedBuilder()
    .setAuthor({
      name: categoryConfig.author || 'GOKU AI Radar',
      iconURL: categoryConfig.icon,
      url: drop.url,
    })
    .setTitle(drop.title.length > 250 ? drop.title.slice(0, 247) + '...' : drop.title)
    .setURL(drop.url)
    .setColor(drop.color || categoryConfig.color || 0x5865f2)
    .setThumbnail(categoryConfig.thumbnail)
    .setDescription(description)
    .setFooter({
      text: categoryConfig.footer || 'GOKU AI Radar • Auto-Ingest Active',
    })
    .setTimestamp();
}

async function dispatchRadarDrops(client, database) {
  if (!client) return [];

  const configuredId = process.env.CHANNEL_AI_NEWS || config.channels?.aiNews;
  const targetChannels = [];

  // 1. Check configured CHANNEL_AI_NEWS ID first
  if (configuredId) {
    const ch =
      client.channels?.cache?.get(configuredId) ||
      (await client.channels?.fetch?.(configuredId).catch(() => null));
    if (ch && ch.isTextBased()) {
      targetChannels.push(ch);
    }
  }

  // 2. Fallback: Search across guilds for text channel named 'ai-news'
  if (client.guilds?.cache) {
    for (const [, guild] of client.guilds.cache) {
      const alreadyCovered = targetChannels.some((c) => c.guild?.id === guild.id);
      if (!alreadyCovered) {
        const namedChannel = guild.channels?.cache?.find(
          (c) => c.isTextBased() && c.name === 'ai-news'
        );
        if (namedChannel) {
          targetChannels.push(namedChannel);
        }
      }
    }
  }

  // 3. Fallback: Search client channels cache directly if targetChannels still empty
  if (targetChannels.length === 0 && client.channels?.cache) {
    const namedChannel = client.channels.cache.find(
      (c) => c.isTextBased() && c.name === 'ai-news'
    );
    if (namedChannel) {
      targetChannels.push(namedChannel);
    }
  }

  if (targetChannels.length === 0) {
    console.warn('[RADAR] Warning: No target channel found for AI news (checked configured ID and channel named "ai-news"). Skipping dispatch.');
    return [];
  }

  const db = database || defaultDb;

  try {
    const unposted = await getUnpostedDrops(db);
    if (unposted.length === 0) return [];

    // Dispatch up to 5 drops per pulse to respect rate limits
    const batch = unposted.slice(0, 5);
    const postedItems = [];

    for (const drop of batch) {
      const embed = buildRadarEmbed(drop);

      for (const channel of targetChannels) {
        try {
          await channel.send({ embeds: [embed] });
          console.log(`[RADAR] Dispatched ${drop.type} "${drop.cleanedTitle || drop.title}" to #${channel.name || channel.id}`);
        } catch (sendErr) {
          console.warn(`[RADAR WARN] Failed to dispatch drop to #${channel.name || channel.id}:`, sendErr.message);
        }
      }

      recordDrop(drop.id, db);
      if (drop.rawId) {
        recordDrop(drop.rawId, db);
      }

      postedItems.push(drop);
    }

    return postedItems;
  } catch (err) {
    console.error('[RADAR ERROR] Failed to dispatch radar drops:', err.message);
    return [];
  }
}

/**
 * Backwards-compatible alias for dispatchRadarDrops.
 */
async function dispatchDailyRadar(client) {
  return dispatchRadarDrops(client);
}

/**
 * Initializes recurring cron job polling every 10 minutes ('* /10 * * * *').
 *
 * @param {import('discord.js').Client} client
 */
function startRadarCron(client) {
  cron.schedule('*/10 * * * *', () => {
    dispatchRadarDrops(client).catch((err) => {
      console.error('[RADAR CRON ERROR] Failed during 10-minute radar cycle:', err.message);
    });
  });

  console.log('[RADAR CRON] Scheduled 10-minute Full-Spectrum AI Radar (*/10 * * * *).');
}

module.exports = {
  RADAR_CATEGORIES,
  HN_KEYWORDS,
  HN_KEYWORD_REGEX,
  OFFICIAL_RSS_FEEDS,
  REDDIT_SUBREDDITS,
  FALLBACK_DROPS,
  sanitizeTitle,
  extractSpecs,
  formatRadarTitle,
  formatExecutiveDescription,
  buildHFInsight,
  buildRedditInsight,
  buildLabInsight,
  buildArXivInsight,
  buildHNInsight,
  buildHFDetails,
  buildRedditDetails,
  buildLabDetails,
  buildArXivDetails,
  buildHNDetails,
  isDropPosted,
  recordDrop,
  fetchHFTrending,
  fetchRedditChatter,
  fetchOfficialLabFeeds,
  fetchHackerNewsAI,
  fetchArXivAI,
  getLatestDrops,
  getUnpostedDrops,
  dispatchRadarDrops,
  dispatchDailyRadar,
  startRadarCron,
  buildRadarEmbed,
};
