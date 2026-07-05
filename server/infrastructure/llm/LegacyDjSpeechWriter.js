import { generateRefillSpeech, generateTransition } from '../../services/claude.js';

/**
 * Adapter that keeps legacy DJ speech generation behind DjSpeechService.
 */
export const legacyDjSpeechWriter = {
  /**
   * Generate a between-song transition script with the legacy Claude service.
   *
   * @param {{prevSong: object, nextSong: object, timeOfDay: string, contextPrompt: string}} input Transition context.
   * @returns {Promise<object|null>} Legacy transition result, usually { say }.
   * @throws Bubbles legacy LLM failures.
   * Constraint: keeps prompt construction outside this adapter for easier service testing.
   */
  writeTransition({ prevSong, nextSong, timeOfDay, contextPrompt }) {
    return generateTransition(prevSong, nextSong, timeOfDay, contextPrompt);
  },

  /**
   * Generate a queue-refill announcement with the legacy Claude service.
   *
   * @param {{upcomingSongs: Array<object>, weather: string, timeOfDay: string}} input Refill context.
   * @returns {Promise<object|null>} Legacy refill result, usually { say }.
   * @throws Bubbles legacy LLM failures.
   * Constraint: keeps legacy prompt behavior intact while hiding services/claude.js from application code.
   */
  writeRefill({ upcomingSongs, weather, timeOfDay }) {
    return generateRefillSpeech(upcomingSongs, weather, timeOfDay);
  },
};
