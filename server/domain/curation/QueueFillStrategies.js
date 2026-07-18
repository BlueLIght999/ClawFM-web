/**
 * QueueFillStrategies — domain logic for filling the play queue.
 *
 * Provides 4 fetch strategies (personalFm, similarSongs, dailyRecs, genreSearch)
 * plus parallel collection with deduplication.
 * All I/O via injected dependencies (music port, queueStore, listenHistory).
 */

import { artistName } from '../hosting/artistName.js';
import { songId } from './songId.js';
import { rankSongsByTopArtists, seedSongMatchesPreference } from './recommenderRules.js';
import { createGenreSearchEngine } from '../routing/GenreSearchEngine.js';
import { resolveActiveBlockHints } from './planBlockProgression.js';
import { preferenceFallbackPlan } from './preferenceFallbackRules.js';

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

  if (perStrategyQuota > 0) {
    // Round-robin pass: each strategy contributes up to perStrategyQuota
    for (let si = 0; si < strategySongs.length; si++) {
      if (allSongs.length >= targetSize) break;
      const songs = strategySongs[si];
      let added = 0;
      for (const s of songs) {
        if (added >= perStrategyQuota || allSongs.length >= targetSize) break;
        if (tryAdd(s)) added++;
      }
    }
    // Second pass: fill remaining from any strategy in order
    if (allSongs.length < targetSize) {
      for (let si = 0; si < strategySongs.length; si++) {
        if (allSongs.length >= targetSize) break;
        const songs = strategySongs[si];
        for (const s of songs) {
          if (allSongs.length >= targetSize) break;
          tryAdd(s);
        }
      }
    }
  } else {
    // Original sequential behavior (backward compat)
    for (let si = 0; si < strategySongs.length; si++) {
      const songs = strategySongs[si];
      for (const s of songs) {
        if (!tryAdd(s)) {
          if (allSongs.length >= targetSize) break;
        }
      }
      if (allSongs.length >= targetSize) break;
    }
  }

  return allSongs;
}

export class QueueFillStrategies {
  constructor({ music = null, queueStore = null, listenHistory = null, topArtists = [], seedPoolRepo = null } = {}) {
    this.music = music;
    this.queueStore = queueStore;
    this.listenHistory = listenHistory;
    this.topArtists = topArtists;
    this.seedPoolRepo = seedPoolRepo;
  }

  buildStrategies(activeBlockHints, recentIds, hourArtists) {
    const strategies = [];
    if (activeBlockHints) {
      strategies.push(() => this.fetchByGenreHints(recentIds, hourArtists, activeBlockHints));
    }
    strategies.push(
      () => this.fetchPersonalFm(recentIds, hourArtists),
      () => this.fetchSimilarSongs(recentIds, hourArtists),
      () => this.fetchDailyRecommendations(recentIds, hourArtists),
      () => this.fetchGenreSearch(recentIds, hourArtists),
    );
    const strategyNames = activeBlockHints
      ? ['genreHints', 'personalFm', 'similarSongs', 'dailyRecs', 'genreSearch']
      : ['personalFm', 'similarSongs', 'dailyRecs', 'genreSearch'];
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

    // P1-4: Rank collected songs by user's top artists for preference relevance
    const rankedSongs = rankSongsByTopArtists(allSongs, this.topArtists);

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
    const songs = [];
    const genreEngine = createGenreSearchEngine(this.music);
    for (const block of hints) {
      const genres = block.genreHints || [];
      for (const genre of genres.slice(0, 2)) {
        if (songs.length >= 20) break;
        try {
          const tracks = (await genreEngine.search(genre, { limit: 8 })).filter(t => {
            const sid = String(t.id);
            return !recentIds.has(sid);
          });
          for (const t of tracks) {
            if (songs.length >= 20) break;
            songs.push(t);
          }
        } catch { /* skip failed genre search */ }
      }
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
      const artist = this.topArtists[Math.floor(Math.random() * Math.min(this.topArtists.length, 10))];
      if (!artist) return [];
      return (await this.music.search(artist.name, 10)).slice(0, 5);
    } catch { return []; }
  }
}
