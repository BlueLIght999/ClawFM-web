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

  // P1: 增大用户偏好偏重 — topArtists 匹配的歌曲获得显著加权
  it('rankSongsByTopArtists_topArtistSongBeatsNonTopEvenWithManySongs', () => {
    const songs = [
      { id: '1', artist: 'Unknown A' },
      { id: '2', artist: 'Unknown B' },
      { id: '3', artist: 'Unknown C' },
      { id: '4', artist: 'Unknown D' },
      { id: '5', artist: 'Jay Chou' },  // top artist
    ];
    const topArtists = [{ name: 'Jay Chou', count: 50 }];

    const ranked = rankSongsByTopArtists(songs, topArtists);
    expect(ranked[0].id).toBe('5');
  });

  it('rankSongsByTopArtists_top1ArtistGetsExtraBoost', () => {
    // When two songs match different topArtists, the #1 artist should rank higher
    const songs = [
      { id: '1', artist: 'Second Artist' },
      { id: '2', artist: 'Top Artist' },
    ];
    const topArtists = [
      { name: 'Top Artist', count: 100 },
      { name: 'Second Artist', count: 50 },
    ];

    const ranked = rankSongsByTopArtists(songs, topArtists);
    expect(ranked[0].id).toBe('2'); // Top Artist should rank first
  });

  it('rankSongsByTopArtists_weightedScoreDominatesOverCount', () => {
    // A song matching top artist should rank above a song matching 2 lower artists
    // (weighted score > count-only)
    const songs = [
      { id: '1', artist: 'LowA, LowB' },    // 2 matches but low rank
      { id: '2', artist: 'TopArtist' },       // 1 match but #1
    ];
    const topArtists = [
      { name: 'TopArtist', count: 100 },
      { name: 'LowA', count: 10 },
      { name: 'LowB', count: 10 },
    ];

    const ranked = rankSongsByTopArtists(songs, topArtists);
    expect(ranked[0].id).toBe('2');
  });

  it('rankSongsByTopArtists_preservesAllSongsWhenNoMatch', () => {
    const songs = [
      { id: '1', artist: 'X' },
      { id: '2', artist: 'Y' },
    ];
    const topArtists = [{ name: 'Z', count: 5 }];

    const ranked = rankSongsByTopArtists(songs, topArtists);
    expect(ranked.length).toBe(2);
  });
});
