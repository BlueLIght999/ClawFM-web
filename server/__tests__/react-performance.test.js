import { describe, it, expect, vi } from 'vitest';
import { createAgentLoopService } from '../agent/application/services/AgentLoopService.js';
import { createInMemoryToolRegistry } from '../agent/infrastructure/InMemoryToolRegistry.js';
import { createToolDefinition } from '../agent/domain/toolDefinition.js';

// ── Test helpers ──

/**
 * Create a mock function-calling adapter with configurable latency.
 * Each response is delivered after `delayMs` to simulate real API latency.
 */
function createTimedFunctionCalling(responses, delayMs = 0) {
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

function createMockToolRegistry() {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createDeps(overrides = {}) {
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

// ── Latency tests ──

describe('ReAct Performance — 延迟测试', () => {
  it('纯聊天: 单次 LLM 调用完成 (无工具)', async () => {
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

    expect(deps.functionCalling.getCallCount()).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(llmDelay);
    expect(elapsed).toBeLessThan(llmDelay + 100); // overhead < 100ms
  });

  it('工具+回复: LLM 同时返回 content+toolCalls 时只调用 1 次 LLM', async () => {
    const llmDelay = 80;
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: '好的，帮你跳过这首歌！', toolCalls: [{ name: 'skip', arguments: {} }] },
      ], llmDelay),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    const result = await service.handleMessage({ text: '这首歌不好听换一首', snapshot: null });
    const elapsed = Date.now() - start;

    // Only 1 LLM call — no wrap-up needed because content was provided
    expect(deps.functionCalling.getCallCount()).toBe(1);
    expect(result.reactReply).toBe('好的，帮你跳过这首歌！');
    expect(elapsed).toBeGreaterThanOrEqual(llmDelay);
    expect(elapsed).toBeLessThan(llmDelay * 2); // Should NOT take 2x LLM delay
  });

  it('工具无回复: LLM 只返回 toolCalls 时需要 2 次 LLM 调用 (wrap-up)', async () => {
    const llmDelay = 60;
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
        { content: '已经帮你跳过了。', toolCalls: [] },
      ], llmDelay),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    const result = await service.handleMessage({ text: '这首歌不好听换一首', snapshot: null });
    const elapsed = Date.now() - start;

    expect(deps.functionCalling.getCallCount()).toBe(2);
    expect(result.reactReply).toBe('已经帮你跳过了。');
    expect(elapsed).toBeGreaterThanOrEqual(llmDelay * 2);
  });

  it('多工具并行: 2 个工具并行执行，总时间 ≈ max(tool1, tool2)', async () => {
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

    // Both tools should have overlapping execution (parallel)
    const searchStart = toolLog[0].start;
    const searchEnd = toolLog[0].end;
    const recommendStart = toolLog[1].start;
    const recommendEnd = toolLog[1].end;

    // They started at nearly the same time (within 5ms)
    expect(Math.abs(searchStart - recommendStart)).toBeLessThan(5);

    // Total tool time should be ~max(50, 80) = ~80ms, not 50+80=130ms
    const toolSpan = Math.max(searchEnd, recommendEnd) - Math.min(searchStart, recommendStart);
    expect(toolSpan).toBeLessThan(130); // Not serial sum

    // Total elapsed should be LLM delay + max(tool times) + overhead
    expect(elapsed).toBeLessThan(llmDelay + 150);
  });

  it('fast-route 命中: 0 次 LLM 调用，延迟 < 5ms', async () => {
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([], 100),
    });
    const service = createAgentLoopService(deps);

    const start = Date.now();
    await service.handleMessage({ text: '下一首', snapshot: null });
    const elapsed = Date.now() - start;

    expect(deps.functionCalling.getCallCount()).toBe(0);
    expect(deps.agentTurnService.handleMessage).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(50); // Should be nearly instant
  });
});

// ── Accuracy tests: LLM tool selection ──
// These test that the right tool is called for typical user inputs

describe('ReAct Performance — 工具选择准确率', () => {
  const testCases = [
    {
      name: '跳过歌曲',
      input: '这首歌不好听换一首',
      expectedTool: 'skip',
      llmResponse: { content: '好的，帮你跳过！', toolCalls: [{ name: 'skip', arguments: {} }] },
    },
    {
      name: '搜索音乐',
      input: '帮我找周杰伦的歌',
      expectedTool: 'search_music',
      llmResponse: {
        content: '好的，帮你搜索周杰伦的歌！',
        toolCalls: [{ name: 'search_music', arguments: { query: '周杰伦' } }],
      },
    },
    {
      name: '推荐音乐',
      input: '帮我生成一份夜晚的播放列表',
      expectedTool: 'recommend',
      llmResponse: {
        content: '好的，帮你推荐一些适合夜晚的音乐！',
        toolCalls: [{ name: 'recommend', arguments: { preference: '夜晚' } }],
      },
    },
    {
      name: '获取当前播放',
      input: '现在在放什么歌',
      expectedTool: 'get_now_playing',
      llmResponse: {
        content: '让我看看现在播放的是什么。',
        toolCalls: [{ name: 'get_now_playing', arguments: {} }],
      },
    },
    {
      name: '纯聊天无工具',
      input: '你今天心情怎么样',
      expectedTool: null,
      llmResponse: { content: '我心情很好，谢谢关心！有什么想听的吗？', toolCalls: [] },
    },
  ];

  for (const tc of testCases) {
    it(`准确率: ${tc.name} → ${tc.expectedTool || '无工具'}`, async () => {
      const deps = createDeps({
        functionCalling: createTimedFunctionCalling([tc.llmResponse], 0),
      });
      const service = createAgentLoopService(deps);

      const result = await service.handleMessage({ text: tc.input, snapshot: null });

      if (tc.expectedTool) {
        expect(result.conversationResults).toHaveLength(1);
        expect(deps.getToolExecLog()[0].tool).toBe(tc.expectedTool);
      } else {
        expect(result.conversationResults).toHaveLength(0);
        expect(result.reactReply).toBeTruthy();
      }

      // Verify content is returned (not null)
      expect(result.reactReply).toBeTruthy();
      // Verify only 1 LLM call (optimized path)
      expect(deps.functionCalling.getCallCount()).toBe(1);
    });
  }
});

// ── Summary benchmark ──

describe('ReAct Performance — 综合基准', () => {
  it('基准报告: 各场景 LLM 调用次数与延迟', async () => {
    const scenarios = [
      {
        name: 'fast-route (正则匹配)',
        input: '下一首',
        llmResponses: [],
        llmDelay: 100,
        expectedLlmCalls: 0,
      },
      {
        name: '纯聊天 (1次 LLM)',
        input: '你好呀',
        llmResponses: [{ content: '你好！', toolCalls: [] }],
        llmDelay: 50,
        expectedLlmCalls: 1,
      },
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

    // Assert all scenarios meet expectations
    for (const r of results) {
      expect(r.llmCalls).toBe(r.expectedCalls);
    }

    // Print benchmark table for visibility
    console.table(results.map(r => ({
      场景: r.name,
      'LLM调用次数': r.llmCalls,
      '期望次数': r.expectedCalls,
      '耗时(ms)': r.elapsedMs,
    })));
  });
});
