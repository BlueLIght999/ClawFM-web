/**
 * SearchResultCache — domain-level LRU+TTL cache for music search results.
 *
 * Reduces external Netease API calls for repeated queries within a short window.
 * Modeled after AudioUrlCache (server/domain/playback/AudioUrlCache.js).
 *
 * Note: This is an optimization, NOT a bug fix. Cache window may serve stale
 * results if Netease cookie/session changes; 60s TTL bounds the staleness.
 */

const DEFAULT_TTL_MS = 60 * 1000;
const DEFAULT_MAX_SIZE = 100;

export class SearchResultCache {
  /**
   * @param {object} [opts]
   * @param {{search: (keywords: string, limit?: number) => Promise<Array<any>>}|null} [opts.music]
   *   music source; optional so the cache can be constructed before the adapter
   *   exists, in which case search() degrades rather than throwing.
   * @param {number} [opts.ttlMs]
   * @param {number} [opts.maxSize]
   */
  constructor({ music = null, ttlMs = DEFAULT_TTL_MS, maxSize = DEFAULT_MAX_SIZE } = {}) {
    this.music = music;
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this._cache = new Map();
  }

  /**
   * Search songs, returning cached results if fresh, otherwise fetching from music source.
   * @param {string} keywords
   * @param {number} limit
   * @returns {Promise<Array>} song DTOs
   */
  async search(keywords, limit = 20) {
    const key = this._key(keywords, limit);
    const cached = this._cache.get(key);
    if (cached && cached.expires > Date.now()) {
      // LRU: refresh position by re-inserting
      this._cache.delete(key);
      this._cache.set(key, cached);
      return cached.songs;
    }
    // `music` is an optional dep (the cache may be built before the adapter is
    // wired), so degrade to an empty result set rather than throwing -- the same
    // contract the profile searchers use. Returning undefined here would also
    // break the declared Promise<Array> return.
    if (!this.music) return [];
    const songs = await this.music.search(keywords, limit);
    if (Array.isArray(songs)) {
      this._setWithEviction(key, { songs, expires: Date.now() + this.ttlMs });
    }
    return songs;
  }

  /**
   * Get cached results without fetching. Returns null if not cached or expired.
   * @param {string} keywords
   * @param {number} limit
   * @returns {Array|null}
   */
  getCached(keywords, limit) {
    const key = this._key(keywords, limit);
    const cached = this._cache.get(key);
    if (cached && cached.expires > Date.now()) {
      // LRU: refresh position
      this._cache.delete(key);
      this._cache.set(key, cached);
      return cached.songs;
    }
    return null;
  }

  /**
   * Current number of cached entries.
   */
  get size() {
    return this._cache.size;
  }

  clear() {
    this._cache.clear();
  }

  _key(keywords, limit) {
    return `${keywords}::${limit}`;
  }

  _setWithEviction(key, value) {
    if (this.maxSize <= 0) return;
    if (this._cache.has(key)) this._cache.delete(key);
    while (this._cache.size >= this.maxSize) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey === undefined) break;
      this._cache.delete(oldestKey);
    }
    this._cache.set(key, value);
  }
}
