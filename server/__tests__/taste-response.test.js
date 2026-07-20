import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P0: /api/taste 永远返回 totalSongs: 0，因为读取 profile.analysis?.totalSongs
 * 但 analysis 从未写入 user_profile 表。应改为从 listen_history 表统计。
 */

vi.mock('../db/schema.js', () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  saveDb: vi.fn(),
}));

vi.mock('../db/history.js', () => ({
  getListenHistory: vi.fn(),
  recordListen: vi.fn(),
  getRecentSongIds: vi.fn(),
  getArtistPlayCount: vi.fn(),
  getChatHistory: vi.fn(),
  saveChatMessage: vi.fn(),
  saveQueueSnapshot: vi.fn(),
  getLatestQueueSnapshot: vi.fn(),
  getSeedPool: vi.fn(),
  upsertSeedPool: vi.fn(),
  incrementPlayCount: vi.fn(),
  getUserProfile: vi.fn(),
  setUserProfile: vi.fn(),
  savePlan: vi.fn(),
  getPlan: vi.fn(),
  getListenCount: vi.fn(),
}));

import { getListenCount } from '../db/history.js';
import { buildTasteResponse } from '../domain/profile/tasteResponse.js';

describe('P0: buildTasteResponse — totalSongs from listen_history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns real listen count from listen_history table', () => {
    getListenCount.mockReturnValue(42);
    const profile = { topArtists: [{ name: 'Jay Chou', count: 10 }] };

    const result = buildTasteResponse({ profile, getListenCount });

    expect(result.totalSongs).toBe(42);
    expect(getListenCount).toHaveBeenCalled();
  });

  it('returns 0 when listen_history is empty', () => {
    getListenCount.mockReturnValue(0);
    const profile = {};

    const result = buildTasteResponse({ profile, getListenCount });

    expect(result.totalSongs).toBe(0);
  });

  it('includes topArtists from profile (capped at 10)', () => {
    getListenCount.mockReturnValue(5);
    const topArtists = Array.from({ length: 15 }, (_, i) => ({ name: `Artist${i}`, count: 15 - i }));
    const profile = { topArtists };

    const result = buildTasteResponse({ profile, getListenCount });

    expect(result.topArtists).toHaveLength(10);
    expect(result.topArtists[0].name).toBe('Artist0');
  });

  it('includes currentMood from time-of-day', () => {
    getListenCount.mockReturnValue(0);
    const profile = {};

    const result = buildTasteResponse({ profile, getListenCount, currentMood: 'morning' });

    expect(result.currentMood).toBe('morning');
  });

  it('does NOT read profile.analysis (which is never written)', () => {
    getListenCount.mockReturnValue(10);
    // profile has analysis but it should NOT be used for totalSongs
    const profile = { analysis: { totalSongs: 999 }, topArtists: [] };

    const result = buildTasteResponse({ profile, getListenCount });

    expect(result.totalSongs).toBe(10); // from listen_history, not analysis
  });
});
