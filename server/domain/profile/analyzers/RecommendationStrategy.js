/**
 * RecommendationStrategy — strategy interface + concrete implementations
 * for enhancing song recommendations using listener profile data.
 *
 * Domain-layer abstraction. No IO lives here; strategies receive
 * pre-collected songs and a profile and return an enhanced ordering.
 * Concrete strategies may be swapped at the composition root without
 * touching callers.
 *
 * Never import infrastructure, db, or application layers.
 */

export class RecommendationStrategy {
  /** @returns {string} strategy name */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Enhance a list of songs using profile data.
   * @param {Array}  songs    — song objects ({ title, artist, … })
   * @param {Object} profile  — listener profile with tags
   * @param {Object} [context] — contextual signals (currentMood, etc.)
   * @returns {Array} enhanced song ordering
   * @throws always — subclasses must override.
   */
  enhance(_songs, _profile, _context = {}) {
    throw new Error('Not implemented');
  }
}

// ─── Profile-weighted: sort songs by tag-alignment score ───

export class ProfileWeightedStrategy extends RecommendationStrategy {
  get name() {
    return 'profile_weighted';
  }

  enhance(songs, profile, context = {}) {
    if (!songs || songs.length === 0) return songs;
    if (!profile?.tags) return songs;

    const scored = songs.map((song) => ({
      song,
      score: this._scoreSong(song, profile, context),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) => ({ ...s.song, _profileScore: s.score }));
  }

  _scoreSong(song, profile, context = {}) {
    let score = 0;
    const artistLower = (song.artist || '').toLowerCase();
    const titleLower = (song.title || '').toLowerCase();

    score += this._scoreDimension(artistLower, titleLower, profile.tags.genre, 1.0);
    score += this._scoreDimension(artistLower, titleLower, profile.tags.region, 0.8);

    if (profile.tags.mood && context.currentMood) {
      const moodWeight = profile.tags.mood[context.currentMood]?.weight || 0;
      score += moodWeight * 0.5;
    }

    return score;
  }

  _scoreDimension(artistLower, titleLower, tags, multiplier) {
    if (!tags) return 0;
    let score = 0;
    for (const [tag, data] of Object.entries(tags)) {
      if (artistLower.includes(tag) || titleLower.includes(tag)) {
        score += (data.weight || 0) * multiplier;
      }
    }
    return score;
  }
}

// ─── Diversity: interleave artists to maximize variety ───

export class DiversityStrategy extends RecommendationStrategy {
  constructor({ minDiversity = 0.3 } = {}) {
    super();
    this.minDiversity = minDiversity;
  }

  get name() {
    return 'diversity';
  }

  enhance(songs, _profile, _context = {}) {
    if (!songs || songs.length <= 1) return songs;

    const byArtist = new Map();
    for (const song of songs) {
      const artist = song.artist || 'unknown';
      if (!byArtist.has(artist)) byArtist.set(artist, []);
      byArtist.get(artist).push(song);
    }

    const result = [];
    const queues = [...byArtist.values()];
    while (queues.some((q) => q.length > 0)) {
      for (const queue of queues) {
        if (queue.length > 0) result.push(queue.shift());
      }
    }

    return result;
  }
}
