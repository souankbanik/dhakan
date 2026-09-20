/**
 * One-time setup script to automatically create test channels and categories in the test server.
 * Reads DISCORD_TOKEN and GUILD_ID from .env, creates categories & channels with strict permissions,
 * and updates .env with the generated IDs.
 */

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('[FATAL] Missing DISCORD_TOKEN or GUILD_ID in .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/**
 * Finds or creates a category channel.
 */
async function getOrCreateCategory(guild, name) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    console.log(`[CATEGORY] Found existing "${existing.name}" (ID: ${existing.id})`);
    return existing;
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
  });
  console.log(`[CATEGORY] Created new category "${created.name}" (ID: ${created.id})`);
  return created;
}

/**
 * Finds or creates a text or voice channel under a category.
 */
async function getOrCreateChannel(guild, { name, type, parentId, permissionOverwrites = [] }) {
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === type &&
      (c.name.toLowerCase() === name.toLowerCase() ||
        c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === name.toLowerCase().replace(/[^a-z0-9]/g, '')) &&
      (!parentId || c.parentId === parentId)
  );

  if (existing) {
    console.log(`[CHANNEL] Found existing "${existing.name}" (ID: ${existing.id})`);
    return existing;
  }

  const options = {
    name,
    type,
    parent: parentId,
  };

  if (permissionOverwrites.length > 0) {
    options.permissionOverwrites = permissionOverwrites;
  }

  const created = await guild.channels.create(options);
  console.log(`[CHANNEL] Created "${created.name}" (${type === ChannelType.GuildVoice ? 'Voice' : 'Text'}, ID: ${created.id})`);
  return created;
}

/**
 * Writes or updates key-value pairs in the .env file cleanly.
 */
function updateEnvFile(newMappings) {
  const envPath = path.join(__dirname, '..', '.env');
  let content = '';

  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const lines = content.split(/\r?\n/);
  const updatedKeys = new Set();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const equalsIdx = line.indexOf('=');
    if (equalsIdx === -1) return line;

    const key = line.substring(0, equalsIdx).trim();
    if (key in newMappings) {
      updatedKeys.add(key);
      return `${key}=${newMappings[key]}`;
    }
    return line;
  });

  // Append any keys that didn't exist previously
  for (const [key, val] of Object.entries(newMappings)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(envPath, newLines.join('\n').trim() + '\n', 'utf8');
  console.log('[ENV] Updated .env with newly mapped channel IDs successfully.');
}

client.once('ready', async () => {
  try {
    console.log(`[AUTH] Logged in as ${client.user.tag} (ID: ${client.user.id})`);
    console.log(`[GUILD] Fetching target guild ${guildId}...`);

    const guild = await client.guilds.fetch(guildId);
    console.log(`[GUILD] Connected to target guild: "${guild.name}" (ID: ${guild.id})`);

    // Fetch existing channels and roles for accurate lookup
    await guild.channels.fetch();
    await guild.roles.fetch();

    // -------------------------------------------------------------
    // 1. Category: COMMUNITY
    // -------------------------------------------------------------
    const communityCategory = await getOrCreateCategory(guild, 'COMMUNITY');

    // #general (GuildText)
    const generalChannel = await getOrCreateChannel(guild, {
      name: 'general',
      type: ChannelType.GuildText,
      parentId: communityCategory.id,
    });

    // #bot-commands (GuildText)
    const botCommandsChannel = await getOrCreateChannel(guild, {
      name: 'bot-commands',
      type: ChannelType.GuildText,
      parentId: communityCategory.id,
    });

    // #showcase (GuildText)
    const showcaseChannel = await getOrCreateChannel(guild, {
      name: 'showcase',
      type: ChannelType.GuildText,
      parentId: communityCategory.id,
    });

    // #ai-leaderboard (GuildText, read-only for @everyone)
    const aiLeaderboardChannel = await getOrCreateChannel(guild, {
      name: 'ai-leaderboard',
      type: ChannelType.GuildText,
      parentId: communityCategory.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ],
    });

    // 🔊 Coworking (GuildVoice)
    const coworkingChannel = await getOrCreateChannel(guild, {
      name: '🔊 Coworking',
      type: ChannelType.GuildVoice,
      parentId: communityCategory.id,
    });

    // -------------------------------------------------------------
    // 2. Category: STAFF & CURATION
    // -------------------------------------------------------------
    const staffCategory = await getOrCreateCategory(guild, 'STAFF & CURATION');

    // Private permission overwrites: viewable only by Admins & Bot
    const privateOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    // Include Admin roles if present
    for (const [, role] of guild.roles.cache) {
      if (
        role.permissions.has(PermissionFlagsBits.Administrator) ||
        role.name.toLowerCase().includes('admin') ||
        role.name.toLowerCase().includes('staff')
      ) {
        privateOverwrites.push({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }
    }

    // #product-test (GuildText, private)
    const productTestChannel = await getOrCreateChannel(guild, {
      name: 'product-test',
      type: ChannelType.GuildText,
      parentId: staffCategory.id,
      permissionOverwrites: privateOverwrites,
    });

    // #video-pipeline (GuildText, private)
    const videoPipelineChannel = await getOrCreateChannel(guild, {
      name: 'video-pipeline',
      type: ChannelType.GuildText,
      parentId: staffCategory.id,
      permissionOverwrites: privateOverwrites,
    });

    // -------------------------------------------------------------
    // 3. Print Summary & Update .env
    // -------------------------------------------------------------
    console.log('\n========================================');
    console.log('       GENERATED CHANNEL SUMMARY        ');
    console.log('========================================');
    console.log(`COMMUNITY Category:       ${communityCategory.id}`);
    console.log(`  - #general:             ${generalChannel.id}`);
    console.log(`  - #bot-commands:        ${botCommandsChannel.id}`);
    console.log(`  - #showcase:            ${showcaseChannel.id}`);
    console.log(`  - #ai-leaderboard:      ${aiLeaderboardChannel.id}`);
    console.log(`  - 🔊 Coworking:         ${coworkingChannel.id}`);
    console.log(`STAFF & CURATION Category:${staffCategory.id}`);
    console.log(`  - #product-test:        ${productTestChannel.id}`);
    console.log(`  - #video-pipeline:      ${videoPipelineChannel.id}`);
    console.log('========================================\n');

    const envUpdates = {
      CHANNEL_GENERAL: generalChannel.id,
      CHANNEL_BOT_COMMANDS: botCommandsChannel.id,
      CHANNEL_SHOWCASE: showcaseChannel.id,
      CHANNEL_COMMUNITY_BUILDS: showcaseChannel.id, // alias
      CHANNEL_AI_LEADERBOARD: aiLeaderboardChannel.id,
      CHANNEL_COWORKING: coworkingChannel.id,
      CHANNEL_WELCOME_VC: coworkingChannel.id, // alias
      CHANNEL_PRODUCT_TEST: productTestChannel.id,
      CHANNEL_STAFF_REVIEW: productTestChannel.id, // alias
      CHANNEL_VIDEO_PIPELINE: videoPipelineChannel.id,
      CHANNEL_STAFF_LOGS: videoPipelineChannel.id, // alias
    };

    updateEnvFile(envUpdates);

    console.log('[COMPLETE] Test channels setup finished cleanly.');
    await client.destroy();
    process.exit(0);
  } catch (error) {
    console.error('[FATAL ERROR during channel setup]:', error);
    await client.destroy().catch(() => null);
    process.exit(1);
  }
});

client.login(token).catch((err) => {
  console.error('[FATAL] Failed to login client:', err);
  process.exit(1);
});
