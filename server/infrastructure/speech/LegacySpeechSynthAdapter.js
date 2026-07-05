import { generateSpeech, getTtsStatus } from '../../services/tts.js';

/**
 * Wraps the legacy TTS module behind SpeechSynthPort.
 *
 * @param {{generateSpeech: (text: string) => Promise<string|null>, getTtsStatus: () => object}=} legacy
 */
export function createLegacySpeechSynthAdapter(legacy = { generateSpeech, getTtsStatus }) {
  return {
    async synthesize(text) {
      try {
        return await legacy.generateSpeech(text);
      } catch {
        return null;
      }
    },
    health() {
      const status = legacy.getTtsStatus();
      return {
        available: status.available ?? null,
        provider: status.provider ?? null,
        reason: status.reason || '',
      };
    },
  };
}

export const legacySpeechSynthAdapter = createLegacySpeechSynthAdapter();
