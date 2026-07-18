/**
 * PROACTIVE.JS — DJ autonomous speech system
 * Every 60s, evaluates whether the DJ should speak unprompted.
 * Streams text to chat AND generates TTS audio for spoken delivery.
 */

import { decideProactiveSpeech } from './claude.js';
import { getTimeOfDayMood } from './context.js';
import { canAttemptProactiveSpeech as _canAttemptProactiveSpeech } from '../domain/hosting/proactiveGuardRules.js';
import { buildProactiveContext, computeHourChanged } from '../domain/hosting/proactiveContextRules.js';
import { isValidSpeechDecision, shouldSynthesizeSpeech } from '../domain/hosting/proactiveDecisionRules.js';

let lastSpeechTime = Date.now();
let lastHour = -1;
let _enabled = true; // Proactive speech on/off

export function setProactiveEnabled(v) { _enabled = !!v; }
export function isProactiveEnabled() { return _enabled; }

export function resetLastSpeechTime(value = Date.now()) {
  lastSpeechTime = value;
}

/** Call from handler when a user sends a chat message */
let _lastUserChat = null;
export function setLastUserChat(text) {
  _lastUserChat = text;
}

export async function maybeProactiveSpeech({
  events,
  scheduler,
  queue,
  getPlan,
  weather = null,
  speech = null,
  decideProactiveSpeech: decide = decideProactiveSpeech,
  tokenDelayMs = null,
}) {
  if (!_canAttemptProactiveSpeech(scheduler, { enabled: _enabled, nowMs: Date.now(), lastSpeechMs: lastSpeechTime })) return;

  const hour = new Date().getHours();
  const hourChanged = computeHourChanged(lastHour, hour);
  lastHour = hour;

  const context = buildProactiveContext({
    scheduler,
    queue,
    getPlan,
    timeOfDay: getTimeOfDayMood(),
    nowMs: Date.now(),
    lastSpeechMs: lastSpeechTime,
    hourChanged,
  });
  const weatherText = weather ? await weather.current() : '';
  const chatMsg = consumeLastUserChat();

  const decision = await decide({
    ...context,
    lastChatMessage: chatMsg,
    weather: weatherText,
    weatherChanged: context.hourChanged,
  });

  if (!isValidSpeechDecision(decision)) return;

  lastSpeechTime = Date.now();
  scheduler.songsSinceLastSpeech = 0;

  const messageId = String(Date.now());
  events.djMessage(decision.message);
  await streamMessageTokens(decision.message, events, messageId, tokenDelayMs);
  maybeSynthesizeSpeech(decision.message, speech, events, scheduler);
}

function consumeLastUserChat() {
  const chatMsg = _lastUserChat;
  _lastUserChat = null;
  return chatMsg;
}

async function streamMessageTokens(message, events, messageId, tokenDelayMs) {
  const chars = [...message];
  for (let i = 0; i < chars.length; i += 3) {
    const token = chars.slice(i, i + 3).join('');
    events.djStreamChunk(messageId, token);
    const delay = tokenDelayMs ?? (30 + Math.random() * 30);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
  }
  events.djStreamEnd(messageId, message);
}

function maybeSynthesizeSpeech(message, speech, events, scheduler) {
  const speechAvailable = speech && speech.health().available !== false;
  if (!shouldSynthesizeSpeech({
    speechAvailable,
    randomValue: Math.random(),
    isAdvancing: scheduler?.isAdvancing || false,
  })) return;
  speech.synthesize(message).then(audioUrl => {
    if (!audioUrl) return;
    // Re-check: song transition may have started during TTS generation
    if (scheduler && scheduler.isAdvancing) {
      console.log('[Proactive] Skipping speech — song transition in progress');
      return;
    }
    events.djSpeechStart({ audioUrl, text: message, type: 'proactive' });
  }).catch(e => console.warn('[Proactive] Speech synthesis failed (degraded):', e.message));
}
