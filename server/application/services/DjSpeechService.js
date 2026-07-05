import { cleanTtsText } from '../../domain/hosting/cleanTtsText.js';
import {
  estimatedSpeechDurationSeconds,
  refillNoTtsDelayMs,
  shouldDropStaleSpeech,
  transitionNoTtsDelayMs,
} from '../../domain/hosting/djSpeechRules.js';

function queueUpdate(queueStore) {
  return {
    upcomingSongs: queueStore.upcomingSongs,
    mode: queueStore.mode,
  };
}

function completedSpeech(scheduler, payload = {}) {
  scheduler.speechComplete();
  return {
    speechHandled: true,
    completed: true,
    ...payload,
  };
}

function staleSpeech(payload) {
  return {
    stale: true,
    speechHandled: false,
    ...payload,
  };
}

function waitForClientSpeech({ scheduler, speechText, audioUrl, text, type, payload = {} }) {
  scheduler.speechGenerationDone(estimatedSpeechDurationSeconds(speechText));
  return {
    speechHandled: true,
    waitForClient: true,
    resetLastSpeechTime: true,
    ...payload,
    speechStart: {
      audioUrl,
      text,
      ...(type ? { type } : {}),
    },
  };
}

async function handleTransitionSpeech({
  prevSong,
  nextSong,
  transitionId,
  scheduler,
  transitionWriter,
  weather,
  timeOfDay,
  promptBuilder,
  speech,
  ttsAvailability,
  delay,
}) {
  const currentWeather = await weather.current();
  const currentTimeOfDay = timeOfDay();
  const contextPrompt = promptBuilder({ environment: { weather: currentWeather } });
  const transition = await transitionWriter.writeTransition({
    prevSong,
    nextSong,
    timeOfDay: currentTimeOfDay,
    contextPrompt,
  });

  if (!transition?.say) return completedSpeech(scheduler);

  const djMessage = { text: transition.say };
  const speechText = cleanTtsText(transition.say);
  const audioUrl = ttsAvailability() === false ? null : await speech.synthesize(speechText);

  if (!audioUrl) {
    await delay(transitionNoTtsDelayMs());
    return completedSpeech(scheduler, { djMessage });
  }

  if (shouldDropStaleSpeech({
    expectedTransitionId: transitionId,
    currentTransitionId: scheduler._transitionId,
    isPlaying: scheduler.isPlaying,
  })) {
    return staleSpeech({ djMessage });
  }

  return waitForClientSpeech({
    scheduler,
    speechText,
    audioUrl,
    text: transition.say,
    payload: { djMessage },
  });
}

async function writeRefillAnnouncement({ queueStore, refillWriter, weather, timeOfDay }) {
  const currentWeather = await weather.current();
  return refillWriter.writeRefill({
    upcomingSongs: queueStore.upcomingSongs.slice(0, 3),
    weather: currentWeather,
    timeOfDay: timeOfDay(),
  });
}

async function handleRefillSpeech({
  transitionId,
  planBlocks,
  scheduler,
  recommender,
  queueStore,
  refillWriter,
  weather,
  timeOfDay,
  speech,
  ttsAvailability,
  delay,
}) {
  const newSongs = await recommender.fillQueue(15, planBlocks);
  if (newSongs.length === 0) return { speechHandled: false };

  const update = queueUpdate(queueStore);
  const nextSong = queueStore.peek();
  if (!nextSong) return completedSpeech(scheduler, { queueUpdate: update });

  const refill = await writeRefillAnnouncement({ queueStore, refillWriter, weather, timeOfDay });
  if (!refill?.say) return completedSpeech(scheduler, { queueUpdate: update });

  const djMessage = { text: refill.say };
  const speechText = cleanTtsText(refill.say);
  const audioUrl = ttsAvailability() === false ? null : await speech.synthesize(speechText);

  if (!audioUrl) {
    await delay(refillNoTtsDelayMs());
    return completedSpeech(scheduler, { queueUpdate: update, djMessage });
  }

  if (shouldDropStaleSpeech({
    expectedTransitionId: transitionId,
    currentTransitionId: scheduler._transitionId,
    isPlaying: scheduler.isPlaying,
  })) {
    return staleSpeech({ queueUpdate: update, djMessage });
  }

  return waitForClientSpeech({
    scheduler,
    speechText,
    audioUrl,
    text: refill.say,
    type: 'refill',
    payload: { queueUpdate: update, djMessage },
  });
}

/**
 * Application service for DJ transition speech orchestration.
 *
 * It owns transition script generation, TTS fallback, and scheduler speech
 * state changes while leaving Socket event names to the handler.
 */
export function createDjSpeechService({
  scheduler,
  recommender,
  queueStore,
  transitionWriter,
  refillWriter,
  weather,
  timeOfDay,
  promptBuilder,
  speech,
  ttsAvailability,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  return {
    /**
     * Generate and optionally synthesize normal between-song transition speech.
     *
     * @param {{prevSong: object, nextSong: object, transitionId: string}} input Transition context.
     * @returns {Promise<object>} Message/speech payloads and scheduler handling flags.
     * @throws Bubbles weather/writer/speech failures so scheduler callback can complete safely.
     * Constraint: handles only the regular transition path; refill speech remains a separate slice.
     */
    async handleTransitionSpeech({ prevSong, nextSong, transitionId }) {
      return handleTransitionSpeech({
        prevSong,
        nextSong,
        transitionId,
        scheduler,
        transitionWriter,
        weather,
        timeOfDay,
        promptBuilder,
        speech,
        ttsAvailability,
        delay,
      });
    },

    /**
     * Refill an exhausted queue and generate the DJ refill announcement.
     *
     * @param {{transitionId: string, planBlocks: Array<object>|null}} input Refill context.
     * @returns {Promise<object>} Queue update, DJ message, speech payloads, and scheduler handling flags.
     * @throws Bubbles dependency failures so the scheduler callback can complete safely.
     * Constraint: preserves legacy Socket payload shape while moving refill orchestration out of the handler.
     */
    async handleRefillSpeech({ transitionId, planBlocks }) {
      return handleRefillSpeech({
        transitionId,
        planBlocks,
        scheduler,
        recommender,
        queueStore,
        refillWriter,
        weather,
        timeOfDay,
        speech,
        ttsAvailability,
        delay,
      });
    },
  };
}
