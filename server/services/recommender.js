/**
 * Recommender — thin orchestration layer.
 *
 * Domain logic extracted to:
 *   domain/curation/SeedPoolBuilder.js — seed pool construction + top artists + corpus
 *   domain/curation/QueueFillStrategies.js — 4 fetch strategies + parallel collection + dedup
 *
 * This file wires injected dependencies to domain objects and manages
 * the seed pool build lifecycle (deferred until first fillQueue completes).
 */

import { queue } from './queue.js';
import { SeedPoolBuilder } from '../domain/curation/SeedPoolBuilder.js';
import { QueueFillStrategies } from '../domain/curation/QueueFillStrategies.js';
import { createGenreSearchEngine } from '../domain/routing/GenreSearchEngine.js';

/**
 * Injected and derived state of the Recommender. Several members are seeded with
 * `null` or `[]` in the constructor and only later replaced by configure(),
 * init() or the seed-pool build; without this declaration strictNullChecks
 * would freeze them to `null` / `never[]` and reject those assignments.
 * `music`, `listenHistory`, `seedPoolRepo`, `profile`, `corpus` and `queueStore`
 * all hold injected ports/adapters, hence `any`.
 * @property {any} music
 * @property {any} listenHistory
 * @property {any} seedPoolRepo
 * @property {any} profile
 * @property {any} corpus
 * @property {any} queueStore
 * @property {string|null} uid
 * @property {Song[]} seedPool
 * @property {any[]} topArtists
 * @property {any[]} topGenres
 * @property {boolean} initialized
 * @property {any} _planProgress
 * @property {boolean} _seedPoolPending
 * @property {number} _seedPoolRetryCount
 * @property {number} _seedPoolMaxRetries
 * @property {null|(() => void)} _onLoginExpired
 */
export class Recommender {
  constructor({
    music = null,
    listenHistory = null,
    seedPool = null,
    profile = null,
    corpus = null,
    queueStore = queue,
  } = {}) {
    this.music = music;
    this.listenHistory = listenHistory;
    this.seedPoolRepo = seedPool;
    this.profile = profile;
    this.corpus = corpus;
    this.queueStore = queueStore;
    this.uid = null;
    this.seedPool = [];
    this.topArtists = [];
    this.topGenres = [];
    this.initialized = false;
    this._planProgress = { planId: null, currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true, pinned: false };
    this._seedPoolPending = false;
    this._seedPoolRetryCount = 0;
    this._seedPoolMaxRetries = 3;
    this._onLoginExpired = null;
  }

  /** Register a callback invoked when seed pool build fails due to login expiry. */
  onLoginExpired(callback) {
    this._onLoginExpired = callback;
  }

  configure({ music, listenHistory, seedPool, profile, corpus }) {
    if (music) this.music = music;
    if (listenHistory) this.listenHistory = listenHistory;
    if (seedPool) this.seedPoolRepo = seedPool;
    if (profile) this.profile = profile;
    if (corpus) this.corpus = corpus;
  }

  async init(uid) {
    this.uid = uid;
    if (!this.profile || !this.music) {
      console.log('[Recommender] Dependencies not configured — call configure() first');
      return;
    }
    const profile = this.profile.get();
    if (profile.topArtists) this.topArtists = profile.topArtists;
    if (profile.topGenres) this.topGenres = profile.topGenres;

    this._seedPoolPending = true;
    this._seedPoolRetryCount = 0;
    this.initialized = true;
    console.log(`[Recommender] Initialized for uid=${uid}, seed pool: ${this.seedPool.length} songs`);
  }

  async fillQueue(targetSize = 15, hints = null) {
    if (!this.initialized) return [];

    const filler = this._createFiller();
    const { allSongs, activeBlockHints } = await filler.fillQueue(targetSize, hints, this._planProgress);

    this._commitFillResult(allSongs, activeBlockHints);
    await this._maybeBuildSeedPool();
    return allSongs;
  }

  async fillQueueByPreference(preference, targetSize = 10) {
    const filler = this._createFiller();
    const allSongs = await filler.fillQueueByPreference(preference, targetSize, this.seedPoolRepo);

    if (allSongs.length > 0) this.queueStore.addSongs(allSongs);
    return allSongs;
  }

  setPlanBlocks(blocks, planId) {
    this._planProgress = { planId, currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true, pinned: false };
  }

  getActiveBlock() {
    return this._planProgress;
  }

  async getSongDetails(ids) {
    if (ids.length === 0) return [];
    try { return await this.music.details(ids); } catch { return []; }
  }

  // ─── Internal wiring ─────────────────────────────────────────────

  _createFiller() {
    return new QueueFillStrategies({
      music: this.music,
      queueStore: this.queueStore,
      listenHistory: this.listenHistory,
      topArtists: this.topArtists,
      topGenres: this.topGenres,
      // D10: curation 不 import routing，引擎在此（组合根）注入。
      genreSearchEngine: createGenreSearchEngine(this.music),
    });
  }

  _commitFillResult(allSongs, activeBlockHints) {
    if (allSongs.length === 0) return;
    this.queueStore.addSongs(allSongs);
    if (activeBlockHints) {
      this._planProgress.songsFilledInBlock += allSongs.length;
    }
  }

  async _maybeBuildSeedPool() {
    if (!this._seedPoolPending) return;
    this._seedPoolRetryCount++;
    try {
      await this._buildSeedPool();
      this._seedPoolPending = false;
    } catch (e) {
      if (this._isLoginExpiredError(e)) {
        this._onLoginExpired?.();
      }
      console.warn(`[Recommender] Seed pool build retry ${this._seedPoolRetryCount}: ${e.message}`);
      if (this._seedPoolRetryCount >= this._seedPoolMaxRetries) {
        console.error(`[Recommender] Seed pool build abandoned after ${this._seedPoolMaxRetries} retries`);
        this._seedPoolPending = false;
      }
    }
  }

  _isLoginExpiredError(e) {
    const msg = (e?.message || '').toLowerCase();
    return msg.includes('login expired') || msg.includes('please re-login');
  }

  async _buildSeedPool() {
    const builder = new SeedPoolBuilder({
      music: this.music,
      seedPoolRepo: this.seedPoolRepo,
      profile: this.profile,
      corpus: this.corpus,
    });
    const result = await builder.build(this.uid);

    if (result.topArtists && result.topArtists.length > 0) {
      this.topArtists = result.topArtists;
      this.topGenres = result.topGenres || this.topGenres;
      this.profile.set('topArtists', this.topArtists);
      if (result.topGenres) this.profile.set('topGenres', result.topGenres);
    }

    if (result.songs > 0) {
      this.seedPool = this.seedPoolRepo.all();
    }

    console.log(`[Recommender] Seed pool built: ${result.songs} songs, ${this.topArtists.length} top artists, ${this.topGenres.length} top genres`);
  }
}

export const recommender = new Recommender();
