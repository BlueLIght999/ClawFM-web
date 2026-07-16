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

const CHAT_MODE_PROMPT = '你正在聊天/对话模式。用中文以纯对话文本回复，不要输出 JSON。保持简短 — 最多 2-3 个短句，像一个真实的电台 DJ 在播音。';

const COLD_OPEN_STREAM_SYSTEM = '你现在要开播了。用中文以第一人称自然地说话。不要输出 JSON — 只输出你说的内容。保持 15-30 秒的口语长度。不要包含舞台指示或情感标签。';

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
  const prompt = `听众画像：
最常听的歌手：${artistStr || '数据不足'}
总听歌数：${analysis?.totalSongs || '未知'}
音乐风格：${(analysis?.topGenres || []).map(g => g.name).join(', ') || '未知'}

用中文写 2-3 句温暖、有个性的观察，聊聊听众的音乐品味。DJ 口吻，纯文本。`;
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
    messages.push({ role: 'system', content: `[听众画像：最常听的歌手包括 ${artistNames}]` });
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
  const nextTitle = nextSong?.name || nextSong?.title || '第一首歌';
  const nextArtist = artistName(nextSong);
  return [
    { role: 'system', content: persona },
    {
      role: 'user',
      content: [
        'Qclaudio 88.7 电台现在首次开播，你即将上线。',
        weather ? `当前天气：${weather}。` : '',
        `时段：${timeOfDay || '此刻'}。`,
        `你即将播放的第一首歌是：${nextArtist} 的《${nextTitle}》。`,
        '',
        '用中文热情地介绍自己、介绍电台，聊聊时间/天气/心情，',
        '然后自然地引出这第一首歌。保持 15-30 秒的口语长度。',
        '输出 JSON，格式为：{"say": "你的中文口播文稿"}',
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
        weather ? `当前天气：${weather}。` : '',
        `时段：${timeOfDay || '此刻'}。`,
        `第一首歌：${nextArtist} 的《${nextTitle}》。`,
        '用中文介绍自己、介绍电台，聊聊氛围，然后自然地引出这首歌。',
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
    const name = s.name || s.title || '一首歌';
    const artist = artistName(s);
    return `${artist} 的《${name}》`;
  }).join('、');

  return [
    { role: 'system', content: persona },
    {
      role: 'user',
      content: [
        '歌曲队列刚刚耗尽，已自动补充了新的推荐歌曲。',
        `即将播放：${songList}。`,
        weather ? `天气：${weather}。` : '',
        `时段：${timeOfDay || '此刻'}。`,
        '',
        '用中文简短自然地介绍一下这次补充 — 提到 1-2 首即将播放的歌曲。',
        '不要像机器人。保持 10-15 秒的口语长度。',
        '输出 JSON，格式为：{"say": "你的中文口播文稿"}',
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
  return song?.name || song?.title || '第一首歌';
}

/**
 * Generate fallback cold open text.
 * @param {object} nextSong
 * @returns {string}
 */
export function coldOpenFallback(nextSong) {
  const title = nextSong?.name || nextSong?.title || '这首歌';
  return `欢迎收听 Qclaudio 88.7。让我们从《${title}》开始吧。`;
}

/**
 * Generate fallback cold open text with artist.
 * @param {string} nextTitle
 * @param {string} nextArtist
 * @returns {string}
 */
export function coldOpenStreamFallback(nextTitle, nextArtist) {
  return `欢迎收听 Qclaudio 88.7。让我们从${nextArtist}的《${nextTitle}》开始吧。`;
}

/**
 * Generate fallback refill speech text.
 * @returns {string}
 */
export function refillSpeechFallback() {
  return '新的歌曲已经排好了，让我们继续享受音乐吧。';
}
