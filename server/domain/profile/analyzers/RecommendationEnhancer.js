/**
 * RecommendationEnhancer — coordinates recommendation enhancement
 * using listener profile data. Extends BaseAnalyzer.
 *
 * Domain-layer abstraction. Delegates scoring/reordering to injected
 * Strategy instances. No IO lives here; songs and profile arrive as
 * plain objects via the analyze() arguments.
 *
 * Never import infrastructure, db, or application layers.
 */

import { BaseAnalyzer } from './BaseAnalyzer.js';
import { ProfileWeightedStrategy, DiversityStrategy } from './RecommendationStrategy.js';

export class RecommendationEnhancer extends BaseAnalyzer {
  /**
   * @param {Object}   [opts]
   * @param {Array}    [opts.strategies] — ordered list of RecommendationStrategy
   * @param {Object}   [opts.eventBus]   — optional bus exposing emit(type, payload)
   */
  constructor({ strategies = null, eventBus = null } = {}) {
    super({ name: 'RecommendationEnhancer', eventBus });
    this.strategies = strategies || [
      new ProfileWeightedStrategy(),
      new DiversityStrategy({ minDiversity: 0.3 }),
    ];
  }

  /**
   * @param {Object} profile
   * @param {Object} [options]
   * @param {Array}  [options.songs]   — songs to enhance
   * @param {Object} [options.context] — contextual signals
   * @returns {Promise<Object>} { enhanced, strategies, improvements, … }
   */
  async analyze(profile, options = {}) {
    const songs = options.songs || [];
    const context = options.context || {};

    if (songs.length === 0) {
      return { enhanced: [], strategy: 'none', improvements: 0 };
    }

    let enhanced = [...songs];
    const appliedStrategies = [];

    for (const strategy of this.strategies) {
      const before = enhanced;
      enhanced = strategy.enhance(enhanced, profile, context);
      if (enhanced !== before) {
        appliedStrategies.push(strategy.name);
      }
    }

    const improvements = this._calculateImprovements(songs, enhanced, profile);

    const result = {
      enhanced,
      strategies: appliedStrategies,
      improvements,
      originalCount: songs.length,
      enhancedCount: enhanced.length,
    };

    this.emit('analysis:completed', { type: 'recommendation', result });
    return result;
  }

  /**
   * Count how many more songs match profile genre tags after enhancement.
   * @param {Array}  original
   * @param {Array}  enhanced
   * @param {Object} profile
   * @returns {number}
   */
  _calculateImprovements(original, enhanced, profile) {
    if (!profile?.tags?.genre) return 0;

    const profileTags = Object.keys(profile.tags.genre).map((a) => a.toLowerCase());

    const originalMatches = this._countMatches(original, profileTags);
    const enhancedMatches = this._countMatches(enhanced, profileTags);

    return enhancedMatches - originalMatches;
  }

  _countMatches(songs, tags) {
    return songs.filter((s) =>
      tags.some((tag) => (s.artist || '').toLowerCase().includes(tag)),
    ).length;
  }

  /**
   * Synchronous convenience: apply all strategies and return enhanced songs.
   * @param {Array}  songs
   * @param {Object} profile
   * @param {Object} [context]
   * @returns {Array}
   */
  enhanceSongs(songs, profile, context = {}) {
    let enhanced = [...songs];
    for (const strategy of this.strategies) {
      enhanced = strategy.enhance(enhanced, profile, context);
    }
    return enhanced;
  }
}
