import { describe, it, expect, vi } from 'vitest';
import { createAgentLoopService } from '../agent/application/services/AgentLoopService.js';
import { createInMemoryToolRegistry } from '../agent/infrastructure/InMemoryToolRegistry.js';
import { createToolDefinition } from '../agent/domain/toolDefinition.js';

function createMockFunctionCalling(responses) {
  let callIndex = 0;
  return {
    completeWithTools: vi.fn(async () => {
      const response = responses[callIndex] || { content: 'fallback', toolCalls: [] };
      callIndex++;
      return response;
    }),
    isConfigured: () => true,
  };
}

function createMockToolRegistry() {
  const registry = createInMemoryToolRegistry();
  registry.register(createToolDefinition({
    name: 'skip',
    description: 'Skip song',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ handled: true, state: { playbackState: 'playing' } }),
  }));
  registry.register(createToolDefinition({
    name: 'search_music',
    description: 'Search music',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async (args) => ({
      handled: true,
      results: [{ name: `result for ${args.query}`, ar: [{ name: 'artist' }] }],
      addedCount: 1,
      queueUpdate: { upcomingSongs: [], mode: 'sequential' },
    }),
  }));
  return registry;
}

function createMockAgentTurnService() {
  return { handleMessage: vi.fn(async () => ({ handled: true, fallback: true })) };
}

function createDeps(overrides = {}) {
  return {
    agentTurnService: createMockAgentTurnService(),
    functionCalling: createMockFunctionCalling([]),
    toolRegistry: createMockToolRegistry(),
    persona: 'test-persona',
    contextBuilder: { assemble: vi.fn(() => 'assembled-context') },
    weather: { current: vi.fn(async () => 'sunny') },
    queue: { future: [], mode: 'sequential', upcomingSongs: [] },
    now: vi.fn(() => 99999),
    maxIterations: 5,
    userActivity: { setLastUserChat: vi.fn() },
    djStatus: { isConfigured: () => true },
    ...overrides,
  };
}

describe('AgentLoopService ReAct', () => {
  it('reactNotEnabled_delegatesToAgentTurnService', async () => {
    const deps = createDeps({
      functionCalling: { isConfigured: () => false, completeWithTools: vi.fn() },
    });
    const service = createAgentLoopService(deps);
    expect(service.isReactEnabled()).toBe(false);

    await service.handleMessage({ text: '今天天气怎么样', snapshot: null });
    expect(deps.agentTurnService.handleMessage).toHaveBeenCalled();
  });

  it('reactEnabled_isReactEnabledReturnsTrue', () => {
    const service = createAgentLoopService(createDeps());
    expect(service.isReactEnabled()).toBe(true);
  });

  it('djNotConfigured_returnsUnavailableMessage', async () => {
    const deps = createDeps({
      djStatus: { isConfigured: () => false },
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '你好', snapshot: { future: [] } });

    expect(deps.userActivity.setLastUserChat).toHaveBeenCalledWith('你好');
    expect(deps.agentTurnService.handleMessage).not.toHaveBeenCalled();
    expect(deps.functionCalling.completeWithTools).not.toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.unavailableMessage).toBeTruthy();
    expect(result.unavailableMessage.text).toContain('离线');
  });

  it('userActivity_setLastUserChat_alwaysCalled', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: '你好！', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    await service.handleMessage({ text: '今天天气怎么样', snapshot: null });
    expect(deps.userActivity.setLastUserChat).toHaveBeenCalledWith('今天天气怎么样');
  });

  it('fastRouteMatch_delegatesToAgentTurnService', async () => {
    const deps = createDeps();
    const service = createAgentLoopService(deps);

    await service.handleMessage({ text: '下一首', snapshot: null });

    expect(deps.agentTurnService.handleMessage).toHaveBeenCalledWith({ text: '下一首', snapshot: null });
    expect(deps.functionCalling.completeWithTools).not.toHaveBeenCalled();
  });

  it('fastRouteMatch_pause_delegatesToAgentTurnService', async () => {
    const deps = createDeps();
    const service = createAgentLoopService(deps);

    await service.handleMessage({ text: '暂停', snapshot: null });

    expect(deps.agentTurnService.handleMessage).toHaveBeenCalled();
    expect(deps.functionCalling.completeWithTools).not.toHaveBeenCalled();
  });

  it('llmReturnsTextDirectly_noToolCalls_returnsReply', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: '你好！欢迎收听电台。', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '今天天气怎么样', snapshot: null });

    expect(deps.functionCalling.completeWithTools).toHaveBeenCalledTimes(1);
    expect(result.handled).toBe(false);
    expect(result.reactReply).toBe('你好！欢迎收听电台。');
    expect(result.routing.route).toBe('react');
    expect(result.mergedStream).toBeTruthy();
  });

  it('llmCallsSkipTool_thenRepliesWithText', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
        { content: '好的，已为你跳过这首歌！', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '这首歌不太合我的口味', snapshot: null });

    expect(deps.functionCalling.completeWithTools).toHaveBeenCalledTimes(2);
    expect(result.reactReply).toBe('好的，已为你跳过这首歌！');
    expect(result.conversationResults).toHaveLength(1);
    expect(result.conversationResults[0].handled).toBe(true);
  });

  it('llmCallsSearchMusic_toolExecutesAndQueueUpdateReturned', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: null, toolCalls: [{ name: 'search_music', arguments: { query: '周杰伦' } }] },
        { content: '找到了几首周杰伦的歌，已经加入队列了！', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '有没有周杰伦的音乐', snapshot: null });

    expect(result.reactReply).toContain('周杰伦');
    expect(result.conversationResults).toHaveLength(1);
    expect(result.conversationResults[0].results).toHaveLength(1);
    expect(result.queueUpdate).toBeTruthy();
  });

  it('llmReturnsNull_fallsBackToAgentTurnService', async () => {
    const deps = createDeps({
      functionCalling: {
        completeWithTools: vi.fn(async () => null),
        isConfigured: () => true,
      },
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '讲个笑话', snapshot: null });

    expect(deps.agentTurnService.handleMessage).toHaveBeenCalled();
    expect(result.fallback).toBe(true);
  });

  it('unknownTool_returnsErrorInResults', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: null, toolCalls: [{ name: 'nonexistent_tool', arguments: {} }] },
        { content: '抱歉，出了点问题。', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '讲个笑话', snapshot: null });

    expect(result.conversationResults).toHaveLength(1);
    expect(result.conversationResults[0].error).toContain('未知工具');
  });

  it('maxIterationsReached_requestsWrapUp', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
        { content: null, toolCalls: [{ name: 'skip', arguments: {} }] },
        { content: '已经帮你跳过了歌曲。', toolCalls: [] },
      ]),
      maxIterations: 2,
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '这首歌不太合我的口味', snapshot: null });

    expect(result.reactReply).toBe('已经帮你跳过了歌曲。');
    expect(result.conversationResults).toHaveLength(2);
  });

  it('mergedStream_yieldsReactReplyText', async () => {
    const deps = createDeps({
      functionCalling: createMockFunctionCalling([
        { content: '你好！', toolCalls: [] },
      ]),
    });
    const service = createAgentLoopService(deps);

    const result = await service.handleMessage({ text: '讲个笑话', snapshot: null });

    const tokens = [];
    for await (const t of result.mergedStream) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['你好！']);
  });

  it('createLoopState_returnsFreshStateMachine', () => {
    const service = createAgentLoopService(createDeps({ maxIterations: 3 }));
    const state = service.createLoopState();
    expect(state.getState()).toBe('idle');
    expect(state.getIterationCount()).toBe(0);
  });
});
