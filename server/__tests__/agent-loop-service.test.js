import { describe, it, expect, vi } from 'vitest';
import { createAgentLoopService } from '../agent/application/services/AgentLoopService.js';

describe('AgentLoopService', () => {
  it('handleMessage_delegatesToAgentTurnService', async () => {
    const mockResult = { handled: false, streamRequest: { text: 'hi' } };
    const agentTurnService = {
      handleMessage: vi.fn(async () => mockResult),
    };
    const loopService = createAgentLoopService({ agentTurnService });

    const result = await loopService.handleMessage({ text: 'hi', snapshot: null });

    expect(agentTurnService.handleMessage).toHaveBeenCalledWith({ text: 'hi', snapshot: null });
    expect(result).toBe(mockResult);
  });

  it('createLoopState_returnsFreshStateMachine', () => {
    const agentTurnService = { handleMessage: vi.fn() };
    const loopService = createAgentLoopService({ agentTurnService, maxIterations: 3 });

    const state = loopService.createLoopState();
    expect(state.getState()).toBe('idle');
    expect(state.getIterationCount()).toBe(0);
  });
});

describe('AgentLoopService preFlightCheck search-direct (F1)', () => {
  it('searchMatch_playArtist_bypassesReAct_delegatesToAgentTurnService', async () => {
    const agentTurnService = { handleMessage: vi.fn(async () => ({ handled: true })) };
    const functionCalling = { isConfigured: () => true, completeWithTools: vi.fn() };
    const loopService = createAgentLoopService({
      agentTurnService,
      functionCalling,
      toolRegistry: { describeAll: () => [] },
      djStatus: { isConfigured: () => true },
    });

    await loopService.handleMessage({ text: '播周杰伦', snapshot: null });

    expect(agentTurnService.handleMessage).toHaveBeenCalledWith({ text: '播周杰伦', snapshot: null });
    expect(functionCalling.completeWithTools).not.toHaveBeenCalled();
  });

  it('searchMatch_laiDianJueShi_bypassesReAct', async () => {
    const agentTurnService = { handleMessage: vi.fn(async () => ({ handled: true })) };
    const functionCalling = { isConfigured: () => true, completeWithTools: vi.fn() };
    const loopService = createAgentLoopService({
      agentTurnService,
      functionCalling,
      toolRegistry: { describeAll: () => [] },
      djStatus: { isConfigured: () => true },
    });

    await loopService.handleMessage({ text: '来点爵士', snapshot: null });

    expect(agentTurnService.handleMessage).toHaveBeenCalled();
    expect(functionCalling.completeWithTools).not.toHaveBeenCalled();
  });

  it('searchMatch_woXiangTingQingTian_bypassesReAct', async () => {
    const agentTurnService = { handleMessage: vi.fn(async () => ({ handled: true })) };
    const functionCalling = { isConfigured: () => true, completeWithTools: vi.fn() };
    const loopService = createAgentLoopService({
      agentTurnService,
      functionCalling,
      toolRegistry: { describeAll: () => [] },
      djStatus: { isConfigured: () => true },
    });

    await loopService.handleMessage({ text: '我想听晴天', snapshot: null });

    expect(agentTurnService.handleMessage).toHaveBeenCalledWith({ text: '我想听晴天', snapshot: null });
  });

  it('fastRouteStillTakesPrecedence_overSearchMatch', async () => {
    // "播放" alone is FAST_ROUTES resume, but matchSearchRoute would also match it
    // (prefix "播", query "放"). preFlightCheck must consult matchFastRoute FIRST.
    const agentTurnService = { handleMessage: vi.fn(async () => ({ handled: true })) };
    const functionCalling = { isConfigured: () => true, completeWithTools: vi.fn() };
    const loopService = createAgentLoopService({
      agentTurnService,
      functionCalling,
      toolRegistry: { describeAll: () => [] },
      djStatus: { isConfigured: () => true },
    });

    await loopService.handleMessage({ text: '播放', snapshot: null });

    // matchFastRoute captures resume → delegates to agentTurnService (which routes to ncm/resume).
    // It must NOT fall through to ReAct.
    expect(agentTurnService.handleMessage).toHaveBeenCalledWith({ text: '播放', snapshot: null });
    expect(functionCalling.completeWithTools).not.toHaveBeenCalled();
  });

  it('nonSearchNonFast_fallsThroughToReAct', async () => {
    const agentTurnService = { handleMessage: vi.fn() };
    const functionCalling = {
      isConfigured: () => true,
      completeWithTools: vi.fn(async () => ({ content: '今天天气不错', toolCalls: [] })),
    };
    const loopService = createAgentLoopService({
      agentTurnService,
      functionCalling,
      toolRegistry: { describeAll: () => [], get: () => null },
      djStatus: { isConfigured: () => true },
    });

    await loopService.handleMessage({ text: '今天天气怎么样', snapshot: null });

    // Neither fast nor search route matches → enters ReAct (calls completeWithTools),
    // does NOT delegate to agentTurnService.
    expect(functionCalling.completeWithTools).toHaveBeenCalled();
    expect(agentTurnService.handleMessage).not.toHaveBeenCalled();
  });
});
