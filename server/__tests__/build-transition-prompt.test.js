import { describe, it, expect } from 'vitest';
import { buildTransitionPrompt } from '../domain/hosting/buildTransitionPrompt.js';

/**
 * 特征测试 —— 钉住 claude.js generateDjResponse 的过渡 prompt 构建。
 * 提炼纯函数，把 ||回退链 + album 条件拼接移出，降 generateDjResponse 复杂度(24)。
 *
 * 现有行为(claude.js:70-80):
 *   Previous: "{prevTitle}" by {prevArtist}
 *   Next: "{nextTitle}" by {nextArtist}{album ? ` (${album})` : ''}
 *   Time: {timeStr}
 *
 *   Generate a DJ transition.
 * 回退: name||title||默认, timeOfDay||'this moment'
 */
describe('buildTransitionPrompt', () => {
  it('fullSongs_buildsPrevNextTimeLines', () => {
    const p = buildTransitionPrompt(
      { name: '晴天', ar: [{ name: '周杰伦' }] },
      { name: '夜曲', ar: [{ name: '周杰伦' }], al: { name: '十一月的萧邦' } },
      'evening'
    );
    expect(p).toContain('Previous: "晴天" by 周杰伦');
    expect(p).toContain('Next: "夜曲" by 周杰伦 (十一月的萧邦)');
    expect(p).toContain('Time: evening');
    expect(p).toContain('Generate a DJ transition.');
  });

  it('noAlbum_omitsAlbumParens', () => {
    const p = buildTransitionPrompt(
      { name: 'A', artist: 'x' },
      { name: 'B', artist: 'y' },
      'night'
    );
    expect(p).toContain('Next: "B" by y\n');
    expect(p).not.toContain('(');
  });

  it('missingTitles_useFallbacks', () => {
    const p = buildTransitionPrompt({}, {}, null);
    expect(p).toContain('Previous: "the last track"');
    expect(p).toContain('Next: "this next track"');
    expect(p).toContain('Time: this moment');
  });
});
