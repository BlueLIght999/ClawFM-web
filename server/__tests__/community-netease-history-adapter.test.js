import { describe, expect, it } from 'vitest';
import { parseRecord, parsePlaylists, createNeteaseMemberHistoryAdapter } from '../infrastructure/netease/NeteaseMemberHistoryAdapter.js';

describe('community netease member history adapter', () => {
  it('parseRecord_extractsTopArtistsAndSongsAndTotalPlays', () => {
    const allData = [
      { playCount: 50, song: { name: '晴天', ar: [{ name: '周杰伦' }] } },
      { playCount: 30, song: { name: '七里香', ar: [{ name: '周杰伦' }] } },
      { playCount: 20, song: { name: 'Yellow', ar: [{ name: 'Coldplay' }] } },
    ];
    const signals = parseRecord(allData);
    expect(signals.totalPlays).toBe(100);
    expect(signals.topArtists[0]).toEqual({ name: '周杰伦', playCount: 80 });
    expect(signals.topArtists[1]).toEqual({ name: 'Coldplay', playCount: 20 });
    expect(signals.topSongs[0]).toEqual({ title: '晴天', artist: '周杰伦', playCount: 50 });
    expect(signals.timeSlotCounts).toEqual({});
    expect(signals.genreCounts).toEqual({});
  });

  it('parseRecord_handlesEmptyAndMalformed', () => {
    expect(parseRecord([])).toMatchObject({ topArtists: [], topSongs: [], totalPlays: 0 });
    expect(parseRecord(null)).toMatchObject({ topArtists: [], totalPlays: 0 });
    expect(parseRecord([{ playCount: 5, song: {} }])).toMatchObject({ totalPlays: 5 });
  });

  it('parseRecord_capsTopArtistsAtTwenty', () => {
    const allData = Array.from({ length: 30 }, (_, i) => ({
      playCount: 30 - i,
      song: { name: `song${i}`, ar: [{ name: `artist${i}` }] },
    }));
    expect(parseRecord(allData).topArtists.length).toBe(20);
  });

  it('fetchMemberHistory_callsApiAndParses', async () => {
    let calledUrl = '';
    const fakeFetch = async (url) => {
      calledUrl = url;
      return { code: 200, allData: [{ playCount: 5, song: { name: 'x', ar: [{ name: 'A' }] } }] };
    };
    const adapter = createNeteaseMemberHistoryAdapter({ apiBase: 'http://test:9999', fetchJson: fakeFetch });
    const signals = await adapter.fetchMemberHistory('123', 'MUSIC_U=abc');
    expect(calledUrl).toContain('http://test:9999/user/record');
    expect(calledUrl).toContain('uid=123');
    expect(calledUrl).toContain('cookie=MUSIC_U');
    expect(signals.totalPlays).toBe(5);
    expect(signals.topArtists[0]).toEqual({ name: 'A', playCount: 5 });
  });

  it('fetchMemberHistory_throwsOnNon200Code', async () => {
    const fakeFetch = async () => ({ code: 301, msg: 'need login' });
    const adapter = createNeteaseMemberHistoryAdapter({ apiBase: 'http://test', fetchJson: fakeFetch });
    await expect(adapter.fetchMemberHistory('123', 'cookie')).rejects.toThrow(/bad response/);
  });

  it('fetchMemberHistory_throwsOnFetchError', async () => {
    const fakeFetch = async () => { throw new Error('network down'); };
    const adapter = createNeteaseMemberHistoryAdapter({ apiBase: 'http://test', fetchJson: fakeFetch });
    await expect(adapter.fetchMemberHistory('123', 'cookie')).rejects.toThrow('network down');
  });

  it('fetchMemberHistory_fallsBackToWeekDataWhenNoAllData', async () => {
    const fakeFetch = async () => ({ code: 200, weekData: [{ playCount: 7, song: { name: 'w', ar: [{ name: 'WA' }] } }] });
    const adapter = createNeteaseMemberHistoryAdapter({ apiBase: 'http://test', fetchJson: fakeFetch });
    const signals = await adapter.fetchMemberHistory('123', 'cookie');
    expect(signals.totalPlays).toBe(7);
    expect(signals.topArtists[0].name).toBe('WA');
  });

  it('fetchMemberPlaylists_callsApiAndParses', async () => {
    let calledUrl = '';
    const fakeFetch = async (url) => {
      calledUrl = url;
      return { code: 200, playlist: [{ id: 1, name: '我的歌单', trackCount: 20, coverImgUrl: 'http://x' }] };
    };
    const adapter = createNeteaseMemberHistoryAdapter({ apiBase: 'http://test:9999', fetchJson: fakeFetch });
    const playlists = await adapter.fetchMemberPlaylists('123', 'cookie');
    expect(calledUrl).toContain('/user/playlist');
    expect(playlists[0]).toEqual({ id: '1', name: '我的歌单', trackCount: 20, coverUrl: 'http://x' });
  });
});

describe('community netease parsePlaylists', () => {
  it('parsePlaylists_extractsFields', () => {
    const list = parsePlaylists([
      { id: 1, name: 'A', trackCount: 10, coverImgUrl: 'http://a' },
      { id: 2, name: 'B', trackCount: 5, picUrl: 'http://b' },
    ]);
    expect(list.length).toBe(2);
    expect(list[0]).toEqual({ id: '1', name: 'A', trackCount: 10, coverUrl: 'http://a' });
    expect(list[1].coverUrl).toBe('http://b');
  });

  it('parsePlaylists_filtersOutMissingId', () => {
    expect(parsePlaylists([{ name: 'noId' }, { id: 0, name: 'zeroId' }])).toEqual([]);
  });

  it('parsePlaylists_handlesEmpty', () => {
    expect(parsePlaylists([])).toEqual([]);
    expect(parsePlaylists(null)).toEqual([]);
  });
});
