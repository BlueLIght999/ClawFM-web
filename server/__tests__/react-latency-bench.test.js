/**
 * ReAct 循环的**墙钟预算**基准 —— 默认不出现在 npm test / npm run quality 中。
 *
 * 用 `npm run bench` 跑。
 *
 * 为什么移出门禁：
 *   这里每条断言都是 Date.now 差值（overhead < 100ms、toolSpan < 130ms 等）。
 *   这类阈值在同一台机器上稳定，到了共享 CI 跑分机、或本机同时开着构建/杀毒
 *   扫描时会直接超标。红灯一旦被归因为「机器慢」，下一步就是把阈值调松——
 *   而调松之后，性能回归就再也没人拦得住。门禁里该留的是不受负载影响的
 *   契约断言，那些在 react-loop-contract.test.js。
 *
 * 但也不该删：延迟是这套 ReAct 循环的核心卖点（并行工具、fast-route、
 * 有 content 就不 wrap-up 这三条优化全是省延迟的）。删掉就等于对「优化
 * 是否真的还在省时间」彻底失明。所以留着，只是改成按需跑。
 *
 * 读结果的方式：不要只看红绿。这些数字是给人看的信号，抖动超过 2 倍
 * 才值得当回归处理。
 */
import { describe, it, expect } from 'vitest';
import { createAgentLoopService } from '../agent/application/services/AgentLoopService.js';
import { createTimedFunctionCalling, createDeps } from './helpers/reactLoopHarness.js';

describe('ReAct 延迟基准', () => {
  it('纯聊天: 耗时 ≈ llmDelay + 小幅 overhead', async () => {
    const llmDelay = 50;
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: '你好！欢迎收听电台。', toolCalls: [] },
      ], llmDelay),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    await service.handleMessage({ text: '你觉得什么季节最适合听音乐', snapshot: null });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(llmDelay);
    expect(elapsed).toBeLessThan(llmDelay + 100); // overhead < 100ms
  });

  it('工具+回复: 耗时 ≈ 1 次 LLM 延迟，未退化成 2 次', async () => {
    const llmDelay = 80;
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: '好的，帮你跳过这首歌！', toolCalls: [{ name: 'skip', arguments: {} }] },
      ], llmDelay),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    await service.handleMessage({ text: '这首歌不好听换一首', snapshot: null });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(llmDelay);
    expect(elapsed).toBeLessThan(llmDelay * 2); // Should NOT take 2x LLM delay
  });

  it('工具无回复: 耗时 ≥ 2 次 LLM 延迟（wrap-up 那一轮跑不掉）', async () => {
    const llmDelay = 60;
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
        { content: '已经帮你跳过了。', toolCalls: [] },
      ], llmDelay),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    await service.handleMessage({ text: '这首歌不好听换一首', snapshot: null });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(llmDelay * 2);
  });

  it('多工具并行: 总耗时 ≈ max(tool1, tool2) 而非两者之和', async () => {
    // 夹具里 search_music sleep 50ms、recommend sleep 80ms。
    // 串行应为 ~130ms，并行应落在 ~80ms 附近。
    const llmDelay = 30;
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        {
          content: '好的，正在搜索并推荐！',
          toolCalls: [
            { name: 'search_music', arguments: { query: '周杰伦' } },
            { name: 'recommend', arguments: {} },
          ],
        },
      ], llmDelay),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    await service.handleMessage({ text: '帮我找点周杰伦的歌同时推荐一些', snapshot: null });
    const elapsed = Date.now() - start;

    const toolLog = deps.getToolExecLog();
    expect(toolLog).toHaveLength(2);

    const searchStart = toolLog[0].start;
    const searchEnd = toolLog[0].end;
    const recommendStart = toolLog[1].start;
    const recommendEnd = toolLog[1].end;

    // 两者几乎同时开始（同一 tick 内派发）
    expect(Math.abs(searchStart - recommendStart)).toBeLessThan(5);

    // 总工具跨度 ≈ max(50, 80) = 80ms，而不是 50+80=130ms
    const toolSpan = Math.max(searchEnd, recommendEnd) - Math.min(searchStart, recommendStart);
    expect(toolSpan).toBeLessThan(130); // Not serial sum

    expect(elapsed).toBeLessThan(llmDelay + 150);
  });

  it('fast-route 命中: 近乎瞬时（无 LLM 往返）', async () => {
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([], 100),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    await service.handleMessage({ text: '下一首', snapshot: null });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50); // Should be nearly instant
  });
});

describe('ReAct 延迟基准 — 综合报告', () => {
  // 这条只断言调用次数（确定性），耗时仅打印成表供人读。
  it('各场景 LLM 调用次数与耗时', async () => {
    const scenarios = [
      { name: 'fast-route (正则匹配)', input: '下一首', llmResponses: [], llmDelay: 100, expectedLlmCalls: 0 },
      { name: '纯聊天 (1次 LLM)', input: '你好呀', llmResponses: [{ content: '你好！', toolCalls: [] }], llmDelay: 50, expectedLlmCalls: 1 },
      {
        name: '工具+回复 (1次 LLM, 优化后)',
        input: '帮我跳过',
        llmResponses: [{ content: '好的！', toolCalls: [{ name: 'skip', arguments: {} }] }],
        llmDelay: 50,
        expectedLlmCalls: 1,
      },
      {
        name: '工具无回复 (2次 LLM, 回退)',
        input: '帮我跳过',
        llmResponses: [
          { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
          { content: '已跳过。', toolCalls: [] },
        ],
        llmDelay: 40,
        expectedLlmCalls: 2,
      },
    ];

    const results = [];

    for (const scenario of scenarios) {
      const deps = createDeps({
        functionCalling: createTimedFunctionCalling(scenario.llmResponses, scenario.llmDelay),
      });
      const service = createAgentLoopService(deps);

      const start = Date.now();
      await service.handleMessage({ text: scenario.input, snapshot: null });
      const elapsed = Date.now() - start;

      results.push({
        name: scenario.name,
        llmCalls: deps.functionCalling.getCallCount(),
        expectedCalls: scenario.expectedLlmCalls,
        elapsedMs: elapsed,
      });
    }

    for (const r of results) {
      expect(r.llmCalls).toBe(r.expectedCalls);
    }

    console.table(results.map(r => ({
      场景: r.name,
      'LLM调用次数': r.llmCalls,
      '期望次数': r.expectedCalls,
      '耗时(ms)': r.elapsedMs,
    })));
  });
});
