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
  if (!_enabled) return;
  if (scheduler.coldStartState !== 'done') return;
  if (!scheduler.isPlaying) return;
  if (scheduler.isAdvancing) return;
  if ((scheduler.songsSinceLastSpeech || 0) < 2) return;
  if (Date.now() - lastSpeechTime < 90000) return;

  const currentSong = scheduler.currentSong;
  if (!currentSong) return;

  const hour = new Date().getHours();
  const timeOfDay = getTimeOfDayMood();
  const upstream = queue.upcomingSongs || [];
  const nextSong = upstream[0];
  const secondNext = upstream[1];

  const plan = getPlan();
  const planData = plan?.plan || plan;
  const blocks = planData?.blocks || [];
  const activeBlock = blocks[0] || null;

  const hourChanged = lastHour >= 0 && hour !== lastHour;
  lastHour = hour;

  const weatherText = await weather.current();

  const chatMsg = _lastUserChat;
  _lastUserChat = null; // consume once

  const secondsAgo = Math.floor((Date.now() - lastSpeechTime) / 1000);
  const songsAgo = scheduler.songsSinceLastSpeech || 0;

  const decision = await decide({
    currentSong,
    timeOfDay,
    activeBlock,
    nextSong,
    secondNext,
    secondsSinceLastSpeech: secondsAgo,
    songsSinceLastSpeech: songsAgo,
    lastChatMessage: chatMsg || null,
    weather: weatherText,
    weatherChanged: hourChanged,
    hourChanged,
  });

  if (decision?.shouldSpeak && decision?.message) {
    lastSpeechTime = Date.now();
    scheduler.songsSinceLastSpeech = 0;

    const messageId = String(Date.now());

    // Emit DJ_MESSAGE so text appears in chat
    events.djMessage(decision.message);

    // Stream text tokens for visual effect
    const chars = [...decision.message];
    for (let i = 0; i < chars.length; i += 3) {
      const token = chars.slice(i, i + 3).join('');
      events.djStreamChunk(messageId, token);
      const delay = tokenDelayMs ?? (30 + Math.random() * 30);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }
    events.djStreamEnd(messageId, decision.message);

    // Generate TTS audio for a random subset of proactive messages (~40% chance)
    // Not every message needs spoken delivery — keeps it feeling natural
    if (speech.health().available !== false && Math.random() < 0.4) {
      speech.synthesize(decision.message).then(audioUrl => {
        if (audioUrl) {
          events.djSpeechStart({ audioUrl, text: decision.message, type: 'proactive' });
        }
      }).catch(() => {});
    }
  }
}
