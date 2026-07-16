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
