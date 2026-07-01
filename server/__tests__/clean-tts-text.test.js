import { describe, it, expect } from 'vitest';
import { cleanTtsText } from '../domain/hosting/cleanTtsText.js';

/**
 * 特征测试 —— 钉住 tts.js 现有文本清洗行为（第87/120行重复逻辑）。
 * 提炼为纯函数供 TTS 适配器复用，消除重复（CODING-STYLE 1.5）。
 *
 * 现有行为: text.replace(/<[^>]+>/g,'').replace(/[\n\r]/g,' ').trim()
 *   1. 去除尖括号标签(情绪标签 <happy> 等)
 *   2. 换行/回车 → 空格
 *   3. 首尾去空白
 */
describe('cleanTtsText', () => {
  it('stripsEmotionTags', () => {
    expect(cleanTtsText('<happy>你好</happy>世界')).toBe('你好世界');
  });

  it('replacesNewlinesWithSpaces', () => {
    expect(cleanTtsText('第一行\n第二行\r第三行')).toBe('第一行 第二行 第三行');
  });

  it('trimsLeadingTrailingWhitespace', () => {
    expect(cleanTtsText('  中间保留  ')).toBe('中间保留');
  });

  it('combinedTagsNewlinesAndTrim', () => {
    expect(cleanTtsText('  <b>晚上好</b>\n各位听众  ')).toBe('晚上好 各位听众');
  });

  it('emptyOrTagOnly_returnsEmptyString', () => {
    expect(cleanTtsText('<x></x>')).toBe('');
    expect(cleanTtsText('   ')).toBe('');
  });
});
