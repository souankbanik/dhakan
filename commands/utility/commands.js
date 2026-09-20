const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} = require('discord.js');

const CATEGORIES = {
  all: {
    name: 'All Commands Overview',
    emoji: '📚',
    description: 'Complete directory of all bot commands and capabilities',
  },
  showcase: {
    name: 'Project Showcase & Builder XP',
    emoji: '🛠️',
    description: 'Submit projects, earn builder XP, upvote builds, and unlock tier roles',
  },
  economy: {
    name: 'Builder XP, Streaks & Economy',
    emoji: '⚡',
    description: 'Ship streaks, daily progression logging, vibe credits, and builder leaderboards',
  },
  staff: {
    name: 'Staff & Moderation Management',
    emoji: '🛡️',
    description: 'Staff leave of absence (LOA) requests and event activity checks',
  },
  admin: {
    name: 'Admin & Setup Panels',
    emoji: '⚙️',
    description: 'Persistent interactive embeds for rules onboarding, support tickets, and partners',
  },
  utility: {
    name: 'Utility & System Commands',
    emoji: '📡',
    description: 'Latency diagnostics, help manuals, and bot status information',
  },
};

/**
 * Builds the embed for a specific category or the global overview.
 */
function buildCategoryEmbed(category = 'all', userTag = 'User') {
  const embed = new EmbedBuilder().setTimestamp();

  if (category === 'showcase') {
    embed
      .setTitle('🛠️ Project Showcase & Builder XP System')
      .setColor(0x5865f2)
      .setDescription(
        'Submit what you are building to the community, receive staff reviews, earn XP, and unlock milestone tier roles.'
      )
      .addFields(
        {
          name: '1. `/showcase`',
          value:
            '• **Description**: Launches an interactive modal to submit your project or AI app.\n' +
            '• **Anti-Spam**: Enforces 7-day account age, 7-day rate limits, and duplicate title/URL prevention.\n' +
            '• **Modal Fields**: Project Name, Live Demo/Repo URL, Tech Stack/AI Tools, Description.\n' +
            '• **Curation Review Queue**: Submissions post directly to `#curation-queue` with **1⭐ to 5⭐** curation rating and **Reject** buttons.\n' +
            '• **Rewards on Approval**: Author gains **Score * 50** VibePoints, **+100 XP** (`PROJECT_APPROVED`), and the **Verified Builder** role.\n' +
            '• **Public Showcase**: Card publishes in `#community-builds` with direct link, **🔥 Upvote**, and **💡 Submit Feedback** buttons.\n' +
            '• **Permissions**: Available to all members (account age >= 7 days).',
        },
        {
          name: '2. `/leaderboard projects`',
          value:
            '• **Description**: Ranks the top 10 community projects by upvote count.\n' +
            '• **Features**: Displays medal rankings (🥇, 🥈, 🥉), project links, author mentions, total upvotes, and total XP generated (`upvoteCount * 25`).\n' +
            '• **Permissions**: Public.',
        },
        {
          name: '3. 🔥 Showcase Upvote & Unvote Engine',
          value:
            '• **Upvoting**: Author earns **+25 XP** (`UPVOTE_RECEIVED`). Voter earns **+5 XP** (`CAST_VOTE`) up to a daily cap of **25 XP/day** (5 votes).\n' +
            '• **Anti-Spam**: Blocks self-votes, enforces 7-day account age, and 2s button debounce.\n' +
            '• **Unvoting (Toggle Off)**: Clicking upvote again rescinds vote, decrements count, and deducts XP accurately.\n' +
            '• **Zero Floor**: User XP never drops below 0.',
        },
        {
          name: '4. 💡 Feedback Bounties System',
          value:
            '• **Submission**: Click **💡 Submit Feedback** on any showcase card to open the feedback modal.\n' +
            '• **Author Review**: Project creator receives a DM with feedback and a **Mark as Helpful** button.\n' +
            '• **Rewards**: When marked helpful, reviewer earns **+25 VibePoints** (capped at 3 per project).',
        },
        {
          name: '5. ⭐ Video Feature Flagging',
          value:
            '• **Curation Perks**: Projects rated 4⭐ or 5⭐ reveal a **⭐ Flag for Video** button in `#curation-queue`.\n' +
            '• **Staff Logs**: Dispatches project metadata directly to `#staff-logs` for video production candidate tracking.',
        },
        {
          name: '6. 🏆 Builder Tier Roles',
          value:
            '• **Level 5 ("Shipper")**: Unlocks at 1,600 XP (or 100+ VibePoints).\n' +
            '• **Level 10 ("Product Lead")**: Unlocks at 8,100 XP (or 1,500+ VibePoints).\n' +
            '• **Level 20 ("Master Builder")**: Unlocks at 36,100 XP.\n' +
            '• **Level Formula**: `Level = floor(0.1 * sqrt(XP)) + 1`. Milestone level-ups broadcast to `#general`.',
        },
        {
          name: '7. `/roast-my-app url:<url> focus:<area>`',
          value:
            '• **Description**: Request brutal, constructive product critiques.\n' +
            '• **Action**: Posts a roast arena card in `#showcase` and automatically spawns a dedicated discussion thread `🔥 Roast: [App Name]`.\n' +
            '• **Permissions**: Public.',
        }
      );
  } else if (category === 'economy') {
    embed
      .setTitle('⚡ Builder XP, Ship Streaks & Economy System')
      .setColor(0xf1c40f)
      .setDescription(
        'Maintain daily development momentum, track ship streaks, and build reputation in the community.'
      )
      .addFields(
        {
          name: '1. `/daily-streak progress:<text>`',
          value:
            '• **Description**: Log what you built or shipped today (e.g., `"Shipped authentication flow"`).\n' +
            '• **Rewards**: Awards **+50 Vibe Credits** and advances your consecutive `ship_streak`.\n' +
            '• **Cooldown**: 20-hour anti-spam protection allows flexible schedule.\n' +
            '• **48-Hour Expiration**: If > 48 hours elapse without logging, streak resets to 0 and restarts fresh at 1.\n' +
            '• **Timezone Safe**: Uses real elapsed UNIX timestamps, immune to calendar timezone drift.',
        },
        {
          name: '2. `/leaderboard builders [sort: xp | streak | credits]`',
          value:
            '• **Description**: Ranks the top 10 community builders.\n' +
            '• **Sorting Modes**:\n' +
            '  - `xp` (Default): Ranked by Total XP and Level.\n' +
            '  - `streak`: Ranked by highest active Ship Streak.\n' +
            '  - `credits`: Ranked by accumulated Vibe Credits / Points.',
        },
        {
          name: '3. `/balance [user: optional]`',
          value:
            '• **Description**: Displays Builder Profile and stats.\n' +
            '• **Metrics**: Level, Total XP, Vibe Credits, Ship Streak, Shipped Projects submitted, and tier badge.',
        },
        {
          name: '4. `/daily`',
          value:
            '• **Description**: Legacy daily reward granting 100 coins with 24h cooldown.',
        },
        {
          name: '5. `/log text:<update>`',
          value:
            '• **Description**: Daily vibe log to record what you shipped today.\n' +
            '• **Streak Rules**: 24–48h increments streak & awards +10 VP; >48h resets streak to 1 & awards +10 VP; <24h cooldown.\n' +
            '• **Channel Post**: Publishes clean shipping log to the community channel.',
        },
        {
          name: '6. `/tip user:<user> amount:<vp>`',
          value:
            '• **Description**: Transfer VibePoints to peer builders to reward great contributions.\n' +
            '• **Guards**: Self-tipping & bot guards, strict balance checks, atomic SQLite balance transfer.\n' +
            '• **Auto-Role Sync**: Triggers automated role checks for recipients.',
        }
      );
  } else if (category === 'staff') {
    embed
      .setTitle('🛡️ Staff Management & Moderation')
      .setColor(0xe74c3c)
      .setDescription(
        'Internal tools for staff leaves of absence and moderator workflow management.'
      )
      .addFields(
        {
          name: '1. `/loa days:<1-365> reason:<text>`',
          value:
            '• **Description**: Staff members submit a formal Leave of Absence request.\n' +
            '• **Workflow**: Submissions route directly to `#staff-logs` with **Approve Request** (✅) and **Decline Request** (❌) buttons.\n' +
            '• **Permissions**: Restricted to staff and administrators.\n' +
            '• **Notifications**: Automatically sends direct messages (DMs) to staff members with the approval/rejection notice.',
        }
      );
  } else if (category === 'admin') {
    embed
      .setTitle('⚙️ Admin & Setup Panels')
      .setColor(0x9b59b6)
      .setDescription(
        'Deploy persistent, self-service interactive panels for onboarding, showcases, tickets, and partnerships.'
      )
      .addFields(
        {
          name: '1. `/rules-setup [channel]`',
          value:
            '• **Description**: Deploys the persistent server rules agreement panel.\n' +
            '• **Action**: Members click **"Accept & Join Server"** to confirm guidelines.\n' +
            '• **Automation**: Automatically assigns `@Member` role, records verification in SQLite, and DMs welcome resource links and YouTube channel.',
        },
        {
          name: '2. `/showcase-setup [channel]`',
          value:
            '• **Description**: Deploys a persistent banner in `#submit-project` with a **"Submit Project"** button triggering the showcase modal.',
        },
        {
          name: '3. `/ticket-setup [channel] [category_id] [role_id]`',
          value:
            '• **Description**: Deploys the private Support Ticket panel.\n' +
            '• **Action**: Members click **"Create Support Ticket"** to generate an isolated private channel visible only to the member and Support Staff role.\n' +
            '• **Inside Ticket**: Includes a **"Close Ticket"** button with confirmation prompt, archiving, and deletion.',
        },
        {
          name: '4. `/partner-setup [channel]`',
          value:
            '• **Description**: Deploys a persistent Partner Application embed with an **"Apply for Partnership"** button opening a 4-field application modal.',
        }
      );
  } else if (category === 'utility') {
    embed
      .setTitle('📡 Utility & System Commands')
      .setColor(0x1abc9c)
      .setDescription(
        'Diagnostic utilities, system health monitors, and AI model tier ratings.'
      )
      .addFields(
        {
          name: '1. `/ping`',
          value:
            '• **Description**: Checks bot latency, Discord API gateway roundtrip, and websocket heartbeat.\n' +
            '• **Permissions**: Public.',
        },
        {
          name: '2. `/commands [category]`',
          value:
            '• **Description**: Interactive commands manual and feature walkthrough with category filtering.\n' +
            '• **Permissions**: Public.',
        },
        {
          name: '3. `/rate-model model:<name> score:<1-5> [comment]`',
          value:
            '• **Description**: Rate any AI coding model or LLM (1 to 5 stars).\n' +
            '• **Anti-Spam**: Enforces 7-day account age and 1 rating per user per model.\n' +
            '• **Reward**: Awards **+5 VibePoints** to the reviewer.\n' +
            '• **Permissions**: Public.',
        },
        {
          name: '4. `/ai-leaderboard`',
          value:
            '• **Description**: View the ranked AI Coding & LLM Model Tier List based on community ratings.\n' +
            '• **Features**: Displays star ratings, average decimal score, and total vote volume.\n' +
            '• **Permissions**: Public.',
        },
        {
          name: '5. 🎙️ Welcome Voice Channel',
          value:
            '• **Feature**: Automatic voice onboarding greeter.\n' +
            '• **Channel**: Joining the Coworking voice channel (`1550590435922280629`) connects the bot with speech audio greeting new builders.',
        },
        {
          name: '6. 📺 YouTube Feed Poller',
          value:
            '• **Feature**: Autonomous RSS poller checking `@rounieee` YouTube feed every 180 seconds and posting new video announcements.',
        },
        {
          name: '7. `/aboutdhakan`',
          value:
            '• **Description**: Detailed overview of DHAKAN, its core mission, capabilities, and complete command index in 3 structured sections.\n' +
            '• **Permissions**: Public.',
        },
        {
          name: '8. `/share-prompt`',
          value:
            '• **Description**: Share tested AI prompts for Cursor, v0, Claude, or custom LLMs.\n' +
            '• **Bookmarks**: Posts with an interactive bookmark button that awards the author +15 VibePoints.',
        },
        {
          name: '9. `/prompts query:<text>`',
          value:
            '• **Description**: Search top 3 rated prompts from the community library by tool or keyword.',
        },
        {
          name: '10. `/collab`',
          value:
            '• **Description**: Builder matchmaker for recruiting frontend, backend, AI, or UI co-builders.\n' +
            '• **Action**: Posts a matchmaker card to the community channel with a 🤝 Connect button.',
        },
        {
          name: '11. `/calc-tokens model:<model> input_words:<num> output_words:<num>`',
          value:
            '• **Description**: Estimates API token volume and costs across GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro.',
        },
        {
          name: '12. `/check-domain domain:<domain>`',
          value:
            '• **Description**: Performs DNS-over-HTTPS (Cloudflare DoH) check to inspect domain availability and IP records.',
        },
        {
          name: '13. `/docs query:<text> [source]`',
          value:
            '• **Description**: Direct documentation lookup for Next.js, Tailwind CSS, SQLite, and MDN Web Docs.',
        },
        {
          name: '14. `/profile [user]`',
          value:
            '• **Description**: Visual builder passport showcasing Level, VibePoints, Shipped Projects, Streak, and Badges.',
        },
        {
          name: '15. `/first-dollar`',
          value:
            '• **Description**: Submit Stripe/revenue screenshot for staff verification, unlocking First Dollar Club status & +100 VP.',
        },
        {
          name: '16. `/video-idea`',
          value:
            '• **Description**: Pitch YouTube video topics directly to Rounit\'s production pipeline in `#video-pipeline`.',
        }
      );
  } else {
    // All Categories Overview
    embed
      .setTitle('📚 Bot Commands & Features Directory')
      .setColor(0x5865f2)
      .setDescription(
        'Welcome to **DHAKAN** — the custom engineering & community platform bot for Rounit\'s developer hub.\n\n' +
        'Select a category from the dropdown menu below to view full details, permissions, options, and workflows.'
      )
      .addFields(
        {
          name: '🛠️ Project Showcase & Builder XP',
          value:
            '`/showcase` — Submit projects for staff approval & community voting\n' +
            '`/roast-my-app` — Request brutal product feedback with auto-spawned thread\n' +
            '`/collab` — Post builder matchmaker requests to recruit teammates\n' +
            '`/leaderboard projects` — View top-voted community creations',
        },
        {
          name: '⚡ Builder Economy & Streaks',
          value:
            '`/daily-streak` — Log daily progress, gain +50 Vibe Credits, maintain streak\n' +
            '`/log` — Daily vibe log with streak progression & shipping updates\n' +
            '`/tip` — Transfer VibePoints to peer builders with role syncing\n' +
            '`/leaderboard builders` — Top builders by XP, Level, Streaks, or Credits\n' +
            '`/balance` — View Builder Profile, Level, XP, Credits, and Shipped count\n' +
            '`/daily` — Daily coin check-in (24h cooldown)',
        },
        {
          name: '🛡️ Staff & Moderation',
          value:
            '`/loa` — Staff Leave of Absence modal submission with log approvals',
        },
        {
          name: '⚙️ Admin & Setup Panels',
          value:
            '`/rules-setup` — Persistent rules agreement & automated member onboarding\n' +
            '`/showcase-setup` — Persistent showcase submission panel\n' +
            '`/ticket-setup` — Private support ticket panel with isolated channels\n' +
            '`/partner-setup` — Partner application modal panel',
        },
        {
          name: '📡 Utility & Developer Tools',
          value:
            '`/calc-tokens` — Estimate tokens & API pricing for GPT-4o, Claude & Gemini\n' +
            '`/check-domain` — Verify domain registration & DNS via Cloudflare DoH\n' +
            '`/docs` — Official documentation lookup for Next.js, Tailwind, SQLite, MDN\n' +
            '`/profile` — Builder stats, level progress, streak, and milestone badges\n' +
            '`/first-dollar` — Submit revenue proof for First Dollar Club verification\n' +
            '`/video-idea` — Pitch video topics directly to Rounit\'s production queue\n' +
            '`/share-prompt` — Share AI prompts with bookmark rewards\n' +
            '`/prompts` — Search top community prompts by tool or query\n' +
            '`/rate-model` — Rate AI models (1-5⭐) and earn +5 VibePoints\n' +
            '`/ai-leaderboard` — View community-voted AI Model Tier List\n' +
            '`/aboutdhakan` — Overview of DHAKAN, core mission & command index\n' +
            '`/commands` — View this detailed command manual\n' +
            '`/ping` — Check websocket heartbeat & API latency',
        }
      );
  }

  embed.setFooter({ text: `Requested by ${userTag} • Select a category below for in-depth specs` });
  return embed;
}

/**
 * Builds the dropdown select menu row.
 */
function buildCategorySelectRow(selectedCategory = 'all') {
  const options = Object.entries(CATEGORIES).map(([key, item]) => ({
    label: item.name,
    value: key,
    description: item.description.substring(0, 100),
    emoji: item.emoji,
    default: key === selectedCategory,
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('commands_select_category')
    .setPlaceholder('📂 Choose a command category to inspect...')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(selectMenu);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Display all bot commands and feature details')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Filter commands by category')
        .setRequired(false)
        .addChoices(
          { name: 'All Commands Overview', value: 'all' },
          { name: '🛠️ Showcase & Builder XP', value: 'showcase' },
          { name: '⚡ Economy & Ship Streaks', value: 'economy' },
          { name: '🛡️ Staff Management & LOA', value: 'staff' },
          { name: '⚙️ Admin & Setup Panels', value: 'admin' },
          { name: '📡 Utility & System', value: 'utility' }
        )
    ),

  async execute(interaction) {
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply();
    }
    const initialCategory = interaction.options?.getString?.('category') || 'all';
    const userTag = interaction.user?.tag || 'User';

    const embed = buildCategoryEmbed(initialCategory, userTag);
    const row = buildCategorySelectRow(initialCategory);

    let response;
    if (interaction.deferred) {
      response = await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } else {
      response = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true,
      });
    }

    // Attach interactive collector for 2 minutes
    try {
      if (response && typeof response.createMessageComponentCollector === 'function') {
        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === interaction.user.id,
          time: 120_000,
        });

      collector.on('collect', async (selectInteraction) => {
        const selected = selectInteraction.values[0] || 'all';
        const updatedEmbed = buildCategoryEmbed(selected, userTag);
        const updatedRow = buildCategorySelectRow(selected);

        await selectInteraction.update({
          embeds: [updatedEmbed],
          components: [updatedRow],
        });
      });

        collector.on('end', async () => {
        // Disable dropdown after timeout
        try {
          const disabledRow = buildCategorySelectRow(initialCategory);
          disabledRow.components[0].setDisabled(true);
          await interaction.editReply({ components: [disabledRow] }).catch(() => null);
        } catch {
          // Message may have been deleted, ignore
        }
      });
      }
    } catch (collectorErr) {
      // Ephemeral or test mock environment without collector support
    }
  },

  buildCategoryEmbed,
  buildCategorySelectRow,
};
