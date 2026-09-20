const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { syncUserRoles } = require('../../services/levelService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tip')
    .setDescription('Transfer VibePoints to another community member')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member you want to tip')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount of VibePoints to transfer')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const senderId = interaction.user.id;

    // 1. Self-tipping guard
    if (targetUser.id === senderId) {
      return interaction.reply({
        content: '❌ You cannot tip yourself! Pass the vibes along to someone else in the community.',
        ephemeral: true,
      });
    }

    // 2. Bot target guard
    if (targetUser.bot) {
      return interaction.reply({
        content: '❌ You cannot tip bot accounts.',
        ephemeral: true,
      });
    }

    // 3. Positive amount validation
    if (!amount || amount <= 0) {
      return interaction.reply({
        content: '❌ Tip amount must be a positive integer greater than 0.',
        ephemeral: true,
      });
    }

    // 4. Sender balance check
    const senderRow = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(senderId);
    const senderBalance = senderRow?.vibePoints || 0;

    if (senderBalance < amount) {
      return interaction.reply({
        content: `❌ Insufficient balance! You currently have **${senderBalance.toLocaleString()} VP**, but tried to tip **${amount.toLocaleString()} VP**.`,
        ephemeral: true,
      });
    }

    // 5. Execute atomic balance transfer
    let newSenderBalance = 0;
    let newRecipientBalance = 0;

    try {
      db.transaction(() => {
        // Deduct from sender
        db.prepare('UPDATE users SET vibePoints = vibePoints - ? WHERE userId = ?').run(
          amount,
          senderId
        );

        // Add to recipient (and add to weeklyPoints)
        db.prepare(`
          INSERT INTO users (userId, vibePoints, weeklyPoints)
          VALUES (?, ?, ?)
          ON CONFLICT(userId) DO UPDATE SET
            vibePoints = vibePoints + ?,
            weeklyPoints = weeklyPoints + ?
        `).run(targetUser.id, amount, amount, amount, amount);

        const updatedSender = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(senderId);
        const updatedRecipient = db.prepare('SELECT vibePoints FROM users WHERE userId = ?').get(targetUser.id);
        newSenderBalance = updatedSender?.vibePoints || 0;
        newRecipientBalance = updatedRecipient?.vibePoints || 0;
      })();
    } catch (txErr) {
      console.error('[TIP ERROR] Transaction failed:', txErr);
      return interaction.reply({
        content: '❌ A database error occurred while processing your tip. Please try again later.',
        ephemeral: true,
      });
    }

    // 6. Check auto-role updates for recipient
    if (interaction.guild) {
      syncUserRoles(interaction.guild, targetUser.id, newRecipientBalance).catch(() => {});
    }

    const tipEmbed = new EmbedBuilder()
      .setTitle('💸 VibePoints Tip Sent!')
      .setColor(0x9b59b6)
      .setDescription(
        `<@${senderId}> tipped **${amount.toLocaleString()} VibePoints** to <@${targetUser.id}>!`
      )
      .addFields(
        {
          name: 'Sender',
          value: `<@${senderId}>\nRemaining: \`${newSenderBalance.toLocaleString()} VP\``,
          inline: true,
        },
        {
          name: 'Recipient',
          value: `<@${targetUser.id}>\nNew Balance: \`${newRecipientBalance.toLocaleString()} VP\``,
          inline: true,
        },
        {
          name: 'Tip Amount',
          value: `✨ **+${amount.toLocaleString()} VP**`,
          inline: true,
        }
      )
      .setFooter({ text: 'Community Builder Economy • Spread the vibes' })
      .setTimestamp();

    await interaction.reply({ embeds: [tipEmbed] });
  },
};
