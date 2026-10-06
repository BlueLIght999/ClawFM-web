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
import { matchSearchRoute } from '../../../domain/routing/matchSearchRoute.js';

/**
 * Execute all tool calls in an LLM response in parallel.
 *
 * Records thoughts/actions first, then runs all tools concurrently,
 * then records observations in order. Tool messages are pushed in
 * tool_calls order to match OpenAI's tool_call_id expectation.
 *
 * @returns {Promise<{conversationResults: Array, queueUpdate: object|null}>}
 */
async function executeToolCalls(response, { toolRegistry, loopState, messages, queue, snapshot, callerUserId }) {
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
      return executeToolSafely(tool, tc, { queue, snapshot, callerUserId });
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

/**
 * Run one tool call with the run-edge context as its second argument.
 *
 * The context is everything the tool may trust: `queue`/`snapshot` are server
 * state, and `callerUserId` is the logged-in member as resolved by the
 * transport (null when there is none). The model only ever produces
 * `tc.arguments`; it never sees this context, so a tool that needs an identity
 * must read it from here — an identity taken from the arguments is whatever the
 * conversation talked the model into writing.
 *
 * @param {object|null|undefined} tool
 * @param {{name: string, arguments?: object}} tc
 * @param {{queue: object, snapshot: object|null, callerUserId: string|null}} context
 * @returns {Promise<object>}
 */
async function executeToolSafely(tool, tc, { queue, snapshot, callerUserId }) {
  if (!tool) {
    return { handled: false, error: `未知工具: ${tc.name}` };
  }
  try {
    return await tool.execute(tc.arguments || {}, { queue, snapshot, callerUserId });
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
  // F1: search-direct intents ("播周杰伦", "来点爵士", "我想听晴天") bypass ReAct
  // and go through AgentTurnService which calls intentRouter.route() once.
  // matchFastRoute is consulted FIRST so "播放" (resume) is captured before
  // matchSearchRoute would match it as prefix "播" + query "放".
  if (matchSearchRoute(normalized)) {
    return agentTurnService.handleMessage({ text, snapshot });
  }
  return null;
}

/**
 * Assemble the ReAct call's opening state: the system messages, the tool
 * catalogue and the loop budget. Extracted from handleMessage so the loop body
 * there reads as the Thought → Action → Observation cycle it documents.
 *
 * @param {string} text - the user's message
 * @param {object} ctx - { persona, contextBuilder, weather, toolRegistry, queue, maxIterations }
 * @returns {Promise<{messages: Array, tools: Array, loopState: object}>}
 */
async function buildReactSession(text, { persona, contextBuilder, weather, toolRegistry, queue, maxIterations }) {
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

  return {
    messages: buildReactMessages(persona, contextPrompt, text),
    tools: toolRegistry.describeAll(),
    loopState,
  };
}

/**
 * Drive the Thought → Action → Observation cycle to completion.
 *
 * Owns the iteration budget and the accumulator state, so handleMessage only
 * has to handle the two outcomes: a usable response, or none at all (which the
 * caller answers by falling back to AgentTurnService).
 *
 * @param {object} ctx - { functionCalling, messages, tools, loopState, toolRegistry, queue, snapshot, callerUserId }
 * @returns {Promise<{lastResponse: object|null, conversationResults: Array, queueUpdate: object|null}>}
 */
async function runReactLoop({ functionCalling, messages, tools, loopState, toolRegistry, queue, snapshot, callerUserId }) {
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
      toolRegistry, loopState, messages, queue, snapshot, callerUserId,
    });
    conversationResults.push(...execResult.conversationResults);
    if (execResult.queueUpdate) queueUpdatePayload = execResult.queueUpdate;

    // Performance: if LLM already provided content alongside tool calls,
    // use it as the final reply — saves one LLM round-trip (~1-3s)
    if (response.content) break;
  }

  return { lastResponse, conversationResults, queueUpdate: queueUpdatePayload };
}

/**
 * Final response, or — when the last turn was tool calls with no prose — one
 * last wrap-up request so the DJ still says something. Returns the original
 * response unchanged when a wrap-up is not needed or fails to produce one.
 *
 * @param {object} response
 * @param {{functionCalling: object, messages: Array}} ctx
 * @returns {Promise<object>}
 */
async function finalResponseOf(response, { functionCalling, messages }) {
  if (!hasToolCalls(response) || response.content) return response;
  const wrapUp = await requestWrapUp(functionCalling, messages);
  return wrapUp || response;
}

/**
 * Run one user message through the ReAct cycle, or hand it to AgentTurnService.
 *
 * The last-chat recorder fires before every branch, including the pre-flight
 * redirect: a message that gets fast-pathed is still the user's most recent
 * activity, and the proactive/typing paths read it.
 *
 * `callerUserId` is the transport's logged-in member; it reaches tools only
 * through their context (see executeToolSafely), never through the prompt.
 *
 * @param {{text: string, snapshot?: object|null, callerUserId?: string|null}} input
 * @param {object} ctx - the service's assembled dependencies
 * @returns {Promise<object>}
 */
async function handleAgentMessage({ text, snapshot = null, callerUserId = null }, ctx) {
  ctx.userActivity.setLastUserChat(text);

  const redirect = preFlightCheck(text, snapshot, ctx);
  if (redirect) return redirect;
  if (!ctx.reactEnabled) return ctx.agentTurnService.handleMessage({ text, snapshot });
  return runReactMessage({ text, snapshot, callerUserId }, ctx);
}

/**
 * The ReAct path proper, entered only once pre-flight and capability checks pass.
 * @param {{text: string, snapshot: object|null, callerUserId: string|null}} input
 * @param {object} ctx
 * @returns {Promise<object>}
 */
async function runReactMessage({ text, snapshot, callerUserId }, ctx) {
  const { messages, tools, loopState } = await buildReactSession(text, ctx);

  const { lastResponse, conversationResults, queueUpdate } = await runReactLoop({
    functionCalling: ctx.functionCalling,
    messages, tools, loopState,
    toolRegistry: ctx.toolRegistry,
    queue: ctx.queue,
    snapshot,
    callerUserId,
  });

  // The loop never got a response out of the LLM; let the fallback service try.
  if (!lastResponse) return ctx.agentTurnService.handleMessage({ text, snapshot });

  const finalResponse = await finalResponseOf(lastResponse, {
    functionCalling: ctx.functionCalling, messages,
  });
  const result = buildFinalResult(finalResponse, loopState, {
    text, messageId: String(ctx.now()), conversationResults, queueUpdate, snapshot,
  });
  result.mergedStream = singleChunkStream(finalResponse?.content || '');
  return result;
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
 * @param {{setLastUserChat: (text: string) => void}} [deps.userActivity] - Last-chat recorder
 * @param {{isConfigured: () => boolean}} [deps.djStatus] - DJ readiness probe
 */
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
  // One bag rather than a dozen positional parameters: the message handlers are
  // module-level functions that take this context, which keeps each handler's own
  // branching out of the factory.
  const ctx = {
    agentTurnService,
    functionCalling,
    toolRegistry,
    persona,
    contextBuilder,
    weather,
    queue,
    now,
    maxIterations,
    userActivity,
    djStatus,
    reactEnabled: !!(functionCalling?.isConfigured() && toolRegistry),
  };

  return {
    handleMessage: (input) => handleAgentMessage(input, ctx),

    createLoopState() {
      return createAgentLoopState(maxIterations);
    },

    isReactEnabled() {
      return ctx.reactEnabled;
    },
  };
}
