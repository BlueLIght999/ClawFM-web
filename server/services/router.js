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
import { moodToQuery } from '../domain/routing/moodToQuery.js';
import { pickStartSong } from '../domain/routing/pickStartSong.js';
import { createGenreSearchEngine } from '../domain/routing/GenreSearchEngine.js';

/**
 * Route a user message to the appropriate handler.
 *
 * @param {string} text — raw user input
 * @returns {{ route: 'ncm'|'claude'|'hybrid', action: string, params: object, results?: object }}
 */
export async function routeIntent(text, dependencies = {}) {
  return routeIntentWithDependencies(text, {
    music: null,
    ...dependencies,
  });
}

// eslint-disable-next-line complexity
export async function routeIntentWithDependencies(text, {
  music = null,
  mergedChat = null,
} = {}) {
  const msg = text.toLowerCase().trim();

  // Fast path: simple commands that don't need AI
  const fast = matchFastRoute(msg);
  if (fast) {
    // Mood-based fast routes: if hybrid+play_mood with mood param, search directly
    if (fast.route === 'hybrid' && fast.action === 'play_mood' && fast.params?.mood) {
      if (!music) return CHAT_FALLBACK;
      try {
        const query = moodToQuery(fast.params.mood);
        return {
          route: 'hybrid',
          action: 'play_mood',
          params: fast.params,
          results: filterLiveVersions(await searchSongsViaMusic(music, query, 5)).slice(0, 5),
        };
      } catch (e) {
        console.warn('[Router] Mood search failed (degraded to chat):', e.message);
        return CHAT_FALLBACK;
      }
    }
    return fast;
  }

  // Search direct: "play <query>", "放<query>", "来点<query>", "我想听<query>"
  // P0-2: \s* allows Chinese no-space input like "来点爵士" "播周杰伦"
  // Note: "帮我找" / "找一首" are conversational and stay on AI path for better intent extraction
  const searchMatch = msg.match(/^(?:play|放|播放|搜索|搜|点播|来点|来一首|点一首|我想听|播|来些|来几首|放一首)\s*(.+)/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    // If query is a genre/instrument/style, route to personalized recommendation
    if (isGenreQuery(query)) {
      // Use GenreSearchEngine for multi-source genre search when music port is available
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
    if (music) {
      try {
        const songs = filterLiveVersions(await searchSongsViaMusic(music, query, 5));
        return {
          route: 'ncm',
          action: 'play_search',
          params: { query },
          results: songs.slice(0, 3),
        };
      } catch (e) {
        // Fall through to claude (degraded search)
        console.warn('[Router] Search failed, falling through to LLM:', e.message);
      }
    }
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
