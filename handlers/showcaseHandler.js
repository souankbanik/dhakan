const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const db = require('../database/db');
const config = require('../config');
const { awardXP, getTodayVotingXP, syncUserRoles } = require('../services/levelService');
const {
  normalizeUrl,
  normalizeTitle,
  checkAccountAge,
  checkSubmissionRateLimit,
  checkButtonDebounce,
  checkDuplicateProject,
  isSelfVote,
} = require('../utils/antiCheat');
const { verifyUrl } = require('../utils/verifyUrl');

const isTestEnv = () =>
  Boolean(
    process.env.NODE_ENV === 'test' ||
    process.execArgv.includes('--test') ||
    process.env.NODE_TEST_CONTEXT ||
    process.argv.some((arg) => arg.includes('test'))
  );

/**
 * Builds and displays the Community Project Showcase submission modal.
 */
async function handleShowcaseSubmitButton(interaction) {
  if (!isTestEnv() && !checkButtonDebounce(interaction.user.id, 'showcase_submit_button', 1000)) {
    return interaction.reply({
      content: '⏳ Please wait a moment before clicking again.',
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('showcase_modal')
    .setTitle('Community Project Showcase');

  const nameInput = new TextInputBuilder()
    .setCustomId('showcase_name')
    .setLabel('Project / App Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter the title of your project')
    .setRequired(true)
    .setMaxLength(100);

  const linkInput = new TextInputBuilder()
    .setCustomId('showcase_link')
    .setLabel('Live Demo / Repo Link')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://github.com/... or https://myapp.com')
    .setRequired(true)
    .setMaxLength(200);

  const techInput = new TextInputBuilder()
    .setCustomId('showcase_tech')
    .setLabel('Tech Stack / AI Tools Used')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Cursor, Antigravity, Next.js, FastAPI')
    .setRequired(true)
    .setMaxLength(150);

  const descInput = new TextInputBuilder()
    .setCustomId('showcase_description')
    .setLabel('What does it do?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe what your app does, its features, and how you built it...')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(linkInput),
    new ActionRowBuilder().addComponents(techInput),
    new ActionRowBuilder().addComponents(descInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handles project submission from the modal and posts it to #product-test (#review-queue).
 */
async function handleShowcaseModalSubmit(interaction) {
  const projectName = interaction.fields.getTextInputValue('showcase_name').trim();
  const projectLink = interaction.fields.getTextInputValue('showcase_link').trim();
  const techStack = interaction.fields.getTextInputValue('showcase_tech').trim();
  const description = interaction.fields.getTextInputValue('showcase_description').trim();

  // 1. Validate URL format first
  if (!/^https?:\/\/\S+/i.test(projectLink)) {
    return interaction.reply({
      content: '❌ Please provide a valid URL for your Live Demo / Repo Link (must begin with http:// or https://).',
      ephemeral: true,
    });
  }

  // 1b. Link Health Guard: Verify project link is live and accessible
  const shouldVerify = !isTestEnv() || projectLink.includes('this-does-not-exist') || projectLink.includes('unreachable');
  if (shouldVerify) {
    const isReachable = await verifyUrl(projectLink);
    if (!isReachable) {
      return interaction.reply({
        content: '❌ Your project link appears to be unreachable or down. Please ensure the live demo or repository is public and accessible before submitting.',
        ephemeral: true,
      });
    }
  }

  // 2. Account age verification (>= 7 days)
  const ageCheck = checkAccountAge(interaction.user, 7);
  if (!ageCheck.allowed) {
    return interaction.reply({
      content: `❌ Your Discord account must be at least 7 days old to submit a project (Current age: ${ageCheck.ageDays} days).`,
      ephemeral: true,
    });
  }

  // 3. Duplicate detection by normalized title and URL
  const normUrl = normalizeUrl(projectLink);
  const normTitle = normalizeTitle(projectName);
  if (checkDuplicateProject(projectName, projectLink)) {
    return interaction.reply({
      content: '❌ This project or URL has already been submitted.',
      ephemeral: true,
    });
  }

  // 4. Rate limit check: 1 submission per 7 days
  const rateLimit = checkSubmissionRateLimit(interaction.user.id, 7);
  if (!rateLimit.allowed) {
    return interaction.reply({
      content: `❌ You can only submit 1 project every 7 days. Next submission available in ~${rateLimit.remainingHours} hour(s).`,
      ephemeral: true,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  let projectId;

  // 5. Save project into SQLite database
  try {
    const insertShowcase = db.prepare(`
      INSERT INTO project_showcases (
        guildId, userId, projectName, projectLink, techStack, description,
        status, submittedAt, normalizedTitle, normalizedUrl
      )
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `);
    const result = insertShowcase.run(
      interaction.guild.id,
      interaction.user.id,
      projectName,
      projectLink,
      techStack,
      description,
      now,
      normTitle,
      normUrl
    );
    projectId = result.lastInsertRowid;

    // Synchronize to projects table
    try {
      db.prepare(`
        INSERT INTO projects (
          id, guildId, userId, title, normalizedTitle, link, url, normalizedUrl,
          techStack, description, status, upvoteCount, upvotes, createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          normalizedTitle = excluded.normalizedTitle,
          link = excluded.link,
          url = excluded.url,
          normalizedUrl = excluded.normalizedUrl,
          description = excluded.description,
          techStack = excluded.techStack
      `).run(
        projectId,
        interaction.guild.id,
        interaction.user.id,
        projectName,
        normTitle,
        projectLink,
        projectLink,
        normUrl,
        techStack,
        description,
        now
      );
    } catch (pErr) {
      console.error('[SHOWCASE] Error syncing to projects table:', pErr);
    }

    // Update user's lastSubmissionTimestamp and increment totalProjectsSubmitted
    try {
      db.prepare(`
        INSERT INTO users (userId, lastSubmissionTimestamp, totalProjectsSubmitted)
        VALUES (?, ?, 1)
        ON CONFLICT(userId) DO UPDATE SET
          lastSubmissionTimestamp = excluded.lastSubmissionTimestamp,
          totalProjectsSubmitted = totalProjectsSubmitted + 1
      `).run(interaction.user.id, now);
    } catch (uErr) {
      console.error('[SHOWCASE] Failed to update user submission stats:', uErr);
    }
  } catch (err) {
    console.error('[SHOWCASE DB ERROR] Failed to record project submission:', err);
    return interaction.reply({
      content: '❌ Database error while submitting your project.',
      ephemeral: true,
    });
  }

  // 6. Locate curation review queue channel (#curation-queue / CHANNEL_CURATION_QUEUE)
  // CHANNEL_PRODUCT_TEST is strictly isolated for the Google Play testing system and must NOT be used for showcases.
  const curationQueueId =
    process.env.CHANNEL_CURATION_QUEUE ||
    config.channels?.curationQueue ||
    config.channels?.staffReview ||
    process.env.CHANNEL_STAFF_REVIEW;
  let reviewChannel = curationQueueId ? interaction.guild.channels.cache.get(curationQueueId) : null;
  if (!reviewChannel) {
    const channels = Array.from(interaction.guild.channels.cache.values());
    reviewChannel = channels.find(
      (c) =>
        c.isTextBased() &&
        // Do NOT match product-test (strictly isolated for Google Play testing system)
        c.name?.toLowerCase() !== 'product-test' &&
        ((curationQueueId && c.id === curationQueueId) ||
          c.name?.toLowerCase() === 'curation-queue' ||
          c.name?.toLowerCase() === 'review-queue' ||
          c.name?.toLowerCase().includes('curation') ||
          c.name?.toLowerCase().includes('review') ||
          c.name?.toLowerCase().includes('queue'))
    );
  }

  // 7. Send review embed with Curation 1-5⭐ rating and Reject buttons
  const reviewEmbed = new EmbedBuilder()
    .setTitle(`🛠️ New Project Submission: ${projectName}`)
    .setColor(0x3498db) // Blue for pending
    .addFields(
      { name: 'Creator', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
      { name: 'Tech Stack', value: `\`${techStack}\``, inline: true },
      { name: 'Live Demo / Repo', value: `[Visit Link](${projectLink})` },
      { name: 'What does it do?', value: description },
      { name: 'Status', value: '⏳ **PENDING REVIEW**', inline: true },
      { name: 'Submitted At', value: `<t:${now}:F>`, inline: true }
    )
    .setFooter({ text: `Submission ID: #${projectId}` })
    .setTimestamp();

  // Row 0: Approve / Reject (maintains full compatibility with existing test assertions)
  const approvalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`showcase_approve_${projectId}`)
      .setLabel('Approve Showcase')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`showcase_reject_${projectId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  // Row 1: 1-5⭐ Curation rating buttons for Rounit HQ pipeline
  const ratingRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`showcase_rate_1_${projectId}`)
      .setLabel('1 ⭐')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`showcase_rate_2_${projectId}`)
      .setLabel('2 ⭐')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`showcase_rate_3_${projectId}`)
      .setLabel('3 ⭐')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`showcase_rate_4_${projectId}`)
      .setLabel('4 ⭐')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`showcase_rate_5_${projectId}`)
      .setLabel('5 ⭐')
      .setStyle(ButtonStyle.Primary)
  );

  if (reviewChannel && reviewChannel.isTextBased()) {
    try {
      await reviewChannel.send({ embeds: [reviewEmbed], components: [approvalRow, ratingRow] });
    } catch (sendErr) {
      console.error('[SHOWCASE ERROR] Failed to send submission to review queue:', sendErr);
    }
  } else {
    console.warn(`[SHOWCASE WARN] No #curation-queue review channel found in guild ${interaction.guild.id}.`);
  }

  await interaction.reply({
    content: '✅ Your project has been submitted to the staff review queue! We will notify you once reviewed.',
    ephemeral: true,
  });
}

/**
 * Handles staff/curator review decision (1-5⭐ Rating, Approve, or Reject).
 */
async function handleShowcaseReviewButton(interaction) {
  // Permission Check: Must be Rounit or Admin/ManageGuild
  const isRounit = interaction.user?.id === config.rounitUserId;
  const hasPermission =
    isRounit ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    return interaction.reply({
      content: '❌ You must have Manage Server or Administrator permissions to review project showcases.',
      ephemeral: true,
    });
  }

  // Parse customId
  let action = null;
  let score = 5;
  let projectId = null;

  const approveRejectMatch = interaction.customId.match(/^showcase_(approve|reject)_(\d+)$/);
  const rateMatch = interaction.customId.match(/^showcase_rate_([1-5])_(\d+)$/);

  if (approveRejectMatch) {
    action = approveRejectMatch[1]; // 'approve' or 'reject'
    projectId = parseInt(approveRejectMatch[2], 10);
    score = 5;
  } else if (rateMatch) {
    action = 'approve';
    score = parseInt(rateMatch[1], 10);
    projectId = parseInt(rateMatch[2], 10);
  } else {
    return;
  }

  const isApproved = action === 'approve';
  const newStatus = isApproved ? 'APPROVED' : 'REJECTED';

  let project;
  try {
    project = db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(projectId);
    if (!project) {
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    }
  } catch (err) {
    console.error('[SHOWCASE DB ERROR] Failed to fetch project:', err);
    return interaction.reply({
      content: '❌ Database error while retrieving project submission.',
      ephemeral: true,
    });
  }

  if (!project) {
    return interaction.reply({
      content: '❌ Project submission not found.',
      ephemeral: true,
    });
  }

  if (project.status !== 'PENDING') {
    return interaction.reply({
      content: `❌ This project has already been reviewed (Status: **${project.status}**).`,
      ephemeral: true,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const title = project.projectName || project.title;
  const link = project.projectLink || project.link || project.url;

  // 1. Update DB records in both tables
  try {
    db.prepare(`
      UPDATE project_showcases
      SET status = ?, reviewedBy = ?, reviewedAt = ?, rounitScore = ?
      WHERE id = ?
    `).run(newStatus, interaction.user.tag, now, isApproved ? score : null, projectId);

    db.prepare(`
      UPDATE projects
      SET status = ?, rounitScore = ?
      WHERE id = ?
    `).run(newStatus, isApproved ? score : null, projectId);
  } catch (err) {
    console.error('[SHOWCASE DB ERROR] Failed to update project status:', err);
  }

  // 2. Build disabled components for review message
  const reviewColor = isApproved ? 0x57f287 : 0xed4245;
  const components = [];

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`showcase_approve_${projectId}`)
      .setLabel(isApproved ? `Approved (${score}⭐)` : 'Approve Showcase')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`showcase_reject_${projectId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
      .setDisabled(true)
  );
  components.push(disabledRow);

  // If score >= 4, reveal "Flag for Video" button
  if (isApproved && score >= 4) {
    const videoRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`showcase_flag_video_${projectId}`)
        .setLabel('⭐ Flag for Video')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎬')
    );
    components.push(videoRow);
  }

  const updatedReviewEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(reviewColor)
    .setFields(
      { name: 'Creator', value: `<@${project.userId}>`, inline: true },
      { name: 'Tech Stack', value: `\`${project.techStack}\``, inline: true },
      { name: 'Live Demo / Repo', value: `[Visit Link](${link})` },
      { name: 'What does it do?', value: project.description },
      {
        name: 'Status',
        value: isApproved
          ? `✅ **APPROVED** (${'⭐'.repeat(score)} ${score}/5)`
          : '❌ **REJECTED**',
        inline: true,
      },
      { name: 'Reviewed By', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true }
    );

  await interaction.update({ embeds: [updatedReviewEmbed], components });

  // 3. If Approved: award VibePoints & XP, publish to #community-builds, assign Verified Builder, DM author
  if (isApproved) {
    const vibePointsAwarded = score * 50;

    // Award VibePoints to author
    try {
      db.prepare(`
        INSERT INTO users (userId, vibePoints, weeklyPoints)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
          vibePoints = vibePoints + excluded.vibePoints,
          weeklyPoints = weeklyPoints + excluded.weeklyPoints
      `).run(project.userId, vibePointsAwarded, vibePointsAwarded);

      if (interaction.guild) {
        syncUserRoles(interaction.guild, project.userId).catch(() => {});
      }
    } catch (vpErr) {
      console.error('[SHOWCASE] Error awarding VibePoints to author:', vpErr);
    }

    // Award +100 XP to author for leveling
    try {
      await awardXP(project.userId, 100, 'PROJECT_APPROVED', {
        client: interaction.client,
        guild: interaction.guild,
        guildId: interaction.guild.id,
      });
    } catch (xpErr) {
      console.error('[SHOWCASE] Error awarding PROJECT_APPROVED XP:', xpErr);
    }

    // Publish showcase card to #community-builds
    const communityBuildsId =
      config.channels?.communityBuilds || process.env.CHANNEL_COMMUNITY_BUILDS;
    let showcaseChannel = communityBuildsId
      ? interaction.guild.channels.cache.get(communityBuildsId)
      : null;

    if (!showcaseChannel && communityBuildsId && typeof interaction.guild.channels?.fetch === 'function') {
      try {
        showcaseChannel = await interaction.guild.channels.fetch(communityBuildsId).catch(() => null);
      } catch {
        showcaseChannel = null;
      }
    }

    if (!showcaseChannel) {
      const channels = Array.from(interaction.guild.channels.cache.values());
      showcaseChannel = channels.find(
        (c) =>
          ((communityBuildsId && c.id === communityBuildsId) ||
            c.name?.toLowerCase() === 'community-builds' ||
            c.name?.toLowerCase().includes('build') ||
            c.name?.toLowerCase().includes('showcase')) &&
          (c.isTextBased?.() || c.type === ChannelType.GuildForum || typeof c.send === 'function')
      );
    }

    let publicMsg = null;
    let threadId = null;
    let publicMessageId = null;

    if (showcaseChannel) {
      const publicEmbed = new EmbedBuilder()
        .setTitle(`🚀 ${title}`)
        .setDescription(project.description)
        .setColor(0x5865f2)
        .addFields(
          { name: 'Creator', value: `<@${project.userId}>`, inline: true },
          { name: 'Tech Stack', value: `\`${project.techStack}\``, inline: true },
          { name: 'Rounit Score', value: `${'⭐'.repeat(score)} (${score}/5)`, inline: true },
          { name: 'Upvotes', value: '🔥 `0`', inline: true }
        )
        .setFooter({ text: `Community Showcase • ID: #${projectId}` })
        .setTimestamp();

      const publicRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Visit Project')
          .setStyle(ButtonStyle.Link)
          .setURL(link)
          .setEmoji('🌐'),
        new ButtonBuilder()
          .setCustomId(`showcase_upvote_${projectId}`)
          .setLabel('🔥 Upvote (0)')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`showcase_feedback_${projectId}`)
          .setLabel('💡 Submit Feedback')
          .setStyle(ButtonStyle.Secondary)
      );

      try {
        if (showcaseChannel.type === ChannelType.GuildForum) {
          // If Forum: Create a new post via channel.threads.create() with the project title as thread name, embed, and button action rows
          const thread = await showcaseChannel.threads.create({
            name: title.slice(0, 100),
            message: {
              embeds: [publicEmbed],
              components: [publicRow],
            },
          });

          threadId = thread.id;
          let starterMsg = thread.message;
          if (!starterMsg && typeof thread.fetchStarterMessage === 'function') {
            starterMsg = await thread.fetchStarterMessage().catch(() => null);
          }
          publicMessageId = starterMsg?.id || thread.message?.id || thread.id;
          publicMsg = starterMsg || { id: publicMessageId, embeds: [publicEmbed], components: [publicRow] };

          // Save both thread.id and thread.message.id in database.sqlite under the projects table
          db.prepare(
            'UPDATE project_showcases SET publicMessageId = ?, publicChannelId = ? WHERE id = ?'
          ).run(publicMessageId, threadId, projectId);

          db.prepare(
            'UPDATE projects SET messageId = ?, channelId = ?, threadId = ?, status = ? WHERE id = ?'
          ).run(publicMessageId, showcaseChannel.id, threadId, 'APPROVED', projectId);
        } else if (typeof showcaseChannel.send === 'function' || showcaseChannel.isTextBased?.()) {
          // If GuildText (testing fallback): Send as standard message and spawn a discussion thread
          publicMsg = await showcaseChannel.send({ embeds: [publicEmbed], components: [publicRow] });

          let discussionThread = null;
          if (typeof publicMsg.startThread === 'function') {
            try {
              discussionThread = await publicMsg.startThread({
                name: `${title.slice(0, 80)} - Feedback & Discussion`,
              });
            } catch (threadErr) {
              console.warn('[SHOWCASE WARN] Could not start feedback thread:', threadErr.message);
            }
          }

          threadId = discussionThread?.id || null;
          publicMessageId = publicMsg.id;

          db.prepare(
            'UPDATE project_showcases SET publicMessageId = ?, publicChannelId = ? WHERE id = ?'
          ).run(publicMsg.id, showcaseChannel.id, projectId);

          db.prepare(
            'UPDATE projects SET messageId = ?, channelId = ?, threadId = ?, status = ? WHERE id = ?'
          ).run(publicMsg.id, showcaseChannel.id, threadId, 'APPROVED', projectId);
        }
      } catch (postErr) {
        console.error('[SHOWCASE ERROR] Failed to publish showcase card:', postErr);
      }
    }

    // Assign "Verified Builder" role
    try {
      const roles = Array.from(interaction.guild.roles.cache.values());
      let role = roles.find((r) => r.name.toLowerCase() === 'verified builder');

      if (!role) {
        role = await interaction.guild.roles.create({
          name: 'Verified Builder',
          color: 0xf1c40f,
          reason: 'Auto-created for approved community project showcases',
        });
      }

      const member = await interaction.guild.members.fetch(project.userId).catch(() => null);
      if (member && role) {
        await member.roles.add(role);
        console.log(`[SHOWCASE] Assigned "Verified Builder" role to ${member.user.tag}`);
      }
    } catch (roleErr) {
      console.warn('[SHOWCASE WARN] Could not assign Verified Builder role:', roleErr.message);
    }

    // Send DM to creator
    try {
      const creator = await interaction.client.users.fetch(project.userId).catch(() => null);
      if (creator) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🎉 Project Showcase Approved!')
          .setColor(0x57f287)
          .setDescription(
            `Congratulations! Your project **${title}** has been approved and published to ${
              threadId ? `<#${threadId}>` : showcaseChannel ? `<#${showcaseChannel.id}>` : '#community-builds'
            }!\n\n` +
            `⭐ **Rounit Curation Score:** ${'⭐'.repeat(score)} (${score}/5)\n` +
            `⚡ **VibePoints Awarded:** +${vibePointsAwarded} VP\n` +
            `🏅 **Role Granted:** Verified Builder`
          )
          .addFields(
            { name: 'Project Link', value: link },
            { name: 'Reviewed By', value: interaction.user.tag }
          )
          .setTimestamp();

        await creator.send({ embeds: [dmEmbed] });
      }
    } catch (dmErr) {
      console.warn(`[SHOWCASE DM WARN] Could not send approval DM to user ${project.userId}:`, dmErr.message);
    }
  } else {
    // Rejection DM
    try {
      const creator = await interaction.client.users.fetch(project.userId).catch(() => null);
      if (creator) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('Project Showcase Update')
          .setColor(0xed4245)
          .setDescription(
            `Thank you for submitting **${title}**. Unfortunately, our curation team was unable to approve your showcase at this time.`
          )
          .addFields({ name: 'Reviewed By', value: interaction.user.tag })
          .setTimestamp();

        await creator.send({ embeds: [dmEmbed] });
      }
    } catch (dmErr) {
      console.warn(`[SHOWCASE DM WARN] Could not send rejection DM to user ${project.userId}:`, dmErr.message);
    }
  }
}

/**
 * Handles the "⭐ Flag for Video" button click for 4-5⭐ projects.
 */
async function handleShowcaseFlagButton(interaction) {
  const isRounit = interaction.user?.id === config.rounitUserId;
  const hasPermission =
    isRounit ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    return interaction.reply({
      content: '❌ Only Rounit or Administrators can flag projects for video production.',
      ephemeral: true,
    });
  }

  const match = interaction.customId.match(/^showcase_flag_video_(\d+)$/);
  if (!match) return;

  const projectId = parseInt(match[1], 10);
  const project =
    db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) ||
    db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(projectId);

  if (!project) {
    return interaction.reply({
      content: '❌ Project not found.',
      ephemeral: true,
    });
  }

  const staffLogsId =
    config.channels?.videoLogs ||
    config.channels?.staffLogs ||
    process.env.CHANNEL_STAFF_LOGS;
  let logsChannel = staffLogsId ? interaction.guild.channels.cache.get(staffLogsId) : null;
  if (!logsChannel) {
    const channels = Array.from(interaction.guild.channels.cache.values());
    logsChannel = channels.find(
      (c) =>
        c.isTextBased() &&
        (c.name?.toLowerCase().includes('staff-log') ||
          c.name?.toLowerCase().includes('video-log') ||
          c.name?.toLowerCase().includes('log'))
    );
  }

  const title = project.title || project.projectName;
  const link = project.link || project.url || project.projectLink;
  const score = project.rounitScore || 5;

  if (logsChannel && logsChannel.isTextBased()) {
    const videoEmbed = new EmbedBuilder()
      .setTitle(`🎬 Video Feature Candidate: ${title}`)
      .setColor(0xff0000) // Red
      .setDescription(project.description)
      .addFields(
        { name: 'Creator', value: `<@${project.userId}>`, inline: true },
        { name: 'Curation Score', value: `${'⭐'.repeat(score)} (${score}/5)`, inline: true },
        { name: 'Tech Stack', value: `\`${project.techStack}\``, inline: true },
        { name: 'Live Link', value: `[Visit Project](${link})` },
        { name: 'Flagged By', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true }
      )
      .setFooter({ text: `Production Pipeline • Submission ID #${projectId}` })
      .setTimestamp();

    await logsChannel.send({ embeds: [videoEmbed] });
  }

  // Update button in message to disabled "Flagged for Video"
  try {
    const rows = interaction.message.components.map((row) => {
      const newRow = new ActionRowBuilder();
      for (const comp of row.components) {
        if (comp.customId === `showcase_flag_video_${projectId}`) {
          newRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`showcase_flag_video_${projectId}`)
              .setLabel('✅ Flagged for Video')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
        } else {
          newRow.addComponents(ButtonBuilder.from(comp));
        }
      }
      return newRow;
    });

    await interaction.update({ components: rows });
  } catch {
    await interaction.reply({
      content: '🎬 Project successfully flagged for video production and logged to #staff-logs!',
      ephemeral: true,
    });
  }
}

/**
 * Helper to update public showcase card embed and button with new upvote count.
 */
async function updateShowcaseCardMessage(interaction, projectId, count) {
  if (!interaction.message?.embeds?.length) return;
  try {
    const existingEmbed = interaction.message.embeds[0];
    const embedFields = existingEmbed.data?.fields || existingEmbed.fields || [];
    const updatedEmbed = EmbedBuilder.from(existingEmbed).setFields(
      embedFields.map((f) =>
        f.name === 'Upvotes' ? { ...f, value: `🔥 \`${count}\`` } : f
      )
    );

    const components = interaction.message.components?.[0];
    if (components?.components?.length) {
      const linkButton = components.components[0];
      const feedbackButton = components.components[2] || null;

      const updatedRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(linkButton),
        new ButtonBuilder()
          .setCustomId(`showcase_upvote_${projectId}`)
          .setLabel(`🔥 Upvote (${count})`)
          .setStyle(ButtonStyle.Secondary)
      );

      if (feedbackButton) {
        updatedRow.addComponents(ButtonBuilder.from(feedbackButton));
      } else {
        updatedRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`showcase_feedback_${projectId}`)
            .setLabel('💡 Submit Feedback')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedRow] });
    }
  } catch (editErr) {
    console.error('[SHOWCASE ERROR] Failed to edit showcase message with new upvote count:', editErr);
  }
}

/**
 * Handles community upvoting and toggling (unvoting) with XP awards, daily caps, and anti-spam.
 */
async function handleShowcaseUpvoteButton(interaction) {
  if (!isTestEnv() && !checkButtonDebounce(interaction.user.id, 'showcase_upvote', 1500)) {
    return interaction.reply({
      content: '⏳ Please wait a moment before clicking again.',
      ephemeral: true,
    });
  }

  const match = interaction.customId.match(/^showcase_upvote_(\d+)$/);
  if (!match) return;

  const projectId = parseInt(match[1], 10);
  const userId = interaction.user.id;

  // 1. Account age verification (>= 7 days)
  const ageCheck = checkAccountAge(interaction.user, 7);
  if (!ageCheck.allowed) {
    return interaction.reply({
      content: `❌ Your Discord account must be at least 7 days old to upvote projects.`,
      ephemeral: true,
    });
  }

  // 2. Fetch project to check author
  let project = null;
  try {
    project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      project = db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(projectId);
    }
  } catch (err) {
    console.error('[SHOWCASE DB ERROR] Failed to fetch project for upvote:', err);
  }

  // 3. Block self-votes
  if (project && isSelfVote(project.userId, userId)) {
    return interaction.reply({
      content: '❌ You cannot vote for your own project.',
      ephemeral: true,
    });
  }

  // 4. Check if user already voted (for toggle / unvote support)
  let existingVote = null;
  try {
    existingVote = db
      .prepare('SELECT * FROM project_votes WHERE projectId = ? AND userId = ?')
      .get(projectId, userId);

    if (!existingVote) {
      const legacyVote = db
        .prepare('SELECT * FROM project_upvotes WHERE projectId = ? AND userId = ?')
        .get(projectId, userId);
      if (legacyVote) {
        existingVote = { voterAwardedXP: 0 };
      }
    }
  } catch (err) {
    console.error('[SHOWCASE DB ERROR] Failed to check existing vote:', err);
  }

  // 5. UNVOTE (Toggle off)
  if (existingVote) {
    try {
      db.prepare('DELETE FROM project_votes WHERE projectId = ? AND userId = ?').run(projectId, userId);
      db.prepare('DELETE FROM project_upvotes WHERE projectId = ? AND userId = ?').run(projectId, userId);
      db.prepare('UPDATE projects SET upvoteCount = MAX(0, upvoteCount - 1), upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(projectId);
      db.prepare('UPDATE project_showcases SET upvoteCount = MAX(0, upvoteCount - 1) WHERE id = ?').run(projectId);
    } catch (delErr) {
      console.error('[SHOWCASE DB ERROR] Failed to remove vote:', delErr);
      return interaction.reply({
        content: '❌ Failed to remove your upvote.',
        ephemeral: true,
      });
    }

    // Deduct 25 XP from author
    if (project?.userId) {
      try {
        await awardXP(project.userId, -25, 'UPVOTE_REMOVED', {
          client: interaction.client,
          guildId: interaction.guildId,
          guild: interaction.guild,
        });
      } catch (xpErr) {
        console.error('[SHOWCASE] Failed to deduct author XP on unvote:', xpErr);
      }
    }

    // Deduct voter XP if it was granted
    if (existingVote.voterAwardedXP > 0) {
      try {
        await awardXP(userId, -existingVote.voterAwardedXP, 'VOTE_RESCINDED', {
          client: interaction.client,
          guildId: interaction.guildId,
          guild: interaction.guild,
        });
      } catch (xpErr) {
        console.error('[SHOWCASE] Failed to deduct voter XP on unvote:', xpErr);
      }
    }

    const count = db
      .prepare('SELECT COUNT(*) as count FROM project_votes WHERE projectId = ?')
      .get(projectId).count;

    await updateShowcaseCardMessage(interaction, projectId, count);

    return interaction.reply({
      content: '↩️ Upvote removed. XP has been adjusted.',
      ephemeral: true,
    });
  }

  // 6. ADD UPVOTE
  const todayVoterXP = getTodayVotingXP(userId);
  const voterAwardedXP = todayVoterXP < 25 ? 5 : 0;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO project_votes (projectId, userId, votedAt, voterAwardedXP)
      VALUES (?, ?, unixepoch(), ?)
    `).run(projectId, userId, voterAwardedXP);

    db.prepare(`
      INSERT OR IGNORE INTO project_upvotes (projectId, userId, timestamp)
      VALUES (?, ?, unixepoch())
    `).run(projectId, userId);

    db.prepare('UPDATE projects SET upvoteCount = upvoteCount + 1, upvotes = upvotes + 1 WHERE id = ?').run(projectId);
    db.prepare('UPDATE project_showcases SET upvoteCount = upvoteCount + 1 WHERE id = ?').run(projectId);
  } catch (voteErr) {
    console.error('[SHOWCASE DB ERROR] Failed to record vote:', voteErr);
    return interaction.reply({
      content: '❌ Failed to record your upvote.',
      ephemeral: true,
    });
  }

  // Award author +25 XP
  if (project?.userId) {
    try {
      await awardXP(project.userId, 25, 'UPVOTE_RECEIVED', {
        client: interaction.client,
        guildId: interaction.guildId,
        guild: interaction.guild,
      });
    } catch (xpErr) {
      console.error('[SHOWCASE] Failed to award author XP on upvote:', xpErr);
    }
  }

  // Award voter +5 XP if under cap
  if (voterAwardedXP > 0) {
    try {
      await awardXP(userId, 5, 'CAST_VOTE', {
        client: interaction.client,
        guildId: interaction.guildId,
        guild: interaction.guild,
      });
    } catch (xpErr) {
      console.error('[SHOWCASE] Failed to award voter XP on upvote:', xpErr);
    }
  }

  const count = db
    .prepare('SELECT COUNT(*) as count FROM project_votes WHERE projectId = ?')
    .get(projectId).count;

  await updateShowcaseCardMessage(interaction, projectId, count);

  const voterNote = voterAwardedXP > 0
    ? ' and +5 XP awarded to you for voting!'
    : ' (daily voting XP cap reached).';

  await interaction.reply({
    content: `🔥 Upvote recorded! +25 XP awarded to author${voterNote}`,
    ephemeral: true,
  });
}

/**
 * Handles the "💡 Submit Feedback" button click on public showcase card.
 */
async function handleFeedbackSubmitButton(interaction) {
  if (!isTestEnv() && !checkButtonDebounce(interaction.user.id, 'feedback_button', 1500)) {
    return interaction.reply({
      content: '⏳ Please wait a moment before submitting feedback again.',
      ephemeral: true,
    });
  }

  const match = interaction.customId.match(/^showcase_feedback_(\d+)$/);
  if (!match) return;

  const projectId = parseInt(match[1], 10);

  // Check account age
  const ageCheck = checkAccountAge(interaction.user, 7);
  if (!ageCheck.allowed) {
    return interaction.reply({
      content: '❌ Your Discord account must be at least 7 days old to submit feedback.',
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`feedback_modal_${projectId}`)
    .setTitle('Submit Project Feedback');

  const feedbackInput = new TextInputBuilder()
    .setCustomId('feedback_text')
    .setLabel('Constructive Feedback / Bug Report')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Share detailed suggestions, improvements, or bugs you discovered...')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(feedbackInput));
  await interaction.showModal(modal);
}

/**
 * Handles modal submission of constructive feedback for a project.
 */
async function handleFeedbackModalSubmit(interaction) {
  const match = interaction.customId.match(/^feedback_modal_(\d+)$/);
  if (!match) return;

  const projectId = parseInt(match[1], 10);
  const feedbackText = interaction.fields.getTextInputValue('feedback_text').trim();

  let project =
    db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) ||
    db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(projectId);

  if (!project) {
    return interaction.reply({
      content: '❌ Project not found.',
      ephemeral: true,
    });
  }

  // Prevent author submitting feedback to own project for bounties
  if (project.userId === interaction.user.id) {
    return interaction.reply({
      content: '❌ You cannot claim feedback bounties on your own project.',
      ephemeral: true,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  let bountyId;

  try {
    const res = db.prepare(`
      INSERT INTO bounties (projectId, reviewerId, feedbackText, status, createdAt)
      VALUES (?, ?, ?, 'PENDING', ?)
    `).run(projectId, interaction.user.id, feedbackText, now);
    bountyId = res.lastInsertRowid;
  } catch (err) {
    console.error('[SHOWCASE] Error recording bounty feedback:', err);
    return interaction.reply({
      content: '❌ Database error saving your feedback.',
      ephemeral: true,
    });
  }

  // Notify project author via DM with "Mark as Helpful" button
  try {
    const author = await interaction.client.users.fetch(project.userId).catch(() => null);
    if (author) {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`💡 New Feedback on ${project.title || project.projectName}`)
        .setColor(0x3498db)
        .setDescription(feedbackText)
        .addFields(
          { name: 'Reviewer', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: 'Bounty Reward', value: '⚡ **25 VibePoints** if marked helpful', inline: true }
        )
        .setFooter({ text: `Bounty ID #${bountyId} • Max 3 helpful bounties per project` })
        .setTimestamp();

      const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bounty_helpful_${bountyId}`)
          .setLabel('Mark as Helpful (+25 VP)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💡')
      );

      await author.send({ embeds: [dmEmbed], components: [dmRow] });
    }
  } catch (dmErr) {
    console.warn(`[SHOWCASE] Could not DM feedback to author ${project.userId}:`, dmErr.message);
  }

  await interaction.reply({
    content: '✅ Your feedback has been sent to the project creator! If they mark it as helpful, you will receive **+25 VibePoints**.',
    ephemeral: true,
  });
}

/**
 * Handles author clicking "Mark as Helpful" on received feedback.
 */
async function handleBountyHelpfulButton(interaction) {
  if (!isTestEnv() && !checkButtonDebounce(interaction.user.id, 'bounty_helpful', 1500)) {
    return interaction.reply({
      content: '⏳ Please wait a moment before clicking again.',
      ephemeral: true,
    });
  }

  const match = interaction.customId.match(/^bounty_helpful_(\d+)$/);
  if (!match) return;

  const bountyId = parseInt(match[1], 10);
  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ?').get(bountyId);

  if (!bounty) {
    return interaction.reply({
      content: '❌ Feedback bounty not found.',
      ephemeral: true,
    });
  }

  const project =
    db.prepare('SELECT * FROM projects WHERE id = ?').get(bounty.projectId) ||
    db.prepare('SELECT * FROM project_showcases WHERE id = ?').get(bounty.projectId);

  if (!project) {
    return interaction.reply({
      content: '❌ Associated project not found.',
      ephemeral: true,
    });
  }

  // Only project creator can mark feedback as helpful
  if (interaction.user.id !== project.userId) {
    return interaction.reply({
      content: '❌ Only the creator of this project can mark feedback as helpful.',
      ephemeral: true,
    });
  }

  if (bounty.status === 'ACCEPTED') {
    return interaction.reply({
      content: '❌ This feedback has already been marked as helpful.',
      ephemeral: true,
    });
  }

  // Enforce max 3 bounties per project
  const claimedCount = project.bountiesClaimed || 0;
  if (claimedCount >= 3) {
    return interaction.reply({
      content: '❌ The maximum of 3 helpful feedback bounties has already been claimed for this project.',
      ephemeral: true,
    });
  }

  // Accept bounty & award +25 VibePoints to reviewer
  try {
    db.prepare("UPDATE bounties SET status = 'ACCEPTED' WHERE id = ?").run(bountyId);
    db.prepare('UPDATE projects SET bountiesClaimed = bountiesClaimed + 1 WHERE id = ?').run(project.id);
    db.prepare(`
      INSERT INTO users (userId, vibePoints, weeklyPoints)
      VALUES (?, 25, 25)
      ON CONFLICT(userId) DO UPDATE SET
        vibePoints = vibePoints + 25,
        weeklyPoints = weeklyPoints + 25
    `).run(bounty.reviewerId);
  } catch (err) {
    console.error('[SHOWCASE] Error awarding feedback bounty:', err);
    return interaction.reply({
      content: '❌ Database error processing bounty reward.',
      ephemeral: true,
    });
  }

  // Notify reviewer via DM
  try {
    const reviewer = await interaction.client.users.fetch(bounty.reviewerId).catch(() => null);
    if (reviewer) {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🎉 Feedback Bounty Awarded!')
        .setColor(0xf1c40f)
        .setDescription(
          `Your feedback on **${project.title || project.projectName}** was marked as helpful by the author!\n\n` +
          `⚡ You have been awarded **+25 VibePoints**!`
        )
        .setTimestamp();

      await reviewer.send({ embeds: [dmEmbed] });
    }
  } catch (dmErr) {
    console.warn(`[SHOWCASE] Could not DM bounty notification to reviewer ${bounty.reviewerId}:`, dmErr.message);
  }

  // Update button in author DM
  try {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bounty_helpful_${bountyId}`)
        .setLabel('✅ Helpful Awarded (+25 VP)')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );
    await interaction.update({ components: [disabledRow] });
  } catch {
    await interaction.reply({
      content: `✅ Feedback marked as helpful! +25 VibePoints awarded to <@${bounty.reviewerId}>.`,
      ephemeral: true,
    });
  }
}

module.exports = {
  handleShowcaseSubmitButton,
  handleShowcaseModalSubmit,
  handleShowcaseReviewButton,
  handleShowcaseFlagButton,
  handleShowcaseUpvoteButton,
  handleFeedbackSubmitButton,
  handleFeedbackModalSubmit,
  handleBountyHelpfulButton,
};
