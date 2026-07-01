import config from '../config.js';
import { getChatHistory, saveChatMessage, getUserProfile } from '../db/history.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { artistName } from '../domain/hosting/artistName.js';
import { fallbackTransitionScript } from '../domain/hosting/fallbackTransitionScript.js';
import { llmClient as client } from '../infrastructure/llm/llmClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadDjPersona() {
  const path = resolve(ROOT, 'prompts', 'dj-persona.md');
  if (existsSync(path)) return readFileSync(path, 'utf-8');
  return 'You are Dan, the AI DJ of Qclaudio 88.7, a 24/7 radio station.';
}

const DJ_PERSONA = loadDjPersona();

async function callLLM(messages, { jsonMode = false, maxTokens = 250, temperature = 0.75 } = {}) {
  if (!client) return null;
  try {
    const response = await client.chat.completions.create({
      model: config.deepseekModel,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    return response.choices[0]?.message?.content || null;
  } catch (e) {
    console.error('[Claude] API error:', e.message);
    return null;
  }
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
  const messages = [
    { role: 'system', content: DJ_PERSONA },
  ];

  if (assembledPrompt) {
    messages.push({ role: 'system', content: assembledPrompt });
  }

  // Add chat history
  const history = getChatHistory(6);
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  // Add user input or transition context
  if (userInput) {
    messages.push({ role: 'user', content: userInput });
  } else if (prevSong && nextSong) {
    const prevTitle = prevSong?.name || prevSong?.title || 'the last track';
    const prevArtist = getArtistStr(prevSong);
    const nextTitle = nextSong?.name || nextSong?.title || 'this next track';
    const nextArtist = getArtistStr(nextSong);
    const album = nextSong?.al?.name || nextSong?.album || '';
    const timeStr = timeOfDay || 'this moment';

    messages.push({
      role: 'user',
      content: `Previous: "${prevTitle}" by ${prevArtist}\nNext: "${nextTitle}" by ${nextArtist}${album ? ` (${album})` : ''}\nTime: ${timeStr}\n\nGenerate a DJ transition.`,
    });
  }

  const result = await callLLM(messages, { jsonMode, maxTokens: 200 });
  if (!result) return fallbackTransition(prevSong, nextSong);

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

  const history = getChatHistory(10);
  const profile = getUserProfile();
  const topArtists = (profile.topArtists || []).slice(0, 5).map(a => a.name).join(', ');

  const messages = [
    { role: 'system', content: DJ_PERSONA },
  ];

  // Chat mode: override JSON output requirement — respond in plain text
  messages.push({ role: 'system', content: 'You are in chat/conversation mode. Respond in plain conversational text, NOT JSON. Keep it very brief — 2-3 short sentences max. Like a real FM DJ on air.' });

  if (contextFragments) {
    messages.push({ role: 'system', content: contextFragments });
  }

  if (topArtists) {
    messages.push({ role: 'system', content: `[Listener profile: top artists include ${topArtists}]` });
  }

  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: 'user', content: userMessage });

  saveChatMessage('user', userMessage);

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
  if (!client) return { action: 'none', params: {} };

  const profile = getUserProfile();
  const topArtists = (profile.topArtists || []).slice(0, 5).map(a => a.name).join(', ');

  const messages = [
    { role: 'system', content: `Parse music intent. Output JSON: {"action":"play_mood"|"play_artist"|"play_song"|"play_personalized"|"reject_recommend"|"chat"|"none","params":{"mood":"","artist":"","song":"","preference":""}}

Rules:
- "play_artist": user wants songs by a specific artist. If they say "从X开始" / "以X打头" / "先放X", put that song name in "song".
- "play_song": user wants a specific song (and similar ones).
- "play_mood": user wants a vibe/mood/atmosphere.
- "play_personalized": user wants DJ to recommend based on their taste profile. Triggers: "根据你对我的了解", "推荐一些歌", "有什么好听的", "来点我喜欢的", "根据我的口味", "最近有什么适合我的". Also use this when user requests a specific genre/instrument/style (e.g. "来点吉他曲", "放点摇滚", "来些钢琴曲") — put the genre/instrument in "preference" field. If no specific preference, leave "preference" empty.
- "reject_recommend": user dislikes the recently recommended songs. Triggers: "不行", "不好听", "这些歌不行", "换一批", "不喜欢", "不对胃口", "有没有别的", "再换一些", "这些不喜欢", "不好", "不怎么样". This takes priority over other actions.
- "chat": casual conversation, not a music request.` },
    { role: 'system', content: `Listener profile: top artists include ${topArtists || 'unknown'}. Use this to decide if a request like "推荐" should be "play_personalized" (they want taste-based recs) vs "chat" (they're just chatting).` },
    { role: 'user', content: userMessage },
  ];

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 120 });
  if (!result) return { action: 'none', params: {} };

  try { return JSON.parse(result); }
  catch { return { action: 'none', params: {} }; }
}

/**
 * Analyze listening habits — generates insight text
 */
export async function analyzeHabits() {
  if (!client) return null;

  const profile = getUserProfile();
  const topArtists = (profile.topArtists || []).slice(0, 10).map(a => `${a.name} (${a.count})`).join(', ');
  const analysis = profile.analysis || {};

  const prompt = `Listener profile:
Top Artists: ${topArtists || 'not enough data'}
Total Songs: ${analysis.totalSongs || 'unknown'}
Genres: ${(analysis.topGenres || []).map(g => g.name).join(', ') || 'unknown'}

Write 2-3 sentences of warm, personal observation about their taste. DJ style, plain text.`;

  const messages = [
    { role: 'system', content: DJ_PERSONA },
    { role: 'user', content: prompt },
  ];

  return callLLM(messages, { maxTokens: 120, jsonMode: false });
}

function fallbackTransition(prev, next) {
  return fallbackTransitionScript(prev, next);
}

function getArtistStr(song) {
  return artistName(song);
}

export async function generateColdOpen(nextSong, weather, timeOfDay) {
  const nextTitle = nextSong?.name || nextSong?.title || 'our first track';
  const nextArtist = getArtistStr(nextSong);

  const messages = [
    { role: 'system', content: DJ_PERSONA },
    {
      role: 'user',
      content: [
        'You are going live on Qclaudio 88.7 for the first time right now.',
        weather ? `Current weather: ${weather}.` : '',
        `Time of day: ${timeOfDay || 'this moment'}.`,
        `The first song you\'ll play is: "${nextTitle}" by ${nextArtist}.`,
        '',
        'Warmly introduce yourself, the station, comment on the time/weather/mood,',
        'then naturally introduce this first song. Keep it 15-30 seconds spoken.',
        'Output JSON with exactly: {"say": "your spoken script here"}',
      ].join('\n'),
    },
  ];

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 200 });
  if (!result) {
    return { say: `Welcome to Qclaudio 88.7. Let's start with ${nextTitle} by ${nextArtist}.` };
  }
  try { return JSON.parse(result); } catch { return { say: result }; }
}

/** Streaming cold open — emits tokens via onChunk, returns full text */
export async function streamColdOpen(nextSong, weather, timeOfDay, onChunk) {
  if (!client) {
    const fallback = `Welcome to Qclaudio 88.7. Let's start with ${nextSong?.name || nextSong?.title || 'this track'}.`;
    onChunk?.(fallback);
    return fallback;
  }

  const nextTitle = nextSong?.name || nextSong?.title || 'our first track';
  const nextArtist = getArtistStr(nextSong);

  const messages = [
    { role: 'system', content: DJ_PERSONA },
    { role: 'system', content: 'You are going live. Speak naturally in first person. No JSON — just your spoken words. Keep it 15-30 seconds spoken. Do NOT include stage directions or emotion tags.' },
    {
      role: 'user',
      content: [
        weather ? `Current weather: ${weather}.` : '',
        `Time of day: ${timeOfDay || 'this moment'}.`,
        `The first song: "${nextTitle}" by ${nextArtist}.`,
        'Introduce yourself, the station, comment on the vibe, then naturally lead into this song.',
      ].join('\n'),
    },
  ];

  try {
    const stream = await client.chat.completions.create({
      model: config.deepseekModel,
      messages,
      max_tokens: 200,
      temperature: 0.85,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        fullText += token;
        onChunk?.(token);
      }
    }
    return fullText || `Welcome to Qclaudio 88.7. Let's start with ${nextTitle} by ${nextArtist}.`;
  } catch (e) {
    console.error('[Claude] Cold open stream error:', e.message);
    const fallback = `Welcome to Qclaudio 88.7. Let's start with ${nextTitle} by ${nextArtist}.`;
    onChunk?.(fallback);
    return fallback;
  }
}

export async function generateRefillSpeech(upcomingSongs, weather, timeOfDay) {
  const songList = upcomingSongs.slice(0, 3).map(s => {
    const name = s.name || s.title || 'a track';
    const artist = getArtistStr(s);
    return `"${name}" by ${artist}`;
  }).join('; ');

  const messages = [
    { role: 'system', content: DJ_PERSONA },
    {
      role: 'user',
      content: [
        'The song queue just ran out and was automatically refilled with fresh recommendations.',
        `Upcoming highlights: ${songList}.`,
        weather ? `Weather: ${weather}.` : '',
        `Time: ${timeOfDay || 'this moment'}.`,
        '',
        'Briefly acknowledge the refill naturally — mention 1-2 upcoming highlights.',
        'Do NOT sound robotic. Keep it 10-15 seconds spoken.',
        'Output JSON with exactly: {"say": "your spoken script here"}',
      ].join('\n'),
    },
  ];

  const result = await callLLM(messages, { jsonMode: true, maxTokens: 150 });
  if (!result) {
    return { say: 'Fresh tracks are lined up and ready to go. Let\'s keep the music flowing.' };
  }
  try { return JSON.parse(result); } catch { return { say: result }; }
}

// Keep backward compat
export const generateTransition = async (prev, next, timeOfDay, assembledPrompt) => {
  return generateDjResponse({ prevSong: prev, nextSong: next, timeOfDay, assembledPrompt });
};

/** Quick LLM call to decide if DJ should speak proactively. Returns { shouldSpeak, message, reason } or null. */
export async function decideProactiveSpeech(ctx) {
  if (!client) return null;

  const songTitle = ctx.currentSong?.name || ctx.currentSong?.title || '?';
  const songArtist = ctx.currentSong?.ar?.map(a => a.name).join(', ') || ctx.currentSong?.artist || '';
  const blockTheme = ctx.activeBlock?.theme || 'auto';
  const blockHints = (ctx.activeBlock?.genreHints || []).join(', ') || 'varied';
  const nextTitle = ctx.nextSong ? (ctx.nextSong.name || ctx.nextSong.title || '?') : '?';
  const secondTitle = ctx.secondNext ? (ctx.secondNext.name || ctx.secondNext.title || '?') : '?';

  const prompt = `你是 Qclaudio 88.7 的 AI DJ CLAWED（一只螃蟹）。

当前歌曲: "${songTitle}" by ${songArtist}
时间: ${ctx.timeOfDay}, 天气: ${ctx.weatherChanged ? '(刚变化) ' : ''}${ctx.weather || 'unknown'}
当前计划板块: "${blockTheme}" (${blockHints})
下首: ${nextTitle}, 再下一首: ${secondTitle}
距上次发言: ${ctx.secondsSinceLastSpeech}s, ${ctx.songsSinceLastSpeech} 首歌前
${ctx.lastChatMessage ? `最近听众聊天: "${ctx.lastChatMessage}"` : '最近无听众互动'}
${ctx.hourChanged ? '(刚刚进入新的小时段)' : ''}

现在适合主动说话吗？只有以下情况才适合说话：
- 天气刚刚变化了，可以随口提一句
- 刚进入新的小时段，时间节点值得 mark
- 听众刚聊完天，可以接话/问候
- 已经很久没说话了（超过 3 首歌），可以活跃一下气氛
- 板块风格有明显变化

如果没什么特别的可说，就不要说话。宁缺毋滥。

输出 JSON (不要 markdown 代码块):
{"shouldSpeak": true/false, "message": "说的话（1-3句中文，DJ 口吻，纯文本，不要加动作标签）", "reason": "简短原因"}`;

  try {
    const res = await client.chat.completions.create({
      model: config.deepseekModel,
      messages: [
        { role: 'system', content: 'You are a radio DJ decision engine. Always output pure JSON, no markdown.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
      stream: false,
    });

    const raw = res.choices?.[0]?.message?.content?.trim() || '';
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

export function isConfigured() { return !!client; }
