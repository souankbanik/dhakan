const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prompts')
    .setDescription('Search the top-rated community prompts by tool or keyword')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('Keyword or tool (e.g. Cursor, v0, React, Claude)')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply();
    }

    const query = interaction.options.getString('query').trim();
    const searchPattern = `%${query}%`;

    let results = [];
    try {
      results = db
        .prepare(`
          SELECT * FROM prompts
          WHERE title LIKE ? OR category LIKE ? OR content LIKE ?
          ORDER BY bookmarks DESC, id DESC
          LIMIT 3
        `)
        .all(searchPattern, searchPattern, searchPattern);
    } catch (err) {
      console.error('[PROMPTS SEARCH ERROR]:', err);
    }

    if (!results || results.length === 0) {
      const emptyMsg = `🔍 No prompts found matching **"${query}"**. Use \`/share-prompt\` to submit one!`;
      if (interaction.deferred) {
        return interaction.editReply({ content: emptyMsg });
      }
      return interaction.reply({ content: emptyMsg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`💡 Community Prompts Matching: "${query}"`)
      .setColor(0x5865f2)
      .setDescription(`Found **${results.length}** top-rated prompt(s) in the library:`)
      .setTimestamp();

    results.forEach((p, idx) => {
      const snippet = p.content.length > 250 ? p.content.slice(0, 247) + '...' : p.content;
      embed.addFields({
        name: `${idx + 1}. ⭐ [${p.bookmarks}] ${p.title} (${p.category})`,
        value: `**Author**: <@${p.userId}>\n\`\`\`markdown\n${snippet}\n\`\`\``,
        inline: false,
      });
    });

    embed.setFooter({ text: 'Use /share-prompt to contribute to the library' });

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed] });
    }
    return interaction.reply({ embeds: [embed] });
  },
};
