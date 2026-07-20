/**
 * CLAUDE.JS — DJ speech generation via DeepSeek LLM.
 * D8-compliant: dependencies injected via configureClaude() from bootstrap.js.
 */
import config from '../config.js';
import { artistName } from '../domain/hosting/artistName.js';
import { fallbackTransitionScript } from '../domain/hosting/fallbackTransitionScript.js';
import { buildProactivePrompt } from '../domain/hosting/buildProactivePrompt.js';
import { extractSayFromText } from '../agent/domain/djJsonGuard.js';
import {
  buildDjResponseMessages,
  buildIntentMessages,
  buildHabitsMessages,
  buildChatMessages,
  buildColdOpenMessages,
  buildColdOpenStreamMessages,
  buildRefillSpeechMessages,
  resolveSongTitle,
  coldOpenFallback,
  coldOpenStreamFallback,
  refillSpeechFallback,
} from '../domain/hosting/djPromptBuilders.js';

// --- Injected dependencies (set by bootstrap.js via configureClaude) ---
let _deps = {
  persona: null,      // DJ persona loaded from djPersonaLoader
  llm: null,          // DeepSeekLlmAdapter (LlmPort)
  llmClient: null,    // Raw OpenAI-compatible client for streaming
  chatHistory: null,  // ChatHistoryRepository
  profile: null,      // ListenerProfileRepository
};

/**
 * Inject dependencies from bootstrap.js (D8 compliance).
 * @param {{persona, llm, llmClient, chatHistory, profile}} deps
 */
export function configureClaude(deps) {
  _deps = { ..._deps, ...deps };
}

function getPersona() {
  return _deps.persona;
}

async function callLLM(messages, { jsonMode = false, maxTokens = 250, temperature = 0.75 } = {}) {
  if (!_deps.llm) return null;
  return _deps.llm.complete(messages, { jsonMode, maxTokens, temperature });
}

/**
 * Main entry: generate structured DJ output
 * Returns { say, play[], reason, segue } per the blueprint
 */
export async function generateDjResponse({
  userInput,
  assembledPrompt,
  prevSong,
  nextSong,
  timeOfDay,
  jsonMode = true,
}) {
  const history = _deps.chatHistory ? _deps.chatHistory.recent(6) : [];
  const messages = buildDjResponseMessages(getPersona(), assembledPrompt, history, userInput, prevSong, nextSong, timeOfDay);

  const result = await callLLM(messages, { jsonMode, maxTokens: 200 });
  if (!result) return fallbackTransitionScript(prevSong, nextSong);

  try {
    return JSON.parse(result);
  } catch {
    // P0: strip JSON markup — LLM may return ```json or partial JSON
    return { say: extractSayFromText(result), play: [], reason: 'parsed as text', segue: '' };
  }
}

/**
 * Chat with DJ — streaming
 */
export async function chatWithDj(userMessage, contextFragments) {
  if (!_deps.llmClient) return null;

  const history = _deps.chatHistory ? _deps.chatHistory.recent(10) : [];
  const profile = _deps.profile ? _deps.profile.get() : { topArtists: [] };
  const messages = buildChatMessages(getPersona(), userMessage, contextFragments, history, profile.topArtists);

  if (_deps.chatHistory) _deps.chatHistory.append('user', userMessage);

  try {
    return await _deps.llmClient.chat.completions.create({
      model: config.deepseekModel,
      messages,
      max_tokens: 250,
      temperature: 0.8,
      stream: true,
    });
  } catch (e) {
    console.error('[Claude] Stream error:', e.message);
    return null;
  }
}

/**
 * Extract structured intent from user message
 */
export async function extractIntent(userMessage) {
  if (!_deps.llm || !_deps.llm.isConfigured()) return { action: 'none', params: {} };

  const profile = _deps.profile ? _deps.profile.get() : { topArtists: [] };
  const messages = buildIntentMessages(userMessage, profile.topArtists);

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 120 });
  if (!result) return { action: 'none', params: {} };

  try { return JSON.parse(result); }
  catch { return { action: 'none', params: {} }; }
}

/**
 * Analyze listening habits — generates insight text
 */
export async function analyzeHabits() {
  if (!_deps.llm || !_deps.llm.isConfigured()) return null;

  const profile = _deps.profile ? _deps.profile.get() : { topArtists: [], analysis: null };
  const messages = buildHabitsMessages(getPersona(), profile.topArtists, profile.analysis);

  return callLLM(messages, { maxTokens: 120, jsonMode: false });
}

export async function generateColdOpen(nextSong, weather, timeOfDay) {
  const messages = buildColdOpenMessages(getPersona(), nextSong, weather, timeOfDay);

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 200 });
  if (!result) {
    return { say: coldOpenFallback(nextSong) };
  }
  try { return JSON.parse(result); } catch { return { say: extractSayFromText(result) }; }
}

/** Streaming cold open — emits tokens via onChunk, returns full text */
export async function streamColdOpen(nextSong, weather, timeOfDay, onChunk) {
  if (!_deps.llm || !_deps.llm.isConfigured()) {
    const fallback = coldOpenFallback(nextSong);
    onChunk?.(fallback);
    return fallback;
  }

  const nextTitle = resolveSongTitle(nextSong);
  const nextArtist = artistName(nextSong);

  try {
    let fullText = '';
    const messages = buildColdOpenStreamMessages(getPersona(), nextTitle, nextArtist, weather, timeOfDay);
    await _deps.llm.stream(messages, { maxTokens: 200, temperature: 0.85 }, (token) => {
      fullText += token;
      onChunk?.(token);
    });
    if (fullText) return fullText;
    const fallback = coldOpenStreamFallback(nextTitle, nextArtist);
    onChunk?.(fallback);
    return fallback;
  } catch (e) {
    console.error('[Claude] Cold open stream error:', e.message);
    const fallback = coldOpenStreamFallback(nextTitle, nextArtist);
    onChunk?.(fallback);
    return fallback;
  }
}

export async function generateRefillSpeech(upcomingSongs, weather, timeOfDay) {
  const messages = buildRefillSpeechMessages(getPersona(), upcomingSongs, weather, timeOfDay);

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 150 });
  if (!result) {
    return { say: refillSpeechFallback() };
  }
  try { return JSON.parse(result); } catch { return { say: extractSayFromText(result) }; }
}

// Keep backward compat
export const generateTransition = async (prev, next, timeOfDay, assembledPrompt) => {
  return generateDjResponse({ prevSong: prev, nextSong: next, timeOfDay, assembledPrompt });
};

/** Quick LLM call to decide if DJ should speak proactively. Returns { shouldSpeak, message, reason } or null. */
export async function decideProactiveSpeech(ctx) {
  if (!_deps.llm || !_deps.llm.isConfigured()) return null;

  const prompt = buildProactivePrompt(ctx);

  try {
    const raw = (await _deps.llm.complete([
      { role: 'system', content: 'You are a radio DJ decision engine. Always output pure JSON, no markdown.' },
      { role: 'user', content: prompt },
    ], { maxTokens: 200, temperature: 0.7 }))?.trim() || '';
    // Strip markdown code fences if present
    const json = raw.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(json); } catch {
      console.error('[Claude] Proactive parse failed:', json);
      return null;
    }
  } catch (e) {
    console.error('[Claude] Proactive decision error:', e.message);
    return null;
  }
}

export function isConfigured() { return _deps.llm ? _deps.llm.isConfigured() : false; }
