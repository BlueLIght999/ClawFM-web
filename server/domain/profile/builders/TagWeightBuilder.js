/**
 * TagWeightBuilder — core builder that aggregates collected evidence
 * into a tag-weighted user profile.
 *
 * Domain-layer abstraction. Groups evidence by tag (dimension + name),
 * delegates weight calculation to an injected WeightStrategy, optionally
 * applies a DecayStrategy, and emits progress events on an optional
 * event bus. No IO lives here — all dependencies are injected.
 *
 * Never import infrastructure, db, or application layers.
 */

export class TagWeightBuilder {
  /**
   * @param {Object}  [opts]
   * @param {Object}  [opts.weightStrategy] — implements calculate(evidence, context)
   * @param {Object}  [opts.decayStrategy]  — implements decay(weight, context)
   * @param {Object}  [opts.eventBus]       — optional bus exposing emit(type, payload)
   */
  constructor({ weightStrategy, decayStrategy, eventBus = null } = {}) {
    this.weightStrategy = weightStrategy;
    this.decayStrategy = decayStrategy;
    this.eventBus = eventBus;
  }

  /**
   * Build a tag-weighted profile from all collected evidence.
   * @param {Array}  allEvidence — flat list of evidence items
   * @param {Object} [options]   — { daysSinceLastSeen, ...extraContext }
   * @returns {{ tags: Object, schemaVersion: number, builtAt: string }}
   */
  build(allEvidence, options = {}) {
    // Group evidence by tag (dimension + name)
    const tagEvidence = this._groupByTag(allEvidence);

    // Calculate weight for each tag
    const tags = {};
    for (const [tagKey, evidenceList] of Object.entries(tagEvidence)) {
      const { dimension, name } = this._parseTagKey(tagKey);
      const context = this._buildContext(evidenceList, options);
      let weight = this.weightStrategy
        ? this.weightStrategy.calculate(evidenceList, context)
        : this._defaultWeight(evidenceList);

      // Apply decay
      if (this.decayStrategy && options.daysSinceLastSeen !== undefined) {
        weight = this.decayStrategy.decay(weight, { daysSinceLastSeen: options.daysSinceLastSeen });
      }

      if (!tags[dimension]) tags[dimension] = {};
      tags[dimension][name] = {
        weight,
        evidenceCount: evidenceList.length,
        lastSeen: this._latestTimestamp(evidenceList),
      };
    }

    if (this.eventBus) this.eventBus.emit('profile:building', { tagCount: Object.keys(tagEvidence).length });
    return { tags, schemaVersion: 1, builtAt: new Date().toISOString() };
  }

  /**
   * Group flat evidence into tag-keyed buckets. Evidence may carry explicit
   * `tags` or tags are inferred from the evidence type.
   * @param {Array} allEvidence
   * @returns {Object<string, Array>}
   */
  _groupByTag(allEvidence) {
    const groups = {};
    for (const evidence of allEvidence) {
      // Evidence may have tags attached, or we derive tags from type
      const tags = evidence.tags || this._inferTags(evidence);
      for (const tag of tags) {
        const key = `${tag.dimension}:${tag.name}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...evidence, confidence: tag.confidence || evidence.confidence || 0.7 });
      }
    }
    return groups;
  }

  /**
   * Infer tags from an evidence item when none are attached explicitly.
   * @param {Object} evidence
   * @returns {Array<{dimension: string, name: string, confidence: number}>}
   */
  _inferTags(evidence) {
    // Simple inference: if evidence is a listen/skip with artist, tag as genre:artist_name
    if (evidence.type === 'listen' || evidence.type === 'skip') {
      return evidence.artist ? [{ dimension: 'genre', name: evidence.artist.toLowerCase(), confidence: 0.6 }] : [];
    }
    if (evidence.type === 'time_pattern') {
      return [{ dimension: 'behavior', name: evidence.period || 'unknown', confidence: 0.8 }];
    }
    if (evidence.type === 'search') {
      return (evidence.extractedKeywords || []).map((kw) => ({ dimension: 'behavior', name: kw, confidence: 0.7 }));
    }
    if (evidence.type === 'chat') {
      return [{ dimension: 'chat', name: 'casual', confidence: 0.5 }];
    }
    return [];
  }

  /**
   * Parse a `dimension:name` tag key back into its parts.
   * @param {string} key
   * @returns {{ dimension: string, name: string }}
   */
  _parseTagKey(key) {
    const idx = key.indexOf(':');
    return { dimension: key.slice(0, idx), name: key.slice(idx + 1) };
  }

  /**
   * Build the weight-calculation context for a tag's evidence list.
   * @param {Array} evidenceList
   * @param {Object} options
   * @returns {Object}
   */
  _buildContext(evidenceList, options) {
    const skipCount = evidenceList.filter((e) => e.type === 'skip').length;
    const skipRate = evidenceList.length > 0 ? skipCount / evidenceList.length : 0;
    return { skipRate, ...options };
  }

  /**
   * Fallback weight when no WeightStrategy is injected.
   * @param {Array} evidenceList
   * @returns {number}
   */
  _defaultWeight(evidenceList) {
    return Math.min(evidenceList.length / 10, 1.0) * 0.7;
  }

  /**
   * Find the latest timestamp across a tag's evidence.
   * @param {Array} evidenceList
   * @returns {string|null}
   */
  _latestTimestamp(evidenceList) {
    return (
      evidenceList
        .map((e) => e.playedAt || e.timestamp || e.createdAt)
        .filter(Boolean)
        .sort()
        .pop() || null
    );
  }
}
