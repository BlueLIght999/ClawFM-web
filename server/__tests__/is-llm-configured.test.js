import { describe, it, expect } from 'vitest';
import { isLlmConfigured } from '../domain/hosting/isLlmConfigured.js';

/**
 * 特征测试 —— 钉住 claude.js/planner.js 重复的"是否配置了 LLM"判断。
 * key 存在且非占位符 'sk-xxx' → 已配置。提炼为纯谓词，供共享客户端工厂复用，
 * 消除两处重复的 client 实例化条件(CODING-STYLE 1.5)。
 *
 * 现有行为: config.deepseekApiKey && config.deepseekApiKey !== 'sk-xxx'
 */
describe('isLlmConfigured', () => {
  it('validKey_returnsTrue', () => {
    expect(isLlmConfigured('sk-real-deepseek-key')).toBe(true);
  });

  it('placeholderKey_returnsFalse', () => {
    expect(isLlmConfigured('sk-xxx')).toBe(false);
  });

  it('emptyString_returnsFalse', () => {
    expect(isLlmConfigured('')).toBe(false);
  });

  it('undefinedOrNull_returnsFalse', () => {
    expect(isLlmConfigured(undefined)).toBe(false);
    expect(isLlmConfigured(null)).toBe(false);
  });
});
