/**
 * ROUTER.JS — Intent routing
 * Blueprint Layer 2: 简单指令直连 · 音乐走 ncm · 自然语言走 claude
 *
 * Decides whether a user request should go directly to NetEase API
 * or be routed through Claude/DJ for natural language processing.
 */

import { extractIntent } from './claude.js';
import { isGenreQuery } from '../domain/routing/isGenreQuery.js';
import { filterLiveVersions } from '../domain/routing/liveVersionFilter.js';
import { matchFastRoute } from '../domain/routing/matchFastRoute.js';
import { matchSearchRoute } from '../domain/routing/matchSearchRoute.js';
import { moodToQuery } from '../domain/routing/moodToQuery.js';
import { pickStartSong } from '../domain/routing/pickStartSong.js';
import { createGenreSearchEngine } from '../domain/routing/GenreSearchEngine.js';

/**
 * Route a user message to the appropriate handler.
 *
 * @param {string} text - raw user input
 * @returns {Promise<{ route: 'ncm'|'claude'|'hybrid', action: string, params: object, results?: object }>}
 */
export async function routeIntent(text, dependencies = {}) {
  return routeIntentWithDependencies(text, {
    music: null,
    ...dependencies,
  });
}

export async function routeIntentWithDependencies(text, {
  music = null,
  mergedChat = null,
} = {}) {
  const msg = text.toLowerCase().trim();

  // Fast path: simple commands that don't need AI
  const fast = matchFastRoute(msg);
  if (fast) {
    // Mood-based fast routes: hybrid+play_mood carries a mood param, which is the
    // same shape handlePlayMood already accepts on the AI path. Calling it here
    // instead of repeating the search-and-fallback body keeps one implementation.
    if (fast.route === 'hybrid' && fast.action === 'play_mood' && fast.params?.mood) {
      return handlePlayMood(fast, text, { music });
    }
    return fast;
  }

  // Search direct: "play <query>", "放<query>", "来点<query>", "我想听<query>"
  // P0-2: \s* allows Chinese no-space input like "来点爵士" "播周杰伦"
  // Note: "帮我找" / "找一首" are conversational and stay on AI path for better intent extraction
  const searchMatch = matchSearchRoute(msg);
  if (searchMatch) {
    const resolved = await resolveSearchRoute(searchMatch.query, music);
    if (resolved) return resolved;
  }

  // Merged path: if mergedChat adapter is available, return merged route
  // instead of calling extractIntent separately.
  if (mergedChat) {
    return { route: 'merged', action: 'pending', params: {}, mergedChat, text };
  }

  // Default: use AI for intent extraction, then dispatch to a handler.
  const intent = await extractIntent(text);
  const handler = AI_ACTION_HANDLERS[intent?.action];
  return handler ? handler(intent, text, { music }) : handleChat(intent);
}

/**
 * Resolve a matched search query into a route, or null to fall through to AI.
 *
 * Genre/instrument/style queries go through GenreSearchEngine for multi-source
 * results and degrade to a preference-carrying personalized route; anything else
 * is a plain search. A failed search also returns null so the caller can try the
 * LLM path -- that degradation is deliberate and documented at each catch.
 *
 * @param {string} query
 * @param {any} music music port, or null when unavailable
 * @returns {Promise<object|null>}
 */
async function resolveSearchRoute(query, music) {
  if (isGenreQuery(query)) {
    if (music) {
      try {
        const genreEngine = createGenreSearchEngine(music);
        const songs = await genreEngine.search(query, { limit: 15 });
        if (songs && songs.length > 0) {
          return {
            route: 'ncm',
            action: 'play_personalized',
            params: { preference: query },
            results: songs.slice(0, 5),
          };
        }
      } catch (e) {
        console.warn('[Router] GenreSearchEngine failed, falling back to plain search:', e.message);
      }
    }
    return { route: 'ncm', action: 'play_personalized', params: { preference: query } };
  }
  if (!music) return null;
  try {
    const songs = filterLiveVersions(await searchSongsViaMusic(music, query, 5));
    return {
      route: 'ncm',
      action: 'play_search',
      params: { query },
      results: songs.slice(0, 3),
    };
  } catch (e) {
    // Degraded search: fall through to claude by reporting no route.
    console.warn('[Router] Search failed, falling through to LLM:', e.message);
    return null;
  }
}

const CHAT_FALLBACK = { route: 'claude', action: 'chat', params: {} };

function handleChat(intent) {
  return { route: 'claude', action: 'chat', params: intent?.params || {} };
}

async function handlePlayMood(intent, _text, { music = null } = {}) {
  if (!music) return CHAT_FALLBACK;
  const query = moodToQuery(intent.params?.mood);
  try {
    return {
      route: 'hybrid',
      action: 'play_mood',
      params: intent.params,
      results: filterLiveVersions(await searchSongsViaMusic(music, query, 5)).slice(0, 5),
    };
  } catch (e) {
    console.warn('[Router] Mood search failed (degraded to chat):', e.message);
    return CHAT_FALLBACK;
  }
}

async function handlePlayArtist(intent, _text, { music = null } = {}) {
  if (!music) return CHAT_FALLBACK;
  try {
    const artistName = intent.params?.artist || '';
    const startSong = intent.params?.song || '';
    let songs = filterLiveVersions(await searchSongsViaMusic(music, artistName, 15)).slice(0, 10);
    if (startSong && songs.length > 0) {
      songs = await orderByStartSong(songs, artistName, startSong, music);
    }
    return { route: 'hybrid', action: 'play_artist', params: intent.params, results: songs };
  } catch (e) {
    console.warn('[Router] Artist search failed (degraded to chat):', e.message);
    return CHAT_FALLBACK;
  }
}

/** Put the requested start song first; fall back to a combined search if not in list. */
async function orderByStartSong(songs, artistName, startSong, music = null) {
  if (!music) return songs;
  const needle = startSong.toLowerCase();
  const inList = songs.some(s => (s.name || s.title || '').toLowerCase().includes(needle));
  if (inList) return pickStartSong(songs, startSong);

  const specificSongs = filterLiveVersions(await searchSongsViaMusic(music, `${artistName} ${startSong}`, 5));
  const bestMatch = specificSongs.find(s =>
    (s.name || s.title || '').toLowerCase().includes(needle)
  ) || specificSongs[0];
  if (!bestMatch) return songs;
  return [bestMatch, ...songs.filter(s => s.id !== bestMatch.id)];
}

async function handlePlaySong(intent, _text, { music = null } = {}) {
  if (!music) return CHAT_FALLBACK;
  try {
    return {
      route: 'hybrid',
      action: 'play_song',
      params: intent.params,
      results: filterLiveVersions(await searchSongsViaMusic(music, intent.params?.song || '', 5)).slice(0, 3),
    };
  } catch (e) {
    console.warn('[Router] Song search failed (degraded to chat):', e.message);
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

function searchSongsViaMusic(music, query, limit) {
  return music.search(query, limit);
}

export function isFastRoute(text) {
  const fast = /^(skip|next|切歌|下一首|pause|stop|暂停|play|resume|播放|继续|what'?s playing|now playing)/i;
  return fast.test(text.trim());
}
