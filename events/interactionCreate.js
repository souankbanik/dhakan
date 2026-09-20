const { Events } = require('discord.js');
const { handleLoaModalSubmit, handleLoaButton } = require('../handlers/loaHandler');
const {
  handlePartnerApplyButton,
  handlePartnerModalSubmit,
  handlePartnerButton,
} = require('../handlers/partnerHandler');
const {
  handleTicketCreateButton,
  handleTicketCloseButton,
  handleTicketConfirmClose,
  handleTicketCancelClose,
} = require('../handlers/ticketHandler');
const {
  handleShowcaseSubmitButton,
  handleShowcaseModalSubmit,
  handleShowcaseReviewButton,
  handleShowcaseFlagButton,
  handleShowcaseUpvoteButton,
  handleFeedbackSubmitButton,
  handleFeedbackModalSubmit,
  handleBountyHelpfulButton,
} = require('../handlers/showcaseHandler');
const {
  handleRulesAcceptButton,
  handleRulesAgreementModal,
} = require('../handlers/onboardingHandler');
const {
  handleSharePromptModalSubmit,
  handlePromptBookmarkButton,
} = require('../handlers/promptHandler');
const {
  handleCollabModalSubmit,
  handleCollabConnectButton,
} = require('../handlers/collabHandler');
const {
  handleFirstDollarModalSubmit,
  handleFirstDollarReviewButton,
} = require('../handlers/firstDollarHandler');
const {
  handleVideoIdeaModalSubmit,
  handleVideoIdeaButton,
} = require('../handlers/videoIdeaHandler');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // 1. Slash Command Interactions
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
          console.warn(`[WARN] No command matching '${interaction.commandName}' was found.`);
          return;
        }

        await command.execute(interaction);
        return;
      }

      // 2. Modal Submission Interactions
      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'loa_modal') {
          await handleLoaModalSubmit(interaction);
          return;
        }

        if (interaction.customId === 'partner_modal') {
          await handlePartnerModalSubmit(interaction);
          return;
        }

        if (interaction.customId === 'showcase_modal') {
          await handleShowcaseModalSubmit(interaction);
          return;
        }

        if (interaction.customId.startsWith('feedback_modal_')) {
          await handleFeedbackModalSubmit(interaction);
          return;
        }

        if (interaction.customId === 'rules_agreement_modal') {
          await handleRulesAgreementModal(interaction);
          return;
        }

        if (interaction.customId === 'share_prompt_modal') {
          await handleSharePromptModalSubmit(interaction);
          return;
        }

        if (interaction.customId === 'collab_modal') {
          await handleCollabModalSubmit(interaction);
          return;
        }

        if (interaction.customId === 'first_dollar_modal') {
          await handleFirstDollarModalSubmit(interaction);
          return;
        }

        if (interaction.customId === 'video_idea_modal') {
          await handleVideoIdeaModalSubmit(interaction);
          return;
        }
      }

      // 3. Button Component Interactions
      if (interaction.isButton()) {
        // Staff LOA review
        if (
          interaction.customId.startsWith('loa_approve_') ||
          interaction.customId.startsWith('loa_decline_')
        ) {
          await handleLoaButton(interaction);
          return;
        }

        // Partner application trigger & review
        if (interaction.customId === 'partner_apply_button') {
          await handlePartnerApplyButton(interaction);
          return;
        }

        if (
          interaction.customId.startsWith('partner_accept_') ||
          interaction.customId.startsWith('partner_decline_')
        ) {
          await handlePartnerButton(interaction);
          return;
        }

        // Support ticket actions
        if (interaction.customId === 'ticket_create_button') {
          await handleTicketCreateButton(interaction);
          return;
        }

        if (interaction.customId === 'ticket_close_button') {
          await handleTicketCloseButton(interaction);
          return;
        }

        if (interaction.customId === 'ticket_confirm_close') {
          await handleTicketConfirmClose(interaction);
          return;
        }

        if (interaction.customId === 'ticket_cancel_close') {
          await handleTicketCancelClose(interaction);
          return;
        }

        // Showcase actions
        if (interaction.customId === 'showcase_submit_button') {
          await handleShowcaseSubmitButton(interaction);
          return;
        }

        if (
          interaction.customId.startsWith('showcase_approve_') ||
          interaction.customId.startsWith('showcase_reject_') ||
          interaction.customId.startsWith('showcase_rate_')
        ) {
          await handleShowcaseReviewButton(interaction);
          return;
        }

        if (interaction.customId.startsWith('showcase_flag_video_')) {
          await handleShowcaseFlagButton(interaction);
          return;
        }

        if (interaction.customId.startsWith('showcase_upvote_')) {
          await handleShowcaseUpvoteButton(interaction);
          return;
        }

        if (interaction.customId.startsWith('showcase_feedback_')) {
          await handleFeedbackSubmitButton(interaction);
          return;
        }

        if (interaction.customId.startsWith('bounty_helpful_')) {
          await handleBountyHelpfulButton(interaction);
          return;
        }

        // Onboarding rules acceptance
        if (interaction.customId === 'rules_accept_button') {
          await handleRulesAcceptButton(interaction);
          return;
        }

        // Community Prompt Library bookmark
        if (interaction.customId.startsWith('prompt_bookmark_')) {
          await handlePromptBookmarkButton(interaction);
          return;
        }

        // Builder Matchmaker connect
        if (interaction.customId.startsWith('collab_connect_')) {
          await handleCollabConnectButton(interaction);
          return;
        }

        // First Dollar review buttons
        if (
          interaction.customId.startsWith('first_dollar_approve_') ||
          interaction.customId.startsWith('first_dollar_reject_')
        ) {
          await handleFirstDollarReviewButton(interaction);
          return;
        }

        // Video Idea review buttons
        if (
          interaction.customId.startsWith('video_idea_accept_') ||
          interaction.customId.startsWith('video_idea_decline_')
        ) {
          await handleVideoIdeaButton(interaction);
          return;
        }
      }
    } catch (error) {
      console.error('[ERROR] Error processing interaction:', error);

      // If interaction already expired on Discord gateway side (3s timeout / Unknown interaction), skip reply
      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      const errorMessage = {
        content: 'There was an error while processing this interaction!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => null);
      } else {
        await interaction.reply(errorMessage).catch(() => null);
      }
    }
  },
};
