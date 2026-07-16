import {
  buildAgentExecTrace,
  buildSearchToolResults,
  latestToolResults,
  nextRecommendationSnapshot,
} from '../../domain/agentTurnRules.js';
import { buildMergedIntentMessages } from '../../../domain/hosting/mergedIntentPromptBuilder.js';
import { inferRouteFromAction, searchMusicByIntent } from '../../../domain/routing/mergedIntentResolver.js';

const RECOMMENDATION_ACTIONS = new Set(['reject_recommend', 'recommend_rollback', 'recommend_retry']);

/**
 * Handle merged route: single LLM call for intent+chat.
 * Extracted to keep handleMessage complexity within limits.
 */
async function handleMergedRoute({
  routing, text, snapshot, conversation, contextBuilder,
  weather, queue, queueUpdate, queueSearchResults,
  music, persona, now,
}) {
  const { mergedChat } = routing;
  const weatherText = await weather.current();
  const baseContext = contextBuilder.assemble({
    userInput: text,
    toolResults: '',
    environment: { weather: weatherText },
    execTrace: buildAgentExecTrace({ routing, queue }),
  });

  const { intent, stream } = await mergedChat.streamWithIntent(
    buildMergedIntentMessages(persona, text, [], [], baseContext),
  );

  const mergedIntent = await intent;
  mergedIntent.route = inferRouteFromAction(mergedIntent.action);
  mergedIntent.results = await searchMusicByIntent(mergedIntent, music);

  const actionResult = await runConversationActions({
    conversation, routing: mergedIntent, text, snapshot,
  });

  let queueUpdatePayload = actionResult.queueUpdate || null;
  if (mergedIntent.results?.length > 0) {
    queueSearchResults(queue, mergedIntent.results);
    queueUpdatePayload = queueUpdate(queue);
  }

  return {
    handled: actionResult.handled,
    routing: mergedIntent,
    snapshot: actionResult.snapshot,
    conversationResults: actionResult.conversationResults,
    queueUpdate: queueUpdatePayload,
    mergedStream: stream,
    streamRequest: {
      text,
      contextPrompt: '',
      routing: mergedIntent,
      messageId: String(now()),
    },
  };
}

  function queueUpdate(queue) {
  return {
    upcomingSongs: queue.upcomingSongs,
    mode: queue.mode,
  };
}

function queueSearchResults(queue, songs = []) {
  for (let index = songs.length - 1; index >= 0; index--) {
    queue.insertNext(songs[index]);
  }
}

function collectResult(results, result) {
  if (result) results.push(result);
  return result || {};
}

async function runConversationActions({ conversation, routing, text, snapshot }) {
  const conversationResults = [];
  let nextSnapshot = snapshot || null;
  let toolResults = '';
  let queueUpdatePayload = null;

  const fastAction = collectResult(conversationResults, await conversation.handleFastAction(routing));
  if (fastAction.handled) {
    return { handled: true, conversationResults, snapshot: nextSnapshot };
  }

  nextSnapshot = fastAction.snapshot || nextSnapshot;
  toolResults = latestToolResults(toolResults, fastAction.toolResults);

  const planAction = collectResult(conversationResults, await conversation.handlePlanAction({ routing, text }));
  toolResults = latestToolResults(toolResults, planAction.toolResults);
  queueUpdatePayload = planAction.queueUpdate || queueUpdatePayload;

  nextSnapshot = nextRecommendationSnapshot(routing, nextSnapshot);

  if (routing.action === 'play_personalized') {
    const result = await conversation.handlePersonalizedRecommendation(routing);
    nextSnapshot = result.snapshot;
    toolResults = latestToolResults(toolResults, result.toolResults);
    queueUpdatePayload = result.queueUpdate || queueUpdatePayload;
  }

  if (RECOMMENDATION_ACTIONS.has(routing.action)) {
    const result = await conversation.handleRecommendationAction({ routing, snapshot: nextSnapshot });
    if (result.snapshot !== undefined) nextSnapshot = result.snapshot;
    toolResults = latestToolResults(toolResults, result.toolResults);
    queueUpdatePayload = result.queueUpdate || queueUpdatePayload;
  }

  return {
    handled: false,
    conversationResults,
    snapshot: nextSnapshot,
    toolResults,
    queueUpdate: queueUpdatePayload,
  };
}

export function createAgentTurnService({
  intentRouter,
  conversation,
  contextBuilder,
  weather,
  queue,
  djStatus,
  userActivity = { setLastUserChat: () => {} },
  now = Date.now,
  persona = '',
  music = { search: async () => [] },
}) {
  return {
    async handleMessage({ text, snapshot = null }) {
      userActivity.setLastUserChat(text);

      if (!djStatus.isConfigured()) {
        return {
          handled: true,
          snapshot,
          unavailableMessage: {
            text: 'DJ 暂时离线，请稍后再试。',
          },
        };
      }

      const routing = await intentRouter.route(text);

      // Merged route: single LLM call for intent+chat
      if (routing.route === 'merged' && routing.mergedChat) {
        return handleMergedRoute({
          routing, text, snapshot, conversation, contextBuilder,
          weather, queue, queueUpdate, queueSearchResults,
          music, persona, now,
        });
      }

      const actionResult = await runConversationActions({ conversation, routing, text, snapshot });

      if (actionResult.handled) {
        return {
          handled: true,
          routing,
          snapshot: actionResult.snapshot,
          conversationResults: actionResult.conversationResults,
        };
      }

      let toolResults = actionResult.toolResults;
      let queueUpdatePayload = actionResult.queueUpdate || null;

      if (routing.results?.length > 0) {
        queueSearchResults(queue, routing.results);
        queueUpdatePayload = queueUpdate(queue);
        toolResults = latestToolResults(toolResults, buildSearchToolResults(routing.results));
      }

      const weatherText = await weather.current();
      const contextPrompt = contextBuilder.assemble({
        userInput: text,
        toolResults,
        environment: { weather: weatherText },
        execTrace: buildAgentExecTrace({ routing, queue }),
      });

      return {
        handled: false,
        routing,
        snapshot: actionResult.snapshot,
        conversationResults: actionResult.conversationResults,
        toolResults,
        queueUpdate: queueUpdatePayload,
        streamRequest: {
          text,
          contextPrompt,
          routing,
          messageId: String(now()),
        },
      };
    },
  };
}
