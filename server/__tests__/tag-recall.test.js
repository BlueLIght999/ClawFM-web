import { describe, expect, it } from 'vitest';
import {
  normalizeTagKey,
  canonicalizeTags,
  SYNONYM_GROUPS,
  buildTagIndex,
  recallByTags,
  RECALL_LIMITS,
} from '../domain/community/tagRecall.js';

/**
 * tagRecall — 自填标签 → 候选成员的召回层（domain，零 IO）。
 *
 * 最小验证序列的第 ② 步：第 ① 步已把自填标签写进 profile.userTags，
 * 但两两比较是 O(n²)，2000 个成员就是 200 万次 Jaccard。倒排索引把
 * 「谁和我有共同标签」降到与命中候选数成正比，这对 A2A 是关键路径：
 * 成员 Agent 每次主动找同类都要走这一步。
 *
 * 本文件按 TDD 先写断言。难点不在索引本身，在「标签怎么算同一个」：
 * 自填标签是自由文本，「爵士」「Jazz」「jazz 乐」理应命中同一桶，而
 * 「摇滚」和「金属」必须分开。归一化的粒度直接决定召回的质量。
 *
 * ── 变异测试存活者归因（Stryker 89.10%，139 杀 / 17 活，无 NoCoverage）──
 * 17 个存活者已逐条归因，全部为「等价变异」或「无输入可达」，不是欠账：
 *
 * 可达性前提：成员 id 来自 community_members.user_id（主键，非空字符串）。
 * 凡「需要某个 id 恰好等于 ""/"null"/"undefined"/"Stryker was here!"」才能
 * 区分的变异，在这个前提下一律不可观测。
 *
 *   源码位置                     变异                          归因
 *   ────────────────────────────────────────────────────────────────────────
 *   L114:9-34  s.length >= suffix.length      → true
 *      等价：右侧 s.endsWith(suffix) 为真时必蕴含长度条件，左侧是冗余前置。
 *      注意 L114:9-56（整个 && 表达式）→ true 是可区分的，已被杀死。
 *   L128:15-41 String(input??'').trim()       → 去掉 .trim()
 *      等价：STRIP_RE 含 \s（且 \s 匹配全角空格 U+3000），会删掉串中任意
 *      位置的空白，replace 之后 trim 已无空白可去。实测去掉 .trim() 后
 *      2202 条断言全绿。保留 .trim() 是给人读的意图说明，不是运行必需。
 *   L129/L131/L172/L325/L328  xxx.length === 0 → false
 *      等价：都是「提前返回」的捷径。去掉后继续往下走，后续步骤对空串
 *      产出同样的结果（STRIP_RE 后为空、无命中、空 Map 无候选）。
 *   L182:18-36 member.id === null             → false
 *      null id 的成员来自仓储，user_id 是主键，不可能为 null；不可达。
 *   L216:51-53 []                             → ["Stryker was here"]
 *      等价：Array.isArray 已经挡掉非数组输入，字面量内容永远进不了循环。
 *   L291:7-32  a.memberId === b.memberId      → false
 *      不可达：toRankedCandidates 遍历的是以 memberId 为键的 Map，
 *      同一个 id 只出现一次，比较器永远拿不到两个相等的 id。
 *   L292:10-33 a.memberId < b.memberId        → <=
 *      不可达：同上，等号分支永不进入，< 与 <= 在可达输入上同结果。
 *   L303:70-92 [...sharedTags].sort()         → 去掉 .sort()
 *      等价：hits 由 collectHits 按 queryKeys（canonicalizeTags 已排序）
 *      顺序压入，sharedTags 构造时即有序，再排一次不改变结果。
 *   L330:16-55 selfId===null||selfId===undefined → false（及 || → &&）
 *   L330:16-31 selfId === null                → false
 *   L330:35-55 selfId === undefined           → false
 *     不可达：仅在 selfId 传 null/undefined 且成员 id 字面量为
 *      "null"/"undefined" 时才可观测；后者不可能。传数字（如 0）的分支
 *      已由 stringifiesNumericSelfIds 钉住，与本组变异无关。
 *   L330:58-60 ''                             → "Stryker was here!"
 *      不可达：需要成员 id 恰为 "Stryker was here!" 才能区分；
 *      而 id 为 "" 的成员根本进不了索引（memberIdOf 先行丢弃）。
 * ────────────────────────────────────────────────────────────────────────
 */

describe('normalizeTagKey', () => {
  it('lowercasesAndTrims', () => {
    expect(normalizeTagKey('  Jazz  ')).toBe('jazz');
    expect(normalizeTagKey('ROCK')).toBe('rock');
  });

  it('stripsFullWidthAndHalfWidthSpacing', () => {
    // 中文用户常在词中夹空格，全角空格尤其常见；它们不该产生不同的桶。
    expect(normalizeTagKey('深 夜 后 摇')).toBe('深夜后摇');
    expect(normalizeTagKey('深夜　后摇')).toBe('深夜后摇');
  });

  it('foldsTraditionalToSimplified', () => {
    // 同一首歌，大陆用户写「后摇」，港台用户写「後搖」。不折叠会把
    // 同一群人切成两个簇——这正是 A2A 匹配要避免的碎片化。
    expect(normalizeTagKey('後搖')).toBe(normalizeTagKey('后摇'));
    expect(normalizeTagKey('爵士樂')).toBe(normalizeTagKey('爵士乐'));
    expect(normalizeTagKey('古典音樂')).toBe(normalizeTagKey('古典音乐'));
  });

  it('foldsJapaneseKanaVariants', () => {
    expect(normalizeTagKey('ロック')).toBe(normalizeTagKey('ろっく'));
    expect(normalizeTagKey('ボサノヴァ')).toBe(normalizeTagKey('ボサノバ'));
  });

  it('stripsDecorativeSuffixesAndPunctuation', () => {
    // 「jazz 乐」「jazz乐」是同一个人写同一件事的两种方式。
    expect(normalizeTagKey('jazz乐')).toBe('jazz');
    expect(normalizeTagKey('jazz 乐')).toBe('jazz');
    expect(normalizeTagKey('jazz音乐')).toBe('jazz');
    expect(normalizeTagKey('city-pop')).toBe('citypop');
    expect(normalizeTagKey('city pop')).toBe('citypop');
    expect(normalizeTagKey('trip-hop!')).toBe('triphop');
  });

  it('canonicalizesThroughTheSynonymTable', () => {
    // 同义词折叠到代表词，让中英文写法进同一个桶。
    expect(normalizeTagKey('爵士乐')).toBe('jazz');
    expect(normalizeTagKey('Jazz')).toBe('jazz');
    expect(normalizeTagKey('j-pop')).toBe(normalizeTagKey('日本流行'));
    expect(normalizeTagKey('post-rock')).toBe(normalizeTagKey('后摇'));
  });

  it('returnsEmptyForNonStringOrBlankInput', () => {
    // 召回层会吃到任意输入（标签表是用户 JSON），空串必须安全地表示
    // 「无标签」，而不是抛错或被当成一个真实桶。
    expect(normalizeTagKey('')).toBe('');
    expect(normalizeTagKey('   ')).toBe('');
    expect(normalizeTagKey(null)).toBe('');
    expect(normalizeTagKey(undefined)).toBe('');
    expect(normalizeTagKey(42)).toBe('42');
  });

  it('returnsEmptyWhenNothingButDecorationRemains', () => {
    // 纯标点折完是空串——等价于「没写标签」。若这一层守卫被去掉，
    // 空串会落进同义词表的兜底分支变成一个真实键，所有写「!!!」的人
    // 会被折进同一个桶，凭空成为「同类」。
    expect(normalizeTagKey('!!!')).toBe('');
    expect(normalizeTagKey('---')).toBe('');
    expect(normalizeTagKey('　')).toBe('');
    // 整串只有装饰后缀时，剥完为空——表示「没有可用的信息」。若要求剥完
    // 必须留有余量（>），「音乐」会留下「音」、「风格」留下「风」这些谁也
    // 不认识的碎片，落进索引变成真实桶，比空标签更糟。
    expect(normalizeTagKey('音乐')).toBe('');
    expect(normalizeTagKey('风格')).toBe('');
    expect(normalizeTagKey('乐')).toBe('');
    expect(normalizeTagKey('风')).toBe('');
  });

  it('keepsTheLongestDecorativeSuffixMatch', () => {
    // 「jazz音乐」要剥掉「音乐」两个字，而不是先撞上「乐」只剥一个字
    // （那样会留下「jazz音」这个谁都不认识的键）。
    expect(normalizeTagKey('jazz音乐')).toBe('jazz');
    expect(normalizeTagKey('jazz乐')).toBe('jazz');
    expect(normalizeTagKey('后摇风格')).toBe(normalizeTagKey('后摇'));
  });

  it('doesNotCollideDistinctGenres', () => {
    // 归一化过头比不归一化更糟：把摇滚和金属折叠到一起，会让推荐
    // 彻底失去区分度。这组是回归护栏。
    const keys = ['摇滚', '金属', '民谣', '电子', '说唱', '古典']
      .map(normalizeTagKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matchesTheStoredSpellingAfterTrimmingAndLowercasing', () => {
    // 索引里的桶键是 foldTag 处理过的（trim + lowercase），查询侧必须先
    // 做同样的处理再去查桶，否则「  Jazz  」会查不到 'jazz' 这个桶——
    // 而用户手填标签带空格、首字母大写都是最常见的形态。
    expect(normalizeTagKey('  Jazz  ')).toBe('jazz');
    expect(normalizeTagKey('JAZZ')).toBe('jazz');
    expect(normalizeTagKey('R&B')).toBe(normalizeTagKey('r&b'));
  });

  it('stripsSurroundingWhitespaceOffChineseTagsToo', () => {
    // 空白必须被去掉——否则「 爵士 」会连同前后空格落进一个谁也不会用的桶。
    // 这条断言真正钉住的是 STRIP_RE 里的 \s（\s 已含全角空格 U+3000，
    // 无需再显式列出）。注意它并不能钉住 foldTag 里的 .trim()：\s 会匹配
    // 串中任意位置的空白，replace 之后 trim 已无空白可去——删掉 .trim()
    // 任何输入都区分不出来，那是等价变异，不该为它编造断言（实测全套
    // 2202 条在去掉 .trim() 后仍全绿）。.trim() 留着是给人读的意图说明。
    expect(normalizeTagKey(' 爵士 ')).toBe('jazz');
    expect(normalizeTagKey(' 爵士')).toBe('jazz');
    expect(normalizeTagKey('爵士 ')).toBe('jazz');
    expect(normalizeTagKey('　爵士　')).toBe('jazz'); // 全角空格 U+3000
    expect(normalizeTagKey('\t爵士\t')).toBe('jazz');
    expect(normalizeTagKey(' 後搖 ')).toBe('postrock');
    expect(normalizeTagKey(' 氛围音乐 ')).toBe('ambient');
  });

  it('foldsKanaAndDropsLongVowelMarks', () => {
    // 片假名与平假名是同一套音节（ロック / ろっく），长音符只是拉长，
    // 不改变词义（ろっくー / ろっく）。日本流行乐的用户两种写法都会用。
    expect(normalizeTagKey('ロック')).toBe('ろっく');
    expect(normalizeTagKey('ろっくー')).toBe(normalizeTagKey('ろっく'));
    expect(normalizeTagKey('ボサノヴァ')).toBe(normalizeTagKey('ボサノバ'));
    // ヷ(ワ+゛) 是 ヴ 的罕见变体，必须一并折到 ワ，否则「ヷ」自成孤桶。
    expect(normalizeTagKey('ヷヴァイオリン')).toBe(normalizeTagKey('ワヴァイオリン'));
  });

  it('returnsEmptyForInputThatIsOnlyDecoration', () => {
    // 「音乐」「风格」整串就是装饰词，剥完是空串——表示「没有可用信息」。
    // 若改成必须留有余量，「音乐」会剩下「音」、「风格」会剩下「风」，
    // 这两个碎片谁也不认识，却会真的变成索引桶。
    expect(normalizeTagKey('音乐')).toBe('');
    expect(normalizeTagKey('风格')).toBe('');
    expect(normalizeTagKey('乐')).toBe('');
    expect(normalizeTagKey('风')).toBe('');
  });

  it('foldsChineseMoodWordsOntoProfileMoodKeys', () => {
    // 情绪组的代表键取画像 MOOD_TAGS 的写法，帖子标签、画像关键词、自填标签才能同桶
    expect(normalizeTagKey('伤感')).toBe('sad');
    expect(normalizeTagKey('治愈')).toBe('calm');
    expect(normalizeTagKey('怀旧')).toBe('nostalgic');
    expect(normalizeTagKey('Happy')).toBe('happy');
  });

  it('keepsSynonymGroupsInternallyConsistent', () => {
    // 表格自身不能有「一个词属于两组」的冲突，否则折叠结果取决于
    // 遍历顺序，且随表格更新静默改变。
    const seen = new Map();
    for (const group of SYNONYM_GROUPS) {
      for (const member of group.members) {
        const key = normalizeTagKey(member);
        expect(seen.has(key) && seen.get(key) !== group.canonical).toBe(false);
        seen.set(key, group.canonical);
      }
    }
  });
});

describe('buildTagIndex', () => {
  const members = [
    { id: 'a', tags: ['爵士', '深夜', '钢琴'] },
    { id: 'b', tags: ['Jazz', 'City Pop'] },
    { id: 'c', tags: ['后摇', '深夜'] },
    { id: 'd', tags: [] },
    { id: 'e', tags: ['爵士乐', '钢琴'] },
  ];

  it('mapsEachNormalizedTagToItsMembers', () => {
    const idx = buildTagIndex(members);
    expect(idx.get('jazz')).toEqual(['a', 'b', 'e']);
    expect(idx.get('深夜')).toEqual(['a', 'c']);
    expect(idx.get('钢琴')).toEqual(['a', 'e']);
  });

  it('omitsMembersWithNoUsableTags', () => {
    // 'd' 没有任何标签，不该出现在任何桶里——否则它会被所有查询召回。
    const idx = buildTagIndex(members);
    for (const ids of idx.values()) expect(ids).not.toContain('d');
  });

  it('sortsMemberIdsForDeterministicOutput', () => {
    // 倒排桶的顺序会决定同分候选的先后，进而在用户可见的推荐位上
    // 表现为「刷新一次换一批」。固定排序消除这个不确定性。
    const idx = buildTagIndex(members);
    for (const ids of idx.values()) {
      expect([...ids].sort()).toEqual(ids);
    }
  });

  it('toleratesMalformedMembersAndTags', () => {
    const idx = buildTagIndex([
      null,
      { id: 'x' },
      { id: 'y', tags: 'jazz' },
      { id: 'z', tags: [null, 42, '  '] },
      { tags: ['jazz'] },
    ]);
    // 只有 z 的 42 是可用输入（转成字符串键 '42'）；其余都无 id 或无有效标签。
    expect(idx.has('42')).toBe(true);
    expect([...idx.keys()].sort()).toEqual(['42']);
  });

  it('returnsAnEmptyMapForNonArrayInput', () => {
    expect(buildTagIndex(null).size).toBe(0);
    expect(buildTagIndex(undefined).size).toBe(0);
    expect(buildTagIndex({}).size).toBe(0);
    // 字符串是「类数组」陷阱：Array.isArray('a') 为 false，但写成
    // Array.from 或下标遍历就会把它拆成 ['a'] 并建出一个桶来。
    expect(buildTagIndex('a').size).toBe(0);
    expect(buildTagIndex({ 0: { id: 'a', tags: ['jazz'] } }).size).toBe(0);
  });

  it('acceptsAnEmptyArrayWithoutSubstitutingAnotherContainer', () => {
    // 空数组合法且必须得到空索引；若把 Array.isArray 判真分支写成字面量数组，
    // 传入的成员会被整个忽略——这条断言就是拦住那种写法。
    expect(buildTagIndex([]).size).toBe(0);
    expect(buildTagIndex([{ id: 'a', tags: ['jazz'] }]).get('jazz')).toEqual(['a']);
  });

  it('sortsBucketIdsRegardlessOfRegistrationOrder', () => {
    // 成员按什么顺序注册不该影响桶内容。若去掉桶内的 sort，桶就是插入序，
    // 同分候选的先后随注册顺序抖动，在用户可见的推荐位上表现为
    // 「刷新一次换一批」——这里用乱序注册把它钉死。
    const idx = buildTagIndex([
      { id: 'z', tags: ['jazz'] },
      { id: 'm', tags: ['jazz'] },
      { id: 'a', tags: ['jazz'] },
    ]);
    expect(idx.get('jazz')).toEqual(['a', 'm', 'z']);
  });
});

describe('canonicalizeTags', () => {
  it('foldsEverySpellingToTheSameKeySet', () => {
    // 「爵士」「Jazz」「爵士乐」是同一件事的三种写法，集合里只该留一个键。
    expect(canonicalizeTags(['爵士', 'Jazz', '爵士乐'])).toEqual(['jazz']);
    expect(canonicalizeTags(['後搖', 'post-rock'])).toEqual(['postrock']);
  });

  it('dropsUnusableEntriesAndSortsTheResult', () => {
    // 这一条要同时钉住两件事，且输入必须让它们可分辨：
    //   - 丢弃不可用项（空格、空串、null、非字符串）
    //   - 排序：输出顺序只由码元序决定，与书写顺序无关
    // 反面教材是 [' 爵士 ', '', null, '深夜'] —— 它去重后「恰好」已经是
    // ['jazz','深夜']，去掉 sort 也一样通过，等于没测到排序。
    // 用 ['深夜', '爵士'] 才逼得出来：书写序是深夜在前，码元序是 jazz 在前。
    expect(canonicalizeTags([' 爵士 ', '', null, '深夜'])).toEqual(['jazz', '深夜']);
    expect(canonicalizeTags(['深夜', '爵士'])).toEqual(['jazz', '深夜']);
    expect(canonicalizeTags(['b', 'a', 'm'])).toEqual(['a', 'b', 'm']);
    // 同一组标签换个写法顺序，结果必须逐字相同——这是「集合语义」的定义。
    expect(canonicalizeTags(['爵士', 'Jazz', '深夜'])).toEqual(canonicalizeTags(['深夜', 'JAZZ', '爵士乐']));
    expect(canonicalizeTags(null)).toEqual([]);
    expect(canonicalizeTags('jazz')).toEqual([]);
  });

  it('agreesWithTheRecallLayerOnTagIdentity', () => {
    // 这是本函数存在的全部理由：召回按归一键建桶，重排若用别的判等规则，
    // 就会出现「因共享标签被召回、却在重排里算出零重合」的自相矛盾。
    const me = canonicalizeTags(['爵士', '深夜']);
    const other = canonicalizeTags(['Jazz', '深夜']);
    const shared = me.filter((k) => other.includes(k));
    expect(shared).toEqual(['jazz', '深夜']);
    // 反向对照：不同概念不能被折到一起，否则重排会把不相似的人排前面。
    expect(canonicalizeTags(['摇滚']).filter((k) => canonicalizeTags(['金属']).includes(k))).toEqual([]);
  });
});

describe('recallByTags', () => {
  const members = [
    { id: 'a', tags: ['爵士', '深夜', '钢琴'] },
    { id: 'b', tags: ['Jazz', 'City Pop'] },
    { id: 'c', tags: ['后摇', '深夜'] },
    { id: 'd', tags: ['古典'] },
    { id: 'e', tags: ['爵士乐', '钢琴'] },
    { id: 'f', tags: ['深夜', '钢琴', '爵士'] },
  ];
  const index = buildTagIndex(members);

  it('ranksCandidatesBySharedTagCount', () => {
    // f 与 a 共享 3 个标签；e 共享 2 个（爵士、钢琴）；b 和 c 各共享 1 个
    // （b 是 jazz，c 是深夜）——同为 1 分，按 memberId 升序排。
    const out = recallByTags({ tags: ['爵士', '深夜', '钢琴'], index });
    expect(out.map((r) => r.memberId)).toEqual(['a', 'f', 'e', 'b', 'c']);
    expect(out.map((r) => r.sharedCount)).toEqual([3, 3, 2, 1, 1]);
  });

  it('excludesTheCallerItself', () => {
    // 成员 Agent 找的是「同类」，不是自己。不排除会让每次召回都把
    // 自己排在第一位，等于浪费一个候选位。
    const out = recallByTags({ tags: ['爵士', '深夜', '钢琴'], index, selfId: 'a' });
    expect(out.map((r) => r.memberId)).not.toContain('a');
  });

  it('breaksTiesByMemberIdForStableOrdering', () => {
    // a 和 f 都是 3 分；不加二级排序时顺序由 Map 插入序决定，
    // 会随成员注册顺序变化而产生无意义的抖动。
    const out = recallByTags({ tags: ['爵士', '深夜', '钢琴'], index });
    const top = out.filter((r) => r.sharedCount === 3).map((r) => r.memberId);
    expect(top).toEqual(['a', 'f']);
  });

  it('countsACandidateOnceEvenWithManySharedTags', () => {
    // 同一个候选可能在多个桶里出现；必须去重计数，否则共享 3 个标签
    // 的候选会被计成 3 次重复条目。
    const out = recallByTags({ tags: ['爵士', '深夜', '钢琴'], index });
    const ids = out.map((r) => r.memberId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('capsTheResultAtTheLimit', () => {
    const out = recallByTags({ tags: ['爵士', '深夜', '钢琴'], index, limit: 2 });
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.memberId)).toEqual(['a', 'f']);
  });

  it('treatsAnExplicitLimitOfZeroAsAnEmptyResult', () => {
    // limit:0 的语义是「一个都不要」，不是「用默认上限」。写成 `limit || default`
    // 会把 0 当假值丢掉，返回 50 个候选——上游想「只探测有无命中」时静默变重。
    expect(recallByTags({ tags: ['爵士'], index, limit: 0 })).toEqual([]);
  });

  it('treatsANegativeLimitAsNoCapRatherThanAnError', () => {
    // 负数不是合法上限但也不该被当成默认值：`limit >= 0` 为假即回落到默认。
    // 这里用「结果数少于默认上限」证明它确实回落，而不是被截成 0。
    const out = recallByTags({ tags: ['爵士'], index, limit: -1 });
    expect(out.map((r) => r.memberId)).toEqual(['a', 'b', 'e', 'f']);
  });

  it('excludesTheCallerOnlyWhenAnIdIsActuallyGiven', () => {
    // selfId 为 null/undefined 时表示「匿名查询」，此时不该排除任何人；
    // 若把 null 也拿去跟成员 id 比，就会静默少一个候选。
    const anonymous = recallByTags({ tags: ['爵士'], index, selfId: null });
    expect(anonymous.map((r) => r.memberId)).toEqual(['a', 'b', 'e', 'f']);
    const noArg = recallByTags({ tags: ['爵士'], index });
    expect(noArg).toEqual(anonymous);
  });

  it('stringifiesNumericSelfIds', () => {
    // 库里 id 是字符串，但调用方可能从 URL/JSON 拿到数字。不转换就永远
    // 匹配不上自己，等于没排除——每次都浪费一个候选位。
    const numeric = buildTagIndex([{ id: 0, tags: ['jazz'] }, { id: 1, tags: ['jazz'] }]);
    expect(recallByTags({ tags: ['jazz'], index: numeric, selfId: 0 }).map((r) => r.memberId))
      .toEqual(['1']);
  });

  it('foldsQueryTagsBeforeProbingTheIndex', () => {
    // 查询侧也要归一：成员把标签写成「jazz>」，查询写「JAZZ」时仍须命中
    // 同一个桶。若查询键没归一，索引建得再对也召不回人。
    const spaced = buildTagIndex([{ id: 'a', tags: ['jazz乐'] }, { id: 'b', tags: ['JAZZ'] }]);
    expect(recallByTags({ tags: ['JAZZ'], index: spaced }).map((r) => r.memberId)).toEqual(['a', 'b']);
  });

  it('skipsQueryKeysThatAreNotInTheIndex', () => {
    // 查询里有桶外的标签时，它们只是没有命中，不该中断其余标签的召回。
    const out = recallByTags({ tags: ['爵士', '从未出现的标签'], index });
    expect(out.map((r) => r.memberId)).toEqual(['a', 'b', 'e', 'f']);
  });

  it('defaultsTheLimitToTheConfiguredMaximum', () => {
    // 每个成员最多 20 个标签，理论上一个查询能召回全体成员。默认上限
    // 存在的意义是给下游的相似度重排一个可预算的候选集大小。
    const many = Array.from({ length: RECALL_LIMITS.MAX_CANDIDATES + 25 }, (_, i) => ({
      id: `m${String(i).padStart(3, '0')}`,
      tags: ['jazz'],
    }));
    const out = recallByTags({ tags: ['jazz'], index: buildTagIndex(many) });
    expect(out).toHaveLength(RECALL_LIMITS.MAX_CANDIDATES);
  });

  it('requiresAtLeastOneSharedTag', () => {
    // 0 共享的候选不该出现在结果里——那是「不相似」，不是「弱相似」。
    const out = recallByTags({ tags: ['古典'], index });
    expect(out.map((r) => r.memberId)).toEqual(['d']);
  });

  it('returnsEmptyWhenTheQueryHasNoUsableTags', () => {
    expect(recallByTags({ tags: [], index })).toEqual([]);
    expect(recallByTags({ tags: ['  '], index })).toEqual([]);
    expect(recallByTags({ tags: null, index })).toEqual([]);
  });

  it('returnsEmptyForAMissingIndex', () => {
    // 冷启动时索引可能尚未建立；调用方不该为此写分支。
    expect(recallByTags({ tags: ['jazz'], index: null })).toEqual([]);
    expect(recallByTags({ tags: ['jazz'] })).toEqual([]);
  });

  it('dedupesRepeatedQueryTags', () => {
    // 用户重复填了同一个标签（不同写法）时，不能让它在计数里重复加权，
    // 否则「写了三遍爵士」会压过「真有共同兴趣」。
    // 判据不能写成「分数等于某个数」——那种断言对两种实现都成立，等于没测。
    // 真正要证明的是等价：三种写法写全，与只写一种，召回结果必须逐字段相同。
    const spelledThreeWays = recallByTags({ tags: ['爵士', 'Jazz', '爵士乐'], index });
    const spelledOnce = recallByTags({ tags: ['爵士'], index });
    expect(spelledThreeWays).toEqual(spelledOnce);
    expect(spelledThreeWays.map((r) => r.sharedCount)).toEqual([1, 1, 1, 1]);
  });

  it('stillCountsGenuinelyDistinctTagsAlongsideDuplicateSpellings', () => {
    // 去重的反面风险是「顺手把不同标签也折掉了」。『爵士』写三遍再加一个
    // 『深夜』，分数只该是 2（jazz + 深夜），不是 4，也不该退化成 1。
    // 1 分那三个是 b/c/e，按 memberId 升序 —— b 与 c 同为 1 分，b 在前。
    const out = recallByTags({ tags: ['爵士', 'Jazz', '爵士乐', '深夜'], index });
    expect(out.map((r) => r.memberId)).toEqual(['a', 'f', 'b', 'c', 'e']);
    expect(out.map((r) => r.sharedCount)).toEqual([2, 2, 1, 1, 1]);
  });

  it('reportsSharedTagsForExplainability', () => {
    // A2A 的互动理由要能对用户解释「为什么推荐他」；共享标签是唯一
    // 可直接展示的依据，所以结果里必须带上，而不是只留一个分数。
    // 顺序固定用默认 sort（UTF-16 码元序），因为它要的是稳定，不是好看：
    // 同一对 (候选人, 查询) 每次都要给出同一个数组，否则前端 diff 会抖动。
    const out = recallByTags({ tags: ['爵士', '深夜'], index, selfId: 'z' });
    const a = out.find((r) => r.memberId === 'a');
    expect(a.sharedTags).toEqual(['jazz', '深夜']);
    // 再来一次必须逐字段相同——这是 explainability 可展示的前提。
    const again = recallByTags({ tags: ['深夜', '爵士'], index, selfId: 'z' });
    expect(again.find((r) => r.memberId === 'a').sharedTags).toEqual(['jazz', '深夜']);
  });

  it('rejectsANonMapIndexInsteadOfThrowing', () => {
    // 索引来自 buildTagIndex，但调用方可能传进一个还没建好的索引
    // （undefined、null）或者干脆传错类型。此时应当是「没有候选」，
    // 而不是 TypeError 冒到 route 层变成 500。
    for (const bogus of [undefined, null, [], {}, 'tags', 0]) {
      expect(recallByTags({ tags: ['爵士'], index: bogus })).toEqual([]);
    }
    // 空 Map 与「传错类型」走同一条出路，但语义不同：这里是真的没人。
    expect(recallByTags({ tags: ['爵士'], index: new Map() })).toEqual([]);
  });

  it('capsTheResultAtTheGivenLimit', () => {
    // 上限是 A2A 的性能闸门：一次主动互动不可能回访几百个候选。
    // limit 为 0 是有意义的取值（「先别给我候选」），不能当成 falsy 忽略掉。
    const all = recallByTags({ tags: ['爵士', '深夜', '钢琴'], index });
    expect(all.length).toBeGreaterThan(3);
    expect(recallByTags({ tags: ['爵士', '深夜', '钢琴'], index, limit: 3 }).map((r) => r.memberId))
      .toEqual(all.slice(0, 3).map((r) => r.memberId));
    expect(recallByTags({ tags: ['爵士', '深夜', '钢琴'], index, limit: 0 })).toEqual([]);
  });

  it('fallsBackToTheDefaultCapWhenTheLimitIsNotUsable', () => {
    // 省略、传负数、传非数字都退回 RECALL_LIMITS.MAX_CANDIDATES——
    // 这是「调用方没打算限制」，不是「限制成 0」，两者必须区分开。
    const members = Array.from({ length: RECALL_LIMITS.MAX_CANDIDATES + 12 }, (_, i) => ({
      id: `m${String(i).padStart(3, '0')}`,
      tags: ['爵士'],
    }));
    const bigIndex = buildTagIndex(members);
    const unbounded = recallByTags({ tags: ['爵士'], index: bigIndex });
    expect(unbounded.length).toBe(RECALL_LIMITS.MAX_CANDIDATES);
    expect(recallByTags({ tags: ['爵士'], index: bigIndex, limit: -1 }).length)
      .toBe(RECALL_LIMITS.MAX_CANDIDATES);
    expect(recallByTags({ tags: ['爵士'], index: bigIndex, limit: '3' }).length)
      .toBe(RECALL_LIMITS.MAX_CANDIDATES);
  });

  it('stringifiesTheCallerIdSoNumericIdsStillExcludeTheCaller', () => {
    // 索引里的成员 id 一律存成字符串（buildTagIndex 用 String 归一），
    // 所以 selfId 传数字时必须也转成字符串再比，否则排除会整个失效——
    // Agent 会把自己推荐给自己。
    const numeric = buildTagIndex([{ id: 3, tags: ['爵士'] }, { id: 'a', tags: ['爵士'] }]);
    const out = recallByTags({ tags: ['爵士'], index: numeric, selfId: 3 });
    expect(out.map((r) => r.memberId)).toEqual(['a']);
  });
});
