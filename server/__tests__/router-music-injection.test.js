import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P0-1: bootstrap.js 未将 music 注入 intentRouter，导致 router.js 中
 *        所有音乐搜索路径返回 CHAT_FALLBACK。
 * P0-2: searchMatch 正则 \s+ 要求空格，中文无空格输入"来点爵士"不匹配。
 */

vi.mock('../infrastructure/netease/neteaseApi.js', () => ({
  searchSongs: vi.fn(),
  getSongUrl: vi.fn(async () => ({ data: [{ url: null }] })),
  getLyric: vi.fn(async () => ({})),
  getSimilarSongs: vi.fn(async () => ({ songs: [] })),
  getPersonalFm: vi.fn(async () => ({ data: [] })),
  getRecommendSongs: vi.fn(async () => ({ data: { dailySongs: [] } })),
  getSongDetail: vi.fn(async () => ({ songs: [] })),
  getLikedSongs: vi.fn(async () => ({ ids: [] })),
  getUserPlaylists: vi.fn(async () => ({ playlist: [] })),
  getPlaylistTracks: vi.fn(async () => ({ songs: [] })),
  scrobbleSong: vi.fn(async () => {}),
  getArtistDetail: vi.fn(),
  getArtistDesc: vi.fn(),
  getArtistSongs: vi.fn(),
  getStyleList: vi.fn(),
  getStyleSongs: vi.fn(),
  getStyleArtists: vi.fn(),
  getSongWikiSummary: vi.fn(),
  getSongCreators: vi.fn(),
  getSimilarArtists: vi.fn(),
  getPlaymodeIntelligenceList: vi.fn(),
  getRecommendResource: vi.fn(),
  getPersonalized: vi.fn(),
  getSearchSuggest: vi.fn(),
  getSearchHotDetail: vi.fn(),
  getPlaylistCatlist: vi.fn(),
  getPlaylistHot: vi.fn(),
}));
vi.mock('../services/claude.js', () => ({
  extractIntent: vi.fn(),
}));

import { routeIntent } from '../services/router.js';
import { searchSongs } from '../infrastructure/netease/neteaseApi.js';
import { createLegacyIntentRouterAdapter } from '../agent/infrastructure/LegacyIntentRouterAdapter.js';

const song = (id, name) => ({ id, name, ar: [{ name: 'x' }] });

const mockMusic = {
  search: async (query, limit) => {
    const res = await searchSongs(query, limit);
    return res?.result?.songs || [];
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P0-1: music injection through LegacyIntentRouterAdapter', () => {
  it('passes music dep through to routeIntent for search queries', async () => {
    searchSongs.mockResolvedValue({ result: { songs: [song(1, '晴天')] } });

    // Simulate bootstrap wiring: adapter created with { music } in deps
    const adapter = createLegacyIntentRouterAdapter(routeIntent, { music: mockMusic });
    const result = await adapter.route('放 晴天');

    expect(result.route).toBe('ncm');
    expect(result.action).toBe('play_search');
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('returns CHAT_FALLBACK when music is NOT injected (regression guard)', async () => {
    // Without music injection (the bug)
    const adapter = createLegacyIntentRouterAdapter(routeIntent, {});
    const result = await adapter.route('放 晴天');

    expect(result.route).toBe('claude');
    expect(result.action).toBe('chat');
  });

  it('passes music through for AI-extracted play_mood intent', async () => {
    const { extractIntent } = await import('../services/claude.js');
    extractIntent.mockResolvedValue({ action: 'play_mood', params: { mood: 'happy' } });
    searchSongs.mockResolvedValue({ result: { songs: [song(1, 'a')] } });

    const adapter = createLegacyIntentRouterAdapter(routeIntent, { music: mockMusic });
    const result = await adapter.route('我想开心一点');

    expect(result.route).toBe('hybrid');
    expect(result.action).toBe('play_mood');
    expect(searchSongs).toHaveBeenCalledWith('欢快 流行', 5);
  });
});

describe('P0-2: searchMatch regex supports Chinese no-space input', () => {
  it('matches "来点爵士" without space — genre query', async () => {
    const result = await routeIntent('来点爵士', { music: mockMusic });
    expect(result.route).toBe('ncm');
    expect(result.action).toBe('play_personalized');
    expect(result.params.preference).toBe('爵士');
  });

  it('matches "播周杰伦" without space — artist search', async () => {
    searchSongs.mockResolvedValue({ result: { songs: [song(1, '夜曲')] } });
    const result = await routeIntent('播周杰伦', { music: mockMusic });
    expect(result.route).toBe('ncm');
    expect(result.action).toBe('play_search');
  });

  it('matches "我想听晴天" without space — song search', async () => {
    searchSongs.mockResolvedValue({ result: { songs: [song(1, '晴天')] } });
    const result = await routeIntent('我想听晴天', { music: mockMusic });
    expect(result.route).toBe('ncm');
    expect(result.action).toBe('play_search');
  });

  it('still matches "放 爵士" with space (backward compat)', async () => {
    const result = await routeIntent('放 爵士', { music: mockMusic });
    expect(result.route).toBe('ncm');
    expect(result.action).toBe('play_personalized');
  });
});
