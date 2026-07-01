import { describe, it, expect } from 'vitest';
import { toSongDTO } from '../domain/curation/toSongDTO.js';

/**
 * 特征/契约测试 —— Song DTO 映射器。
 * 把网易云原始 song {id,name,ar,al,dt} 映射为干净 DTO
 * {id,title,artist,album,durationMs,coverUrl}，斩断 ar/al/dt 透传前端(ML2)。
 * 复用已提炼的 artistName 统一艺人解析。
 *
 * 前端(PlayerBar.jsx)现读: song.name||title, (song.ar||[]).map(name)||artist
 * DTO 提供稳定字段 title/artist，前端将来只依赖这些，网易云换字段不再破坏前端。
 */
describe('toSongDTO', () => {
  it('neteaseRawSong_mapsToCleanDTO', () => {
    const dto = toSongDTO({
      id: 186016,
      name: '晴天',
      ar: [{ name: '周杰伦' }],
      al: { name: '叶惠美', picUrl: 'http://p.music/cover.jpg' },
      dt: 269000,
    });
    expect(dto).toEqual({
      id: '186016',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationMs: 269000,
      coverUrl: 'http://p.music/cover.jpg',
    });
  });

  it('titleFallsBackToTitleField', () => {
    const dto = toSongDTO({ id: 1, title: 'Night', artist: 'Reol', duration: 200000 });
    expect(dto.title).toBe('Night');
    expect(dto.artist).toBe('Reol');
    expect(dto.durationMs).toBe(200000);
  });

  it('missingFields_useSafeDefaults', () => {
    const dto = toSongDTO({ id: 9 });
    expect(dto).toEqual({
      id: '9',
      title: 'Unknown Track',
      artist: '',
      album: '',
      durationMs: 0,
      coverUrl: '',
    });
  });

  it('nullSong_returnsNull', () => {
    expect(toSongDTO(null)).toBeNull();
    expect(toSongDTO(undefined)).toBeNull();
  });

  it('idCoercedToString', () => {
    expect(toSongDTO({ id: 12345, name: 'x' }).id).toBe('12345');
  });
});
