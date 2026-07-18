import { describe, it, expect } from 'vitest';
import { isLiveVersion, filterLiveVersions } from '../domain/routing/liveVersionFilter.js';

describe('isLiveVersion', () => {
  it('returnsFalse_forNullName', () => {
    expect(isLiveVersion(null)).toBe(false);
  });

  it('returnsFalse_forEmptyName', () => {
    expect(isLiveVersion('')).toBe(false);
  });

  it('returnsTrue_forLiveSuffix', () => {
    expect(isLiveVersion('Bohemian Rhapsody (Live)')).toBe(true);
  });

  it('returnsTrue_forLiveAtPrefix', () => {
    expect(isLiveVersion('Live at Wembley')).toBe(true);
  });

  it('returnsTrue_forLiveHyphen', () => {
    expect(isLiveVersion('Some Song - Live')).toBe(true);
  });

  it('returnsTrue_forLive版本', () => {
    expect(isLiveVersion('歌曲 (Live版本)')).toBe(true);
  });

  it('returnsTrue_for现场', () => {
    expect(isLiveVersion('歌曲 现场')).toBe(true);
  });

  it('returnsFalse_forStudioRecording', () => {
    expect(isLiveVersion('Bohemian Rhapsody')).toBe(false);
  });

  it('returnsFalse_forAliveWord', () => {
    // 'Alive' should not match 'Live'
    expect(isLiveVersion('Stayin Alive')).toBe(false);
  });

  it('returnsFalse_forDelivery', () => {
    expect(isLiveVersion('Delivery')).toBe(false);
  });
});

describe('filterLiveVersions', () => {
  it('returnsAllSongs_whenNoneAreLive', () => {
    const songs = [{ id: '1', name: 'Song A' }, { id: '2', name: 'Song B' }];
    expect(filterLiveVersions(songs)).toHaveLength(2);
  });

  it('filtersOutLiveVersions', () => {
    const songs = [
      { id: '1', name: 'Song A' },
      { id: '2', name: 'Song B (Live)' },
      { id: '3', name: 'Song C' },
    ];
    const result = filterLiveVersions(songs);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(['1', '3']);
  });

  it('returnsEmptyArray_whenAllLive', () => {
    const songs = [{ id: '1', name: 'Live at Wembley' }];
    expect(filterLiveVersions(songs)).toEqual([]);
  });

  it('returnsEmptyArray_forEmptyInput', () => {
    expect(filterLiveVersions([])).toEqual([]);
  });

  it('handlesSongsWithoutNameField', () => {
    const songs = [{ id: '1' }, { id: '2', name: 'Song' }];
    expect(filterLiveVersions(songs)).toHaveLength(2);
  });

  it('doesNotMutateInput', () => {
    const songs = [{ id: '1', name: 'Song (Live)' }];
    const original = [...songs];
    filterLiveVersions(songs);
    expect(songs).toEqual(original);
  });
});
