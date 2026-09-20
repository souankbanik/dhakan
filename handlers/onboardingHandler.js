const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');

/**
 * Handle "Accept & Join Server" button click.
 * Displays the rules confirmation modal.
 */
async function handleRulesAcceptButton(interaction) {
  // Check if member already possesses the Member role
  const existingRoles = interaction.member?.roles?.cache
    ? Array.from(interaction.member.roles.cache.values())
    : [];
  const hasMemberRole = existingRoles.some(
    (r) =>
      r.name.toLowerCase() === 'member' ||
      (process.env.MEMBER_ROLE_ID && r.id === process.env.MEMBER_ROLE_ID)
  );

  if (hasMemberRole) {
    return interaction.reply({
      content: '✅ You have already agreed to the rules and hold the **@Member** role!',
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('rules_agreement_modal')
    .setTitle('Community Rules Agreement');

  // Discord TextInput label has a strict 45-character limit
  const agreementInput = new TextInputBuilder()
    .setCustomId('rules_agreement_confirm')
    .setLabel('Agree to AI building & community rules?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Type 'I agree' to confirm AI building, respecting projects, and zero spam.")
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(100);

  const row = new ActionRowBuilder().addComponents(agreementInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Handle submission of the rules agreement modal.
 * Validates affirmation, assigns @Member role, persists onboarding to DB, and DMs starter links.
 */
async function handleRulesAgreementModal(interaction) {
  const confirmation = interaction.fields.getTextInputValue('rules_agreement_confirm').trim().toLowerCase();

  // Validate agreement (must not be negative and should contain an affirmative token)
  const isNegative = ['no', 'disagree', 'never', 'refuse', 'decline'].includes(confirmation);
  const isAffirmative =
    ['agree', 'i agree', 'yes', 'y', 'accept', 'i accept', 'confirm', 'sure'].includes(confirmation) ||
    confirmation.includes('agree') ||
    confirmation.includes('accept');

  if (isNegative || !isAffirmative) {
    return interaction.reply({
      content:
        '❌ You must agree to the community guidelines (focus on AI building, respect member projects, no spam) to join the server.',
      ephemeral: true,
    });
  }

  // 1. Locate or create @Member role
  let memberRole = null;
  if (interaction.guild?.roles) {
    const roles = Array.from(interaction.guild.roles.cache.values());
    memberRole = roles.find(
      (r) =>
        r.name.toLowerCase() === 'member' ||
        (process.env.MEMBER_ROLE_ID && r.id === process.env.MEMBER_ROLE_ID)
    );

    if (!memberRole && interaction.guild.roles.create) {
      try {
        memberRole = await interaction.guild.roles.create({
          name: 'Member',
          color: 0x3498db,
          reason: 'Auto-created Member role for onboarding verification',
        });
      } catch (roleCreateErr) {
        console.error('[ONBOARDING] Failed to auto-create @Member role:', roleCreateErr);
      }
    }
  }

  // 2. Assign role to user
  if (memberRole && interaction.member?.roles?.add) {
    try {
      await interaction.member.roles.add(memberRole);
      console.log(`[ONBOARDING] Assigned @Member role to ${interaction.user.tag} (${interaction.user.id}).`);
    } catch (roleAssignErr) {
      console.error(`[ONBOARDING] Failed to assign role to ${interaction.user.tag}:`, roleAssignErr);
    }
  }

  // 3. Persist onboarding record in SQLite
  const db = interaction.client.db;
  if (db) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO member_onboarding (userId, guildId, agreedRules, timestamp)
        VALUES (?, ?, 1, unixepoch())
      `).run(interaction.user.id, interaction.guild.id);
    } catch (dbErr) {
      console.error('[ONBOARDING DB ERROR] Failed to record member onboarding:', dbErr);
    }
  }

  // 4. Send direct message with YouTube channel and resource hubs
  const youtubeUrl = process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@rounieee';
  let dmDelivered = true;

  const dmEmbed = new EmbedBuilder()
    .setTitle("🚀 Welcome to Rounit's Community!")
    .setDescription(
      `Hey <@${interaction.user.id}>! You've verified your membership in **${interaction.guild.name}**.\n\n` +
      `Here is your starter guide to hit the ground running:`
    )
    .setColor(0x57f287)
    .addFields(
      {
        name: '📺 Rounit\'s YouTube Channel',
        value: `Check out hands-on builds, AI agents, and development walkthroughs:\n👉 **[Watch & Subscribe on YouTube](${youtubeUrl})**`,
      },
      {
        name: '🛠️ Community Project Showcase',
        value: 'Submit what you are building via `/showcase` and upvote community work in `#community-builds`!',
      },
      {
        name: '📢 Announcements & Drops',
        value: 'Stay updated with new video notifications, community events, and code releases in `#announcements`.',
      },
      {
        name: '📜 Guidelines',
        value: 'Keep discussions focused on AI building, respect your fellow developers, and enjoy the journey!',
      }
    )
    .setFooter({ text: "Stop typing, start building." })
    .setTimestamp();

  try {
    await interaction.user.send({ embeds: [dmEmbed] });
  } catch (dmErr) {
    console.warn(`[ONBOARDING] Could not DM user ${interaction.user.tag} (DMs might be disabled).`);
    dmDelivered = false;
  }

  // 5. Reply ephemerally to the interaction
  if (dmDelivered) {
    await interaction.reply({
      content:
        '🎉 **Welcome aboard!** You have accepted the guidelines and received the **@Member** role.\n' +
        `📬 We just sent you a DM with direct links to Rounit's YouTube channel and community hubs!`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content:
        '🎉 **Welcome aboard!** You have accepted the guidelines and received the **@Member** role.\n\n' +
        `*(Note: Your DMs are private or closed, so here are your starter resources!)*\n` +
        `▶️ **YouTube Channel**: ${youtubeUrl}\n` +
        `🛠️ **Showcase**: Explore and submit creations in \`#community-builds\` using \`/showcase\`!`,
      ephemeral: true,
    });
  }
}

module.exports = {
  handleRulesAcceptButton,
  handleRulesAgreementModal,
};
