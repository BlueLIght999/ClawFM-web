/**
 * SeedPoolBuilder — pure domain logic for constructing the user's seed pool.
 *
 * Collects songs from user playlists + liked songs, computes top artists,
 * writes user corpus markdown if templates are unfilled.
 * All I/O via injected dependencies (music port, seedPoolRepo, profile, corpus).
 */

import { toSeedSongFromTrack } from './recommenderRules.js';
import { buildTasteMarkdown } from './buildTasteMarkdown.js';
import {
  isTasteTemplate,
  isRoutinesTemplate,
  buildRoutinesMarkdown,
} from './userCorpusRules.js';

/** Pure function: sort artists by count, limit to 30 */
export function computeTopArtists(artistCount) {
  return Object.entries(artistCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));
}

/** Pure function: sort genres by count, limit to top 10 names */
export function computeTopGenres(genreCount) {
  return Object.entries(genreCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name]) => name);
}

/** Detect login-expired errors that should abort the build and notify the user. */
function isLoginExpiredError(e) {
  const msg = (e?.message || '').toLowerCase();
  return msg.includes('login expired') || msg.includes('please re-login');
}

export class SeedPoolBuilder {
  constructor({ music = null, seedPoolRepo = null, profile = null, corpus = null } = {}) {
    this.music = music;
    this.seedPoolRepo = seedPoolRepo;
    this.profile = profile;
    this.corpus = corpus;
  }

  /**
   * Build the seed pool for a user.
   * @param {string} uid user id
   * @returns {Promise<{songs: number, topArtists: Array}>}
   */
  async build(uid) {
    const playlists = await this.music.userPlaylists(uid);
    const songs = new Map();
    const artistCount = {};
    const genreCount = {};

    await this._collectPlaylistSongs(playlists, songs, artistCount, genreCount);
    await this._collectLikedSongs(uid, songs, artistCount, genreCount);

    for (const [, song] of songs) {
      this.seedPoolRepo.upsert(song);
    }

    const topArtists = computeTopArtists(artistCount);
    const topGenres = computeTopGenres(genreCount);
    this._writeUserCorpus(songs.size, topArtists, topGenres);

    return { songs: songs.size, topArtists, topGenres };
  }

  async _collectPlaylistSongs(playlists, songs, artistCount, genreCount) {
    for (const pl of playlists.slice(0, 10)) {
      try {
        const tracks = await this.music.playlistTracks(pl.id);
        for (const track of tracks) {
          this._addSeedSong(track, songs, artistCount, genreCount, `playlist:${pl.name}`);
        }
      } catch (e) {
        if (isLoginExpiredError(e)) throw e;
        console.warn(`[SeedPoolBuilder] Failed to fetch playlist "${pl?.name}" (${pl?.id}):`, e.message);
      }
    }
  }

  async _collectLikedSongs(uid, songs, artistCount, genreCount) {
    try {
      const likedSongs = await this.music.likedSongs(uid);
      for (const item of likedSongs.slice(0, 500)) {
        const seedSong = toSeedSongFromTrack(item, 'liked');
        if (!songs.has(seedSong.songId)) {
          songs.set(seedSong.songId, seedSong);
          this._countArtists(seedSong, artistCount);
          this._countGenres(seedSong, genreCount);
        }
      }
    } catch (e) {
      if (isLoginExpiredError(e)) throw e;
      console.warn('[SeedPoolBuilder] Failed to fetch liked songs:', e.message);
    }
  }

  _addSeedSong(track, songs, artistCount, genreCount, source) {
    const seedSong = toSeedSongFromTrack(track, source);
    const sid = seedSong.songId;
    if (songs.has(sid)) return;
    songs.set(sid, seedSong);
    this._countArtists(seedSong, artistCount);
    this._countGenres(seedSong, genreCount);
  }

  _countArtists(seedSong, artistCount) {
    for (const name of seedSong.artist.split(',').map(a => a.trim()).filter(Boolean)) {
      artistCount[name] = (artistCount[name] || 0) + 1;
    }
  }

  _countGenres(seedSong, genreCount) {
    for (const genre of seedSong.genreTags || []) {
      const name = String(genre).trim();
      if (name) genreCount[name] = (genreCount[name] || 0) + 1;
    }
  }

  _writeUserCorpus(totalSongs, topArtists, topGenres) {
    try {
      const existingTaste = this.corpus.readTaste();
      if (isTasteTemplate(existingTaste)) {
        const tasteContent = buildTasteMarkdown({
          topArtists,
          topGenres,
          totalSongs,
          date: new Date().toISOString().split('T')[0],
        });
        this.corpus.writeTaste(tasteContent);
      }

      const existingRoutines = this.corpus.readRoutines();
      if (isRoutinesTemplate(existingRoutines)) {
        const topArtistNames = topArtists.slice(0, 10).map(a => a.name);
        this.corpus.writeRoutines(buildRoutinesMarkdown(topArtistNames));
      }
    } catch (e) {
      console.error('[SeedPoolBuilder] User corpus write failed:', e.message);
    }
  }
}
