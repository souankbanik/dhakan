const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

const COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours
const DAILY_REWARD = 100;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward of 100 coins'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const now = Math.floor(Date.now() / 1000);

    // Fetch user economy record
    let user;
    try {
      user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
      if (!user) {
        db.prepare('INSERT INTO users (userId, balance, lastDaily) VALUES (?, 0, 0)').run(userId);
        user = { userId, balance: 0, lastDaily: 0 };
      }
    } catch (err) {
      console.error('[ECONOMY DB ERROR] Failed to fetch user for /daily:', err);
      return interaction.reply({
        content: '❌ Database error while retrieving user balance.',
        ephemeral: true,
      });
    }

    const timePassed = now - user.lastDaily;

    // Check if 24-hour cooldown is still active
    if (timePassed < COOLDOWN_SECONDS) {
      const nextClaim = user.lastDaily + COOLDOWN_SECONDS;
      const cooldownEmbed = new EmbedBuilder()
        .setTitle('⏳ Daily Reward Cooldown')
        .setColor(0xe67e22)
        .setDescription(
          `You have already claimed your daily coins! You can claim again <t:${nextClaim}:R> (<t:${nextClaim}:t>).`
        );

      return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
    }

    // Award daily coins & vibe credits
    const newBalance = (user.balance || 0) + DAILY_REWARD;
    const newCredits = (user.vibeCredits || user.balance || 0) + DAILY_REWARD;
    try {
      db.prepare(`
        UPDATE users 
        SET balance = ?, 
            vibeCredits = ?, 
            lastDaily = ?, 
            lastStreakTimestamp = ? 
        WHERE userId = ?
      `).run(newBalance, newCredits, now, now, userId);
    } catch (err) {
      console.error('[ECONOMY DB ERROR] Failed to update daily reward:', err);
      return interaction.reply({
        content: '❌ Database error while claiming daily coins.',
        ephemeral: true,
      });
    }

    const rewardEmbed = new EmbedBuilder()
      .setTitle('💰 Daily Reward Claimed!')
      .setColor(0x2ecc71)
      .setDescription(`You received **${DAILY_REWARD} coins**!`)
      .addFields(
        { name: 'Previous Balance', value: `\`${user.balance.toLocaleString()} coins\``, inline: true },
        { name: 'New Balance', value: `\`${newBalance.toLocaleString()} coins\``, inline: true },
        { name: 'Next Claim', value: `<t:${now + COOLDOWN_SECONDS}:R>`, inline: false }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [rewardEmbed] });
  },
};
