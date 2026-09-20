const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { buildCategoryEmbed, buildCategorySelectRow } = require('./commands');

/**
 * Generates the rich embed describing DHAKAN in 1-3 paragraphs with command highlights.
 */
function buildAboutEmbed() {
  const description = [
    '**What is DHAKAN?**',
    "DHAKAN is the flagship engineering companion and community operating system for Rounit's Developer Community. Built to empower developers, vibe coders, and indie hackers, DHAKAN bridges daily building habits with community recognition. Whether you are shipping full-stack apps, experimenting with AI workflows, or building side projects, DHAKAN manages and tracks your journey from your first line of code to milestone builder tiers.",
    '',
    '---',
    '',
    '**🚀 Builder Showcase & Economy**',
    "DHAKAN puts creators in the spotlight. Members showcase their web apps and repositories using `/showcase`, where projects undergo Rounit's 1 to 5⭐ curation pipeline in `#curation-queue` to earn VibePoints, Builder XP, and the Verified Builder role. Builds rated 4+ get flagged for YouTube video features, while reviewers earn bounties through constructive critique. To keep developers accountable, members log their daily development with `/log` to earn VibePoints and preserve consecutive ship streaks, track their progress with `/profile`, and climb the ranks on `/leaderboard`.",
    '',
    '---',
    '',
    '**🤖 AI Benchmarks & Server Intelligence**',
    'Beyond the builder economy, DHAKAN serves as an autonomous intelligence and utility hub. Community members rate frontier LLMs and code editors using `/rate-model` (+5 VibePoints), with collective ratings aggregated in the live `/ai-leaderboard`. Members can index and discover developer prompts via `/share-prompt` and `/prompts`, find co-builders with `/collab`, and receive automated YouTube upload notifications.',
    '',
    '---',
    '',
    '**Directory & Modules:**',
    '• **Showcase & Curation:** `/showcase` • `/collab` • `/leaderboard projects` • Feedback Bounties',
    '• **Economy & Streaks:** `/log` • `/profile` • `/leaderboard builders` • `/tip`',
    '• **AI Model Tier List:** `/rate-model` • `/ai-leaderboard` • `/calc-tokens`',
    '• **Prompt Library & Utilities:** `/share-prompt` • `/prompts` • `/check-domain` • `/docs` • `/ping`',
  ].join('\n');

  return new EmbedBuilder()
    .setTitle('About DHAKAN — Community & Builder OS')
    .setColor(0x5865f2)
    .setDescription(description)
    .setFooter({
      text: 'DHAKAN Community Bot • Click below to explore the interactive command directory.',
    })
    .setTimestamp();
}

/**
 * Builds the action row with a button leading to the full commands directory.
 */
function buildAboutActionRow() {
  const button = new ButtonBuilder()
    .setCustomId('about_open_commands')
    .setLabel('📚 Explore Full Command Manual (/commands)')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(button);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aboutdhakan')
    .setDescription('Learn about DHAKAN, its core capabilities, and command directory'),

  buildAboutEmbed,
  buildAboutActionRow,

  async execute(interaction) {
    // Immediately defer reply to prevent Discord 3-second timeout over high-latency networks
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply();
    }

    const embed = buildAboutEmbed();
    const row = buildAboutActionRow();

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

    // Attach button collector to seamlessly transition into /commands directory if clicked
    try {
      if (response && typeof response.createMessageComponentCollector === 'function') {
        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === interaction.user.id,
          time: 120_000,
        });

        collector.on('collect', async (btnInteraction) => {
          if (btnInteraction.customId === 'about_open_commands') {
            const userTag = interaction.user?.tag || 'User';
            const commandsEmbed = buildCategoryEmbed('all', userTag);
            const commandsRow = buildCategorySelectRow('all');

            await btnInteraction.update({
              embeds: [commandsEmbed],
              components: [commandsRow],
            });
          }
        });

        collector.on('end', async () => {
          try {
            const disabledRow = buildAboutActionRow();
            disabledRow.components[0].setDisabled(true);
            await interaction.editReply({ components: [disabledRow] }).catch(() => null);
          } catch {
            // Ignored if interaction was deleted
          }
        });
      }
    } catch {
      // Ignored in headless/test environments
    }
  },
};
