import { queue } from './queue.js';
import { buildTasteMarkdown } from '../domain/curation/buildTasteMarkdown.js';
import { artistName } from '../domain/hosting/artistName.js';
import {
  isTasteTemplate,
  isRoutinesTemplate,
  buildRoutinesMarkdown,
} from '../domain/curation/userCorpusRules.js';
import {
  rankSongsByTopArtists,
  seedSongMatchesPreference,
  toSeedSongFromTrack,
} from '../domain/curation/recommenderRules.js';
import { songId } from '../domain/curation/songId.js';
import { createGenreSearchEngine } from '../domain/routing/GenreSearchEngine.js';

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

  /** Inject dependencies via bootstrap.js (D8 compliance) */
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

    // Don't fire _buildSeedPool yet — it competes with fillQueue for API bandwidth.
    // It will be triggered after the first fillQueue completes.
    this._seedPoolPending = true;
    this.initialized = true;
    console.log(`[Recommender] Initialized for uid=${uid}, seed pool: ${this.seedPool.length} songs`);
  }

  /** Build seed pool after initial queue fill to avoid API bandwidth contention. */
  _maybeBuildSeedPool() {
    if (!this._seedPoolPending) return;
    this._seedPoolPending = false;
    this._buildSeedPool().catch(e => console.error('[Recommender] Seed pool build failed:', e.message));
  }

  // ─── Seed pool construction ─────────────────────────────────────

  async _buildSeedPool() {
    try {
      const playlists = await this.music.userPlaylists(this.uid);
      const songs = new Map();
      const artistCount = {};

      await this._collectPlaylistSongs(playlists, songs, artistCount);
      await this._collectLikedSongs(songs);

      for (const [, song] of songs) {
        this.seedPoolRepo.upsert(song);
      }

      this.topArtists = this._computeTopArtists(artistCount);
      this.profile.set('topArtists', this.topArtists);
      this.seedPool = this.seedPoolRepo.all();

      console.log(`[Recommender] Seed pool built: ${songs.size} songs, ${this.topArtists.length} top artists`);
      this._writeUserCorpus(songs.size);
    } catch (e) {
      console.error('[Recommender] Seed pool error:', e.message);
    }
  }

  async _collectPlaylistSongs(playlists, songs, artistCount) {
    for (const pl of playlists.slice(0, 10)) {
      try {
        const tracks = await this.music.playlistTracks(pl.id);
        for (const track of tracks) {
          this._addSeedSong(track, songs, artistCount, `playlist:${pl.name}`);
        }
      } catch { /* skip failed playlist */ }
    }
  }

  async _collectLikedSongs(songs) {
    try {
      const likedSongs = await this.music.likedSongs(this.uid);
      for (const item of likedSongs.slice(0, 500)) {
        const seedSong = toSeedSongFromTrack(item, 'liked');
        if (!songs.has(seedSong.songId)) {
          songs.set(seedSong.songId, seedSong);
        }
      }
    } catch { /* skip */ }
  }

  _addSeedSong(track, songs, artistCount, source) {
    const seedSong = toSeedSongFromTrack(track, source);
    const sid = seedSong.songId;
    if (songs.has(sid)) return;
    songs.set(sid, seedSong);
    for (const name of seedSong.artist.split(',').map(a => a.trim()).filter(Boolean)) {
      artistCount[name] = (artistCount[name] || 0) + 1;
    }
  }

  _computeTopArtists(artistCount) {
    return Object.entries(artistCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30)
      .map(([name, count]) => ({ name, count }));
  }

  _writeUserCorpus(totalSongs) {
    try {
      console.log('[Recommender] _writeUserCorpus called, totalSongs:', totalSongs, 'artists:', this.topArtists.length);

      const existingTaste = this.corpus.readTaste();
      if (isTasteTemplate(existingTaste)) {
        const tasteContent = buildTasteMarkdown({
          topArtists: this.topArtists,
          topGenres: this.topGenres,
          totalSongs,
          date: new Date().toISOString().split('T')[0],
        });
        this.corpus.writeTaste(tasteContent);
        console.log('[Recommender] User taste.md auto-filled');
      }

      const existingRoutines = this.corpus.readRoutines();
      if (isRoutinesTemplate(existingRoutines)) {
        const topArtistNames = this.topArtists.slice(0, 10).map(a => a.name);
        this.corpus.writeRoutines(buildRoutinesMarkdown(topArtistNames));
        console.log('[Recommender] User routines.md auto-filled');
      }
    } catch (e) {
      console.error('[Recommender] User corpus write failed:', e.message);
    }
  }

  // ─── fillQueue ──────────────────────────────────────────────────

  async fillQueue(targetSize = 15, hints = null) {
    if (!this.initialized) { console.log('[Recommender] fillQueue: not initialized'); return []; }

    const recentIds = new Set(this.listenHistory.recentSongIds(200));
    const hourArtists = new Set(this.listenHistory.artistPlayCount(1).slice(0, 10).map(a => a.artist));
    console.log(`[Recommender] fillQueue target=${targetSize}, recentIds=${recentIds.size}, hints=${hints ? hints.length : 0}`);

    const activeBlockHints = this._resolveActiveBlockHints(hints);
    const { strategies, strategyNames } = this._buildFillStrategies(activeBlockHints, recentIds, hourArtists);
    const allSongs = await this._collectFromStrategies(strategies, strategyNames, recentIds, targetSize);

    console.log(`[Recommender] fillQueue total: ${allSongs.length} songs (target ${targetSize})`);
    this._commitFillResult(allSongs, activeBlockHints);
    // Build seed pool now that fillQueue's API calls are done (avoids bandwidth contention)
    this._maybeBuildSeedPool();
    return allSongs;
  }

  _resolveActiveBlockHints(hints) {
    if (!hints || hints.length === 0) return null;
    const p = this._planProgress;
    if (p.currentBlockIndex >= hints.length) p.currentBlockIndex = 0;
    const block = hints[p.currentBlockIndex];
    if (!block) return null;

    if (p.autoMode !== false && p.songsFilledInBlock >= (block.targetCount || 5)) {
      p.currentBlockIndex = (p.currentBlockIndex + 1) % hints.length;
      p.songsFilledInBlock = 0;
      const nextBlock = hints[p.currentBlockIndex];
      return nextBlock ? [nextBlock] : null;
    }
    return [block];
  }

  _buildFillStrategies(activeBlockHints, recentIds, hourArtists) {
    const strategies = [];
    if (activeBlockHints) {
      strategies.push(() => this._fetchByGenreHints(recentIds, hourArtists, activeBlockHints));
    }
    strategies.push(
      () => this._fetchPersonalFm(recentIds, hourArtists),
      () => this._fetchSimilarSongs(recentIds, hourArtists),
      () => this._fetchDailyRecommendations(recentIds, hourArtists),
      () => this._fetchGenreSearch(recentIds, hourArtists),
    );
    const strategyNames = activeBlockHints
      ? ['genreHints', 'personalFm', 'similarSongs', 'dailyRecs', 'genreSearch']
      : ['personalFm', 'similarSongs', 'dailyRecs', 'genreSearch'];
    return { strategies, strategyNames };
  }

  async _collectFromStrategies(strategies, strategyNames, recentIds, targetSize) {
    // Run all strategies in parallel to minimize latency (was sequential)
    const results = await Promise.allSettled(
      strategies.map(fn => fn().catch(e => {
        console.log(`[Recommender] strategy error:`, e.message);
        return [];
      }))
    );

    const allSongs = [];
    for (let si = 0; si < results.length; si++) {
      const songs = results[si].status === 'fulfilled' ? results[si].value : [];
      console.log(`[Recommender] strategy "${strategyNames[si]}" returned ${songs.length} songs`);
      for (const s of songs) {
        const sid = songId(s);
        if (!recentIds.has(sid) && allSongs.length < targetSize) {
          allSongs.push(s);
          recentIds.add(sid);
        }
      }
      if (allSongs.length >= targetSize) break;
    }
    return allSongs;
  }

  _commitFillResult(allSongs, activeBlockHints) {
    if (allSongs.length === 0) return;
    this.queueStore.addSongs(allSongs);
    if (activeBlockHints) {
      this._planProgress.songsFilledInBlock += allSongs.length;
    }
  }

  // ─── fillQueueByPreference ──────────────────────────────────────

  async fillQueueByPreference(preference, targetSize = 10) {
    const recentIds = new Set(this.listenHistory.recentSongIds(200));
    const allSongs = [];

    if (preference) {
      await this._fillFromSeedPool(preference, recentIds, allSongs, targetSize);
    }
    if (allSongs.length < targetSize && preference) {
      await this._fillFromSearch(preference, recentIds, allSongs, targetSize);
    }
    if (allSongs.length < targetSize) {
      await this._fillFromGenericFallback(allSongs, recentIds, targetSize);
    }

    if (allSongs.length > 0) {
      this.queueStore.addSongs(allSongs);
    }
    return allSongs;
  }

  async _fillFromSeedPool(preference, recentIds, allSongs, targetSize) {
    const seedMatches = this._filterSeedPoolByPreference(preference);
    if (seedMatches.length === 0) return;
    try {
      const tracks = (await this.music.details(seedMatches.slice(0, 20))).filter(t => {
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
    const remaining = targetSize - allSongs.length;
    const saved = { ...this._planProgress };
    const more = await this._fillGeneric(remaining, recentIds);
    Object.assign(this._planProgress, saved);
    for (const s of more) {
      if (allSongs.length >= targetSize) break;
      const sid = songId(s);
      if (!recentIds.has(sid)) {
        allSongs.push(s);
        recentIds.add(sid);
      }
    }
  }

  // ─── Generic fill (no plan hints) ───────────────────────────────

  async _fillGeneric(targetSize, recentIds) {
    const hourArtists = new Set(this.listenHistory.artistPlayCount(1).slice(0, 10).map(a => a.artist));
    const strategies = [
      () => this._fetchPersonalFm(recentIds, hourArtists),
      () => this._fetchSimilarSongs(recentIds, hourArtists),
      () => this._fetchDailyRecommendations(recentIds, hourArtists),
      () => this._fetchGenreSearch(recentIds, hourArtists),
    ];
    const songs = [];
    for (const strategy of strategies) {
      const batch = await strategy();
      for (const s of batch) {
        const sid = songId(s);
        if (!recentIds.has(sid) && songs.length < targetSize) {
          songs.push(s);
          recentIds.add(sid);
        }
      }
      if (songs.length >= targetSize) break;
    }
    return songs;
  }

  // ─── Strategy helpers ───────────────────────────────────────────

  _filterSeedPoolByPreference(preference) {
    const pool = this.seedPoolRepo.all();
    if (!pool.length) return [];
    const matched = [];
    for (const row of pool) {
      if (seedSongMatchesPreference(row, preference)) {
        matched.push(String(row.songId));
      }
    }
    return [...new Set(matched)];
  }

  async _fetchByGenreHints(recentIds, _hourArtists, hints) {
    const songs = [];
    // Use GenreSearchEngine for multi-source genre search (playlist + artist + song)
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
          // Add tracks, respecting the 20-song cap
          for (const t of tracks) {
            if (songs.length >= 20) break;
            songs.push(t);
          }
        } catch { /* skip failed genre search */ }
      }
    }
    return songs;
  }

  async _fetchPersonalFm(recentIds, hourArtists) {
    try {
      const tracks = await this.music.personalFm();
      return tracks.filter(t => {
        const artist = artistName(t);
        return !hourArtists.has(artist);
      });
    } catch (e) { console.log('[Recommender] _fetchPersonalFm error:', e.message); return []; }
  }

  async _fetchSimilarSongs(_recentIds, _hourArtists) {
    if (!this.queueStore.current) { console.log('[Recommender] _fetchSimilarSongs: no queue.current'); return []; }
    try {
      const currentId = songId(this.queueStore.current);
      return (await this.music.similar(String(currentId))).slice(0, 10);
    } catch (e) { console.log('[Recommender] _fetchSimilarSongs error:', e.message); return []; }
  }

  async _fetchDailyRecommendations(_recentIds, _hourArtists) {
    try {
      return (await this.music.dailyRecommend()).slice(0, 15);
    } catch (e) { console.log('[Recommender] _fetchDailyRecommendations error:', e.message); return []; }
  }

  async _fetchGenreSearch(_recentIds, _hourArtists) {
    try {
      const artist = this.topArtists[Math.floor(Math.random() * Math.min(this.topArtists.length, 10))];
      if (!artist) { console.log('[Recommender] _fetchGenreSearch: no top artists'); return []; }
      return (await this.music.search(artist.name, 10)).slice(0, 5);
    } catch (e) { console.log('[Recommender] _fetchGenreSearch error:', e.message); return []; }
  }

  // ─── Plan progress management ───────────────────────────────────

  setPlanBlocks(blocks, planId) {
    this._planProgress = { planId, currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true, pinned: false };
  }

  getActiveBlock() {
    return this._planProgress;
  }

  // ─── Misc ───────────────────────────────────────────────────────

  async getSongDetails(songIds) {
    if (songIds.length === 0) return [];
    try {
      return await this.music.details(songIds);
    } catch { return []; }
  }
}

export const recommender = new Recommender();
