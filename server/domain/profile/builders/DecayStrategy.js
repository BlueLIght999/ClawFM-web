/**
 * DecayStrategy — strategy interface + Ebbinghaus implementation for
 * decaying tag weights over time.
 *
 * Domain-layer abstraction. Given a current weight and a context with
 * `daysSinceLastSeen`, the strategy returns a reduced weight reflecting
 * the forgetting curve. Concrete strategies may be swapped at the
 * composition root without touching callers.
 *
 * Never import infrastructure, db, or application layers.
 */

export class DecayStrategy {
  /** @returns {string} strategy name */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Apply time-based decay to a weight.
   * @param {number} weight — current weight
   * @param {Object} [context] — must contain `daysSinceLastSeen` for decay
   * @returns {number} decayed weight
   * @throws always — subclasses must override.
   */
  decay(weight, _context = {}) {
    throw new Error('Not implemented');
  }
}

// ─── Ebbinghaus forgetting-curve implementation ───

export class EbbinghausDecayStrategy extends DecayStrategy {
  /**
   * @param {Object}  [opts]
   * @param {number}  [opts.halfLifeDays=30] — days for weight to halve
   */
  constructor({ halfLifeDays = 30 } = {}) {
    super();
    this.halfLifeDays = halfLifeDays;
  }

  get name() {
    return 'ebbinghaus';
  }

  decay(weight, context = {}) {
    if (!context.daysSinceLastSeen) return weight;
    const decayFactor = Math.pow(0.5, context.daysSinceLastSeen / this.halfLifeDays);
    return weight * decayFactor;
  }
}
