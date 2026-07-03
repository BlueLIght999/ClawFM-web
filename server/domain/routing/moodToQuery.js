/**
 * Map a mood keyword to a Chinese search query for song discovery.
 * Extracted from router.js play_mood case (pure lookup + fallback),
 * moving the moodMap out of routeIntent's switch.
 *
 * Behavior: (mood||'chill').toLowerCase() → MOOD_MAP[key] || mood || '热门'
 *
 * @param {string} mood mood keyword (may be empty/undefined)
 * @returns {string} search query
 */
const MOOD_MAP = {
  happy: '欢快 流行', energetic: '电子 舞曲', upbeat: '流行 摇滚',
  chill: '轻音乐 放松', relaxed: '轻音乐 治愈', calm: '钢琴 纯音乐',
  sad: '伤感 情歌', melancholy: '民谣 抒情', romantic: '浪漫 情歌',
  rock: '摇滚 经典', jazz: '爵士 经典', classical: '古典 钢琴',
  intense: '重金属 摇滚', dark: '后摇 迷幻', dreamy: '梦幻流行 电子',
  focus: '学习 专注 钢琴', party: '派对 舞曲', nostalgic: '怀旧 经典老歌',
};

export function moodToQuery(mood) {
  const moodKey = (mood || 'chill').toLowerCase();
  return MOOD_MAP[moodKey] || mood || '热门';
}
