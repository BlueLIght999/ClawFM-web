/**
 * DJ prompt builders — pure domain functions for constructing LLM message arrays.
 *
 * Extracted from claude.js to separate prompt construction (domain)
 * from LLM invocation (infrastructure).
 */

import { artistName } from './artistName.js';
import { buildTransitionPrompt } from './buildTransitionPrompt.js';

const INTENT_SYSTEM_PROMPT = `Parse music intent. Output JSON: {"action":"play_mood"|"play_artist"|"play_song"|"play_personalized"|"reject_recommend"|"chat"|"none","params":{"mood":"","artist":"","song":"","preference":""}}

Rules:
- "play_artist": user wants songs by a specific artist. If they say "从X开始" / "以X打头" / "先放X", put that song name in "song".
- "play_song": user wants a specific song (and similar ones).
- "play_mood": user wants a vibe/mood/atmosphere.
- "play_personalized": user wants DJ to recommend based on their taste profile. Triggers: "根据你对我的了解", "推荐一些歌", "有什么好听的", "来点我喜欢的", "根据我的口味", "最近有什么适合我的". Also use this when user requests a specific genre/instrument/style (e.g. "来点吉他曲", "放点摇滚", "来些钢琴曲") — put the genre/instrument in "preference" field. If no specific preference, leave "preference" empty.
- "reject_recommend": user dislikes the recently recommended songs. Triggers: "不行", "不好听", "这些歌不行", "换一批", "不喜欢", "不对胃口", "有没有别的", "再换一些", "这些不喜欢", "不好", "不怎么样". This takes priority over other actions.
- "chat": casual conversation, not a music request.`;

const CHAT_MODE_PROMPT = 'You are in chat/conversation mode. Respond in plain conversational text, NOT JSON. Keep it very brief — 2-3 short sentences max. Like a real FM DJ on air.';

const COLD_OPEN_STREAM_SYSTEM = 'You are going live. Speak naturally in first person. No JSON — just your spoken words. Keep it 15-30 seconds spoken. Do NOT include stage directions or emotion tags.';

/**
 * Build messages for generateDjResponse.
 * @param {string} persona - DJ persona text
 * @param {string|null} assembledPrompt - pre-assembled context
 * @param {Array<{role:string,content:string}>} history - chat history
 * @param {string|null} userInput - user message
 * @param {object|null} prevSong
 * @param {object|null} nextSong
 * @param {string|null} timeOfDay
 * @returns {Array<{role:string,content:string}>}
 */
export function buildDjResponseMessages(persona, assembledPrompt, history, userInput, prevSong, nextSong, timeOfDay) {
  const messages = [{ role: 'system', content: persona }];
  if (assembledPrompt) messages.push({ role: 'system', content: assembledPrompt });
  for (const h of history) messages.push({ role: h.role, content: h.content });
  if (userInput) {
    messages.push({ role: 'user', content: userInput });
  } else if (prevSong && nextSong) {
    messages.push({ role: 'user', content: buildTransitionPrompt(prevSong, nextSong, timeOfDay) });
  }
  return messages;
}

/**
 * Build messages for extractIntent.
 * @param {string} userMessage
 * @param {Array<{name:string,count:number}>} topArtists
 * @returns {Array<{role:string,content:string}>}
 */
export function buildIntentMessages(userMessage, topArtists) {
  const artistNames = (topArtists || []).slice(0, 5).map(a => a.name).join(', ');
  return [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'system', content: `Listener profile: top artists include ${artistNames || 'unknown'}. Use this to decide if a request like "推荐" should be "play_personalized" (they want taste-based recs) vs "chat" (they're just chatting).` },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build messages for analyzeHabits.
 * @param {string} persona - DJ persona text
 * @param {Array<{name:string,count:number}>} topArtists
 * @param {object} analysis - profile analysis
 * @returns {Array<{role:string,content:string}>}
 */
export function buildHabitsMessages(persona, topArtists, analysis) {
  const artistStr = (topArtists || []).slice(0, 10).map(a => `${a.name} (${a.count})`).join(', ');
  const prompt = `Listener profile:
Top Artists: ${artistStr || 'not enough data'}
Total Songs: ${analysis?.totalSongs || 'unknown'}
Genres: ${(analysis?.topGenres || []).map(g => g.name).join(', ') || 'unknown'}

Write 2-3 sentences of warm, personal observation about their taste. DJ style, plain text.`;
  return [
    { role: 'system', content: persona },
    { role: 'user', content: prompt },
  ];
}

/**
 * Build messages for chatWithDj (streaming chat).
 * @param {string} persona - DJ persona text
 * @param {string} userMessage
 * @param {string|null} contextFragments
 * @param {Array<{role:string,content:string}>} history
 * @param {Array<{name:string}>} topArtists
 * @returns {Array<{role:string,content:string}>}
 */
export function buildChatMessages(persona, userMessage, contextFragments, history, topArtists) {
  const messages = [{ role: 'system', content: persona }];
  messages.push({ role: 'system', content: CHAT_MODE_PROMPT });
  if (contextFragments) messages.push({ role: 'system', content: contextFragments });
  const artistNames = (topArtists || []).slice(0, 5).map(a => a.name).join(', ');
  if (artistNames) {
    messages.push({ role: 'system', content: `[Listener profile: top artists include ${artistNames}]` });
  }
  for (const h of history) messages.push({ role: h.role, content: h.content });
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

/**
 * Build messages for generateColdOpen (non-streaming).
 * @param {string} persona
 * @param {object} nextSong
 * @param {string|null} weather
 * @param {string|null} timeOfDay
 * @returns {Array<{role:string,content:string}>}
 */
export function buildColdOpenMessages(persona, nextSong, weather, timeOfDay) {
  const nextTitle = nextSong?.name || nextSong?.title || 'our first track';
  const nextArtist = artistName(nextSong);
  return [
    { role: 'system', content: persona },
    {
      role: 'user',
      content: [
        'You are going live on Qclaudio 88.7 for the first time right now.',
        weather ? `Current weather: ${weather}.` : '',
        `Time of day: ${timeOfDay || 'this moment'}.`,
        `The first song you'll play is: "${nextTitle}" by ${nextArtist}.`,
        '',
        'Warmly introduce yourself, the station, comment on the time/weather/mood,',
        'then naturally introduce this first song. Keep it 15-30 seconds spoken.',
        'Output JSON with exactly: {"say": "your spoken script here"}',
      ].join('\n'),
    },
  ];
}

/**
 * Build messages for streaming cold open.
 * @param {string} persona
 * @param {string} nextTitle
 * @param {string} nextArtist
 * @param {string|null} weather
 * @param {string|null} timeOfDay
 * @returns {Array<{role:string,content:string}>}
 */
export function buildColdOpenStreamMessages(persona, nextTitle, nextArtist, weather, timeOfDay) {
  return [
    { role: 'system', content: persona },
    { role: 'system', content: COLD_OPEN_STREAM_SYSTEM },
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
}

/**
 * Build messages for generateRefillSpeech.
 * @param {string} persona
 * @param {Array<object>} upcomingSongs
 * @param {string|null} weather
 * @param {string|null} timeOfDay
 * @returns {Array<{role:string,content:string}>}
 */
export function buildRefillSpeechMessages(persona, upcomingSongs, weather, timeOfDay) {
  const songList = (upcomingSongs || []).slice(0, 3).map(s => {
    const name = s.name || s.title || 'a track';
    const artist = artistName(s);
    return `"${name}" by ${artist}`;
  }).join('; ');

  return [
    { role: 'system', content: persona },
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
}

/**
 * Resolve song title from song object.
 * @param {object} song
 * @returns {string}
 */
export function resolveSongTitle(song) {
  return song?.name || song?.title || 'our first track';
}

/**
 * Generate fallback cold open text.
 * @param {object} nextSong
 * @returns {string}
 */
export function coldOpenFallback(nextSong) {
  const title = nextSong?.name || nextSong?.title || 'this track';
  return `Welcome to Qclaudio 88.7. Let's start with ${title}.`;
}

/**
 * Generate fallback cold open text with artist.
 * @param {string} nextTitle
 * @param {string} nextArtist
 * @returns {string}
 */
export function coldOpenStreamFallback(nextTitle, nextArtist) {
  return `Welcome to Qclaudio 88.7. Let's start with ${nextTitle} by ${nextArtist}.`;
}

/**
 * Generate fallback refill speech text.
 * @returns {string}
 */
export function refillSpeechFallback() {
  return "Fresh tracks are lined up and ready to go. Let's keep the music flowing.";
}
