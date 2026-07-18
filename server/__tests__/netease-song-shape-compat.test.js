import { describe, expect, it } from 'vitest';
import { toSongDTO } from '../domain/curation/toSongDTO.js';
import { toSeedSongFromTrack } from '../domain/curation/recommenderRules.js';
import { artistName } from '../domain/hosting/artistName.js';
import { buildListenHistoryRecord } from '../domain/playback/listenHistoryRecord.js';

const legacyAlbum = {
  name: 'Legacy Album',
  id: 42,
  type: 'EP',
  size: 5,
  picId: 99,
  blurPicUrl: 'https://example.com/blur.jpg',
  picUrl: 'https://example.com/cover.jpg',
};

const legacySong = {
  id: 1001,
  name: 'Legacy Track',
  artists: [{ name: 'Legacy Artist' }],
  album: legacyAlbum,
  duration: 201000,
};

describe('NetEase song shape compatibility', () => {
  it('normalizes the legacy album object into stable scalar DTO fields', () => {
    expect(toSongDTO(legacySong)).toEqual({
      id: '1001',
      title: 'Legacy Track',
      artist: 'Legacy Artist',
      album: 'Legacy Album',
      durationMs: 201000,
      coverUrl: 'https://example.com/cover.jpg',
    });
  });

  it('keeps stable DTO values unchanged when normalized again', () => {
    const stableSong = {
      id: 'stable-1',
      title: 'Stable Track',
      artist: 'Stable Artist',
      album: 'Stable Album',
      durationMs: 180000,
      coverUrl: 'https://example.com/stable.jpg',
    };

    expect(toSongDTO(stableSong)).toEqual(stableSong);
  });

  it('keeps legacy album objects out of seed and listen-history records', () => {
    expect(toSeedSongFromTrack(legacySong, 'personal-fm')).toMatchObject({
      songId: '1001',
      artist: 'Legacy Artist',
      album: 'Legacy Album',
    });

    expect(buildListenHistoryRecord({ song: legacySong, durationMs: 201000 })).toMatchObject({
      songId: '1001',
      artist: 'Legacy Artist',
      album: 'Legacy Album',
    });
  });

  it('normalizes singular artist objects and falls back from empty ar arrays', () => {
    expect(artistName({ artist: { name: 'Object Artist' } })).toBe('Object Artist');
    expect(artistName({ ar: [], artists: [{ name: 'Fallback Artist' }] })).toBe('Fallback Artist');
  });
});
