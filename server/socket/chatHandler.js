/**
 * ChatHandler — extracted from socket/handler.js.
 *
 * Handles incoming chat messages:
 *   1. Persist user message to chat history
 *   2. Route through agent loop (intent detection + action)
 *   3. Stream DJ reply if needed
 *   4. Synthesize TTS announcement for reply
 */

import { EVENTS } from './events.js';
import { emitConversationResult, emitStreamingConversationResult, emitDashboardEvent } from './emitHelpers.js';
import { emitQueueUpdate } from './versionedRadioEmitter.js';

let logger = console;
export function setChatLogger(l) { logger = l; }

let preRecommendSnapshot = {};

export function startChatAnnouncement(io, result, deps) {
  if (!result?.speechAnnouncement) return;
  const { streamingConversationService, resetLastSpeechTime } = deps;
  streamingConversationService.synthesizeAnnouncement(result.speechAnnouncement).then(speechStart => {
    if (speechStart) {
      io.emit(EVENTS.DJ_SPEECH_START, speechStart);
      resetLastSpeechTime();
    }
  }).catch(e => console.warn('[ChatHandler] Proactive speech failed (degraded):', e.message));
}

function logChatRoute(routing) {
  const r = routing || {};
  logger.info({ component: 'chat', route: r.route, action: r.action, params: r.params }, 'route result');
}

export function emitChatTurnResults(io, socket, turnResult) {
  for (const result of turnResult.conversationResults || []) {
    emitConversationResult(io, socket, result);
  }
  if (turnResult.queueUpdate) emitQueueUpdate(io, turnResult.queueUpdate);
}

export async function handleChatMessage(text, io, socket, deps) {
  const { agentLoopService, streamingConversationService, llmAdapter, metricsCollector, chatHistory } = deps;
  logger.info({ component: 'chat', text: text?.slice(0, 80) }, 'received');
  logger.debug({ component: 'chat', configured: llmAdapter.isConfigured() }, 'DJ configured');
  emitDashboardEvent(io, 'user_chat', (text || '').slice(0, 60));

  if (chatHistory && text) chatHistory.append('user', text);
  if (metricsCollector) metricsCollector.chatMessages.inc({ role: 'user' });

  const turnResult = await agentLoopService.handleMessage({ text, snapshot: preRecommendSnapshot });
  if (turnResult.unavailableMessage) {
    socket.emit(EVENTS.DJ_MESSAGE, turnResult.unavailableMessage);
    preRecommendSnapshot = turnResult.snapshot;
    return;
  }

  logChatRoute(turnResult.routing);
  emitChatTurnResults(io, socket, turnResult);
  preRecommendSnapshot = turnResult.snapshot;
  if ((turnResult.handled || !turnResult.streamRequest) && !turnResult.mergedStream) return;

  const streamingResult = await streamingConversationService.streamReply({
    ...turnResult.streamRequest,
    mergedStream: turnResult.mergedStream || null,
    onChunk: payload => socket.emit(EVENTS.DJ_STREAM_CHUNK, payload),
  });
  if (streamingResult.streamError) {
    logger.error({ component: 'chat', err: streamingResult.streamError }, 'stream error');
  }
  emitStreamingConversationResult(socket, streamingResult);
  startChatAnnouncement(io, streamingResult, deps);
}
