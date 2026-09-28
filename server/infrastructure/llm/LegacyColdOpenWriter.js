import { streamColdOpen } from '../../services/claude.js';

/**
 * Adapter that keeps the legacy streaming cold-open function behind ColdStartService.
 */
export const legacyColdOpenWriter = {
  /**
   * Streams the first DJ intro text for a cold start.
   *
   * @param {{firstSong: object, weather: string, timeOfDay: string, onToken?: Function}} input Cold-start context.
   * @returns {Promise<string>} Full spoken intro text, or a legacy fallback string.
   * @throws Does not intentionally throw; legacy streamColdOpen handles provider failures internally.
   * Constraint: preserves the old streamColdOpen signature while exposing named application inputs.
   */
  writeIntro(input) {
    // Destructured in the body rather than the parameter list: tsc only binds a
    // JSDoc object type to a destructured parameter in some positions, and when
    // it fails it infers a zero-arg signature instead -- which then rejects the
    // real call site (TS2554) rather than reporting the JSDoc mismatch.
    const { firstSong, weather, timeOfDay, onToken } = input;
    return streamColdOpen(firstSong, weather, timeOfDay, onToken);
  },
};
