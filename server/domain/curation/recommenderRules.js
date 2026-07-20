import { artistName } from '../hosting/artistName.js';
import { albumName } from './toSongDTO.js';

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null) ?? '';
}

function lower(value) {
  return String(value || '').toLowerCase();
}

export function toSeedSongFromTrack(track, source = '') {
  const { id, songId, song_id, name, title, dt, durationMs, duration, genres, playCount, play_count } = track || {};
  return {
    songId: String(firstValue(id, songId, song_id)),
    title: firstValue(name, title),
    artist: artistName(track),
    album: albumName(track),
    durationMs: firstValue(dt, durationMs, duration, 0),
    source,
    genreTags: Array.isArray(genres) ? genres : [],
    playCount: firstValue(playCount, play_count, 0),
  };
}

export function seedSongMatchesPreference(seedSong, preference) {
  const keyword = lower(preference);
  if (!keyword) return false;
  const tags = Array.isArray(seedSong?.genreTags) ? seedSong.genreTags : [];
  const haystack = [
    seedSong?.title,
    seedSong?.artist,
    ...tags,
  ].map(lower).join(' ');
  return haystack.includes(keyword);
}

/**
 * Rank songs by user's top artists with weighted preference.
 *
 * P1: Increased preference weight — top artists get exponentially more weight
 * based on their rank position. The #1 artist gets TOP1_BOOST extra points.
 * This ensures user's most-listened artists dominate the queue over generic
 * recommendations.
 */
export function rankSongsByTopArtists(songs, topArtists) {
  const topList = (topArtists || []).slice(0, 15);
  const topArtistNames = new Set(topList.map(a => lower(a.name)));

  // Build weight map: #1 artist gets 5.0, exponential decay by rank
  // Formula ensures top1 single match beats any combination of lower-rank matches
  const weightMap = new Map();
  topList.forEach((a, idx) => {
    const baseWeight = 5.0 * Math.pow(0.6, idx); // 5.0, 3.0, 1.8, 1.08, 0.65, ...
    weightMap.set(lower(a.name), baseWeight);
  });

  return [...(songs || [])].sort((a, b) =>
    artistWeightedScore(b, weightMap, topArtistNames) -
    artistWeightedScore(a, weightMap, topArtistNames)
  );
}

function artistWeightedScore(song, weightMap, topArtistNames) {
  return artistName(song)
    .split(',')
    .map(name => lower(name.trim()))
    .filter(name => topArtistNames.has(name))
    .reduce((sum, name) => sum + (weightMap.get(name) || 0), 0);
}
