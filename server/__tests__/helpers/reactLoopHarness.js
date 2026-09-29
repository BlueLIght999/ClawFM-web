/**
 * ReAct 循环测试夹具：可配置延迟的 LLM 适配器 + 带执行日志的工具注册表。
 *
 * 从 react-performance.test.js 抽出，供两个使用方共享：
 *   - react-loop-contract.test.js —— 进默认门禁的确定性契约（无墙钟断言）
 *   - react-latency-bench.test.js —— 墙钟预算基准（不进默认门禁）
 *
 * 抽出的动机不是复用行数，而是**纪律**：夹具里若混入断言或耗时统计，
 * 基准侧调阈值时就会顺手改到契约侧依赖的代码。夹具只负责搭台，
 * 判据全部留在测试文件里。
 */
import { vi } from 'vitest';
import { createInMemoryToolRegistry } from '../../agent/infrastructure/InMemoryToolRegistry.js';
import { createToolDefinition } from '../../agent/domain/toolDefinition.js';

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 模拟真实 API 延迟的函数调用适配器。
 *
 * @param {Array<object>} responses 按序返回的响应；用尽后回落为无工具的兜底响应。
 * @param {number} delayMs 每次调用的模拟延迟。
 */
export function createTimedFunctionCalling(responses, delayMs = 0) {
  let callIndex = 0;
  const callLog = [];
  return {
    completeWithTools: vi.fn(async (req) => {
      const start = Date.now();
      if (delayMs > 0) await sleep(delayMs);
      const response = responses[callIndex] || { content: 'fallback', toolCalls: [] };
      callIndex++;
      callLog.push({ request: req, response, elapsed: Date.now() - start });
      return response;
    }),
    isConfigured: () => true,
    getCallLog: () => callLog,
    getCallCount: () => callIndex,
  };
}

/**
 * 注册 4 个可观测工具（skip / search_music / recommend / get_now_playing）。
 *
 * 每次 execute 的起止时刻都记入 toolExecLog，供测试判断并行与串行。
 * search_music 与 skip 刻意带 sleep：并行断言需要「一个未结束的工具」
 * 作为观察窗口，否则两个工具都是同步返回，并行与串行无从区分。
 *
 * @returns {{registry: object, getToolExecLog: () => Array}}
 */
export function createMockToolRegistry() {
  const registry = createInMemoryToolRegistry();
  const toolExecLog = [];

  registry.register(createToolDefinition({
    name: 'skip',
    description: '跳过当前正在播放的歌曲，播放下一首',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const entry = { tool: 'skip', start: Date.now() };
      toolExecLog.push(entry);
      await sleep(10);
      entry.end = Date.now();
      return { handled: true, state: { playbackState: 'playing' } };
    },
  }));

  registry.register(createToolDefinition({
    name: 'search_music',
    description: '搜索音乐并加入播放队列',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '结果数量上限' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const entry = { tool: 'search_music', args, start: Date.now() };
      toolExecLog.push(entry);
      await sleep(50); // Simulate network search
      entry.end = Date.now();
      return {
        handled: true,
        results: [{ name: `结果-${args.query}`, ar: [{ name: '歌手' }] }],
        addedCount: 1,
        queueUpdate: { upcomingSongs: [], mode: 'sequential' },
      };
    },
  }));

  registry.register(createToolDefinition({
    name: 'recommend',
    description: '根据听众口味推荐音乐并加入播放队列',
    parameters: {
      type: 'object',
      properties: {
        preference: { type: 'string', description: '偏好描述' },
      },
    },
    execute: async (args) => {
      const entry = { tool: 'recommend', args, start: Date.now() };
      toolExecLog.push(entry);
      await sleep(80); // Simulate recommendation engine
      entry.end = Date.now();
      return {
        handled: true,
        addedCount: 5,
        queueUpdate: { upcomingSongs: [], mode: 'sequential' },
      };
    },
  }));

  registry.register(createToolDefinition({
    name: 'get_now_playing',
    description: '获取当前播放状态',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const entry = { tool: 'get_now_playing', start: Date.now() };
      toolExecLog.push(entry);
      entry.end = Date.now();
      return { handled: true, state: { current: { title: '晴天' } } };
    },
  }));

  return { registry, getToolExecLog: () => toolExecLog };
}

/**
 * createAgentLoopService 的最小依赖集。
 *
 * 默认 LLM 延迟为 0：契约侧只关心调用次数与顺序，加延迟只会让门禁变慢。
 * 基准侧通过 overrides 注入自己的 functionCalling。
 */
export function createDeps(overrides = {}) {
  const { registry, getToolExecLog } = createMockToolRegistry();
  return {
    agentTurnService: { handleMessage: vi.fn(async () => ({ handled: true, fallback: true })) },
    functionCalling: createTimedFunctionCalling([], 0),
    toolRegistry: registry,
    persona: 'test-persona',
    contextBuilder: { assemble: vi.fn(() => 'ctx') },
    weather: { current: vi.fn(async () => 'sunny') },
    queue: { future: [], mode: 'sequential', upcomingSongs: [] },
    now: vi.fn(() => 99999),
    maxIterations: 5,
    userActivity: { setLastUserChat: vi.fn() },
    djStatus: { isConfigured: () => true },
    getToolExecLog,
    ...overrides,
  };
}
