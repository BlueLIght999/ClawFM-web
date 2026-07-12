import config from '../config.js';
import { loadDjPersona } from '../infrastructure/llm/djPersonaLoader.js';
import { deepSeekLlmAdapter } from '../infrastructure/llm/DeepSeekLlmAdapter.js';
import { llmClient as client } from '../infrastructure/llm/llmClient.js';
import { legacyChatHistoryRepository } from '../infrastructure/persistence/repositories/LegacyChatHistoryRepository.js';
import { legacyListenerProfileRepository } from '../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';
import { artistName } from '../domain/hosting/artistName.js';
import { fallbackTransitionScript } from '../domain/hosting/fallbackTransitionScript.js';
import { buildProactivePrompt } from '../domain/hosting/buildProactivePrompt.js';
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

const DJ_PERSONA = loadDjPersona();

async function callLLM(messages, { jsonMode = false, maxTokens = 250, temperature = 0.75 } = {}) {
  return deepSeekLlmAdapter.complete(messages, { jsonMode, maxTokens, temperature });
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
  const history = legacyChatHistoryRepository.recent(6);
  const messages = buildDjResponseMessages(DJ_PERSONA, assembledPrompt, history, userInput, prevSong, nextSong, timeOfDay);

  const result = await callLLM(messages, { jsonMode, maxTokens: 200 });
  if (!result) return fallbackTransitionScript(prevSong, nextSong);

  try {
    return JSON.parse(result);
  } catch {
    return { say: result, play: [], reason: 'parsed as text', segue: '' };
  }
}

/**
 * Chat with DJ — streaming
 */
export async function chatWithDj(userMessage, contextFragments) {
  if (!client) return null;

  const history = legacyChatHistoryRepository.recent(10);
  const profile = legacyListenerProfileRepository.get();
  const messages = buildChatMessages(DJ_PERSONA, userMessage, contextFragments, history, profile.topArtists);

  legacyChatHistoryRepository.append('user', userMessage);

  try {
    return await client.chat.completions.create({
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
  if (!deepSeekLlmAdapter.isConfigured()) return { action: 'none', params: {} };

  const profile = legacyListenerProfileRepository.get();
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
  if (!deepSeekLlmAdapter.isConfigured()) return null;

  const profile = legacyListenerProfileRepository.get();
  const messages = buildHabitsMessages(DJ_PERSONA, profile.topArtists, profile.analysis);

  return callLLM(messages, { maxTokens: 120, jsonMode: false });
}

export async function generateColdOpen(nextSong, weather, timeOfDay) {
  const messages = buildColdOpenMessages(DJ_PERSONA, nextSong, weather, timeOfDay);

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 200 });
  if (!result) {
    return { say: coldOpenFallback(nextSong) };
  }
  try { return JSON.parse(result); } catch { return { say: result }; }
}

/** Streaming cold open — emits tokens via onChunk, returns full text */
export async function streamColdOpen(nextSong, weather, timeOfDay, onChunk) {
  if (!deepSeekLlmAdapter.isConfigured()) {
    const fallback = coldOpenFallback(nextSong);
    onChunk?.(fallback);
    return fallback;
  }

  const nextTitle = resolveSongTitle(nextSong);
  const nextArtist = artistName(nextSong);

  try {
    let fullText = '';
    const messages = buildColdOpenStreamMessages(DJ_PERSONA, nextTitle, nextArtist, weather, timeOfDay);
    await deepSeekLlmAdapter.stream(messages, { maxTokens: 200, temperature: 0.85 }, (token) => {
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
  const messages = buildRefillSpeechMessages(DJ_PERSONA, upcomingSongs, weather, timeOfDay);

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 150 });
  if (!result) {
    return { say: refillSpeechFallback() };
  }
  try { return JSON.parse(result); } catch { return { say: result }; }
}

// Keep backward compat
export const generateTransition = async (prev, next, timeOfDay, assembledPrompt) => {
  return generateDjResponse({ prevSong: prev, nextSong: next, timeOfDay, assembledPrompt });
};

/** Quick LLM call to decide if DJ should speak proactively. Returns { shouldSpeak, message, reason } or null. */
export async function decideProactiveSpeech(ctx) {
  if (!deepSeekLlmAdapter.isConfigured()) return null;

  const prompt = buildProactivePrompt(ctx);

  try {
    const raw = (await deepSeekLlmAdapter.complete([
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

export function isConfigured() { return deepSeekLlmAdapter.isConfigured(); }
