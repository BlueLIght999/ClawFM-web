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
    this.initialized = true;
    console.log(`[Recommender] Initialized for uid=${uid}, seed pool: ${this.seedPool.length} songs`);
  }

  async fillQueue(targetSize = 15, hints = null) {
    if (!this.initialized) return [];

    const filler = this._createFiller();
    const { allSongs, activeBlockHints } = await filler.fillQueue(targetSize, hints, this._planProgress);

    this._commitFillResult(allSongs, activeBlockHints);
    this._maybeBuildSeedPool();
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
    });
  }

  _commitFillResult(allSongs, activeBlockHints) {
    if (allSongs.length === 0) return;
    this.queueStore.addSongs(allSongs);
    if (activeBlockHints) {
      this._planProgress.songsFilledInBlock += allSongs.length;
    }
  }

  _maybeBuildSeedPool() {
    if (!this._seedPoolPending) return;
    this._seedPoolPending = false;
    this._buildSeedPool().catch(e => console.error('[Recommender] Seed pool build failed:', e.message));
  }

  async _buildSeedPool() {
    try {
      const builder = new SeedPoolBuilder({
        music: this.music,
        seedPoolRepo: this.seedPoolRepo,
        profile: this.profile,
        corpus: this.corpus,
      });
      const result = await builder.build(this.uid);
      this.topArtists = result.topArtists;
      this.profile.set('topArtists', this.topArtists);
      this.seedPool = this.seedPoolRepo.all();
      console.log(`[Recommender] Seed pool built: ${result.songs} songs, ${this.topArtists.length} top artists`);
    } catch (e) {
      console.error('[Recommender] Seed pool error:', e.message);
    }
  }
}

export const recommender = new Recommender();
