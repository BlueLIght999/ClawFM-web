/**
 * tagRecall — 自填标签的归一化与倒排召回（domain，零 IO）。
 *
 * 最小验证序列第 ② 步。第 ① 步（0c7e949）已把自填标签落进 profile.userTags，
 * 但「找出兴趣相同的成员」若用两两 Jaccard，复杂度是 O(n²)：2000 个成员
 * 即 200 万次集合运算，而每个成员 Agent 每次主动找同类都要走这一步。
 * 倒排索引把单次召回降到与「命中候选数」成正比，与总人数无关——这是 A2A
 * 匹配能做成实时路径的前提。
 *
 * 真正难的不是索引，是「两个标签算不算同一个」：
 *   - 「爵士」「Jazz」「爵士乐」「爵士樂」是同一个人写同一件事的四种方式，
 *     不折叠就会把同一群人切成四个互不相通的簇，A2A 的匹配率凭空掉四分之三；
 *   - 但「摇滚」和「金属」必须分开——归一化过头会让推荐失去区分度。
 * 这个边界就是本模块的全部内容：先把写法折叠到同一「键」，再按键建桶。
 *
 * 折叠顺序（顺序本身是契约，改动必须同步测试）：
 *   去空白/标点 → 繁转简 → 片假名转平假名 → 去装饰后缀 → 查同义词表
 * 同义词表放在最后：表里的成员本身要先被前面的步骤归一，否则
 * 「Jazz」「j-pop」这类带大小写/连写的写法会查不到表。
 *
 * 纯函数，零 IO，不 import node 内置（D1/D2）。
 */

/** 召回层的规模上限。 */
export const RECALL_LIMITS = {
  /** 单次召回的候选上限。下游相似度重排据此预算，不随成员总数膨胀。 */
  MAX_CANDIDATES: 50,
};

/**
 * 同义词组：canonical 是折叠后的代表键，members 是各种写法。
 *
 * 两条不变量（由测试守护，新增条目必须满足）：
 *   1. 任何成员归一后不得属于两个不同的组——否则折叠结果取决于遍历顺序；
 *   2. canonical 必须是自己归一后的形式，即 normalizeTagKey(canonical) === canonical。
 *      例如 'postrock' 而非 'post-rock'，'jpop' 而非 'j-pop'。
 */
export const SYNONYM_GROUPS = [
  { canonical: 'jazz', members: ['jazz', '爵士', '爵士乐', 'jazz乐'] },
  { canonical: 'rock', members: ['rock', '摇滚'] },
  { canonical: 'metal', members: ['metal', '金属', '重金属'] },
  { canonical: 'folk', members: ['folk', '民谣', 'folkmusic'] },
  { canonical: 'electronic', members: ['electronic', 'edm', '电子', '电子音乐'] },
  { canonical: 'hiphop', members: ['hiphop', 'hip-hop', 'rap', '说唱', '嘻哈'] },
  { canonical: 'classical', members: ['classical', 'classic', '古典', '古典音乐', '古典乐'] },
  { canonical: 'rnb', members: ['rnb', 'r&b', '节奏布鲁斯'] },
  { canonical: 'pop', members: ['pop', '流行', '流行音乐'] },
  { canonical: 'indie', members: ['indie', '独立音乐', '独立'] },
  { canonical: 'jpop', members: ['jpop', 'j-pop', '日本流行', '日系'] },
  { canonical: 'kpop', members: ['kpop', 'k-pop', '韩国流行', '韩流'] },
  { canonical: 'postrock', members: ['postrock', 'post-rock', '后摇', '後搖'] },
  { canonical: 'citypop', members: ['citypop', 'city-pop', 'city pop', '城市流行'] },
  { canonical: 'lofi', members: ['lofi', 'lo-fi', '低保真'] },
  { canonical: 'ambient', members: ['ambient', 'ambientmusic', '氛围', '氛围音乐'] },
  { canonical: 'bossanova', members: ['bossanova', 'bossa-nova', '波萨诺瓦', 'ボサノヴァ', 'ボサノバ'] },
  { canonical: 'blues', members: ['blues', '布鲁斯', '蓝调'] },
  { canonical: 'punk', members: ['punk', '朋克'] },
  { canonical: 'instrumental', members: ['instrumental', '纯音乐', '器乐'] },
  // 情绪组：代表键取 profileFusionRules.MOOD_TAGS 的写法，帖子标签、画像关键词、
  // 自填标签才能落进同一个桶。刻意不收「快乐」：它会被剥掉装饰后缀「乐」折成「快」。
  { canonical: 'happy', members: ['happy', '开心', '欢快'] },
  { canonical: 'sad', members: ['sad', '伤感', '悲伤', '难过', 'emo'] },
  { canonical: 'energetic', members: ['energetic', '热血', '动感', '带感'] },
  { canonical: 'calm', members: ['calm', 'chill', '治愈', '安静', '平静', '舒缓'] },
  { canonical: 'nostalgic', members: ['nostalgic', '怀旧', '回忆'] },
  { canonical: 'romantic', members: ['romantic', '浪漫'] },
  { canonical: 'angry', members: ['angry', '愤怒', '暴躁'] },
  { canonical: 'dreamy', members: ['dreamy', '梦幻'] },
];

/**
 * 常见繁体 → 简体。
 *
 * 只收「本项目词表里真实用到、且繁简确实不同」的字。刻意不收「爵→爵」这类
 * 恒等映射：它们对折叠结果毫无影响，却会掩盖真正的漏字——一张塞满恒等项的
 * 表看着很全，实际缺失的字反而无法被一眼看出，且极易写出重复键。
 */
const T2S_MAP = {
  後: '后', 搖: '摇', 滾: '滚', 樂: '乐',
  電: '电', 說: '说', 經: '经', 點: '点',
  獨: '独', 韓: '韩', 國: '国',
  藍: '蓝', 調: '调', 龐: '庞', 剋: '克', 節: '节',
  魯: '鲁', 純: '纯', 氣: '气', 圍: '围',
  聲: '声', 響: '响', 風: '风', 鋼: '钢',
  貝: '贝', 謠: '谣', 頭: '头', 腦: '脑', 數: '数',
};

/** 装饰后缀：写「jazz乐」和「jazz」时指的是同一件事。长的排前面，先匹配长的。 */
const DECORATIVE_SUFFIXES = ['音乐', '乐', '曲', '风格', '风'];

/**
 * 需要剥掉的空白与标点。连字符必须去掉，否则 city-pop 与 city pop 分家。
 * 全角空格由 \s 覆盖（\s 已含 U+3000），显式再写一遍会被 lint 判为
 * 「字符类内重复」，也不是能让人看出意图的写法。
 */
const STRIP_RE = /[\s\-_·・/\\,.，。!！?？:：;；"'“”‘’()（）[\]【】<>《》~～+*&#@$%^|]/g;

/** 繁转简：逐字替换，未收录的字原样保留。 */
function toSimplified(s) {
  let out = '';
  for (const ch of s) out += T2S_MAP[ch] || ch;
  return out;
}

/** 片假名转平假名（U+30A1–U+30F6 整体下移 0x60），并处理ヴ/ヷ 等浊音变体。 */
function foldKana(s) {
  return s
    .replace(/ヴ/g, 'バ') // ヴ → バ
    .replace(/ヷ/g, 'ワ') // ヷ → ワ
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/ー/g, ''); // 长音符：ろっくー 与 ろっく 应进同一桶
}

/**
 * 剥离末尾的装饰后缀，只剥一层。
 *
 * 用 `>=` 而非 `>`：整串就是一个装饰后缀时（「音乐」「风格」），剥完是空串，
 * 表示「没有可用的信息」——这正是常量表要表达的意思。若要求剥完必须留有
 * 剩余（`>`），「音乐」会被留下成「音」、「风格」留下成「风」这些谁也不认识
 * 的碎片，反而是最坏的结果：它们落进索引变成真实桶。
 */
function stripDecorativeSuffix(s) {
  for (const suffix of DECORATIVE_SUFFIXES) {
    if (s.length >= suffix.length && s.endsWith(suffix)) {
      return s.slice(0, s.length - suffix.length);
    }
  }
  return s;
}

/**
 * 写法折叠：只做字符级归一，不查同义词表。
 *
 * 必须与 normalizeTagKey 分开：同义词表的构建要用折叠结果当键，若这一步
 * 里再查表就会自我递归。表查找是 normalizeTagKey 独有的一步。
 */
function foldTag(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (raw.length === 0) return '';
  let s = raw.replace(STRIP_RE, '');
  if (s.length === 0) return '';
  s = toSimplified(s);
  s = foldKana(s);
  s = stripDecorativeSuffix(s);
  return s;
}

/**
 * 折叠结果 → 代表键。模块加载时构建一次，之后是 O(1) 查表。
 *
 * 用折叠后的形式当键，正是为了让表里的写法本身也能被查到：
 * 'Jazz'、'j-pop'、'ボサノヴァ' 折叠后都落进这里。
 */
const SYNONYM_LOOKUP = (() => {
  const map = new Map();
  // 先写 members 再写 canonical，让 canonical 自身的形式胜出（两者折叠
  // 结果相同时 canonical 是权威写法）。
  for (const group of SYNONYM_GROUPS) {
    for (const member of group.members) {
      const key = foldTag(member);
      if (key.length > 0) map.set(key, group.canonical);
    }
  }
  for (const group of SYNONYM_GROUPS) {
    const key = foldTag(group.canonical);
    if (key.length > 0) map.set(key, group.canonical);
  }
  return map;
})();

/**
 * 把任意输入折叠成一个标签「键」。
 *
 * 契约：同样的音乐概念无论中英文、简繁体、全半角、带不带装饰后缀，
 * 都折叠到同一个键；不同概念必须落到不同的键（测试有回归护栏）。
 *
 * @param {unknown} input
 * @returns {string} 归一后的键；无法使用（空、纯标点）时返回 ''
 */
export function normalizeTagKey(input) {
  const folded = foldTag(input);
  if (folded.length === 0) return '';
  return SYNONYM_LOOKUP.get(folded) || folded;
}

/**
 * 取成员 id 的字符串形式；不可用时返回 ''（调用方据此跳过该成员）。
 * @param {{id?: unknown}} member
 * @returns {string}
 */
function memberIdOf(member) {
  if (!member || member.id === null || member.id === undefined) return '';
  return String(member.id);
}

/**
 * 把某个成员的全部可用标签键加进倒排桶。不返回值，直接改 buckets。
 * @param {Map<string, Set<string>>} buckets
 * @param {string} id
 * @param {unknown} tags
 */
function addTagsToBuckets(buckets, id, tags) {
  const list = Array.isArray(tags) ? tags : [];
  for (const tag of list) {
    const key = normalizeTagKey(tag);
    if (key.length === 0) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new Set();
      buckets.set(key, bucket);
    }
    bucket.add(id);
  }
}

/**
 * 建立「标签键 → 成员 id 列表」的倒排索引。
 *
 * 桶内 id 排序：桶的顺序会决定同分候选的先后，进而在用户可见的推荐位上
 * 表现为「刷新一次换一批」。固定排序消除这个不确定性。
 *
 * @param {Array<{id?: unknown, tags?: unknown}>} members
 * @returns {Map<string, string[]>}
 */
export function buildTagIndex(members) {
  const list = Array.isArray(members) ? members : [];
  /** @type {Map<string, Set<string>>} */
  const buckets = new Map();

  for (const member of list) {
    const id = memberIdOf(member);
    if (id.length === 0) continue;
    addTagsToBuckets(buckets, id, member.tags);
  }

  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const [key, ids] of buckets) out.set(key, [...ids].sort());
  return out;
}

/**
 * 把一组标签折叠成「键集合」，供相似度计算与召回共用。
 *
 * 存在的理由：召回层用的是 normalizeTagKey（「爵士」与「Jazz」同桶），
 * 若下游重排用另一套判等规则（如仅小写比较），同一个候选会「因共享标签被
 * 召回、却在重排里算出零重合」——召回与重排对「同一个标签」的定义必须一致，
 * 否则管道中间一步就把上游的结论推翻。相似度计算一律先过这一层。
 *
 * 去重后按码元序排序：集合语义，且让调用方拿到稳定顺序。
 *
 * @param {unknown} tags
 * @returns {string[]} 归一后的键集合（已排序、已去重、已丢弃不可用输入）
 */
export function canonicalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const keys = new Set();
  for (const raw of list) {
    const key = normalizeTagKey(raw);
    if (key.length > 0) keys.add(key);
  }
  return [...keys].sort();
}

/**
 * 按查询键收集候选：candidateId → 共享键列表。排除 selfId。
 * @param {string[]} queryKeys
 * @param {Map<string, string[]>} index
 * @param {string} self
 * @returns {Map<string, string[]>}
 */
function collectHits(queryKeys, index, self) {
  /** @type {Map<string, string[]>} */
  const hits = new Map();
  for (const key of queryKeys) {
    const bucket = index.get(key);
    if (!bucket) continue;
    for (const id of bucket) {
      if (id === self) continue;
      let shared = hits.get(id);
      if (!shared) {
        shared = [];
        hits.set(id, shared);
      }
      shared.push(key);
    }
  }
  return hits;
}

/**
 * 候选排序：共享标签数降序，同分按 memberId 升序。
 * 二级序不可省——否则同分候选的先后由 Map 插入序决定，会随成员注册
 * 顺序抖动，在用户可见的推荐位上表现为「刷新一次换一批」。
 * @param {{memberId: string, sharedCount: number}} a
 * @param {{memberId: string, sharedCount: number}} b
 * @returns {number}
 */
function compareCandidates(a, b) {
  if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
  if (a.memberId === b.memberId) return 0;
  return a.memberId < b.memberId ? -1 : 1;
}

/**
 * 把 hits 展开成带分数的候选列表并排好序。
 * @param {Map<string, string[]>} hits
 * @returns {Array<{memberId: string, sharedCount: number, sharedTags: string[]}>}
 */
function toRankedCandidates(hits) {
  const out = [];
  for (const [memberId, sharedTags] of hits) {
    out.push({ memberId, sharedCount: sharedTags.length, sharedTags: [...sharedTags].sort() });
  }
  out.sort(compareCandidates);
  return out;
}

/**
 * 按标签召回候选成员，按共享标签数降序。
 *
 * 复杂度与「命中候选数」成正比，与成员总数无关——这是相比两两 Jaccard
 * 的核心收益，也是 A2A 能做成实时路径的前提。
 *
 * @param {object} input
 * @param {unknown} [input.tags] - 查询方标签
 * @param {Map<string, string[]>} [input.index] - buildTagIndex 的输出
 * @param {unknown} [input.selfId] - 调用方自身 id，从结果中排除
 * @param {number} [input.limit] - 候选上限
 * @returns {Array<{memberId: string, sharedCount: number, sharedTags: string[]}>}
 *   按 sharedCount 降序、memberId 升序（稳定的二级序）；
 *   无共享标签的成员不出现（那是「不相似」，不是「弱相似」）。
 */
export function recallByTags({ tags, index, selfId = null, limit } = {}) {
  if (!(index instanceof Map) || index.size === 0) return [];

  const queryKeys = canonicalizeTags(tags);
  if (queryKeys.length === 0) return [];

  const self = selfId === null || selfId === undefined ? '' : String(selfId);
  const hits = collectHits(queryKeys, index, self);

  const cap = typeof limit === 'number' && limit >= 0 ? limit : RECALL_LIMITS.MAX_CANDIDATES;
  return toRankedCandidates(hits).slice(0, cap);
}
