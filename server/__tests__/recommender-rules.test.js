import { describe, it, expect } from 'vitest';
import {
  rankSongsByTopArtists,
  seedSongMatchesPreference,
  toSeedSongFromTrack,
} from '../domain/curation/recommenderRules.js';

describe('recommenderRules', () => {
  it('toSeedSongFromTrack_mapsNeteaseTrackToCamelCaseSeedSong', () => {
    const seedSong = toSeedSongFromTrack({
      id: 186016,
      name: '晴天',
      ar: [{ name: '周杰伦' }],
      al: { name: '叶惠美' },
      dt: 269000,
      genres: ['pop'],
    }, 'playlist:Favorites');

    expect(seedSong).toEqual({
      songId: '186016',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationMs: 269000,
      source: 'playlist:Favorites',
      genreTags: ['pop'],
      playCount: 0,
    });
  });

  it('seedSongMatchesPreference_matchesGenreTitleOrArtist', () => {
    const seedSong = {
      songId: '1',
      title: '午夜爵士',
      artist: 'Blue Trio',
      album: '',
      durationMs: 180000,
      source: 'liked',
      genreTags: ['jazz', 'night'],
      playCount: 0,
    };

    expect(seedSongMatchesPreference(seedSong, 'jazz')).toBe(true);
    expect(seedSongMatchesPreference(seedSong, '午夜')).toBe(true);
    expect(seedSongMatchesPreference(seedSong, 'blue')).toBe(true);
    expect(seedSongMatchesPreference(seedSong, 'metal')).toBe(false);
  });

  it('rankSongsByTopArtists_prioritizesSongsByListenerArtists', () => {
    const songs = [
      { id: '1', title: 'Other', artist: 'Someone Else' },
      { id: '2', title: 'Hit', artist: '周杰伦' },
      { id: '3', title: 'Duet', artist: 'Blue Trio, 周杰伦' },
    ];

    expect(rankSongsByTopArtists(songs, [{ name: '周杰伦', count: 9 }]).map(s => s.id))
      .toEqual(['2', '3', '1']);
  });
});
