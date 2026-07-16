import { describe, it, expect } from 'vitest';
import { createAgentLoopState } from '../agent/domain/agentLoopState.js';

describe('AgentLoopState', () => {
  it('startsInIdleState', () => {
    const state = createAgentLoopState();
    expect(state.getState()).toBe('idle');
  });

  it('start_transitionsToThinking', () => {
    const state = createAgentLoopState();
    state.start();
    expect(state.getState()).toBe('thinking');
  });

  it('fullCycle_thoughtActionObservation_returnsToThinking', () => {
    const state = createAgentLoopState(5);
    state.start();
    state.recordThought('need to skip');
    expect(state.getState()).toBe('acting');
    state.recordAction({ tool: 'skip' });
    state.recordObservation({ handled: true });
    expect(state.getState()).toBe('thinking');
    expect(state.getIterationCount()).toBe(1);
  });

  it('maxIterationsReached_transitionsToDone', () => {
    const state = createAgentLoopState(2);
    state.start();
    state.recordThought('t1'); state.recordAction({}); state.recordObservation({});
    state.recordThought('t2'); state.recordAction({}); state.recordObservation({});
    expect(state.getState()).toBe('done');
    expect(state.canContinue()).toBe(false);
  });

  it('getHistory_returnsCopyNotReference', () => {
    const state = createAgentLoopState();
    state.start();
    state.recordThought('test');
    const h1 = state.getHistory();
    h1[0].thought = 'mutated';
    const h2 = state.getHistory();
    expect(h2[0].thought).toBe('test');
  });

  it('finish_transitionsToDone', () => {
    const state = createAgentLoopState();
    state.start();
    state.finish();
    expect(state.isDone()).toBe(true);
  });
});
