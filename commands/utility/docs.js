const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const DOC_SOURCES = {
  nextjs: {
    name: 'Next.js',
    color: 0x000000,
    icon: '⚡',
    homeUrl: 'https://nextjs.org/docs',
    searchUrl: (q) => `https://nextjs.org/docs?search=${encodeURIComponent(q)}`,
  },
  tailwind: {
    name: 'Tailwind CSS',
    color: 0x38bdf8,
    icon: '🎨',
    homeUrl: 'https://tailwindcss.com/docs',
    searchUrl: (q) => `https://tailwindcss.com/docs/${encodeURIComponent(q.toLowerCase().replace(/\s+/g, '-'))}`,
  },
  sqlite: {
    name: 'SQLite',
    color: 0x003b57,
    icon: '🗄️',
    homeUrl: 'https://www.sqlite.org/docs.html',
    searchUrl: (q) => `https://www.sqlite.org/search?q=${encodeURIComponent(q)}`,
  },
  mdn: {
    name: 'MDN Web Docs',
    color: 0x2563eb,
    icon: '🌐',
    homeUrl: 'https://developer.mozilla.org',
    searchUrl: (q) => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}`,
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('docs')
    .setDescription('Quickly lookup official documentation for Next.js, Tailwind, SQLite, or MDN')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('What topic or concept are you searching for?')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('source')
        .setDescription('Filter documentation source (defaults to all sources)')
        .setRequired(false)
        .addChoices(
          { name: 'Next.js', value: 'nextjs' },
          { name: 'Tailwind CSS', value: 'tailwind' },
          { name: 'SQLite', value: 'sqlite' },
          { name: 'MDN Web Docs', value: 'mdn' }
        )
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query').trim();
    const sourceKey = interaction.options.getString('source');

    if (sourceKey && DOC_SOURCES[sourceKey]) {
      const src = DOC_SOURCES[sourceKey];
      const targetUrl = src.searchUrl(query);

      const embed = new EmbedBuilder()
        .setTitle(`${src.icon} ${src.name} Documentation: "${query}"`)
        .setDescription(
          `Direct documentation search results for **${query}** on **${src.name}**.\n\n` +
          `• [Open Official Search Page](${targetUrl})\n` +
          `• [Browse ${src.name} Home Docs](${src.homeUrl})`
        )
        .setColor(src.color)
        .setFooter({ text: 'Rounit HQ Developer Quick Docs' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`Open ${src.name} Search`)
          .setStyle(ButtonStyle.Link)
          .setURL(targetUrl),
        new ButtonBuilder()
          .setLabel('Docs Home')
          .setStyle(ButtonStyle.Link)
          .setURL(src.homeUrl)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // Multi-source overview
    const embed = new EmbedBuilder()
      .setTitle(`📚 Developer Documentation: "${query}"`)
      .setDescription(`Quick links to official documentation for **${query}**:`)
      .setColor(0x5865f2)
      .addFields(
        {
          name: '⚡ Next.js',
          value: `[Next.js Docs for "${query}"](https://www.google.com/search?q=site:nextjs.org/docs+${encodeURIComponent(query)})`,
          inline: true,
        },
        {
          name: '🎨 Tailwind CSS',
          value: `[Tailwind Docs for "${query}"](https://tailwindcss.com/docs/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))})`,
          inline: true,
        },
        {
          name: '🗄️ SQLite',
          value: `[SQLite Search for "${query}"](https://www.sqlite.org/search?q=${encodeURIComponent(query)})`,
          inline: true,
        },
        {
          name: '🌐 MDN Web Docs',
          value: `[MDN Search for "${query}"](https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(query)})`,
          inline: false,
        }
      )
      .setFooter({ text: 'Tip: Specify the "source" option to filter directly to one framework' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Next.js')
        .setStyle(ButtonStyle.Link)
        .setURL('https://nextjs.org/docs'),
      new ButtonBuilder()
        .setLabel('Tailwind')
        .setStyle(ButtonStyle.Link)
        .setURL('https://tailwindcss.com/docs'),
      new ButtonBuilder()
        .setLabel('SQLite')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.sqlite.org/docs.html'),
      new ButtonBuilder()
        .setLabel('MDN')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(query)}`)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
