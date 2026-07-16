/**
 * WeightStrategy — strategy interface + default implementation for
 * calculating tag weights from collected evidence.
 *
 * Domain-layer abstraction. No IO lives here; the strategy receives
 * pre-collected evidence and an optional context object and returns a
 * scalar weight (0-1). Concrete strategies may be swapped at the
 * composition root without touching callers.
 *
 * Never import infrastructure, db, or application layers.
 */

export class WeightStrategy {
  /** @returns {string} strategy name */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Calculate a tag weight from its supporting evidence.
   * @param {Array}  evidence — list of evidence items backing this tag
   * @param {Object} [context] — contextual signals (skipRate, etc.)
   * @returns {number} weight value 0-1
   * @throws always — subclasses must override.
   */
  calculate(evidence, _context = {}) {
    throw new Error('Not implemented');
  }
}

// ─── Default implementation: frequency x recency x confidence x skip-penalty ───

export class DefaultWeightStrategy extends WeightStrategy {
  get name() {
    return 'default';
  }

  calculate(evidence, context = {}) {
    if (!evidence || evidence.length === 0) return 0;

    // Frequency score: more evidence = higher weight, capped at 1.0
    const freqScore = Math.min(evidence.length / 10, 1.0);

    // Recency score: exponential decay based on weeks since last evidence
    const latestEvidence = evidence[0];
    const weeksSince = this._weeksSince(latestEvidence?.playedAt || latestEvidence?.timestamp);
    const recencyScore = Math.pow(0.95, weeksSince);

    // Confidence score: average confidence across evidence
    const confScore = evidence.reduce((sum, e) => sum + (e.confidence || 0.7), 0) / evidence.length;

    // Skip penalty: if user frequently skips this tag's songs, reduce weight
    const skipPenalty = context.skipRate ? 1 - context.skipRate * 0.5 : 1;

    return freqScore * recencyScore * confScore * skipPenalty;
  }

  /**
   * Compute weeks elapsed since the given timestamp (0 when missing/invalid).
   * @param {string|number|Date} [timestamp]
   * @returns {number}
   */
  _weeksSince(timestamp) {
    if (!timestamp) return 0;
    const then = new Date(timestamp).getTime();
    if (isNaN(then)) return 0;
    const now = Date.now();
    return Math.max(0, (now - then) / (7 * 24 * 60 * 60 * 1000));
  }
}
