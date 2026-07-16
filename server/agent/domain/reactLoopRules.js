/**
 * Pure domain functions for the ReAct agent loop.
 *
 * These functions have no side effects and no external dependencies.
 * They handle: parsing LLM responses, formatting tool results,
 * and determining loop continuation.
 */

/**
 * Check if an LLM function-calling response contains tool calls.
 *
 * @param {{content: string|null, toolCalls: Array}|null} response
 * @returns {boolean}
 */
export function hasToolCalls(response) {
  return !!(response && Array.isArray(response.toolCalls) && response.toolCalls.length > 0);
}

/**
 * Determine if the ReAct loop should stop after this response.
 *
 * The loop stops when:
 * - The response is null (LLM unavailable)
 * - There are no tool calls (LLM produced a final text answer)
 * - The loop state says we can't continue (max iterations)
 *
 * @param {{content: string|null, toolCalls: Array}|null} response
 * @param {{canContinue: Function}} loopState
 * @returns {boolean}
 */
export function shouldStop(response, loopState) {
  if (!response) return true;
  if (!hasToolCalls(response)) return true;
  if (!loopState.canContinue()) return true;
  return false;
}

/**
 * Build the assistant message from an LLM response for conversation history.
 *
 * @param {{content: string|null, toolCalls: Array}} response
 * @returns {{role: string, content: string|null, tool_calls?: Array}}
 */
export function buildAssistantMessage(response) {
  const msg = { role: 'assistant', content: response.content };
  if (hasToolCalls(response)) {
    msg.tool_calls = response.toolCalls.map((tc, i) => ({
      id: `call_${i}`,
      type: 'function',
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }
  return msg;
}

/**
 * Format a tool execution result as a tool message for the LLM.
 *
 * @param {object} result - Tool execution result
 * @param {string} toolName - Name of the tool that was called
 * @param {number} callIndex - Index of the tool call (for id matching)
 * @returns {{role: string, content: string, tool_call_id: string}}
 */
export function formatToolMessage(result, toolName, callIndex) {
  const summary = summarizeToolResult(result, toolName);
  return {
    role: 'tool',
    content: summary,
    tool_call_id: `call_${callIndex}`,
  };
}

/**
 * Summarize a tool execution result into a concise string for the LLM.
 *
 * @param {object} result - Tool execution result
 * @param {string} toolName - Name of the tool
 * @returns {string}
 */
// eslint-disable-next-line complexity
function summarizeToolResult(result, toolName) {
  if (!result) return `${toolName}: completed (no output)`;

  if (result.error) return `${toolName}: error - ${result.error}`;

  switch (toolName) {
    case 'skip':
      return result.handled
        ? `skip: done. Current state: ${JSON.stringify(result.state?.playbackState || 'playing')}`
        : 'skip: failed';
    case 'pause':
      return result.handled ? 'pause: playback paused' : 'pause: failed';
    case 'resume':
      return result.handled ? `resume: playback resumed at ${result.resume?.startedAt || 'now'}` : 'resume: failed';
    case 'get_now_playing': {
      const state = result.state;
      if (!state) return 'get_now_playing: no state available';
      const song = state.current?.title || 'unknown';
      return `get_now_playing: currently playing "${song}"`;
    }
    case 'search_music': {
      const count = result.results?.length || 0;
      if (count === 0) return 'search_music: no results found';
      const titles = result.results.slice(0, 5).map(s =>
        `"${s.name || s.title}" by ${s.ar?.[0]?.name || s.artist || 'unknown'}`,
      ).join('; ');
      return `search_music: found ${count} songs. Top results: ${titles}`;
    }
    case 'recommend': {
      const count = result.addedCount || 0;
      return `recommend: added ${count} fresh tracks to queue`;
    }
    case 'refresh_plan':
      return result.planUpdate
        ? `refresh_plan: generated new plan with ${result.planUpdate.blocks?.length || 0} blocks`
        : 'refresh_plan: failed to generate plan';
    case 'select_plan_block':
      return `select_plan_block: switched to block #${(result.blockIndex || 0) + 1}`;
    case 'pin_plan_block':
      return 'pin_plan_block: current block pinned';
    case 'clear_plan':
      return 'clear_plan: returned to auto mode';
    case 'get_queue_status': {
      const len = result.length || 0;
      return `get_queue_status: ${len} songs in queue, mode: ${result.mode || 'sequential'}`;
    }
    default:
      return `${toolName}: ${JSON.stringify(result).slice(0, 200)}`;
  }
}

/**
 * Build the final result from the last LLM response.
 *
 * When the LLM produces a text response (no tool calls), this function
 * packages it into the standard return shape for the socket handler.
 *
 * @param {{content: string|null, toolCalls: Array}} response
 * @param {object} loopState
 * @param {{text: string, messageId: string, conversationResults: Array, queueUpdate: object|null, snapshot: object|null}} ctx
 * @returns {object}
 */
export function buildFinalResult(response, loopState, ctx) {
  const finalText = response?.content || '';
  return {
    handled: false,
    routing: { action: 'chat', route: 'react' },
    snapshot: ctx.snapshot,
    conversationResults: ctx.conversationResults,
    queueUpdate: ctx.queueUpdate,
    reactReply: finalText,
    reactHistory: loopState.getHistory(),
    streamRequest: {
      text: ctx.text,
      contextPrompt: '',
      routing: { action: 'chat', route: 'react' },
      messageId: ctx.messageId,
    },
  };
}

/**
 * Create a simple async generator that yields a single text chunk.
 * Used to turn the ReAct final reply into a mergedStream-compatible shape.
 *
 * @param {string} text
 * @returns {AsyncIterable<string>}
 */
export async function* singleChunkStream(text) {
  if (text) yield text;
}
