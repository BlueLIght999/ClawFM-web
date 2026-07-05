import {
  coldStartRetrySpeechText,
  coldStartSpeechText,
  shouldAttemptColdStartTts,
  textOnlyColdStartReason,
} from '../../domain/hosting/coldStartSpeechRules.js';

const COLD_START_RETRY_DELAY_MS = 1000;
const TEXT_ONLY_READING_DELAY_MS = 3500;

function queueUpdate(queue) {
  return {
    upcomingSongs: queue.upcomingSongs,
    mode: queue.mode,
  };
}

async function startMusicDirectly({ scheduler, queue }) {
  scheduler.coldStartState = 'done';
  await scheduler.startWithQueue();
  return {
    radioState: scheduler.getState(),
    queueUpdate: queueUpdate(queue),
  };
}

async function handleGeneratedIntro({
  fullText,
  scheduler,
  queue,
  speech,
  ttsAvailability,
  delay,
}) {
  const speechText = coldStartSpeechText(fullText);
  let audioUrl = null;

  if (shouldAttemptColdStartTts(ttsAvailability())) {
    audioUrl = await speech.synthesize(speechText);
    if (!audioUrl) {
      const shorterText = coldStartRetrySpeechText(speechText);
      if (shorterText) {
        await delay(COLD_START_RETRY_DELAY_MS);
        audioUrl = await speech.synthesize(shorterText);
      }
    }
  }

  if (audioUrl) {
    return {
      speechStart: {
        audioUrl,
        text: fullText,
        type: 'cold-start',
      },
    };
  }

  const textOnlyPhase = {
    phase: 'text-only',
    text: fullText,
    reason: textOnlyColdStartReason(speech.health()),
  };
  await delay(TEXT_ONLY_READING_DELAY_MS);
  return {
    textOnlyPhase,
    ...(await startMusicDirectly({ scheduler, queue })),
  };
}

/**
 * Application service for the cold-start intro after text has been generated.
 *
 * It owns TTS retry/fallback and first-song startup, while the socket handler
 * still owns transport events and LLM streaming until the next strangler slice.
 */
export function createColdStartService({
  queue,
  scheduler,
  speech,
  ttsAvailability,
  weather = { current: async () => '' },
  timeOfDay = () => '',
  introWriter = { writeIntro: async () => '' },
  messageId = () => Date.now().toString(),
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  return {
    /**
     * Decide whether a client-ready event may start the cold open.
     *
     * @returns {{shouldStart: boolean, firstSong?: object}} Start decision and prepared first song.
     * @throws Does not throw; missing/invalid queue state is treated as "not ready".
     * Constraint: preserves the legacy order that advances queued music before guard checks.
     */
    beginIfReady() {
      if (!queue.hasCurrent && queue.future?.length > 0) {
        queue.advance();
      }

      if (scheduler.coldStartState !== 'pending' || scheduler.isPlaying
          || scheduler.isAdvancing || scheduler.playhead.currentSong || !queue.hasCurrent) {
        return { shouldStart: false };
      }

      scheduler.coldStartState = 'in-progress';
      return {
        shouldStart: true,
        firstSong: queue.current,
      };
    },

    /**
     * Write the cold-start intro and stream token payloads through callbacks.
     *
     * @param {{firstSong: object, onChunk?: Function, onPhase?: Function}} input First song and transport callbacks.
     * @returns {Promise<{messageId: string, fullText: string, streamEnd: object}>} Stream identity and completed text.
     * @throws Bubbles writer/weather failures so the socket layer can fall back to direct music startup.
     * Constraint: transport-agnostic callbacks keep Socket event names outside the application service.
     */
    async writeIntro({ firstSong, onChunk, onPhase } = {}) {
      const coldMessageId = messageId();
      onPhase?.({ phase: 'writing' });

      const currentWeather = await weather.current();
      const currentTimeOfDay = timeOfDay();
      const fullText = await introWriter.writeIntro({
        firstSong,
        weather: currentWeather,
        timeOfDay: currentTimeOfDay,
        onToken: token => onChunk?.({ messageId: coldMessageId, token }),
      });
      const normalizedText = fullText || '';

      return {
        messageId: coldMessageId,
        fullText: normalizedText,
        streamEnd: {
          messageId: coldMessageId,
          fullText: normalizedText,
        },
      };
    },

    /**
     * Handle a generated cold-open message by either speaking it or falling back to text.
     *
     * @param {{fullText: string}} input Streamed cold-open text.
     * @returns {Promise<object>} Payloads for socket events; no transport side effects.
     * @throws Does not intentionally throw; SpeechSynthPort should return null on failure.
     * Constraint: preserves one retry and text-only startup timing from the legacy handler.
     */
    async handleGeneratedIntro({ fullText }) {
      return handleGeneratedIntro({
        fullText,
        scheduler,
        queue,
        speech,
        ttsAvailability,
        delay,
      });
    },

    /**
     * Start music from the safety timeout only if cold start is still waiting for speech completion.
     *
     * @returns {Promise<object|null>} Radio/queue payloads when music starts, otherwise null.
     * @throws Does not intentionally throw; scheduler failures bubble to the socket error log.
     * Constraint: prevents stale safety timers from restarting music after cold start has ended.
     */
    async startMusicIfStillInProgress() {
      if (scheduler.coldStartState !== 'in-progress') return null;
      return startMusicDirectly({ scheduler, queue });
    },

    startMusicDirectly() {
      return startMusicDirectly({ scheduler, queue });
    },
  };
}
