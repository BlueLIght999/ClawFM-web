/**
 * profileFusionRules — P-B 三路画像融合纯逻辑（domain 层，零 IO）。
 *
 * 输入三路信号：
 *   - neteaseSignals：成员网易云历史（路 1，由 NeteaseMemberHistoryAdapter 产出）
 *   - radioSignals：本电台交互（路 2，由 community_listens 聚合）
 *   - selfTags：自填兴趣标签（路 3）
 *
 * 输出 fused profile：36 维标签分布 + artistAffinity + timeSlot + userTags + meta。
 * 36 维 = 现有 UserClusterAnalyzer 的 33 维（genre10+mood8+region5+behavior6+chat4）
 *         + 扩展 artist_affinity / time_slot(5) / user_tags（见 PRD §4）。
 *
 * 纯函数：不 import node 内置、不碰 IO，100% 可单测。遵循 D1/D2。
 */

export const GENRE_TAGS = [
  'pop', 'rock', 'folk', 'electronic', 'hiphop',
  'jazz', 'classical', 'rnb', 'metal', 'indie',
];

export const MOOD_TAGS = [
  'happy', 'sad', 'energetic', 'calm',
  'nostalgic', 'romantic', 'angry', 'dreamy',
];

export const REGION_TAGS = [
  'chinese', 'english', 'japanese', 'korean', 'instrumental',
];

export const BEHAVIOR_TAGS = [
  'skip_prone', 'replay_lover', 'night_owl', 'morning_person',
  'explorer', 'loyalist',
];

export const CHAT_TAGS = ['concise', 'detailed', 'casual', 'formal'];

export const TIME_SLOTS = ['morning', 'afternoon', 'evening', 'night', 'late_night'];

const MAX_ARTISTS = 10;

/**
 * 把一个 counts 对象在给定 tagList 上归一化为 0-1 权重分布。
 * 缺失的 tag 补 0；total <= 0 时全 0。
 */
export function normalizeWeights(counts, tagList) {
  const c = counts || {};
  const total = tagList.reduce((sum, tag) => sum + (Number(c[tag]) || 0), 0);
  if (total <= 0) {
    return Object.fromEntries(tagList.map((tag) => [tag, 0]));
  }
  return Object.fromEntries(tagList.map((tag) => [tag, (Number(c[tag]) || 0) / total]));
}

/**
 * 加权混合两路原始 counts：blended[k] = a[k]*wa + b[k]*wb。
 */
export function blendCounts(a, b, wa, wb) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    out[k] = (Number(a?.[k]) || 0) * wa + (Number(b?.[k]) || 0) * wb;
  }
  return out;
}

/**
 * 把 topArtists（[{name, playCount}]）归一化为 [{artist, weight}]，按权重降序，取前 MAX_ARTISTS。
 * weight = playCount / sum(allPlayCount)；全 0 时返回空数组。
 */
export function normalizeArtistAffinity(topArtists) {
  const list = Array.isArray(topArtists) ? topArtists : [];
  const total = list.reduce((sum, a) => sum + (Number(a?.playCount) || 0), 0);
  if (total <= 0) return [];
  return list
    .map((a) => ({ artist: String(a?.name || a?.artist || '').trim(), weight: (Number(a?.playCount) || 0) / total }))
    .filter((a) => a.artist.length > 0)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, MAX_ARTISTS);
}

/**
 * 自填标签 → [{tag, weight: 1}]（显式标签，等权）。
 */
export function normalizeSelfTags(selfTags) {
  const list = Array.isArray(selfTags) ? selfTags : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = String(raw || '').trim();
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    out.push({ tag, weight: 1 });
  }
  return out;
}

/**
 * P-B 三路融合主入口。
 * @param {object} input
 * @param {object} [input.neteaseSignals] - { genreCounts, regionCounts, topArtists, totalPlays, timeSlotCounts }
 * @param {object} [input.radioSignals]   - { genreCounts, moodCounts, behaviorCounts, chatStyleCounts, timeSlotCounts }
 * @param {string[]} [input.selfTags]
 * @returns {object} fused profile
 */
export function fuseProfile({ neteaseSignals, radioSignals, selfTags } = {}) {
  const netease = neteaseSignals || {};
  const radio = radioSignals || {};

  // genre：网易云为主(0.7) + 电台交互(0.3)
  const genreCounts = blendCounts(netease.genreCounts, radio.genreCounts, 0.7, 0.3);
  // region：网易云历史推断
  const regionCounts = netease.regionCounts || {};
  // mood / behavior / chat：来自电台交互
  const moodCounts = radio.moodCounts || {};
  const behaviorCounts = radio.behaviorCounts || {};
  const chatCounts = radio.chatStyleCounts || {};

  // timeSlot：优先网易云，回退电台
  const timeSlotCounts = netease.timeSlotCounts || radio.timeSlotCounts || {};

  return {
    tags: {
      genre: normalizeWeights(genreCounts, GENRE_TAGS),
      mood: normalizeWeights(moodCounts, MOOD_TAGS),
      region: normalizeWeights(regionCounts, REGION_TAGS),
      behavior: normalizeWeights(behaviorCounts, BEHAVIOR_TAGS),
      chat: normalizeWeights(chatCounts, CHAT_TAGS),
    },
    artistAffinity: normalizeArtistAffinity(netease.topArtists),
    timeSlot: normalizeWeights(timeSlotCounts, TIME_SLOTS),
    userTags: normalizeSelfTags(selfTags),
    meta: {
      totalPlays: Number(netease.totalPlays) || 0,
      source: 'P-B',
    },
  };
}

/**
 * 把小时（0-23）映射到时段桶。
 * late_night[0-4] / morning[5-10] / afternoon[11-16] / evening[17-22] / night[23]
 */
export function hourToSlot(hour) {
  if (hour === null || hour === undefined) return null;
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  if (h < 5) return 'late_night';
  if (h < 11) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 23) return 'evening';
  return 'night';
}

function parseHour(playedAt) {
  if (!playedAt) return null;
  const d = new Date(typeof playedAt === 'string' ? playedAt.replace(' ', 'T') : playedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

/**
 * 把本电台交互 list（[{action, artist, playedAt}]）聚合为 radioSignals。
 * behavior 从 action 派生（skip_prone/replay_lover/explorer/loyalist/night_owl/morning_person）；
 * timeSlot 从 playedAt 小时分桶；genre/mood/chat 留空（需歌曲曲风/情绪推断与聊天分析，后续增强）。
 * 纯函数，可单测。
 */
export function aggregateRadioSignals(listens) {
  const list = Array.isArray(listens) ? listens : [];
  const behaviorCounts = {
    skip_prone: 0, replay_lover: 0, explorer: 0,
    loyalist: 0, night_owl: 0, morning_person: 0,
  };
  const timeSlotCounts = { morning: 0, afternoon: 0, evening: 0, night: 0, late_night: 0 };
  const artistCount = {};

  for (const l of list) {
    const action = l?.action;
    if (action === 'skipped') behaviorCounts.skip_prone += 1;
    if (action === 'liked') behaviorCounts.replay_lover += 1;

    const artist = String(l?.artist || '').trim();
    if (artist) artistCount[artist] = (artistCount[artist] || 0) + 1;

    const slot = hourToSlot(parseHour(l?.playedAt));
    if (slot) {
      timeSlotCounts[slot] += 1;
      if (slot === 'late_night' || slot === 'night') behaviorCounts.night_owl += 1;
      if (slot === 'morning') behaviorCounts.morning_person += 1;
    }
  }

  const artistEntries = Object.values(artistCount);
  behaviorCounts.explorer = artistEntries.filter((c) => c === 1).length;
  behaviorCounts.loyalist = artistEntries.filter((c) => c > 1).length;

  return {
    genreCounts: {},
    moodCounts: {},
    behaviorCounts,
    chatStyleCounts: {},
    timeSlotCounts,
  };
}
