import { createAgentLoopState } from '../../domain/agentLoopState.js';
import { buildReactMessages } from '../../domain/reactPromptBuilder.js';
import {
  hasToolCalls,
  shouldStop,
  buildAssistantMessage,
  formatToolMessage,
  buildFinalResult,
  singleChunkStream,
} from '../../domain/reactLoopRules.js';
import { buildAgentExecTrace } from '../../domain/agentTurnRules.js';
import { matchFastRoute } from '../../../domain/routing/matchFastRoute.js';

/**
 * Execute all tool calls in an LLM response in parallel.
 *
 * Records thoughts/actions first, then runs all tools concurrently,
 * then records observations in order. Tool messages are pushed in
 * tool_calls order to match OpenAI's tool_call_id expectation.
 *
 * @returns {{conversationResults: Array, queueUpdate: object|null}}
 */
async function executeToolCalls(response, { toolRegistry, loopState, messages, queue, snapshot }) {
  const conversationResults = [];
  let queueUpdatePayload = null;

  messages.push(buildAssistantMessage(response));

  const toolCalls = response.toolCalls;

  // Record all thoughts and actions first
  for (const tc of toolCalls) {
    loopState.recordThought(`调用工具: ${tc.name}`);
    loopState.recordAction(tc);
  }

  // Execute all tools in parallel
  const results = await Promise.all(
    toolCalls.map(tc => {
      const tool = toolRegistry.get(tc.name);
      return executeToolSafely(tool, tc, { queue, snapshot });
    }),
  );

  // Record observations and build messages in order
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    loopState.recordObservation(result);
    conversationResults.push(result);

    if (result.queueUpdate) {
      queueUpdatePayload = result.queueUpdate;
    }

    messages.push(formatToolMessage(result, toolCalls[i].name, i));
  }

  return { conversationResults, queueUpdate: queueUpdatePayload };
}

async function executeToolSafely(tool, tc, { queue, snapshot }) {
  if (!tool) {
    return { handled: false, error: `未知工具: ${tc.name}` };
  }
  try {
    return await tool.execute(tc.arguments || {}, { queue, snapshot });
  } catch (err) {
    return { handled: false, error: err.message };
  }
}

async function requestWrapUp(functionCalling, messages) {
  const wrapUp = await functionCalling.completeWithTools({
    messages,
    tools: [],
    maxTokens: 200,
    temperature: 0.75,
  });
  return wrapUp || null;
}

/**
 * Pre-flight checks before entering the ReAct loop.
 * Returns a redirect result if the message should bypass ReAct, or null to proceed.
 */
function preFlightCheck(text, snapshot, { djStatus, agentTurnService }) {
  if (!djStatus.isConfigured()) {
    return {
      handled: true,
      snapshot,
      unavailableMessage: { text: 'DJ 暂时离线，请稍后再试。' },
    };
  }
  const normalized = text.trim().toLowerCase();
  if (matchFastRoute(normalized)) {
    return agentTurnService.handleMessage({ text, snapshot });
  }
  return null;
}

/**
 * ReAct agent loop service.
 *
 * Implements the Thought → Action → Observation multi-step cycle:
 * 1. Send user message + tool definitions to LLM (function calling)
 * 2. If LLM requests tool calls → execute tools, feed results back
 * 3. Repeat until LLM produces a final text response or max iterations
 * 4. Return the final DJ reply as a mergedStream-compatible result
 *
 * Falls back to AgentTurnService when function calling is unavailable.
 *
 * @param {object} deps
 * @param {object} deps.agentTurnService - Fallback single-step service
 * @param {object} [deps.functionCalling] - FunctionCallingPort implementation
 * @param {object} [deps.toolRegistry] - ToolRegistryPort implementation
 * @param {string} [deps.persona] - DJ persona text
 * @param {object} [deps.contextBuilder] - Context assembler
 * @param {object} [deps.weather] - Weather service
 * @param {object} [deps.queue] - Song queue
 * @param {Function} [deps.now] - Timestamp factory
 * @param {number} [deps.maxIterations] - Max ReAct iterations (default 5)
 */
// eslint-disable-next-line complexity
export function createAgentLoopService({
  agentTurnService,
  functionCalling = null,
  toolRegistry = null,
  persona = '',
  contextBuilder = null,
  weather = null,
  queue = null,
  now = Date.now,
  maxIterations = 5,
  userActivity = { setLastUserChat: () => {} },
  djStatus = { isConfigured: () => true },
}) {
  const reactEnabled = !!(functionCalling?.isConfigured() && toolRegistry);

  return {
    // eslint-disable-next-line complexity
    async handleMessage({ text, snapshot = null }) {
      userActivity.setLastUserChat(text);

      const redirect = preFlightCheck(text, snapshot, { djStatus, agentTurnService });
      if (redirect) return redirect;

      if (!reactEnabled) {
        return agentTurnService.handleMessage({ text, snapshot });
      }

      const loopState = createAgentLoopState(maxIterations);
      loopState.start();

      const weatherText = weather ? await weather.current() : '';
      const contextPrompt = contextBuilder
        ? contextBuilder.assemble({
            userInput: text,
            toolResults: '',
            environment: { weather: weatherText },
            execTrace: buildAgentExecTrace({ routing: { action: 'react' }, queue }),
          })
        : '';

      const messages = buildReactMessages(persona, contextPrompt, text);
      const tools = toolRegistry.describeAll();
      const conversationResults = [];
      let queueUpdatePayload = null;
      let lastResponse = null;

      while (loopState.canContinue()) {
        const response = await functionCalling.completeWithTools({
          messages, tools, maxTokens: 300, temperature: 0.75,
        });
        lastResponse = response;
        if (shouldStop(response, loopState)) break;

        const execResult = await executeToolCalls(response, {
          toolRegistry, loopState, messages, queue, snapshot,
        });
        conversationResults.push(...execResult.conversationResults);
        if (execResult.queueUpdate) queueUpdatePayload = execResult.queueUpdate;

        // Performance: if LLM already provided content alongside tool calls,
        // use it as the final reply — saves one LLM round-trip (~1-3s)
        if (response.content) break;
      }

      if (!lastResponse) {
        return agentTurnService.handleMessage({ text, snapshot });
      }

      if (hasToolCalls(lastResponse) && !lastResponse.content) {
        const wrapUp = await requestWrapUp(functionCalling, messages);
        if (wrapUp) lastResponse = wrapUp;
      }

      const messageId = String(now());
      const result = buildFinalResult(lastResponse, loopState, {
        text, messageId, conversationResults, queueUpdate: queueUpdatePayload, snapshot,
      });
      result.mergedStream = singleChunkStream(lastResponse?.content || '');
      return result;
    },

    createLoopState() {
      return createAgentLoopState(maxIterations);
    },

    isReactEnabled() {
      return reactEnabled;
    },
  };
}
