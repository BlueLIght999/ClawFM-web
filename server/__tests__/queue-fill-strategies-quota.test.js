import { describe, it, expect, vi } from 'vitest';
import { collectFromStrategies } from '../domain/curation/QueueFillStrategies.js';
import { rankSongsByTopArtists } from '../domain/curation/recommenderRules.js';

const song = (id, name, artist = 'unknown') => ({ id, name, ar: [{ name: artist }] });

describe('P1-3: collectFromStrategies — per-strategy quota prevents domination', () => {
  it('includes songs from multiple strategies even when first strategy fills targetSize', async () => {
    const strategies = [
      () => Promise.resolve([song(1, 'a1'), song(2, 'a2'), song(3, 'a3'), song(4, 'a4'), song(5, 'a5'), song(6, 'a6')]),
      () => Promise.resolve([song(7, 'b1'), song(8, 'b2'), song(9, 'b3'), song(10, 'b4')]),
      () => Promise.resolve([song(11, 'c1'), song(12, 'c2')]),
    ];
    const names = ['genreHints', 'personalFm', 'similarSongs'];
    const recentIds = new Set();

    const result = await collectFromStrategies(strategies, names, recentIds, 10, { perStrategyQuota: 4 });

    // First strategy should be capped at 4, not 6
    const fromFirst = result.filter(s => s.id <= 6).length;
    expect(fromFirst).toBeLessThanOrEqual(4);

    // Second strategy songs should be present
    const fromSecond = result.filter(s => s.id >= 7 && s.id <= 10).length;
    expect(fromSecond).toBeGreaterThan(0);

    // Third strategy songs should be present
    const fromThird = result.filter(s => s.id >= 11).length;
    expect(fromThird).toBeGreaterThan(0);
  });

  it('fills to targetSize when strategies have enough songs with quota', async () => {
    const strategies = [
      () => Promise.resolve([song(1, 'a1'), song(2, 'a2'), song(3, 'a3')]),
      () => Promise.resolve([song(4, 'b1'), song(5, 'b2'), song(6, 'b3')]),
      () => Promise.resolve([song(7, 'c1'), song(8, 'c2'), song(9, 'c3')]),
    ];
    const names = ['genreHints', 'personalFm', 'similarSongs'];

    const result = await collectFromStrategies(strategies, names, new Set(), 8, { perStrategyQuota: 4 });
    expect(result.length).toBe(8);
  });

  it('falls back to sequential fill when quota option is not provided (backward compat)', async () => {
    const strategies = [
      () => Promise.resolve([song(1, 'a1'), song(2, 'a2'), song(3, 'a3'), song(4, 'a4'), song(5, 'a5')]),
      () => Promise.resolve([song(6, 'b1')]),
    ];
    const names = ['first', 'second'];

    // No quota option → original behavior
    const result = await collectFromStrategies(strategies, names, new Set(), 5);
    expect(result.length).toBe(5);
    expect(result.every(s => s.id <= 5)).toBe(true);
  });

  it('handles fewer songs than quota gracefully, second pass fills remaining', async () => {
    const strategies = [
      () => Promise.resolve([song(1, 'a1')]),
      () => Promise.resolve([song(2, 'b1'), song(3, 'b2'), song(4, 'b3'), song(5, 'b4'), song(6, 'b5')]),
    ];
    const names = ['first', 'second'];

    const result = await collectFromStrategies(strategies, names, new Set(), 5, { perStrategyQuota: 3 });
    // First pass: first contributes 1 (below quota), second contributes 3 (at quota) = 4
    // Second pass: fills remaining 1 from second strategy = 5
    expect(result.length).toBe(5);
    // First strategy song should be present
    expect(result.some(s => s.id === 1)).toBe(true);
    // Second strategy should have contributed songs
    const fromSecond = result.filter(s => s.id >= 2).length;
    expect(fromSecond).toBe(4); // 3 from first pass + 1 from second pass
  });
});

describe('P1-4: rankSongsByTopArtists applied after collection', () => {
  it('ranks songs matching topArtists higher in the final list', () => {
    const songs = [
      song(1, 'random1', 'Unknown Artist'),
      song(2, 'fav1', 'Jay Chou'),
      song(3, 'random2', 'Another Artist'),
      song(4, 'fav2', 'Jay Chou'),
    ];
    const topArtists = [{ name: 'Jay Chou' }, { name: 'Eason Chan' }];

    const ranked = rankSongsByTopArtists(songs, topArtists);

    // Jay Chou songs should be first
    expect(ranked[0].ar[0].name).toBe('Jay Chou');
    expect(ranked[1].ar[0].name).toBe('Jay Chou');
  });

  it('preserves all songs even when none match topArtists', () => {
    const songs = [song(1, 'a', 'X'), song(2, 'b', 'Y')];
    const topArtists = [{ name: 'Z' }];

    const ranked = rankSongsByTopArtists(songs, topArtists);
    expect(ranked.length).toBe(2);
  });
});
