import { describe, it, expect, vi } from 'vitest';
import {
  inferRouteFromAction,
  searchMusicByIntent,
} from '../domain/routing/mergedIntentResolver.js';

/**
 * These two functions are what turn a bare {action, params} from the merged LLM
 * call into something the conversation handlers can act on, so a wrong route
 * sends an action down the wrong handler and a wrong query plays the wrong music.
 * The module had no test of its own -- it was only ever exercised incidentally
 * through AgentTurnService, which left its live-version filter and its
 * per-action limits unchecked by mutation testing.
 */

describe('inferRouteFromAction', () => {
  it('mapsPlayActions_toHybrid', () => {
    expect(inferRouteFromAction('play_mood')).toBe('hybrid');
    expect(inferRouteFromAction('play_artist')).toBe('hybrid');
    expect(inferRouteFromAction('play_song')).toBe('hybrid');
  });

  it('mapsRecommendationControlActions_toNcm', () => {
    expect(inferRouteFromAction('play_personalized')).toBe('ncm');
    expect(inferRouteFromAction('reject_recommend')).toBe('ncm');
    expect(inferRouteFromAction('recommend_rollback')).toBe('ncm');
    expect(inferRouteFromAction('recommend_retry')).toBe('ncm');
    expect(inferRouteFromAction('recommend')).toBe('ncm');
  });

  it('mapsPlaybackControlActions_toNcm', () => {
    expect(inferRouteFromAction('skip')).toBe('ncm');
    expect(inferRouteFromAction('pause')).toBe('ncm');
    expect(inferRouteFromAction('resume')).toBe('ncm');
    expect(inferRouteFromAction('replay')).toBe('ncm');
    expect(inferRouteFromAction('now_playing')).toBe('ncm');
  });

  it('mapsPlanActions_toNcm', () => {
    expect(inferRouteFromAction('plan_refresh')).toBe('ncm');
    expect(inferRouteFromAction('plan_select')).toBe('ncm');
    expect(inferRouteFromAction('plan_pin')).toBe('ncm');
    expect(inferRouteFromAction('plan_clear')).toBe('ncm');
  });

  it('mapsChat_toMerged', () => {
    expect(inferRouteFromAction('chat')).toBe('merged');
  });

  it('fallsBackToMerged_forUnknownAction', () => {
    // An action the LLM invents must not silently become a music route.
    expect(inferRouteFromAction('teleport')).toBe('merged');
    expect(inferRouteFromAction('')).toBe('merged');
    expect(inferRouteFromAction(undefined)).toBe('merged');
    expect(inferRouteFromAction(null)).toBe('merged');
  });

  it('doesNotMatchInheritedPrototypeKeys', () => {
    // 'constructor' is not in the map; a naive lookup on a prototype-bearing
    // object would hand back a function instead of the merged fallback.
    expect(inferRouteFromAction('constructor')).toBe('merged');
    expect(inferRouteFromAction('toString')).toBe('merged');
  });
});

describe('searchMusicByIntent', () => {
  const song = (id, name) => ({ id, name });

  it('returnsEmpty_forNonMusicAction', async () => {
    const music = { search: vi.fn() };
    expect(await searchMusicByIntent({ action: 'chat', params: {} }, music)).toEqual([]);
    expect(await searchMusicByIntent({ action: 'skip', params: {} }, music)).toEqual([]);
    expect(music.search).not.toHaveBeenCalled();
  });

  it('returnsEmpty_forUnknownAction', async () => {
    const music = { search: vi.fn() };
    expect(await searchMusicByIntent({ action: 'teleport', params: {} }, music)).toEqual([]);
    expect(music.search).not.toHaveBeenCalled();
  });

  it('playMood_translatesMoodToQuery_andSearchesFive', async () => {
    const music = { search: vi.fn().mockResolvedValue([song('1', 'A')]) };
    await searchMusicByIntent({ action: 'play_mood', params: { mood: 'jazz' } }, music);
    expect(music.search).toHaveBeenCalledWith('爵士 经典', 5);
  });

  it('playArtist_searchesByArtistName_withLimit15', async () => {
    const music = { search: vi.fn().mockResolvedValue([song('1', 'A')]) };
    await searchMusicByIntent({ action: 'play_artist', params: { artist: '周杰伦' } }, music);
    expect(music.search).toHaveBeenCalledWith('周杰伦', 15);
  });

  it('playSong_searchesBySongName_withLimit5', async () => {
    const music = { search: vi.fn().mockResolvedValue([song('1', 'A')]) };
    await searchMusicByIntent({ action: 'play_song', params: { song: '晴天' } }, music);
    expect(music.search).toHaveBeenCalledWith('晴天', 5);
  });

  it('playMood_capsAtFiveResults', async () => {
    const many = Array.from({ length: 20 }, (_, i) => song(String(i), `Song ${i}`));
    const music = { search: vi.fn().mockResolvedValue(many) };
    const result = await searchMusicByIntent({ action: 'play_mood', params: { mood: 'chill' } }, music);
    expect(result).toHaveLength(5);
  });

  it('playArtist_capsAtTenResults', async () => {
    const many = Array.from({ length: 20 }, (_, i) => song(String(i), `Song ${i}`));
    const music = { search: vi.fn().mockResolvedValue(many) };
    const result = await searchMusicByIntent({ action: 'play_artist', params: { artist: 'X' } }, music);
    expect(result).toHaveLength(10);
  });

  it('playSong_capsAtThreeResults', async () => {
    const many = Array.from({ length: 20 }, (_, i) => song(String(i), `Song ${i}`));
    const music = { search: vi.fn().mockResolvedValue(many) };
    const result = await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(result).toHaveLength(3);
  });

  it('filtersLiveVersions_fromResults', async () => {
    const music = {
      search: vi.fn().mockResolvedValue([
        song('1', 'Studio Take'),
        song('2', 'Same Song (Live)'),
        song('3', 'Another'),
      ]),
    };
    const result = await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(result.map(s => s.id)).toEqual(['1', '3']);
  });

  it('filtersChineseLiveMarkers', async () => {
    const music = {
      search: vi.fn().mockResolvedValue([
        song('1', '正常版本'),
        song('2', '歌曲 现场版'),
        song('3', '歌曲 演唱会'),
      ]),
    };
    const result = await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(result.map(s => s.id)).toEqual(['1']);
  });

  it('filtersInstrumental_andRemix_andAcoustic', async () => {
    const music = {
      search: vi.fn().mockResolvedValue([
        song('1', 'Normal'),
        song('2', 'Song (Instrumental)'),
        song('3', 'Song (Remix)'),
        song('4', 'Song (Acoustic)'),
      ]),
    };
    const result = await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(result.map(s => s.id)).toEqual(['1']);
  });

  it('readsTitleFromNameOrTitleField', async () => {
    // Some sources report `title`, others `name`; both must reach the filter.
    const music = {
      search: vi.fn().mockResolvedValue([
        { id: '1', title: 'Live at Wembley' },
        { id: '2', title: 'Studio' },
      ]),
    };
    const result = await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(result.map(s => s.id)).toEqual(['2']);
  });

  it('keepsSongWithNoTitleField', async () => {
    // An untitled entry has no evidence of being live, so it is kept rather
    // than dropped -- dropping it would silently shrink every result set.
    const music = { search: vi.fn().mockResolvedValue([{ id: '1' }]) };
    const result = await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(result).toHaveLength(1);
  });

  it('returnsEmpty_whenSearchThrows', async () => {
    const music = { search: vi.fn().mockRejectedValue(new Error('upstream down')) };
    expect(await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music)).toEqual([]);
  });

  it('handlesMissingParams_forEachAction', async () => {
    const music = { search: vi.fn().mockResolvedValue([]) };
    await searchMusicByIntent({ action: 'play_mood' }, music);
    await searchMusicByIntent({ action: 'play_artist' }, music);
    await searchMusicByIntent({ action: 'play_song' }, music);
    expect(music.search).toHaveBeenCalledTimes(3);
  });

  it('doesNotMutateSearchResults', async () => {
    const songs = [song('1', 'A'), song('2', 'B (Live)')];
    const music = { search: vi.fn().mockResolvedValue(songs) };
    await searchMusicByIntent({ action: 'play_song', params: { song: 'X' } }, music);
    expect(songs).toHaveLength(2);
  });
});
