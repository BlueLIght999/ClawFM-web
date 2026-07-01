/**
 * ROUTER.JS — Intent routing
 * Blueprint Layer 2: 简单指令直连 · 音乐走 ncm · 自然语言走 claude
 *
 * Decides whether a user request should go directly to NetEase API
 * or be routed through Claude/DJ for natural language processing.
 */

import { searchSongs } from './netease.js';
import { extractIntent } from './claude.js';

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

  // Genre/instrument/style keywords that should trigger personalized recommendation
  const GENRE_KEYWORDS = [
    '吉他', '钢琴', '爵士', '摇滚', '民谣', '古典', '电子', '轻音乐',
    '说唱', '嘻哈', '古风', '国风', '流行', '金属', '朋克', '雷鬼',
    '布鲁斯', '蓝调', '乡村', '灵魂', '放克', '迪斯科', '拉丁',
    '后摇', '迷幻', '梦幻流行', '低保真', '氛围', '纯音乐',
    'acoustic', 'jazz', 'rock', 'classical', 'electronic', 'blues',
    'piano', 'guitar', 'folk', 'metal', 'punk', 'reggae', 'funk',
    'lo-fi', 'ambient', 'instrumental', 'indie', 'rap', 'hip-hop',
    '小提琴', '大提琴', '萨克斯', '口琴', '古筝', '琵琶', '二胡',
  ];

  function hasGenreKeyword(text) {
    const lower = text.toLowerCase();
    return GENRE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  }

  // Fast path: simple commands that don't need AI
  const fastRoutes = [
    { pattern: /^(skip|next|切歌|下一首)$/, route: 'ncm', action: 'skip', params: {} },
    { pattern: /^(pause|stop|暂停)$/, route: 'ncm', action: 'pause', params: {} },
    { pattern: /^(play|resume|播放|继续)$/, route: 'ncm', action: 'resume', params: {} },
    { pattern: /^(what'?s playing|now playing|现在放什么|当前播放)/, route: 'ncm', action: 'now_playing', params: {} },
    // Rejection — must come before recommend patterns
    { pattern: /^(不行|不好听|这些歌不行|换一批|不喜欢|不对胃口|有没有别的|再换|这些不喜欢|不好|不怎么样|都不喜欢|不太行|一般般)/, route: 'ncm', action: 'reject_recommend', params: {} },
    // Rollback / retry (follow-up to rejection)
    { pattern: /^(回到|恢复|之前|原来|回去|回滚|还原|前面的)/, route: 'ncm', action: 'recommend_rollback', params: {} },
    { pattern: /^(再推荐|再换|再来|换一批|重新|换一下|别的|换点)/, route: 'ncm', action: 'recommend_retry', params: {} },
    // Personalized recommendations
    { pattern: /^(根据你对我的了解|根据我的口味|推荐一些|推荐一下|有什么好听的|来点我喜欢的|最近有什么适合|推荐点)/, route: 'ncm', action: 'play_personalized', params: {} },
    { pattern: /^(推荐|推荐歌曲|来点推荐)$/, route: 'ncm', action: 'play_personalized', params: {} },
    { pattern: /^(换个风格|换风格|来点不一样的|换个口味|换换口味|换歌单|换个心情)$/, route: 'ncm', action: 'plan_refresh', params: {} },
    { pattern: /^(切换|选|换到).*(第[一二三四五]|[0-9]+).*(个主题|个板块|个块|主题|板块)/, route: 'ncm', action: 'plan_select', params: {} },
    { pattern: /^(钉住|锁定|固定|pin).*(这个|当前|风格|板块|主题)/, route: 'ncm', action: 'plan_pin', params: {} },
    { pattern: /^(取消|解除|自动|auto|自动推荐|自动模式|恢复自动)/, route: 'ncm', action: 'plan_clear', params: {} },
  ];

  for (const { pattern, route, action, params } of fastRoutes) {
    if (pattern.test(msg)) {
      return { route, action, params };
    }
  }

  // Search direct: "play <query>", "放 <query>", "来点 <query>", "我想听 <query>"
  const searchMatch = msg.match(/^(?:play|放|搜索|搜|点播|来点|来一首|点一首|我想听|播)\s+(.+)/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    // If query is a genre/instrument/style, route to personalized recommendation
    if (hasGenreKeyword(query)) {
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

  // Default: use AI for intent extraction
  const intent = await extractIntent(text);

  switch (intent?.action) {
    case 'play_mood': {
      // Map mood keywords to better search queries
      const moodMap = {
        happy: '欢快 流行', energetic: '电子 舞曲', upbeat: '流行 摇滚',
        chill: '轻音乐 放松', relaxed: '轻音乐 治愈', calm: '钢琴 纯音乐',
        sad: '伤感 情歌', melancholy: '民谣 抒情', romantic: '浪漫 情歌',
        rock: '摇滚 经典', jazz: '爵士 经典', classical: '古典 钢琴',
        intense: '重金属 摇滚', dark: '后摇 迷幻', dreamy: '梦幻流行 电子',
        focus: '学习 专注 钢琴', party: '派对 舞曲', nostalgic: '怀旧 经典老歌',
      };
      const moodKey = (intent.params?.mood || 'chill').toLowerCase();
      const query = moodMap[moodKey] || intent.params?.mood || '热门';
      try {
        const moodRes = await searchSongs(query, 5);
        return {
          route: 'hybrid',
          action: 'play_mood',
          params: intent.params,
          results: filterLive(moodRes?.result?.songs || []).slice(0, 5),
        };
      } catch {
        return { route: 'claude', action: 'chat', params: {} };
      }
    }

    case 'play_artist':
      try {
        const artistName = intent.params?.artist || '';
        const startSong = intent.params?.song || '';
        console.log('[Router] play_artist:', { artistName, startSong });
        // Search more songs so listener gets variety
        const artistRes = await searchSongs(artistName, 15);
        let songs = filterLive(artistRes?.result?.songs || []).slice(0, 10);
        console.log('[Router] artist search results:', songs.map(s => `${s.name} (${s.id})`));

        // If user specified a starting song, try to put it first
        if (startSong && songs.length > 0) {
          let bestMatch = songs.find(s =>
            (s.name || s.title || '').toLowerCase().includes(startSong.toLowerCase())
          );

          // If not in artist results, try a combined search
          if (!bestMatch) {
            const specificRes = await searchSongs(`${artistName} ${startSong}`, 5);
            const specificSongs = filterLive(specificRes?.result?.songs || []);
            console.log('[Router] specific search results:', specificSongs.map(s => `${s.name} (${s.id})`));
            bestMatch = specificSongs.find(s =>
              (s.name || s.title || '').toLowerCase().includes(startSong.toLowerCase())
            ) || specificSongs[0];
          }

          console.log('[Router] bestMatch:', bestMatch?.name, bestMatch?.id);

          if (bestMatch) {
            songs = songs.filter(s => s.id !== bestMatch.id);
            songs.unshift(bestMatch);
          }
        }

        return {
          route: 'hybrid',
          action: 'play_artist',
          params: intent.params,
          results: songs,
        };
      } catch {
        return { route: 'claude', action: 'chat', params: {} };
      }

    case 'play_song':
      try {
        const songRes = await searchSongs(intent.params?.song || '', 5);
        return {
          route: 'hybrid',
          action: 'play_song',
          params: intent.params,
          results: filterLive(songRes?.result?.songs || []).slice(0, 3),
        };
      } catch {
        return { route: 'claude', action: 'chat', params: {} };
      }

    case 'chat':
    case 'none':
    default:
      return { route: 'claude', action: 'chat', params: intent?.params || {} };

    case 'play_personalized':
      return {
        route: 'ncm',
        action: 'play_personalized',
        params: { ...intent.params, _raw: text },
      };

    case 'reject_recommend':
      return {
        route: 'ncm',
        action: 'reject_recommend',
        params: { ...intent.params, _raw: text },
      };
  }
}

export function isFastRoute(text) {
  const fast = /^(skip|next|切歌|下一首|pause|stop|暂停|play|resume|播放|继续|what'?s playing|now playing)/i;
  return fast.test(text.trim());
}
