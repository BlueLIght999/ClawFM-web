import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 特征测试 —— 钉住 routeIntent 的现有行为，为后续把 switch 拆成
 * handler 分发表(结构性重构)提供安全网。
 *
 * 隔离两个外部 IO 依赖:
 *   searchSongs (netease) — mock 返回可控歌曲
 *   extractIntent (claude) — mock 返回可控 intent
 * fast-route 路径提前返回、不碰 IO，但仍走 mock 后的模块。
 */

vi.mock('../services/netease.js', () => ({
  searchSongs: vi.fn(),
}));
vi.mock('../services/claude.js', () => ({
  extractIntent: vi.fn(),
}));

import { routeIntent } from '../services/router.js';
import { searchSongs } from '../services/netease.js';
import { extractIntent } from '../services/claude.js';

const song = (id, name) => ({ id, name, ar: [{ name: 'x' }] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('routeIntent fast routes (no AI)', () => {
  it('skip_returnsNcmSkip_withoutCallingAI', async () => {
    const r = await routeIntent('切歌');
    expect(r).toEqual({ route: 'ncm', action: 'skip', params: {} });
    expect(extractIntent).not.toHaveBeenCalled();
    expect(searchSongs).not.toHaveBeenCalled();
  });

  it('reject_returnsRejectRecommend', async () => {
    const r = await routeIntent('不好听');
    expect(r.action).toBe('reject_recommend');
    expect(extractIntent).not.toHaveBeenCalled();
  });
});

describe('routeIntent search-direct path', () => {
  it('playPrefix_genreQuery_routesPersonalized', async () => {
    const r = await routeIntent('放 爵士');
    expect(r).toEqual({ route: 'ncm', action: 'play_personalized', params: { preference: '爵士' } });
    expect(searchSongs).not.toHaveBeenCalled();
  });

  it('playPrefix_songName_searchesAndReturnsResults', async () => {
    searchSongs.mockResolvedValue({ result: { songs: [song(1, '晴天'), song(2, '稻香')] } });
    const r = await routeIntent('放 晴天');
    expect(r.route).toBe('ncm');
    expect(r.action).toBe('play_search');
    expect(r.params.query).toBe('晴天');
    expect(r.results.length).toBeGreaterThan(0);
  });
});

describe('routeIntent AI path (extractIntent)', () => {
  it('playMood_mapsMoodAndSearches', async () => {
    extractIntent.mockResolvedValue({ action: 'play_mood', params: { mood: 'happy' } });
    searchSongs.mockResolvedValue({ result: { songs: [song(1, 'a')] } });
    const r = await routeIntent('我想开心一点');
    expect(r.route).toBe('hybrid');
    expect(r.action).toBe('play_mood');
    expect(searchSongs).toHaveBeenCalledWith('欢快 流行', 5);
  });

  it('playSong_searchesAndReturnsHybrid', async () => {
    extractIntent.mockResolvedValue({ action: 'play_song', params: { song: '晴天' } });
    searchSongs.mockResolvedValue({ result: { songs: [song(1, '晴天')] } });
    const r = await routeIntent('帮我找晴天这首歌');
    expect(r.route).toBe('hybrid');
    expect(r.action).toBe('play_song');
  });

  it('chat_routesToClaude', async () => {
    extractIntent.mockResolvedValue({ action: 'chat', params: {} });
    const r = await routeIntent('你今天过得怎么样');
    expect(r.route).toBe('claude');
    expect(r.action).toBe('chat');
  });

  it('playPersonalized_routesNcmWithRawText', async () => {
    extractIntent.mockResolvedValue({ action: 'play_personalized', params: {} });
    const r = await routeIntent('根据你对我的理解随便放');
    expect(r.route).toBe('ncm');
    expect(r.action).toBe('play_personalized');
    expect(r.params._raw).toBeDefined();
  });
});
