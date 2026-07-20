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

    await this._collectPlaylistSongs(playlists, songs, artistCount);
    await this._collectLikedSongs(uid, songs, artistCount);

    for (const [, song] of songs) {
      this.seedPoolRepo.upsert(song);
    }

    const topArtists = computeTopArtists(artistCount);
    this._writeUserCorpus(songs.size, topArtists);

    return { songs: songs.size, topArtists };
  }

  async _collectPlaylistSongs(playlists, songs, artistCount) {
    for (const pl of playlists.slice(0, 10)) {
      try {
        const tracks = await this.music.playlistTracks(pl.id);
        for (const track of tracks) {
          this._addSeedSong(track, songs, artistCount, `playlist:${pl.name}`);
        }
      } catch (e) {
        // P1: log error instead of silently swallowing — aids diagnosing empty seed pool
        console.warn(`[SeedPoolBuilder] Failed to fetch playlist "${pl?.name}" (${pl?.id}):`, e.message);
      }
    }
  }

  async _collectLikedSongs(uid, songs, artistCount) {
    try {
      const likedSongs = await this.music.likedSongs(uid);
      for (const item of likedSongs.slice(0, 500)) {
        const seedSong = toSeedSongFromTrack(item, 'liked');
        if (!songs.has(seedSong.songId)) {
          songs.set(seedSong.songId, seedSong);
          for (const name of seedSong.artist.split(',').map(a => a.trim()).filter(Boolean)) {
            artistCount[name] = (artistCount[name] || 0) + 1;
          }
        }
      }
    } catch (e) {
      // P1: log error instead of silently swallowing
      console.warn('[SeedPoolBuilder] Failed to fetch liked songs:', e.message);
    }
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

  _writeUserCorpus(totalSongs, topArtists) {
    try {
      const existingTaste = this.corpus.readTaste();
      if (isTasteTemplate(existingTaste)) {
        const tasteContent = buildTasteMarkdown({
          topArtists,
          topGenres: [],
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
