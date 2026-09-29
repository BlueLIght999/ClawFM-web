/**
 * ReAct 循环的确定性契约：LLM 调用次数、工具选择、并行派发。
 *
 * 与 react-latency-bench.test.js 的分工：
 *   - 本文件断言「发生了什么」，不含任何墙钟阈值，进默认门禁；
 *   - 那个文件断言「花了多久」，靠 Date.now 差值，**不进**默认门禁。
 *
 * 拆开的理由（见 react-latency-bench.test.js 顶部注释）：时间断言在 CI
 * 共享跑分机上会抖，一旦抖成红灯，人的第一反应是把阈值调松，于是性能
 * 回归的门禁被慢慢磨平。契约断言不受机器负载影响，留在门禁里才拦得住
 * 「LLM 多调了一次」这类真正的回归。
 */
import { describe, it, expect } from 'vitest';
import { createAgentLoopService } from '../agent/application/services/AgentLoopService.js';
import { createToolDefinition } from '../agent/domain/toolDefinition.js';
import { createTimedFunctionCalling, createDeps } from './helpers/reactLoopHarness.js';

describe('ReAct 循环 — LLM 调用次数', () => {
  it('纯聊天: 只调用 1 次 LLM (无工具)', async () => {
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: '你好！欢迎收听电台。', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '你觉得什么季节最适合听音乐', snapshot: null });

    expect(deps.functionCalling.getCallCount()).toBe(1);
    expect(result.reactReply).toBe('你好！欢迎收听电台。');
  });

  it('工具+回复: LLM 同时返回 content+toolCalls 时只调用 1 次 LLM', async () => {
    // 有 content 就不需要 wrap-up 那一轮——这是省掉半程延迟的关键优化，
    // 必须由调用次数钉住，而不是由耗时钉住。
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: '好的，帮你跳过这首歌！', toolCalls: [{ name: 'skip', arguments: {} }] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '这首歌不好听换一首', snapshot: null });

    expect(deps.functionCalling.getCallCount()).toBe(1);
    expect(result.reactReply).toBe('好的，帮你跳过这首歌！');
  });

  it('工具无回复: LLM 只返回 toolCalls 时需要 2 次 LLM 调用 (wrap-up)', async () => {
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([
        { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
        { content: '已经帮你跳过了。', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '这首歌不好听换一首', snapshot: null });

    expect(deps.functionCalling.getCallCount()).toBe(2);
    expect(result.reactReply).toBe('已经帮你跳过了。');
  });

  it('fast-route 命中: 0 次 LLM 调用，交给 agentTurnService 兜住', async () => {
    const deps = createDeps({
      functionCalling: createTimedFunctionCalling([], 100),
    });
    const service = createAgentLoopService(deps);

    await service.handleMessage({ text: '下一首', snapshot: null });

    expect(deps.functionCalling.getCallCount()).toBe(0);
    expect(deps.agentTurnService.handleMessage).toHaveBeenCalled();
  });
});

describe('ReAct 循环 — 工具并行派发', () => {
  /**
   * 并行执行的确定性判据。
   *
   * 原实现用墙钟：「两个工具的 start 相差 < 5ms」+「总跨度 < 串行和」。
   * 两条都依赖机器负载，且 5ms 在繁忙 CI 上可以直接超标。
   *
   * 换个观察角度就有确定性判据：让先声明的工具 sleep 一段，
   * 后声明的工具在自己的 execute 里检查「前一个是否已经结束」。
   * Promise.all 的语义是先把所有 mapper 同步调用一遍再 await 结果，
   * 所以后一个工具必然在前一个结束前就进入 execute——串行实现则相反。
   *
   * 注意不能反过来让前一个工具检查后一个是否已启动：Promise.all 按序
   * 调用 mapper，前一个 execute 进入时后一个还没轮到，那样断言恒假。
   *
   * 另外 execute 的异常会被 AgentLoopService.executeToolSafely 吞成
   * { handled:false, error }，所以判据只能记在闭包变量里、在 await 之后
   * 断言，不能在工具内部 expect。
   */
  it('两个工具并行执行：后声明的工具在前一个结束前已进入 execute', async () => {
    let slowToolFinished = false;
    /** 后声明的工具进入 execute 时，前一个是否尚未结束 */
    let overlapped = null;

    const deps = createDeps();
    deps.toolRegistry.register(createToolDefinition({
      name: 'slow_probe',
      description: '先声明的慢工具',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        await new Promise((r) => setTimeout(r, 30));
        slowToolFinished = true;
        return { handled: true };
      },
    }));
    deps.toolRegistry.register(createToolDefinition({
      name: 'fast_probe',
      description: '后声明的快工具',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        overlapped = !slowToolFinished;
        return { handled: true };
      },
    }));

    deps.functionCalling = createTimedFunctionCalling([
      {
        content: '好的，正在处理！',
        toolCalls: [
          { name: 'slow_probe', arguments: {} },
          { name: 'fast_probe', arguments: {} },
        ],
      },
    ]);
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '帮我找点周杰伦的歌同时推荐一些', snapshot: null });

    expect(result.conversationResults).toHaveLength(2);
    expect(overlapped).toBe(true);
  });

  it('串行实现会落在对照的反面（哨兵：判据本身有效）', async () => {
    // 上一条断言 overlapped === true。若某天 AgentLoopService 改成串行
    // for-await，overlapped 会变成 false 而 fail —— 本测试用串行写法
    // 复现同一段逻辑，确认「false」确实是串行会得到的结果，
    // 排除「这个判据恒为 true / 恒为 undefined」的可能。
    let slowToolFinished = false;
    let overlapped = null;

    const slow = async () => {
      await new Promise((r) => setTimeout(r, 30));
      slowToolFinished = true;
    };
    const fast = async () => {
      overlapped = !slowToolFinished;
    };

    await slow();
    await fast();

    expect(overlapped).toBe(false);
  });
});

// ── 工具选择准确率（确定性：喂定 LLM 响应，断言选中的工具）──

describe('ReAct 循环 — 工具选择准确率', () => {
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
      }

      // Verify content is returned (not null)
      expect(result.reactReply).toBeTruthy();
      // Verify only 1 LLM call (optimized path)
      expect(deps.functionCalling.getCallCount()).toBe(1);
    });
  }
});
