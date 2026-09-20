const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription("View your or another builder's Vibe Credits and Ship Streak profile")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user whose builder profile you want to view')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    let balance = 0;
    let vibeCredits = 0;
    let currentStreak = 0;
    let totalProjectsSubmitted = 0;

    try {
      const row = db
        .prepare('SELECT balance, vibeCredits, currentStreak, totalProjectsSubmitted FROM users WHERE userId = ?')
        .get(targetUser.id);
      if (row) {
        balance = row.balance || 0;
        vibeCredits = row.vibeCredits || row.balance || 0;
        currentStreak = row.currentStreak || 0;
        totalProjectsSubmitted = row.totalProjectsSubmitted || 0;
      }
    } catch (err) {
      console.error('[ECONOMY DB ERROR] Failed to fetch balance profile:', err);
      return interaction.reply({
        content: '❌ Database error while retrieving builder profile.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`💳 ${targetUser.username}'s Builder Profile`)
      .setColor(0x3498db)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'User', value: `<@${targetUser.id}>`, inline: true },
        { name: '⚡ Vibe Credits', value: `**${vibeCredits.toLocaleString()}** credits`, inline: true },
        { name: '🔥 Ship Streak', value: `**${currentStreak} day${currentStreak === 1 ? '' : 's'}**`, inline: true },
        { name: '🛠️ Shipped Projects', value: `**${totalProjectsSubmitted}**`, inline: true },
        { name: 'Coins', value: `💰 **${balance.toLocaleString()}**`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
