import {
  getUserPlaylists,
  getPlaylistTracks,
  getLikedSongs,
  getRecommendSongs,
  getPersonalFm,
  getSimilarSongs,
  getSmartPlaylist,
  searchSongs,
  getSongDetail,
} from './netease.js';
import {
  setUserProfile,
  getUserProfile,
  getRecentSongIds,
  getSeedPool,
  upsertSeedPool,
  getArtistPlayCount,
} from '../db/history.js';
import { queue } from './queue.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildTasteMarkdown } from '../domain/curation/buildTasteMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DIR = resolve(__dirname, '..', '..', 'user');

export class Recommender {
  constructor() {
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
    const profile = getUserProfile();
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
      const playlistRes = await getUserPlaylists(this.uid);
      const playlists = playlistRes.playlist || [];

      const songs = new Map();
      const artistCount = {};
      const genreCount = {};

      // Process playlists (limit to top 10 to avoid rate limiting)
      for (const pl of playlists.slice(0, 10)) {
        try {
          const tracksRes = await getPlaylistTracks(pl.id);
          const tracks = tracksRes.songs || tracksRes.tracks || [];
          for (const track of tracks) {
            const sid = String(track.id);
            if (songs.has(sid)) continue;
            songs.set(sid, {
              song_id: sid,
              title: track.name || track.title,
              artist: (track.ar || []).map(a => a.name).join(', ') || track.artist || '',
              album: track.al?.name || track.album || '',
              duration: track.dt || track.duration || 0,
              source: `playlist:${pl.name}`,
              genre_tags: JSON.stringify(track.genres || []),
            });
            // Count artists
            for (const a of (track.ar || [])) {
              artistCount[a.name] = (artistCount[a.name] || 0) + 1;
            }
          }
        } catch (e) { /* skip failed playlist */ }
      }

      // Add liked songs
      try {
        const likedRes = await getLikedSongs(this.uid);
        const likedSongs = likedRes.ids || [];
        for (const item of likedSongs.slice(0, 500)) {
          const sid = String(item.id);
          if (!songs.has(sid)) {
            songs.set(sid, {
              song_id: sid,
              title: item.name || '',
              artist: (item.ar || []).map(a => a.name).join(', '),
              album: item.al?.name || '',
              duration: item.dt || 0,
              source: 'liked',
              genre_tags: '[]',
            });
          }
        }
      } catch (e) { /* skip */ }

      // Store in DB
      for (const [, song] of songs) {
        upsertSeedPool(song);
      }

      // Store profile
      this.topArtists = Object.entries(artistCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));

      setUserProfile('topArtists', this.topArtists);
      this.seedPool = getSeedPool();

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
      if (!existsSync(USER_DIR)) mkdirSync(USER_DIR, { recursive: true });

      // Build taste.md — only overwrite if still a template (empty artists list)
      const tastePath = resolve(USER_DIR, 'taste.md');
      const existingTaste = existsSync(tastePath) ? readFileSync(tastePath, 'utf-8') : '';
      const isEmpty = !/^-\s*\S/m.test(existingTaste); // no non-empty list items
      console.log('[Recommender] taste.md exists:', existsSync(tastePath), 'isEmpty:', isEmpty);

      if (isEmpty) {
        const tasteContent = buildTasteMarkdown({
          topArtists: this.topArtists,
          topGenres: this.topGenres,
          totalSongs,
          date: new Date().toISOString().split('T')[0],
        });
        writeFileSync(tastePath, tasteContent, 'utf-8');
        console.log('[Recommender] User taste.md auto-filled');
      }

      // Fill routines.md genre gaps
      const routinesPath = resolve(USER_DIR, 'routines.md');
      const existingRoutines = existsSync(routinesPath) ? readFileSync(routinesPath, 'utf-8') : '';
      const routinesEmpty = existingRoutines && !/Genre: \S/.test(existingRoutines);
      console.log('[Recommender] routines.md exists:', existsSync(routinesPath), 'routinesEmpty:', routinesEmpty);
      if (routinesEmpty) {
        // Map time-of-day to genres from top artists
        const topArtistNames = this.topArtists.slice(0, 10).map(a => a.name);
        const routinesContent = `# Daily Routines

## Morning (06:00 - 10:00)
Mood: energetic but gentle
Genre: pop, acoustic, indie folk

## Daytime (10:00 - 17:00)
Mood: focused, neutral
Genre: instrumental, ambient, post-rock

## Evening (17:00 - 22:00)
Mood: warm, engaged
Genre: ${topArtistNames.slice(0, 3).join(', ') || 'indie, electronic, jazz'}

## Late Night (22:00 - 06:00)
Mood: intimate, chill
Genre: ambient, lo-fi, dream pop

## Weekend
Mood: relaxed, exploratory
Genre: mix of favorites + new discoveries
`;
        writeFileSync(routinesPath, routinesContent, 'utf-8');
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
          const res = await searchSongs(genre, 5);
          const tracks = (res.result?.songs || []).filter(t => {
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

    const recentIds = new Set(getRecentSongIds(200));
    const hourArtists = new Set(getArtistPlayCount(1).slice(0, 10).map(a => a.artist));
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
      queue.addSongs(allSongs);
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
    const recentIds = new Set(getRecentSongIds(200));
    const allSongs = [];

    // Step 1: try matching from seed pool
    if (preference) {
      const seedMatches = this._filterSeedPoolByPreference(preference);
      if (seedMatches.length > 0) {
        try {
          const details = await getSongDetail(seedMatches.slice(0, 20));
          const tracks = (details.songs || []).filter(t => {
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
        const res = await searchSongs(preference, 15);
        const tracks = (res.result?.songs || []).filter(t => {
          const sid = String(t.id);
          return !recentIds.has(sid);
        });
        // Prioritize songs by user's top artists
        const topArtistNames = new Set(this.topArtists.slice(0, 15).map(a => a.name.toLowerCase()));
        const scored = tracks.map(t => {
          const artists = (t.ar || []).map(a => a.name.toLowerCase());
          const score = artists.filter(a => topArtistNames.has(a)).length;
          return { track: t, score };
        });
        scored.sort((a, b) => b.score - a.score);
        for (const { track } of scored) {
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
      queue.addSongs(allSongs);
    }
    return allSongs;
  }

  /** Generic fill without plan hints — used as fallback */
  async _fillGeneric(targetSize, recentIds) {
    const hourArtists = new Set(getArtistPlayCount(1).slice(0, 10).map(a => a.artist));
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
    const pool = getSeedPool();
    if (!pool.length) return [];
    const kw = preference.toLowerCase();
    const matched = [];
    for (const row of pool) {
      try {
        const tags = JSON.parse(row.genre_tags || '[]');
        const tagStr = (Array.isArray(tags) ? tags : []).join(' ').toLowerCase();
        const title = (row.title || '').toLowerCase();
        const artist = (row.artist || '').toLowerCase();
        if (tagStr.includes(kw) || title.includes(kw) || artist.includes(kw)) {
          matched.push(String(row.song_id));
        }
      } catch {
        // Simple string match fallback
        const all = `${row.title||''} ${row.artist||''} ${row.genre_tags||''}`.toLowerCase();
        if (all.includes(kw)) matched.push(String(row.song_id));
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
      const res = await getPersonalFm();
      const tracks = res.data || [];
      return tracks.filter(t => {
        const artist = (t.ar || []).map(a => a.name).join(', ');
        return !hourArtists.has(artist);
      });
    } catch (e) { console.log('[Recommender] _fetchPersonalFm error:', e.message); return []; }
  }

  async _fetchSimilarSongs(recentIds, hourArtists) {
    if (!queue.current) { console.log('[Recommender] _fetchSimilarSongs: no queue.current'); return []; }
    try {
      const currentId = queue.current.id || queue.current.song_id;
      const res = await getSimilarSongs(String(currentId));
      return (res.songs || []).slice(0, 10);
    } catch (e) { console.log('[Recommender] _fetchSimilarSongs error:', e.message); return []; }
  }

  async _fetchDailyRecommendations(recentIds, hourArtists) {
    try {
      const res = await getRecommendSongs();
      return (res.data?.dailySongs || res.recommend || []).slice(0, 15);
    } catch (e) { console.log('[Recommender] _fetchDailyRecommendations error:', e.message); return []; }
  }

  async _fetchGenreSearch(recentIds, hourArtists) {
    try {
      // Search by top artist
      const artist = this.topArtists[Math.floor(Math.random() * Math.min(this.topArtists.length, 10))];
      if (!artist) { console.log('[Recommender] _fetchGenreSearch: no top artists'); return []; }
      const res = await searchSongs(artist.name, 10);
      return (res.result?.songs || []).slice(0, 5);
    } catch (e) { console.log('[Recommender] _fetchGenreSearch error:', e.message); return []; }
  }

  async getSongDetails(songIds) {
    if (songIds.length === 0) return [];
    try {
      const res = await getSongDetail(songIds);
      return res.songs || [];
    } catch { return []; }
  }
}

export const recommender = new Recommender();
