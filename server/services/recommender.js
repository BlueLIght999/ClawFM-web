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
import { defaultCorpus } from '../infrastructure/storage/defaultCorpus.js';
import { legacyNeteaseMusicSourceAdapter } from '../infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';
import { legacyListenHistoryRepository } from '../infrastructure/persistence/repositories/LegacyListenHistoryRepository.js';
import { legacySeedPoolRepository } from '../infrastructure/persistence/repositories/LegacySeedPoolRepository.js';
import { legacyListenerProfileRepository } from '../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';

export class Recommender {
  constructor({
    music = legacyNeteaseMusicSourceAdapter,
    listenHistory = legacyListenHistoryRepository,
    seedPool = legacySeedPoolRepository,
    profile = legacyListenerProfileRepository,
    corpus = defaultCorpus,
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

  async init(uid) {
    this.uid = uid;
    // Load cached profile
    const profile = this.profile.get();
    if (profile.topArtists) this.topArtists = profile.topArtists;
    if (profile.topGenres) this.topGenres = profile.topGenres;

    // Build seed pool in background
    this._buildSeedPool().catch(e => console.error('[Recommender] Seed pool build failed:', e.message));

    this.initialized = true;
    console.log(`[Recommender] Initialized for uid=${uid}, seed pool: ${this.seedPool.length} songs`);
  }

  async _buildSeedPool() {
    try {
      // Fetch user playlists
      const playlists = await this.music.userPlaylists(this.uid);

      const songs = new Map();
      const artistCount = {};

      // Process playlists (limit to top 10 to avoid rate limiting)
      for (const pl of playlists.slice(0, 10)) {
        try {
          const tracks = await this.music.playlistTracks(pl.id);
          for (const track of tracks) {
            const seedSong = toSeedSongFromTrack(track, `playlist:${pl.name}`);
            const sid = seedSong.songId;
            if (songs.has(sid)) continue;
            songs.set(sid, seedSong);
            // Count artists
            for (const name of seedSong.artist.split(',').map(a => a.trim()).filter(Boolean)) {
              artistCount[name] = (artistCount[name] || 0) + 1;
            }
          }
        } catch (e) { /* skip failed playlist */ }
      }

      // Add liked songs
      try {
        const likedSongs = await this.music.likedSongs(this.uid);
        for (const item of likedSongs.slice(0, 500)) {
          const seedSong = toSeedSongFromTrack(item, 'liked');
          const sid = seedSong.songId;
          if (!songs.has(sid)) {
            songs.set(sid, seedSong);
          }
        }
      } catch (e) { /* skip */ }

      // Store in DB
      for (const [, song] of songs) {
        this.seedPoolRepo.upsert(song);
      }

      // Store profile
      this.topArtists = Object.entries(artistCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));

      this.profile.set('topArtists', this.topArtists);
      this.seedPool = this.seedPoolRepo.all();

      console.log(`[Recommender] Seed pool built: ${songs.size} songs, ${this.topArtists.length} top artists`);

      // Auto-fill user corpus from profile data
      this._writeUserCorpus(songs.size, artistCount);
    } catch (e) {
      console.error('[Recommender] Seed pool error:', e.message);
    }
  }

  _writeUserCorpus(totalSongs, artistCount) {
    try {
      console.log('[Recommender] _writeUserCorpus called, totalSongs:', totalSongs, 'artists:', this.topArtists.length);

      // Build taste.md — only overwrite if still a template (empty artists list)
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

      // Fill routines.md genre gaps
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

  async _fetchByGenreHints(recentIds, hourArtists, hints) {
    const songs = [];
    for (const block of hints) {
      const genres = block.genreHints || [];
      for (const genre of genres.slice(0, 2)) {
        if (songs.length >= 20) break;
        try {
          const tracks = (await this.music.search(genre, 5)).filter(t => {
            const sid = String(t.id);
            return !recentIds.has(sid);
          });
          songs.push(...tracks);
        } catch { /* skip failed genre search */ }
      }
    }
    return songs;
  }

  async fillQueue(targetSize = 15, hints = null) {
    if (!this.initialized) { console.log('[Recommender] fillQueue: not initialized'); return []; }

    const recentIds = new Set(this.listenHistory.recentSongIds(200));
    const hourArtists = new Set(this.listenHistory.artistPlayCount(1).slice(0, 10).map(a => a.artist));
    const allSongs = [];
    console.log(`[Recommender] fillQueue target=${targetSize}, recentIds=${recentIds.size}, hints=${hints ? hints.length : 0}`);

    // Plan progress: use current block's hints, advance when target reached
    let activeBlockHints = null;
    if (hints && hints.length > 0) {
      const p = this._planProgress;
      if (p.currentBlockIndex >= hints.length) p.currentBlockIndex = 0;
      const block = hints[p.currentBlockIndex];
      if (block) {
        activeBlockHints = [block]; // Single block for genre search
        // Auto-advance to next block if current one is full (only in auto mode)
        if (p.autoMode !== false && p.songsFilledInBlock >= (block.targetCount || 5)) {
          p.currentBlockIndex = (p.currentBlockIndex + 1) % hints.length;
          p.songsFilledInBlock = 0;
          const nextBlock = hints[p.currentBlockIndex];
          if (nextBlock) activeBlockHints = [nextBlock];
        }
      }
    }

    // Strategy rotation: plan hints first, then fallbacks
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

    for (let si = 0; si < strategies.length; si++) {
      const strategy = strategies[si];
      const songs = await strategy();
      console.log(`[Recommender] strategy "${strategyNames[si]}" returned ${songs.length} songs`);
      for (const s of songs) {
        const sid = String(s.id || s.song_id);
        if (!recentIds.has(sid) && allSongs.length < targetSize) {
          allSongs.push(s);
          recentIds.add(sid);
        }
      }
      if (allSongs.length >= targetSize) break;
    }

    console.log(`[Recommender] fillQueue total: ${allSongs.length} songs (target ${targetSize})`);
    if (allSongs.length > 0) {
      this.queueStore.addSongs(allSongs);
      if (activeBlockHints) {
        this._planProgress.songsFilledInBlock += allSongs.length;
      }
    }

    return allSongs;
  }

  /**
   * Personalized recommendation with an optional genre/instrument preference.
   * Uses seed pool matching first, then preference-aware search, then fallback.
   */
  async fillQueueByPreference(preference, targetSize = 10) {
    const recentIds = new Set(this.listenHistory.recentSongIds(200));
    const allSongs = [];

    // Step 1: try matching from seed pool
    if (preference) {
      const seedMatches = this._filterSeedPoolByPreference(preference);
      if (seedMatches.length > 0) {
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
        } catch (e) { /* seed pool detail fetch failed, continue */ }
      }
    }

    // Step 2: preference-aware search (filter by user's top artists affinity)
    if (allSongs.length < targetSize && preference) {
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
      } catch { /* search failed, continue */ }
    }

    // Step 3: fallback to regular fillQueue pipeline
    if (allSongs.length < targetSize) {
      const remaining = targetSize - allSongs.length;
      // Temporarily bypass plan progress to fill generically
      const saved = { ...this._planProgress };
      const more = await this._fillGeneric(remaining, recentIds);
      Object.assign(this._planProgress, saved);
      for (const s of more) {
        if (allSongs.length >= targetSize) break;
        const sid = String(s.id || s.song_id);
        if (!recentIds.has(sid)) {
          allSongs.push(s);
          recentIds.add(sid);
        }
      }
    }

    if (allSongs.length > 0) {
      this.queueStore.addSongs(allSongs);
    }
    return allSongs;
  }

  /** Generic fill without plan hints — used as fallback */
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
        const sid = String(s.id || s.song_id);
        if (!recentIds.has(sid) && songs.length < targetSize) {
          songs.push(s);
          recentIds.add(sid);
        }
      }
      if (songs.length >= targetSize) break;
    }
    return songs;
  }

  /** Filter seed pool by preference keyword (genre, instrument, style) */
  _filterSeedPoolByPreference(preference) {
    const pool = this.seedPoolRepo.all();
    if (!pool.length) return [];
    const matched = [];
    for (const row of pool) {
      if (seedSongMatchesPreference(row, preference)) {
        matched.push(String(row.songId));
      }
    }
    return [...new Set(matched)]; // deduplicate
  }

  /** Reset plan progress when a new plan is generated */
  setPlanBlocks(blocks, planId) {
    this._planProgress = { planId, currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true, pinned: false };
  }

  /** Get current active block for proactive speech and UI */
  getActiveBlock() {
    return this._planProgress;
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

  async _fetchSimilarSongs(recentIds, hourArtists) {
    if (!this.queueStore.current) { console.log('[Recommender] _fetchSimilarSongs: no queue.current'); return []; }
    try {
      const currentId = this.queueStore.current.id || this.queueStore.current.song_id;
      return (await this.music.similar(String(currentId))).slice(0, 10);
    } catch (e) { console.log('[Recommender] _fetchSimilarSongs error:', e.message); return []; }
  }

  async _fetchDailyRecommendations(recentIds, hourArtists) {
    try {
      return (await this.music.dailyRecommend()).slice(0, 15);
    } catch (e) { console.log('[Recommender] _fetchDailyRecommendations error:', e.message); return []; }
  }

  async _fetchGenreSearch(recentIds, hourArtists) {
    try {
      // Search by top artist
      const artist = this.topArtists[Math.floor(Math.random() * Math.min(this.topArtists.length, 10))];
      if (!artist) { console.log('[Recommender] _fetchGenreSearch: no top artists'); return []; }
      return (await this.music.search(artist.name, 10)).slice(0, 5);
    } catch (e) { console.log('[Recommender] _fetchGenreSearch error:', e.message); return []; }
  }

  async getSongDetails(songIds) {
    if (songIds.length === 0) return [];
    try {
      return await this.music.details(songIds);
    } catch { return []; }
  }
}

export const recommender = new Recommender();
