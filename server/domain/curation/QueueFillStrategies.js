/**
 * QueueFillStrategies — domain logic for filling the play queue.
 *
 * Provides 4 fetch strategies (personalFm, similarSongs, dailyRecs, genreSearch)
 * plus parallel collection with deduplication.
 * All I/O via injected dependencies (music port, queueStore, listenHistory).
 */

import { artistName } from '../shared/artistName.js';
import { songId } from '../shared/songId.js';
import { rankSongsByPreference, rankSongsByTopArtists, seedSongMatchesPreference } from './recommenderRules.js';
import { resolveActiveBlockHints } from './planBlockProgression.js';
import { preferenceFallbackPlan } from './preferenceFallbackRules.js';

// Cap on tracks a single genre-sweep strategy contributes. Was a bare `20` in two
// near-identical loops; naming it keeps the two in step if it ever changes.
const GENRE_FILL_LIMIT = 20;

/**
 * Pure: collect songs from multiple strategies, deduplicating against recentIds.
 *
 * P1-3: When perStrategyQuota is set, uses round-robin collection so no single
 * strategy dominates the queue. Each strategy contributes at most `perStrategyQuota`
 * songs in the first pass; if targetSize is not reached, a second pass fills
 * remaining slots from any strategy in order.
 *
 * @param {Array<() => Promise<Array>>} strategies
 * @param {string[]} strategyNames
 * @param {Set<string>} recentIds
 * @param {number} targetSize
 * @param {{ perStrategyQuota?: number }} [options]
 * @returns {Promise<Array>}
 */
export async function collectFromStrategies(strategies, strategyNames, recentIds, targetSize, options = {}) {
  const { perStrategyQuota = 0 } = options;

  const results = await Promise.allSettled(
    strategies.map(fn => fn().catch(() => [])),
  );

  const strategySongs = results.map(r => r.status === 'fulfilled' ? r.value : []);
  const allSongs = [];

  function tryAdd(song) {
    const sid = songId(song);
    if (recentIds.has(sid) || allSongs.length >= targetSize) return false;
    allSongs.push(song);
    recentIds.add(sid);
    return true;
  }

  // The three passes below were one 53-branch function; each is now a named step
  // reading exactly as its comment did, so the ordering intent is visible without
  // holding the whole loop nest in mind.
  if (perStrategyQuota > 0) {
    addWithQuota(strategySongs, perStrategyQuota, targetSize, tryAdd, allSongs);
    // Second pass: fill remaining from any strategy in order
    fillAny(strategySongs, targetSize, tryAdd, allSongs);
  } else {
    // Original sequential behavior (backward compat)
    addSequential(strategySongs, targetSize, tryAdd, allSongs);
  }

  return allSongs;
}

/**
 * Round-robin pass: each strategy contributes up to `quota` songs.
 * @param {Array<Array>} strategySongs
 * @param {number} quota
 * @param {number} targetSize
 * @param {(song: object) => boolean} tryAdd
 * @param {Array} allSongs accumulated output, read for its length
 */
function addWithQuota(strategySongs, quota, targetSize, tryAdd, allSongs) {
  for (const songs of strategySongs) {
    if (allSongs.length >= targetSize) return;
    let added = 0;
    for (const s of songs) {
      if (added >= quota || allSongs.length >= targetSize) break;
      if (tryAdd(s)) added++;
    }
  }
}

/**
 * Second pass: fill any remaining slots from every strategy, ignoring quota.
 * @param {Array<Array>} strategySongs
 * @param {number} targetSize
 * @param {(song: object) => boolean} tryAdd
 * @param {Array} allSongs
 */
function fillAny(strategySongs, targetSize, tryAdd, allSongs) {
  if (allSongs.length >= targetSize) return;
  for (const songs of strategySongs) {
    if (allSongs.length >= targetSize) return;
    for (const s of songs) {
      if (allSongs.length >= targetSize) return;
      tryAdd(s);
    }
  }
}

/**
 * Quota-free sequential fill, preserving the original strategy priority.
 * @param {Array<Array>} strategySongs
 * @param {number} targetSize
 * @param {(song: object) => boolean} tryAdd
 * @param {Array} allSongs
 */
function addSequential(strategySongs, targetSize, tryAdd, allSongs) {
  for (const songs of strategySongs) {
    for (const s of songs) {
      if (!tryAdd(s) && allSongs.length >= targetSize) break;
    }
    if (allSongs.length >= targetSize) return;
  }
}

/**
 * Dependencies of the queue fill strategies. All are injected at the composition
 * root (services/recommender.js), so they are declared `any` here: the concrete
 * port interfaces are not nameable from this layer without importing across the
 * D10 boundary this class exists to respect.
 * @property {any} music
 * @property {any} queueStore
 * @property {any} listenHistory
 * @property {any[]} topArtists
 * @property {any[]} topGenres
 * @property {any} seedPoolRepo
 * @property {any} genreSearchEngine
 */
export class QueueFillStrategies {
  /**
   * @param {object} [deps]
   * @param {any} [deps.music]
   * @param {any} [deps.queueStore]
   * @param {any} [deps.listenHistory]
   * @param {any[]} [deps.topArtists]
   * @param {any[]} [deps.topGenres]
   * @param {any} [deps.seedPoolRepo]
   * @param {any} [deps.genreSearchEngine]
   */
  constructor({
    music = null,
    queueStore = null,
    listenHistory = null,
    topArtists = [],
    topGenres = [],
    seedPoolRepo = null,
    genreSearchEngine = null,
  } = {}) {
    this.music = music;
    this.queueStore = queueStore;
    this.listenHistory = listenHistory;
    this.topArtists = topArtists;
    this.topGenres = topGenres;
    this.seedPoolRepo = seedPoolRepo;
    // D10: 流派检索引擎由外层（services/recommender.js）注入，curation 不 import routing。
    // 缺省为 null——调用方忘了注入时 fetchByGenre* 会退化为空结果，而不是越界 import。
    this.genreSearchEngine = genreSearchEngine;
  }

  buildStrategies(activeBlockHints, recentIds, hourArtists) {
    const strategies = [];
    if (activeBlockHints) {
      strategies.push(() => this.fetchByGenreHints(recentIds, hourArtists, activeBlockHints));
    } else if (this.topGenres.length > 0) {
      // Deep-profile genres drive selection when the plan isn't pinning genres.
      strategies.push(() => this.fetchByUserGenres(recentIds));
    }
    strategies.push(
      () => this.fetchPersonalFm(recentIds, hourArtists),
      () => this.fetchSimilarSongs(recentIds, hourArtists),
      () => this.fetchDailyRecommendations(recentIds, hourArtists),
      () => this.fetchGenreSearch(recentIds, hourArtists),
    );
    let strategyNames;
    if (activeBlockHints) {
      strategyNames = ['genreHints', 'personalFm', 'similarSongs', 'dailyRecs', 'genreSearch'];
    } else if (this.topGenres.length > 0) {
      strategyNames = ['userGenres', 'personalFm', 'similarSongs', 'dailyRecs', 'genreSearch'];
    } else {
      strategyNames = ['personalFm', 'similarSongs', 'dailyRecs', 'genreSearch'];
    }
    return { strategies, strategyNames };
  }

  async fillQueue(targetSize, hints, planProgress) {
    const recentIds = new Set(this.listenHistory.recentSongIds(200));
    const hourArtists = new Set(this.listenHistory.artistPlayCount(1).slice(0, 10).map(a => a.artist));

    const activeBlockHints = this._resolveActiveBlockHints(hints, planProgress);
    const { strategies, strategyNames } = this.buildStrategies(activeBlockHints, recentIds, hourArtists);

    // P1-3: Use per-strategy quota so no single strategy dominates the queue
    const numStrategies = strategies.length;
    const perStrategyQuota = Math.max(3, Math.ceil(targetSize / numStrategies));
    const allSongs = await collectFromStrategies(strategies, strategyNames, recentIds, targetSize, { perStrategyQuota });

    // P1-4: Rank collected songs by user's top artists + genre affinity
    const rankedSongs = rankSongsByPreference(allSongs, this.topArtists, this.topGenres);

    return { allSongs: rankedSongs, activeBlockHints };
  }

  _resolveActiveBlockHints(hints, planProgress) {
    return resolveActiveBlockHints(hints, planProgress);
  }

  async fillQueueByPreference(preference, targetSize, seedPoolRepo) {
    const recentIds = new Set(this.listenHistory.recentSongIds(200));
    const allSongs = [];
    const seedPoolSize = seedPoolRepo?.all()?.length || 0;
    const { stages } = preferenceFallbackPlan({
      preference,
      currentCount: allSongs.length,
      targetSize,
      seedPoolSize,
    });

    for (const stage of stages) {
      if (allSongs.length >= targetSize) break;
      if (stage === 'seedPool') {
        await this._fillFromSeedPool(preference, recentIds, allSongs, targetSize, seedPoolRepo);
      } else if (stage === 'search') {
        await this._fillFromSearch(preference, recentIds, allSongs, targetSize);
      } else if (stage === 'genericFallback') {
        await this._fillFromGenericFallback(allSongs, recentIds, targetSize);
      }
    }

    return allSongs;
  }

  async _fillFromSeedPool(preference, recentIds, allSongs, targetSize, seedPoolRepo) {
    const pool = seedPoolRepo?.all() || [];
    if (!pool.length) return;
    const matched = [];
    for (const row of pool) {
      if (seedSongMatchesPreference(row, preference)) {
        matched.push(String(row.songId));
      }
    }
    if (matched.length === 0) return;
    try {
      const tracks = (await this.music.details(matched.slice(0, 20))).filter(t => {
        const sid = String(t.id);
        return !recentIds.has(sid);
      });
      for (const t of tracks) {
        if (allSongs.length >= targetSize) break;
        allSongs.push(t);
        recentIds.add(String(t.id));
      }
    } catch { /* seed pool detail fetch failed */ }
  }

  async _fillFromSearch(preference, recentIds, allSongs, targetSize) {
    try {
      const tracks = (await this.music.search(preference, 15)).filter(t => {
        const sid = String(t.id);
        return !recentIds.has(sid);
      });
      for (const track of rankSongsByTopArtists(tracks, this.topArtists)) {
        if (allSongs.length >= targetSize) break;
        allSongs.push(track);
        recentIds.add(String(track.id));
      }
    } catch { /* search failed */ }
  }

  async _fillFromGenericFallback(allSongs, recentIds, targetSize) {
    const hourArtists = new Set(this.listenHistory.artistPlayCount(1).slice(0, 10).map(a => a.artist));
    const fns = [
      () => this.fetchPersonalFm(recentIds, hourArtists),
      () => this.fetchSimilarSongs(recentIds, hourArtists),
      () => this.fetchDailyRecommendations(recentIds, hourArtists),
      () => this.fetchGenreSearch(recentIds, hourArtists),
    ];
    for (const fn of fns) {
      if (allSongs.length >= targetSize) break;
      const batch = await fn();
      for (const s of batch) {
        const sid = songId(s);
        if (!recentIds.has(sid) && allSongs.length < targetSize) {
          allSongs.push(s);
          recentIds.add(sid);
        }
      }
    }
  }

  // ─── Strategy implementations ────────────────────────────────────

  async fetchByGenreHints(recentIds, _hourArtists, hints) {
    if (!this.genreSearchEngine) return [];
    // Two genres per block, preserving the original per-block cap (a flat slice
    // over all blocks would have let one hint-rich block starve the others).
    const genres = hints.flatMap((block) => (block.genreHints || []).slice(0, 2));
    return this._collectByGenres(genres, recentIds);
  }

  async fetchByUserGenres(recentIds) {
    if (!this.genreSearchEngine) return [];
    return this._collectByGenres(this.topGenres.slice(0, 2), recentIds);
  }

  /**
   * Search a bounded list of genres and collect up to GENRE_FILL_LIMIT unseen
   * tracks. Shared by the two genre strategies above, whose loops were identical
   * once the genre list was supplied (CODING-STYLE no-duplication).
   *
   * @param {string[]} genres
   * @param {Set<string>} recentIds
   * @returns {Promise<Array>}
   */
  async _collectByGenres(genres, recentIds) {
    const songs = [];
    for (const genre of genres) {
      if (songs.length >= GENRE_FILL_LIMIT) break;
      try {
        const tracks = (await this.genreSearchEngine.search(genre, { limit: 8 }))
          .filter((t) => !recentIds.has(String(t.id)));
        for (const t of tracks) {
          if (songs.length >= GENRE_FILL_LIMIT) break;
          songs.push(t);
        }
      } catch { /* skip failed genre search */ }
    }
    return songs;
  }

  async fetchPersonalFm(_recentIds, hourArtists) {
    try {
      const tracks = await this.music.personalFm();
      return tracks.filter(t => {
        const artist = artistName(t);
        return !hourArtists.has(artist);
      });
    } catch { return []; }
  }

  async fetchSimilarSongs(_recentIds, _hourArtists) {
    if (!this.queueStore.current) return [];
    try {
      const currentId = songId(this.queueStore.current);
      return (await this.music.similar(String(currentId))).slice(0, 10);
    } catch { return []; }
  }

  async fetchDailyRecommendations(_recentIds, _hourArtists) {
    try {
      return (await this.music.dailyRecommend()).slice(0, 15);
    } catch { return []; }
  }

  async fetchGenreSearch(_recentIds, _hourArtists) {
    try {
      // Prefer a profile genre when available; otherwise fall back to a top artist.
      const candidates = [
        ...this.topGenres.slice(0, 5),
        ...this.topArtists.slice(0, 10).map(a => a.name),
      ].filter(Boolean);
      if (candidates.length === 0) return [];
      // Picks a random genre/artist to seed a search. Unpredictability is not a
      // requirement here -- any candidate gives a valid search -- so Math.random is
      // correct, and it is the only source usable in this pure domain layer.
      // eslint-disable-next-line sonarjs/pseudo-random
      const query = candidates[Math.floor(Math.random() * candidates.length)];
      return (await this.music.search(query, 10)).slice(0, 5);
    } catch { return []; }
  }
}
