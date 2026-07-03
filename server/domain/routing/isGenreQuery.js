/**
 * Genre/instrument/style keywords that indicate a personalized-recommendation
 * intent rather than a literal song/artist search (Chinese + English).
 * Extracted from router.js to move the inline list + detection out of
 * routeIntent, lowering its complexity.
 */
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

/**
 * Whether the text contains a genre/instrument/style keyword
 * (case-insensitive).
 * @param {string} text
 * @returns {boolean}
 */
export function isGenreQuery(text) {
  const lower = (text || '').toLowerCase();
  return GENRE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}
