import { describe, it, expect } from 'vitest';
import { buildTransitionPrompt } from '../domain/hosting/buildTransitionPrompt.js';

/**
 * 特征测试 —— 钉住 buildTransitionPrompt 的中文输出行为。
 * 提炼纯函数，把 ||回退链 + album 条件拼接移出，降 generateDjResponse 复杂度。
 *
 * 现有行为:
 *   上一首：{prevArtist}的《{prevTitle}》
 *   下一首：{nextArtist}的《{nextTitle}》{album ? `（专辑：${album}）` : ''}
 *   时段：{timeStr}
 *
 *   请用中文生成一段 DJ 过渡词。
 * 回退: name||title||默认, timeOfDay||'此刻'
 */
describe('buildTransitionPrompt', () => {
  it('fullSongs_buildsPrevNextTimeLines', () => {
    const p = buildTransitionPrompt(
      { name: '晴天', ar: [{ name: '周杰伦' }] },
      { name: '夜曲', ar: [{ name: '周杰伦' }], al: { name: '十一月的萧邦' } },
      'evening'
    );
    expect(p).toContain('上一首：周杰伦的《晴天》');
    expect(p).toContain('下一首：周杰伦的《夜曲》（专辑：十一月的萧邦）');
    expect(p).toContain('时段：evening');
    expect(p).toContain('请用中文生成一段 DJ 过渡词。');
  });

  it('noAlbum_omitsAlbumParens', () => {
    const p = buildTransitionPrompt(
      { name: 'A', artist: 'x' },
      { name: 'B', artist: 'y' },
      'night'
    );
    expect(p).toContain('下一首：y的《B》\n');
    expect(p).not.toContain('（专辑');
  });

  it('missingTitles_useFallbacks', () => {
    const p = buildTransitionPrompt({}, {}, null);
    expect(p).toContain('上一首：的《上一首》');
    expect(p).toContain('下一首：的《下一首》');
    expect(p).toContain('时段：此刻');
  });
});
