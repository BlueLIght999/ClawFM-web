import { describe, it, expect } from 'vitest';

/**
 * 回归测试 —— recommender.js 必须能被 import（模块加载不抛错）。
 * 复现 bug: CorpusPort 重构移除 path import 后，残留
 * `const __dirname = dirname(...)` 引用了未定义的 dirname，
 * 导致 server 启动即崩（ReferenceError: dirname is not defined）。
 */
describe('recommender module loads', () => {
  it('importsWithoutThrowing', async () => {
    const mod = await import('../services/recommender.js');
    expect(mod.recommender).toBeDefined();
  });
});
