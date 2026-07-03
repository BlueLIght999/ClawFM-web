/**
 * ROUTER.JS — Intent routing
 * Blueprint Layer 2: 简单指令直连 · 音乐走 ncm · 自然语言走 claude
 *
 * Decides whether a user request should go directly to NetEase API
 * or be routed through Claude/DJ for natural language processing.
 */

import { searchSongs } from './netease.js';
import { extractIntent } from './claude.js';
import { isGenreQuery } from '../domain/routing/isGenreQuery.js';
import { matchFastRoute } from '../domain/routing/matchFastRoute.js';
import { moodToQuery } from '../domain/routing/moodToQuery.js';
import { pickStartSong } from '../domain/routing/pickStartSong.js';

// Keywords that indicate a live/concert version (case-insensitive)
const LIVE_PATTERNS = [
  /live/i, /现场/, /演唱会/, /音乐会/, /音乐节/, /巡演/, /公演/,
  /\(\s*live\s*\)/i, /\[\s*live\s*\]/i, /acoustic/i, /unplugged/i,
  /remix/i, /混音/, /伴奏/, /instrumental/i, /demo/i,
];

function isLiveVersion(song) {
  const title = (song.name || song.title || '').toLowerCase();
  // Check title (keep the lowercase version)
  const titleOrig = song.name || song.title || '';
  for (const pattern of LIVE_PATTERNS) {
    if (pattern.test(titleOrig)) return true;
  }
  // Also check for (live) suffixes in any case
  if (/[\(\[]\s*live(\s+version)?\s*[\)\]]/i.test(titleOrig)) return true;
  return false;
}

function filterLive(songs) {
  return songs.filter(s => !isLiveVersion(s));
}

/**
 * Route a user message to the appropriate handler.
 *
 * @param {string} text — raw user input
 * @returns {{ route: 'ncm'|'claude'|'hybrid', action: string, params: object, results?: object }}
 */
export async function routeIntent(text) {
  const msg = text.toLowerCase().trim();

  // Fast path: simple commands that don't need AI
  const fast = matchFastRoute(msg);
  if (fast) return fast;

  // Search direct: "play <query>", "放 <query>", "来点 <query>", "我想听 <query>"
  const searchMatch = msg.match(/^(?:play|放|搜索|搜|点播|来点|来一首|点一首|我想听|播)\s+(.+)/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    // If query is a genre/instrument/style, route to personalized recommendation
    if (isGenreQuery(query)) {
      return { route: 'ncm', action: 'play_personalized', params: { preference: query } };
    }
    try {
      const res = await searchSongs(query, 5);
      const songs = filterLive(res?.result?.songs || []);
      return {
        route: 'ncm',
        action: 'play_search',
        params: { query },
        results: songs.slice(0, 3),
      };
    } catch (e) {
      // Fall through to claude
    }
  }

  // Default: use AI for intent extraction, then dispatch to a handler.
  const intent = await extractIntent(text);
  const handler = AI_ACTION_HANDLERS[intent?.action];
  return handler ? handler(intent, text) : handleChat(intent);
}

const CHAT_FALLBACK = { route: 'claude', action: 'chat', params: {} };

function handleChat(intent) {
  return { route: 'claude', action: 'chat', params: intent?.params || {} };
}

async function handlePlayMood(intent) {
  const query = moodToQuery(intent.params?.mood);
  try {
    const res = await searchSongs(query, 5);
    return {
      route: 'hybrid',
      action: 'play_mood',
      params: intent.params,
      results: filterLive(res?.result?.songs || []).slice(0, 5),
    };
  } catch {
    return CHAT_FALLBACK;
  }
}

async function handlePlayArtist(intent) {
  try {
    const artistName = intent.params?.artist || '';
    const startSong = intent.params?.song || '';
    const artistRes = await searchSongs(artistName, 15);
    let songs = filterLive(artistRes?.result?.songs || []).slice(0, 10);
    if (startSong && songs.length > 0) {
      songs = await orderByStartSong(songs, artistName, startSong);
    }
    return { route: 'hybrid', action: 'play_artist', params: intent.params, results: songs };
  } catch {
    return CHAT_FALLBACK;
  }
}

/** Put the requested start song first; fall back to a combined search if not in list. */
async function orderByStartSong(songs, artistName, startSong) {
  const needle = startSong.toLowerCase();
  const inList = songs.some(s => (s.name || s.title || '').toLowerCase().includes(needle));
  if (inList) return pickStartSong(songs, startSong);

  const specificRes = await searchSongs(`${artistName} ${startSong}`, 5);
  const specificSongs = filterLive(specificRes?.result?.songs || []);
  const bestMatch = specificSongs.find(s =>
    (s.name || s.title || '').toLowerCase().includes(needle)
  ) || specificSongs[0];
  if (!bestMatch) return songs;
  return [bestMatch, ...songs.filter(s => s.id !== bestMatch.id)];
}

async function handlePlaySong(intent) {
  try {
    const res = await searchSongs(intent.params?.song || '', 5);
    return {
      route: 'hybrid',
      action: 'play_song',
      params: intent.params,
      results: filterLive(res?.result?.songs || []).slice(0, 3),
    };
  } catch {
    return CHAT_FALLBACK;
  }
}

function handleNcmWithRaw(action, intent, text) {
  return { route: 'ncm', action, params: { ...intent.params, _raw: text } };
}

const AI_ACTION_HANDLERS = {
  play_mood: handlePlayMood,
  play_artist: handlePlayArtist,
  play_song: handlePlaySong,
  play_personalized: (intent, text) => handleNcmWithRaw('play_personalized', intent, text),
  reject_recommend: (intent, text) => handleNcmWithRaw('reject_recommend', intent, text),
  chat: handleChat,
  none: handleChat,
};

export function isFastRoute(text) {
  const fast = /^(skip|next|切歌|下一首|pause|stop|暂停|play|resume|播放|继续|what'?s playing|now playing)/i;
  return fast.test(text.trim());
}
