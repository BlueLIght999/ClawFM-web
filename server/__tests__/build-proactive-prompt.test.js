import { describe, it, expect } from 'vitest';
import { buildProactivePrompt } from '../domain/hosting/buildProactivePrompt.js';

/**
 * 特征测试 —— 钉住 claude.js decideProactiveSpeech 的 prompt 构建逻辑。
 * 提炼为纯函数，把多条 ||回退链 + 条件拼接移出，降低 decideProactiveSpeech
 * 圈复杂度(33→更低)。纯字符串构建，可无 mock 单测。
 */
describe('buildProactivePrompt', () => {
  const baseCtx = {
    currentSong: { name: '晴天', ar: [{ name: '周杰伦' }] },
    timeOfDay: 'evening',
    weather: '西安, 23°C, 阴',
    activeBlock: { theme: '午后微光', genreHints: ['ambient', 'post-rock'] },
    nextSong: { name: 'Night' },
    secondNext: { name: 'Dawn' },
    secondsSinceLastSpeech: 120,
    songsSinceLastSpeech: 3,
  };

  it('includesCurrentSongTitleAndArtist', () => {
    const p = buildProactivePrompt(baseCtx);
    expect(p).toContain('"晴天" by 周杰伦');
  });

  it('includesBlockThemeAndHints', () => {
    const p = buildProactivePrompt(baseCtx);
    expect(p).toContain('"午后微光" (ambient, post-rock)');
  });

  it('includesNextAndSecondNext', () => {
    const p = buildProactivePrompt(baseCtx);
    expect(p).toContain('下首: Night, 再下一首: Dawn');
  });

  it('weatherChanged_marksChange', () => {
    const p = buildProactivePrompt({ ...baseCtx, weatherChanged: true });
    expect(p).toContain('(刚变化)');
  });

  it('withChatMessage_includesIt', () => {
    const p = buildProactivePrompt({ ...baseCtx, lastChatMessage: '你好' });
    expect(p).toContain('最近听众聊天: "你好"');
  });

  it('noChatMessage_showsNoInteraction', () => {
    const p = buildProactivePrompt(baseCtx);
    expect(p).toContain('最近无听众互动');
  });

  it('missingFields_useSafeDefaults', () => {
    const p = buildProactivePrompt({ timeOfDay: 'night' });
    expect(p).toContain('"?" by ');
    expect(p).toContain('"auto" (varied)');
    expect(p).toContain('下首: ?, 再下一首: ?');
  });
});
