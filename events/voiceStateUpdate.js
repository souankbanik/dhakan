const fs = require('node:fs');
const path = require('node:path');
const { Events } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  entersState,
} = require('@discordjs/voice');
const config = require('../config');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    // 1. Ignore bots and ensure member exists
    if (!newState.member || newState.member.user.bot) return;

    // 2. Ignore mute, deafen, stream, and other non-channel-switch updates
    if (oldState.channelId === newState.channelId) return;

    // 3. User left voice entirely
    if (!newState.channelId) return;

    // 4. Determine if the joined channel is a designated coworking/welcome channel:
    // Explicitly listens to config.channels.coworkingVoice,
    // with guild_settings.welcomeVoiceChannel / config.channels.welcomeVc fallback,
    // or if channel name contains "Coworking" or "Welcome VC" (case-insensitive).
    const joinedChannel = newState.channel;
    const isWelcomeByName = joinedChannel?.name && (
      joinedChannel.name.toLowerCase().includes('coworking') ||
      joinedChannel.name.toLowerCase().includes('welcome vc')
    );

    let targetChannelId = config.channels?.coworkingVoice || process.env.CHANNEL_COWORKING_VOICE;

    if (!targetChannelId) {
      try {
        const db = newState.client.db;
        if (db) {
          const row = db
            .prepare('SELECT welcomeVoiceChannel FROM guild_settings WHERE guildId = ?')
            .get(newState.guild.id);
          targetChannelId = row?.welcomeVoiceChannel;
        }
      } catch (dbErr) {
        console.error('[VOICE DB ERROR] Failed to query guild_settings:', dbErr);
      }
    }

    if (!targetChannelId) {
      targetChannelId =
        config.channels?.welcomeVc ||
        process.env.CHANNEL_WELCOME_VC ||
        process.env.WELCOME_CHANNEL_ID ||
        process.env.CHANNEL_ID;
    }

    const isWelcomeById =
      (config.channels?.coworkingVoice && newState.channelId === config.channels.coworkingVoice) ||
      (targetChannelId && newState.channelId === targetChannelId);

    // Ignore if not a designated coworking/welcome channel
    if (!isWelcomeByName && !isWelcomeById) {
      return;
    }

    // 5. Verify audio file existence before connecting (welcome.mp3 with welcome.wav fallback)
    let audioPath = path.resolve(__dirname, '../assets/welcome.mp3');
    if (!fs.existsSync(audioPath)) {
      const wavPath = path.resolve(__dirname, '../assets/welcome.wav');
      if (fs.existsSync(wavPath)) {
        audioPath = wavPath;
      } else {
        console.warn(`[VOICE WARN] Welcome audio file not found at: "${audioPath}". Skipping voice welcoming.`);
        return;
      }
    }

    console.log(
      `[VOICE] Non-bot user ${newState.member.user.tag} joined target channel "${joinedChannel?.name || newState.channelId}". Initiating welcome audio.`
    );

    let connection;
    let safetyTimeout = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
      }

      try {
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      } catch (destroyErr) {
        console.error('[VOICE ERROR] Failed to cleanly destroy voice connection:', destroyErr);
      }

      console.log(`[VOICE] Voice connection cleaned up for guild ${newState.guild.id}.`);
    };

    try {
      // 6. Join user's voice channel
      connection = joinVoiceChannel({
        channelId: newState.channelId,
        guildId: newState.guild.id,
        adapterCreator: newState.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      connection.on('stateChange', (oldState, newState) => {
        console.log(`[VOICE STATE] Connection transitioned from ${oldState.status} to ${newState.status}`);
      });

      // 7. Create AudioPlayer and AudioResource
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
        },
      });
      const resource = createAudioResource(audioPath, {
        inlineVolume: true,
      });
      resource.volume?.setVolume(1.0);

      player.on('stateChange', (oldState, newState) => {
        console.log(`[PLAYER STATE] Player transitioned from ${oldState.status} to ${newState.status}`);
      });

      // Handle connection errors and unexpected disconnects
      connection.on('error', (connErr) => {
        console.error('[VOICE CONNECTION ERROR]', connErr);
        cleanup();
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        cleanup();
      });

      // Handle player events
      player.on(AudioPlayerStatus.Idle, () => {
        console.log('[VOICE] Playback complete. Exiting channel in 1s.');
        setTimeout(cleanup, 1000);
      });

      player.on('error', (playerErr) => {
        console.error('[VOICE PLAYER ERROR]', playerErr.message);
        cleanup();
      });

      // Subscribe connection to player
      connection.subscribe(player);

      // Wait until connection is Ready before transmitting audio
      try {
        if (typeof entersState === 'function') {
          await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
        }
      } catch (stateErr) {
        console.warn('[VOICE WARN] Connection ready state wait timed out, continuing:', stateErr.message);
      }

      // Small 300ms buffer so user client establishes RTP stream
      await new Promise((resolve) => setTimeout(resolve, 300));

      console.log('[VOICE] Starting welcome audio playback.');
      player.play(resource);

      // 8. 30-second safety timeout
      safetyTimeout = setTimeout(() => {
        console.log('[VOICE] 30-second safety timeout expired. Disconnecting.');
        cleanup();
      }, 30000);
    } catch (err) {
      console.error('[VOICE ERROR] Failed to initialize voice welcome playback:', err);
      cleanup();
    }
  },
};
