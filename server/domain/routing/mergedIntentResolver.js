/**
 * Domain helpers for resolving merged-route intents.
 *
 * When the LLM returns an intent via the merged call, it only contains
 * {action, params}. This module:
 * 1. Infers the `route` field so existing conversation handlers work.
 * 2. Executes music search for play_mood/play_artist/play_song actions.
 */
import { moodToQuery } from './moodToQuery.js';

const ACTION_TO_ROUTE = {
  play_mood: 'hybrid',
  play_artist: 'hybrid',
  play_song: 'hybrid',
  play_personalized: 'ncm',
  reject_recommend: 'ncm',
  recommend_rollback: 'ncm',
  recommend_retry: 'ncm',
  recommend: 'ncm',
  skip: 'ncm',
  pause: 'ncm',
  resume: 'ncm',
  replay: 'ncm',
  now_playing: 'ncm',
  plan_refresh: 'ncm',
  plan_select: 'ncm',
  plan_pin: 'ncm',
  plan_clear: 'ncm',
  chat: 'merged',
};

/**
 * Infer the route field from an action.
 * @param {string} action - LLM-returned action
 * @returns {string} route ('hybrid'|'ncm'|'merged')
 */
export function inferRouteFromAction(action) {
  return ACTION_TO_ROUTE[action] || 'merged';
}

const MUSIC_SEARCH_ACTIONS = new Set(['play_mood', 'play_artist', 'play_song']);

const LIVE_PATTERNS = [
  /live/i, /现场/, /演唱会/, /音乐会/, /音乐节/, /巡演/, /公演/,
  /\(\s*live\s*\)/i, /\[\s*live\s*\]/i, /acoustic/i, /unplugged/i,
  /remix/i, /混音/, /伴奏/, /instrumental/i, /demo/i,
];

function isLiveVersion(song) {
  const title = song.name || song.title || '';
  for (const p of LIVE_PATTERNS) {
    if (p.test(title)) return true;
  }
  if (/[([]\s*live(\s+version)?\s*[)\]]/i.test(title)) return true;
  return false;
}

function filterLive(songs) {
  return songs.filter(s => !isLiveVersion(s));
}

/**
 * Search for music based on a merged intent.
 *
 * @param {{action: string, params: object}} intent - LLM-returned intent
 * @param {{search: function}} music - Music source adapter (injected)
 * @returns {Promise<Array>} Search results (live versions filtered)
 */
export async function searchMusicByIntent(intent, music) {
  const { action, params } = intent;
  if (!MUSIC_SEARCH_ACTIONS.has(action)) return [];

  let query, limit, maxResults;
  if (action === 'play_mood') {
    query = moodToQuery(params?.mood);
    limit = 5;
    maxResults = 5;
  } else if (action === 'play_artist') {
    query = params?.artist || '';
    limit = 15;
    maxResults = 10;
  } else {
    query = params?.song || '';
    limit = 5;
    maxResults = 3;
  }

  try {
    const songs = filterLive(await music.search(query, limit));
    return songs.slice(0, maxResults);
  } catch {
    return [];
  }
}
