import {
  buildAgentExecTrace,
  buildSearchToolResults,
  latestToolResults,
  nextRecommendationSnapshot,
} from '../../domain/agent/agentTurnRules.js';

const RECOMMENDATION_ACTIONS = new Set(['reject_recommend', 'recommend_rollback', 'recommend_retry']);

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
}) {
  return {
    async handleMessage({ text, snapshot = null }) {
      userActivity.setLastUserChat(text);

      if (!djStatus.isConfigured()) {
        return {
          handled: true,
          snapshot,
          unavailableMessage: {
            text: 'DJ booth is offline - DeepSeek API key not configured yet.',
          },
        };
      }

      const routing = await intentRouter.route(text);
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
