const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../../config');
const { cleanDomainName } = require('../../utils/checkDomain');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roast-my-app')
    .setDescription('Request brutal, constructive feedback on your app and start a dedicated roast thread')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('The URL of your app, SaaS, or project')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('focus')
        .setDescription('Specific area you want roasted')
        .setRequired(true)
        .addChoices(
          { name: 'UI / UX Design & Polish', value: 'UI/UX Design' },
          { name: 'Landing Page & Copywriting', value: 'Landing Page Copy' },
          { name: 'Value Proposition & Pricing', value: 'Value Proposition & Pricing' },
          { name: 'Onboarding & First Impression', value: 'Onboarding & First Impression' },
          { name: 'Everything / Full Brutal Roast', value: 'Everything (Full Roast)' }
        )
    ),

  async execute(interaction) {
    const rawUrl = interaction.options.getString('url').trim();
    const focus = interaction.options.getString('focus');

    // URL validation
    let validUrl = rawUrl;
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = `https://${validUrl}`;
    }

    try {
      new URL(validUrl);
    } catch {
      return interaction.reply({
        content: '❌ Please provide a valid URL (e.g. `https://myapp.com`).',
        ephemeral: true,
      });
    }

    const domain = cleanDomainName(validUrl) || 'My App';
    const appName = domain.replace(/^www\./, '');

    // Target channel: #showcase or #community-builds
    const showcaseChannelId =
      config.channels?.showcase ||
      process.env.CHANNEL_SHOWCASE ||
      config.channels?.communityBuilds ||
      process.env.CHANNEL_COMMUNITY_BUILDS;

    let showcaseChannel = showcaseChannelId
      ? interaction.guild?.channels?.cache?.get(showcaseChannelId)
      : null;

    if (!showcaseChannel && interaction.guild) {
      const channels = Array.from(interaction.guild.channels.cache.values());
      showcaseChannel = channels.find(
        (c) =>
          c.isTextBased() &&
          (c.name.toLowerCase().includes('showcase') ||
            c.name.toLowerCase().includes('build') ||
            c.name.toLowerCase() === 'general')
      );
    }

    if (!showcaseChannel || !showcaseChannel.isTextBased()) {
      return interaction.reply({
        content: '❌ Could not find a suitable showcase channel to post your roast request.',
        ephemeral: true,
      });
    }

    const roastEmbed = new EmbedBuilder()
      .setTitle(`🔥 Roast My App: ${appName}`)
      .setColor(0xe74c3c)
      .setDescription(
        `Builder <@${interaction.user.id}> is brave enough to put their app in the hot seat!\n` +
        `Drop your most honest, unfiltered, and actionable feedback in the thread below.`
      )
      .addFields(
        { name: 'Live Application', value: `[Visit ${appName}](${validUrl})`, inline: true },
        { name: 'Submitter', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Focus Area', value: `🎯 \`${focus}\``, inline: true },
        {
          name: 'Ground Rules',
          value:
            '• Be brutally honest but constructive.\n' +
            '• Point out bugs, bad copy, confusing UI, or unconvincing offers.\n' +
            '• Give actionable suggestions on how to make it 10x better.\n' +
            '• No personal attacks — roast the code & product, not the builder!',
        }
      )
      .setFooter({ text: 'Rounit HQ Roast Arena • No sugarcoating allowed' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Visit App')
        .setStyle(ButtonStyle.Link)
        .setURL(validUrl)
        .setEmoji('🌐')
    );

    const postMsg = await showcaseChannel.send({ embeds: [roastEmbed], components: [row] });

    // Spawn dedicated discussion thread
    let thread = null;
    try {
      thread = await postMsg.startThread({
        name: `🔥 Roast: ${appName}`,
        autoArchiveDuration: 1440,
        reason: `Roast discussion for ${appName}`,
      });

      await thread.send(
        `🔥 **Roast thread open for ${appName}!**\n` +
        `<@${interaction.user.id}> wants feedback on **${focus}**.\n` +
        `What is the first thing that looks off or needs work? Let 'em hear it!`
      );
    } catch (threadErr) {
      console.warn('[ROAST ERROR] Failed to spawn thread:', threadErr.message);
    }

    await interaction.reply({
      content:
        `🔥 **Your app roast request has been posted to <#${showcaseChannel.id}>!**\n` +
        (thread ? `Check out the thread: <#${thread.id}>` : ''),
      ephemeral: true,
    });
  },
};
