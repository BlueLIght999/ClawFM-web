/**
 * ReAct agent loop state machine.
 *
 * States: 'idle' -> 'thinking' -> 'acting' -> 'observing' -> 'thinking' | 'done'
 *
 * @param {number} maxIterations - Safety limit to prevent infinite loops.
 * @returns {AgentLoopState}
 */
export function createAgentLoopState(maxIterations = 5) {
  let state = 'idle';
  let iterations = 0;
  const history = [];

  return {
    start() { state = 'thinking'; },

    recordThought(thought) {
      history.push({ step: iterations, thought, action: null, observation: null });
      state = 'acting';
    },

    recordAction(action) {
      const current = history[history.length - 1];
      if (current) current.action = action;
    },

    recordObservation(observation) {
      const current = history[history.length - 1];
      if (current) current.observation = observation;
      iterations++;
      state = iterations >= maxIterations ? 'done' : 'thinking';
    },

    canContinue() { return state === 'thinking' && iterations < maxIterations; },
    finish() { state = 'done'; },
    isDone() { return state === 'done'; },
    getIterationCount() { return iterations; },
    getHistory() { return history.map(h => ({ ...h })); },
    getState() { return state; },
  };
}
