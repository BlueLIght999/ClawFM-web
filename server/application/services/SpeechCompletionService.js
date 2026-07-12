import {
  classifySpeechCompletion,
} from '../../domain/playback/speechCompletionRules.js';

/**
 * Create the application seam for `dj-speech-finished` socket events.
 *
 * When the frontend signals that DJ speech audio has finished playing,
 * this service decides the playback action and returns socket-ready
 * payloads.  The handler is responsible for emitting them.
 *
 * @param {{scheduler: object, queue: object}} deps
 *   scheduler must expose: coldStartState (setter), startWithQueue(),
 *     speechComplete(), getState().
 *   queue must expose: upcomingSongs, mode.
 * @returns {{handleSpeechFinished(data: {type?: string} | null): Promise<object>}}
 */
export function createSpeechCompletionService({ scheduler, queue }) {
  return {
    async handleSpeechFinished(data) {
      const action = classifySpeechCompletion(data?.type);

      const base = {
        speechEnd: true,
        crabAnimation: { state: 'idle' },
      };

      if (action === 'no-op') {
        return base;
      }

      if (action === 'cold-start') {
        scheduler.coldStartState = 'done';
        await scheduler.startWithQueue();
        return {
          ...base,
          radioState: scheduler.getState(),
          queueUpdate: { upcomingSongs: queue.upcomingSongs, mode: queue.mode },
        };
      }

      // normal
      scheduler.speechComplete();
      return {
        ...base,
        radioState: scheduler.getState(),
        queueUpdate: { upcomingSongs: queue.upcomingSongs, mode: queue.mode },
      };
    },
  };
}
