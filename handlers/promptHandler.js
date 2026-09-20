const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database/db');
const config = require('../config');

/**
 * Handles submission of the /share-prompt modal.
 */
async function handleSharePromptModalSubmit(interaction) {
  const title = interaction.fields.getTextInputValue('prompt_title').trim();
  const category = interaction.fields.getTextInputValue('prompt_category').trim();
  const content = interaction.fields.getTextInputValue('prompt_content').trim();

  if (!title || !category || !content) {
    return interaction.reply({
      content: '❌ All fields are required to share a prompt.',
      ephemeral: true,
    });
  }

  const now = Math.floor(Date.now() / 1000);

  let promptId;
  try {
    const result = db
      .prepare(`
        INSERT INTO prompts (userId, title, category, content, bookmarks, createdAt)
        VALUES (?, ?, ?, ?, 0, ?)
      `)
      .run(interaction.user.id, title, category, content, now);

    promptId = result.lastInsertRowid;
  } catch (err) {
    console.error('[PROMPT DB ERROR] Failed to save prompt:', err);
    return interaction.reply({
      content: '❌ Database error saving prompt.',
      ephemeral: true,
    });
  }

  // Resolve #bot-commands channel
  const targetChannelId =
    config.channels?.botCommands || process.env.CHANNEL_BOT_COMMANDS;
  let targetChannel = targetChannelId
    ? interaction.guild?.channels.cache.get(targetChannelId)
    : null;

  if (!targetChannel && interaction.guild?.channels?.cache) {
    const channels = Array.from(interaction.guild.channels.cache.values());
    targetChannel = channels.find(
      (c) =>
        c.isTextBased() &&
        (c.name?.toLowerCase().includes('bot-command') ||
          c.name?.toLowerCase().includes('command') ||
          c.name?.toLowerCase().includes('general'))
    );
  }

  if (!targetChannel) {
    targetChannel = interaction.channel;
  }

  const embed = new EmbedBuilder()
    .setTitle(`💡 Community Prompt: ${title}`)
    .setColor(0x5865f2)
    .setDescription(
      `**Tool / Category**: \`${category}\`\n` +
      `**Submitted By**: <@${interaction.user.id}>\n\n` +
      `\`\`\`markdown\n${content.slice(0, 3900)}\n\`\`\``
    )
    .setFooter({ text: `Prompt #${promptId} • Click Bookmark to save & reward author` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prompt_bookmark_${promptId}`)
      .setLabel('⭐ Bookmark (0)')
      .setStyle(ButtonStyle.Secondary)
  );

  try {
    await targetChannel.send({ embeds: [embed], components: [row] });
  } catch (sendErr) {
    console.error('[PROMPT SEND ERROR] Failed to dispatch prompt card:', sendErr);
  }

  return interaction.reply({
    content: `✅ Your prompt **"${title}"** has been shared in ${
      targetChannel ? `<#${targetChannel.id}>` : '#bot-commands'
    }!`,
    ephemeral: true,
  });
}

/**
 * Handles the "⭐ Bookmark" button click on prompt cards.
 */
async function handlePromptBookmarkButton(interaction) {
  const match = interaction.customId.match(/^prompt_bookmark_(\d+)$/);
  if (!match) return;

  const promptId = parseInt(match[1], 10);
  const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(promptId);

  if (!prompt) {
    return interaction.reply({
      content: '❌ Prompt not found in database.',
      ephemeral: true,
    });
  }

  // Prevent self-bookmarking
  if (prompt.userId === interaction.user.id) {
    return interaction.reply({
      content: '❌ You cannot bookmark your own prompt.',
      ephemeral: true,
    });
  }

  // Check duplicate bookmark
  const existingBm = db
    .prepare('SELECT * FROM prompt_bookmarks WHERE promptId = ? AND userId = ?')
    .get(promptId, interaction.user.id);

  if (existingBm) {
    return interaction.reply({
      content: '⭐ You have already bookmarked this prompt!',
      ephemeral: true,
    });
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    // Record bookmark
    db.prepare('INSERT INTO prompt_bookmarks (promptId, userId, createdAt) VALUES (?, ?, ?)').run(
      promptId,
      interaction.user.id,
      now
    );

    // Increment bookmarks count
    db.prepare('UPDATE prompts SET bookmarks = bookmarks + 1 WHERE id = ?').run(promptId);

    // Award author +15 VibePoints
    db.prepare(`
      INSERT INTO users (userId, vibePoints, weeklyPoints)
      VALUES (?, 15, 15)
      ON CONFLICT(userId) DO UPDATE SET
        vibePoints = vibePoints + 15,
        weeklyPoints = weeklyPoints + 15
    `).run(prompt.userId);
  } catch (dbErr) {
    console.error('[PROMPT BOOKMARK DB ERROR]:', dbErr);
    return interaction.reply({
      content: '❌ Database error recording bookmark.',
      ephemeral: true,
    });
  }

  const updatedPrompt = db.prepare('SELECT bookmarks FROM prompts WHERE id = ?').get(promptId);
  const newCount = updatedPrompt ? updatedPrompt.bookmarks : prompt.bookmarks + 1;

  // Update button on message
  const updatedRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prompt_bookmark_${promptId}`)
      .setLabel(`⭐ Bookmark (${newCount})`)
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ components: [updatedRow] }).catch(() => null);

  return interaction.followUp({
    content: `⭐ You bookmarked **"${prompt.title}"**! The author (<@${prompt.userId}>) was awarded **+15 VibePoints**.`,
    ephemeral: true,
  });
}

module.exports = {
  handleSharePromptModalSubmit,
  handlePromptBookmarkButton,
};
