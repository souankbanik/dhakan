const { Events, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../config');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // 1. Ignore bot messages and direct messages
    if (message.author.bot || !message.guild) return;

    // -------------------------------------------------------------
    // Anti-Spam Link Shield
    // If an account is <7 days old and posts a Discord invite or mentions @everyone/@here:
    // - delete message
    // - timeout user for 1 hour
    // - log alert to #staff-logs
    // -------------------------------------------------------------
    const accountAgeMs = Date.now() - (message.author.createdTimestamp || 0);
    const isYoungAccount = accountAgeMs < 7 * 24 * 60 * 60 * 1000;

    if (isYoungAccount) {
      const rawContent = message.content || '';
      const hasDiscordInvite = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-zA-Z0-9_-]+/i.test(
        rawContent
      );
      const hasMassMention = Boolean(
        message.mentions?.everyone ||
        rawContent.includes('@everyone') ||
        rawContent.includes('@here')
      );

      if (hasDiscordInvite || hasMassMention) {
        const reason =
          hasDiscordInvite && hasMassMention
            ? 'Posted Discord invite and mass mention'
            : hasDiscordInvite
            ? 'Posted Discord invite link'
            : 'Attempted mass mention (@everyone/@here)';

        // 1. Delete message
        if (message.deletable) {
          await message.delete().catch(() => {});
        }

        // 2. Timeout user for 1 hour (3,600,000 ms)
        try {
          if (message.member?.timeout) {
            await message.member.timeout(
              60 * 60 * 1000,
              `Anti-Spam Link Shield: Account <7d (${reason})`
            );
          }
        } catch (timeoutErr) {
          console.warn('[ANTI-SPAM SHIELD] Failed to timeout user:', timeoutErr.message);
        }

        // 3. Log to #staff-logs
        try {
          const staffLogsId =
            config.channels?.staffLogs ||
            process.env.CHANNEL_STAFF_LOGS ||
            config.channels?.videoPipeline;

          let logChannel = staffLogsId
            ? message.guild.channels.cache.get(staffLogsId)
            : null;

          if (!logChannel) {
            const channels = Array.from(message.guild.channels.cache.values());
            logChannel = channels.find(
              (c) =>
                c.isTextBased() &&
                (c.name.toLowerCase().includes('staff-log') ||
                  c.name.toLowerCase().includes('mod-log') ||
                  c.name.toLowerCase().includes('log'))
            );
          }

          if (logChannel && logChannel.isTextBased()) {
            const ageDays = (accountAgeMs / (24 * 60 * 60 * 1000)).toFixed(1);
            const shieldEmbed = new EmbedBuilder()
              .setTitle('🛡️ Anti-Spam Link Shield Triggered')
              .setColor(0xed4245)
              .setDescription(
                'A young account attempted to post restricted content and was automatically timed out.'
              )
              .addFields(
                {
                  name: 'User',
                  value: `<@${message.author.id}> (${message.author.tag || message.author.username})`,
                  inline: true,
                },
                { name: 'Account Age', value: `\`${ageDays} days old\` (< 7 days)`, inline: true },
                { name: 'Action Taken', value: 'Deleted message & **1-hour Timeout**', inline: true },
                { name: 'Trigger Reason', value: `\`${reason}\``, inline: false },
                { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                {
                  name: 'Intercepted Content',
                  value: `\`\`\`${rawContent.slice(0, 1000) || '[No text content]'}\`\`\``,
                  inline: false,
                }
              )
              .setFooter({ text: `User ID: ${message.author.id}` })
              .setTimestamp();

            await logChannel.send({ embeds: [shieldEmbed] });
          }
        } catch (logErr) {
          console.error('[ANTI-SPAM SHIELD] Failed to dispatch staff log:', logErr);
        }

        return; // Halt further processing of this message
      }
    }

    // 2. Fetch guild settings to check for configured counting channel
    let settings;
    try {
      settings = db.prepare('SELECT * FROM guild_settings WHERE guildId = ?').get(message.guild.id);
    } catch (err) {
      console.error('[COUNTING DB ERROR] Failed to query guild_settings:', err);
      return;
    }

    // Ignore if no counting channel is configured or message is in a different channel
    if (!settings?.countingChannel || message.channel.id !== settings.countingChannel) {
      return;
    }

    const content = message.content.trim();

    // 3. If a message is not a valid number, ignore or delete it
    if (!/^\d+$/.test(content)) {
      try {
        if (message.deletable) {
          await message.delete();
        }
      } catch (delErr) {
        // Fallback: ignore message if delete permissions are missing
      }
      return;
    }

    const inputNumber = parseInt(content, 10);
    const currentNumber = settings.countingCurrentNumber || 0;
    const lastUser = settings.countingLastUser;

    // 4. Validate game rules:
    // a) Number must be exactly currentNumber + 1
    // b) Consecutive turns by the same user are forbidden
    const isConsecutiveUser = lastUser === message.author.id;
    const isCorrectNumber = inputNumber === currentNumber + 1;

    if (isConsecutiveUser || !isCorrectNumber) {
      // Failure: reset counter back to 0, react with ❌, and post ruined embed
      try {
        db.prepare(
          'UPDATE guild_settings SET countingCurrentNumber = 0, countingLastUser = NULL WHERE guildId = ?'
        ).run(message.guild.id);

        await message.react('❌').catch(() => {});

        const reason = isConsecutiveUser
          ? 'You cannot count twice in a row!'
          : `Expected **${currentNumber + 1}**, but you sent **${inputNumber}**.`;

        const ruinedEmbed = new EmbedBuilder()
          .setTitle('💥 Count Ruined!')
          .setColor(0xed4245)
          .setDescription(`Count ruined by <@${message.author.id}>! The counter has been reset to 0.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Previous Count', value: `\`${currentNumber}\``, inline: true },
            { name: 'Next Expected Number', value: '`1`', inline: true }
          )
          .setFooter({ text: 'Start over from 1!' })
          .setTimestamp();

        await message.channel.send({ embeds: [ruinedEmbed] });
      } catch (failErr) {
        console.error('[COUNTING ERROR] Failed to reset counter on failure:', failErr);
      }
      return;
    }

    // Success: advance counter and react with ✅
    try {
      db.prepare(
        'UPDATE guild_settings SET countingCurrentNumber = ?, countingLastUser = ? WHERE guildId = ?'
      ).run(inputNumber, message.author.id, message.guild.id);

      await message.react('✅').catch(() => {});
    } catch (successErr) {
      console.error('[COUNTING ERROR] Failed to advance counter:', successErr);
    }
  },
};
