/**
 * AudioUrlCache — domain-level cache for song audio URLs.
 *
 * Fetches URLs from injected MusicSourcePort, caches with TTL.
 * Implements LRU eviction when maxSize is reached.
 * Extracted from scheduler.js for testability.
 */

import { songId } from '../curation/songId.js';

const DEFAULT_MAX_SIZE = 500;

export class AudioUrlCache {
  constructor({ music = null, ttlMs = 15 * 60 * 1000, maxSize = DEFAULT_MAX_SIZE } = {}) {
    this.music = music;
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this._cache = new Map();
  }

  /**
   * Get audio URL for a song, fetching from music source if not cached.
   * Accepts either a string ID or a song object.
   * @param {string|object} songOrId
   * @returns {Promise<string|null>}
   */
  async get(songOrId) {
    const sid = String(typeof songOrId === 'string' ? songOrId : songId(songOrId));
    const cached = this._cache.get(sid);
    if (cached && cached.expires > Date.now()) {
      // LRU: refresh position by re-inserting
      this._cache.delete(sid);
      this._cache.set(sid, cached);
      return cached.url;
    }

    try {
      const url = await this.music.songUrl(sid);
      if (url) {
        this._setWithEviction(sid, { url, expires: Date.now() + this.ttlMs });
        return url;
      }
    } catch (e) {
      console.error(`[AudioUrlCache] Failed to get URL for ${sid}:`, e.message);
    }
    return null;
  }

  /**
   * Get cached URL without fetching. Returns null if not cached or expired.
   * @param {string} sid
   * @returns {string|null}
   */
  getCachedUrl(sid) {
    const key = String(sid);
    const cached = this._cache.get(key);
    if (cached && cached.expires > Date.now()) {
      // LRU: refresh position
      this._cache.delete(key);
      this._cache.set(key, cached);
      return cached.url;
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

  _setWithEviction(key, value) {
    if (this.maxSize <= 0) return;
    // If key already exists, delete first to update position
    if (this._cache.has(key)) this._cache.delete(key);
    // Evict oldest if at capacity
    while (this._cache.size >= this.maxSize) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey === undefined) break;
      this._cache.delete(oldestKey);
    }
    this._cache.set(key, value);
  }
}
