import { artistName } from '../hosting/artistName.js';

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null) ?? '';
}

function lower(value) {
  return String(value || '').toLowerCase();
}

export function toSeedSongFromTrack(track, source = '') {
  const { id, songId, song_id, name, title, al = {}, album, dt, durationMs, duration, genres, playCount, play_count } = track || {};
  return {
    songId: String(firstValue(id, songId, song_id)),
    title: firstValue(name, title),
    artist: artistName(track),
    album: firstValue(al.name, album),
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

export function rankSongsByTopArtists(songs, topArtists) {
  const topArtistNames = new Set(
    (topArtists || []).slice(0, 15).map(a => lower(a.name))
  );
  return [...(songs || [])].sort((a, b) =>
    artistScore(b, topArtistNames) - artistScore(a, topArtistNames)
  );
}

function artistScore(song, topArtistNames) {
  return artistName(song)
    .split(',')
    .map(name => lower(name.trim()))
    .filter(name => topArtistNames.has(name))
    .length;
}
