/**
 * PROACTIVE.JS — DJ autonomous speech system
 * Every 60s, evaluates whether the DJ should speak unprompted.
 * Streams text to chat AND generates TTS audio for spoken delivery.
 */

import { decideProactiveSpeech } from './claude.js';
import { getTimeOfDayMood } from './context.js';
import { legacyWeatherAdapter } from '../infrastructure/environment/LegacyWeatherAdapter.js';
import { legacySpeechSynthAdapter } from '../infrastructure/speech/LegacySpeechSynthAdapter.js';

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
  weather = legacyWeatherAdapter,
  speech = legacySpeechSynthAdapter,
  decideProactiveSpeech: decide = decideProactiveSpeech,
  tokenDelayMs = null,
}) {
  if (!canAttemptProactiveSpeech(scheduler)) return;

  const context = buildProactiveContext(scheduler, queue, getPlan);
  const weatherText = await weather.current();
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
  maybeSynthesizeSpeech(decision.message, speech, events);
}

function canAttemptProactiveSpeech(scheduler) {
  if (!_enabled) return false;
  if (scheduler.coldStartState !== 'done') return false;
  if (!scheduler.isPlaying) return false;
  if (scheduler.isAdvancing) return false;
  if ((scheduler.songsSinceLastSpeech || 0) < 2) return false;
  if (Date.now() - lastSpeechTime < 90000) return false;
  if (!scheduler.currentSong) return false;
  return true;
}

function buildProactiveContext(scheduler, queue, getPlan) {
  const currentSong = scheduler.currentSong;
  const upstream = queue.upcomingSongs || [];
  const hour = new Date().getHours();
  const timeOfDay = getTimeOfDayMood();
  const hourChanged = lastHour >= 0 && hour !== lastHour;
  lastHour = hour;

  const plan = getPlan();
  const planData = plan?.plan || plan;
  const blocks = planData?.blocks || [];

  return {
    currentSong,
    timeOfDay,
    activeBlock: blocks[0] || null,
    nextSong: upstream[0],
    secondNext: upstream[1],
    secondsSinceLastSpeech: Math.floor((Date.now() - lastSpeechTime) / 1000),
    songsSinceLastSpeech: scheduler.songsSinceLastSpeech || 0,
    hourChanged,
  };
}

function consumeLastUserChat() {
  const chatMsg = _lastUserChat;
  _lastUserChat = null;
  return chatMsg;
}

function isValidSpeechDecision(decision) {
  return Boolean(decision?.shouldSpeak && decision?.message);
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

function maybeSynthesizeSpeech(message, speech, events) {
  if (speech.health().available === false) return;
  if (Math.random() >= 0.4) return;
  speech.synthesize(message).then(audioUrl => {
    if (audioUrl) {
      events.djSpeechStart({ audioUrl, text: message, type: 'proactive' });
    }
  }).catch(() => {});
}
