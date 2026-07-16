/**
 * Genre dictionary — replaces the flat keyword list in isGenreQuery.js.
 *
 * Each entry contains:
 * - aliases: alternative spellings (lowercase, matched case-insensitively)
 * - playlistQuery: search term for /cloudsearch?type=1000 (playlist search)
 * - seedArtists: representative artists for direct song search
 * - enhancedQuery: augmented keyword for /cloudsearch?type=1 (song fallback)
 * - neteaseStyleId: optional NetEase style tag ID for /style/song
 *
 * Matching priority:
 *   1.0 — exact key match (e.g. "jpop" === "jpop")
 *   0.9 — alias exact match (e.g. "j-pop" matches alias)
 *   0.5 — partial/contains match (e.g. "来点爵士" contains "爵士")
 */
const GENRE_DICT = {
  // ── Regional scenes ──
  jpop: {
    aliases: ['j-pop', 'j pop', '日流', '日本流行', '日语流行'],
    playlistQuery: '日语流行',
    seedArtists: ['YOASOBI', '米津玄师', 'Official髭男dism', 'Ado', 'King Gnu'],
    enhancedQuery: 'jpop 日语流行',
    neteaseStyleId: null,
  },
  kpop: {
    aliases: ['k-pop', 'k pop', '韩流', '韩语流行', '韩国流行'],
    playlistQuery: '韩语流行',
    seedArtists: ['BTS', 'BLACKPINK', 'IU', 'NewJeans', 'aespa'],
    enhancedQuery: 'kpop 韩语流行',
    neteaseStyleId: null,
  },
  cpop: {
    aliases: ['c-pop', 'c pop', '华语流行'],
    playlistQuery: '华语流行',
    seedArtists: ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋'],
    enhancedQuery: 'cpop 华语流行',
    neteaseStyleId: null,
  },
  citypop: {
    aliases: ['city pop', 'city-pop', '城市流行', '昭和'],
    playlistQuery: 'city pop',
    seedArtists: ['山下达郎', '松原みき', '竹内まりや', '大瀧詠一'],
    enhancedQuery: 'city pop 都市流行 日本',
    neteaseStyleId: null,
  },

  // ── Rock & metal ──
  rock: {
    aliases: ['摇滚'],
    playlistQuery: '摇滚',
    seedArtists: ['Queen', 'Nirvana', 'Coldplay', 'Oasis'],
    enhancedQuery: 'rock 摇滚',
  },
  metal: {
    aliases: ['金属', '重金属', 'heavy metal'],
    playlistQuery: '金属',
    seedArtists: ['Metallica', 'Iron Maiden', 'Slipknot'],
    enhancedQuery: 'metal 金属',
  },
  punk: {
    aliases: ['朋克'],
    playlistQuery: '朋克',
    seedArtists: ['Green Day', 'The Offspring', 'Blink-182'],
    enhancedQuery: 'punk 朋克',
  },
  shoegaze: {
    aliases: ['盯鞋', '鞋 gaze'],
    playlistQuery: '盯鞋',
    seedArtists: ['My Bloody Valentine', 'Slowdive', 'Ride'],
    enhancedQuery: 'shoegaze 盯鞋',
  },
  postrock: {
    aliases: ['后摇', 'post-rock', 'post rock'],
    playlistQuery: '后摇',
    seedArtists: ['Sigur Rós', 'Explosions in the Sky', 'Mogwai'],
    enhancedQuery: 'post rock 后摇',
  },

  // ── Electronic ──
  electronic: {
    aliases: ['电子', 'electronica'],
    playlistQuery: '电子音乐',
    seedArtists: ['Daft Punk', 'The Chemical Brothers', 'Deadmau5'],
    enhancedQuery: 'electronic 电子',
  },
  synthwave: {
    aliases: ['合成器浪潮', 'retrowave', 'outrun'],
    playlistQuery: 'synthwave',
    seedArtists: ['The Midnight', 'Gunship', 'Carpenter Brut'],
    enhancedQuery: 'synthwave 合成器',
  },
  house: {
    aliases: ['浩室'],
    playlistQuery: 'house',
    seedArtists: ['Disclosure', 'Frankie Knuckles', 'Robin Schulz'],
    enhancedQuery: 'house 浩室',
  },
  techno: {
    aliases: ['铁克诺'],
    playlistQuery: 'techno',
    seedArtists: ['Carl Cox', 'Richie Hawtin', 'Charlotte de Witte'],
    enhancedQuery: 'techno',
  },
  ambient: {
    aliases: ['氛围', '环境音乐'],
    playlistQuery: '氛围音乐',
    seedArtists: ['Brian Eno', 'Aphex Twin', 'Stars of the Lid'],
    enhancedQuery: 'ambient 氛围',
  },
  lofi: {
    aliases: ['lo-fi', 'lo fi', '低保真'],
    playlistQuery: 'lo-fi',
    seedArtists: ['Nujabes', 'J Dilla', 'Tomppabeats'],
    enhancedQuery: 'lo-fi 低保真',
  },

  // ── Jazz & blues ──
  jazz: {
    aliases: ['爵士'],
    playlistQuery: '爵士',
    seedArtists: ['Miles Davis', 'John Coltrane', 'Louis Armstrong'],
    enhancedQuery: 'jazz 爵士',
  },
  blues: {
    aliases: ['布鲁斯', '蓝调'],
    playlistQuery: '蓝调',
    seedArtists: ['B.B. King', 'Muddy Waters', 'Eric Clapton'],
    enhancedQuery: 'blues 蓝调',
  },
  soul: {
    aliases: ['灵魂'],
    playlistQuery: '灵魂乐',
    seedArtists: ['Aretha Franklin', 'Stevie Wonder', 'D\'Angelo'],
    enhancedQuery: 'soul 灵魂',
  },
  funk: {
    aliases: ['放克'],
    playlistQuery: '放克',
    seedArtists: ['James Brown', 'Parliament-Funkadelic', 'Bruno Mars'],
    enhancedQuery: 'funk 放克',
  },

  // ── Folk & acoustic ──
  folk: {
    aliases: ['民谣'],
    playlistQuery: '民谣',
    seedArtists: ['Bob Dylan', 'Leonard Cohen', 'Bon Iver'],
    enhancedQuery: 'folk 民谣',
  },
  acoustic: {
    aliases: ['原声', '不插电'],
    playlistQuery: 'acoustic',
    seedArtists: ['Iron & Wine', 'José González', 'Nick Drake'],
    enhancedQuery: 'acoustic 原声',
  },
  classical: {
    aliases: ['古典'],
    playlistQuery: '古典音乐',
    seedArtists: ['Mozart', 'Beethoven', 'Chopin'],
    enhancedQuery: 'classical 古典',
  },

  // ── Hip-hop & R&B ──
  hiphop: {
    aliases: ['嘻哈', 'hip-hop', 'hip hop', '说唱', 'rap'],
    playlistQuery: '嘻哈说唱',
    seedArtists: ['Kendrick Lamar', 'J. Cole', 'Eminem', 'Drake'],
    enhancedQuery: 'hip hop 嘻哈 说唱',
  },
  rnb: {
    aliases: ['r&b', 'rnb', '节奏布鲁斯'],
    playlistQuery: 'R&B',
    seedArtists: ['The Weeknd', 'Frank Ocean', 'SZA'],
    enhancedQuery: 'r&b',
  },

  // ── Asian styles ──
  gufeng: {
    aliases: ['古风', '国风'],
    playlistQuery: '古风',
    seedArtists: ['银临', '河图', '音频怪物'],
    enhancedQuery: '古风 国风',
  },

  // ── Instruments ──
  piano: {
    aliases: ['钢琴'],
    playlistQuery: '钢琴',
    seedArtists: ['Yiruma', 'Ludovico Einaudi', 'Chopin'],
    enhancedQuery: 'piano 钢琴',
  },
  guitar: {
    aliases: ['吉他'],
    playlistQuery: '吉他',
    seedArtists: ['Sungha Jung', 'Tommy Emmanuel', 'Antonio Lauro'],
    enhancedQuery: 'guitar 吉他',
  },
  violin: {
    aliases: ['小提琴'],
    playlistQuery: '小提琴',
    seedArtists: ['Itzhak Perlman', 'Lindsey Stirling', 'David Garrett'],
    enhancedQuery: 'violin 小提琴',
  },
  cello: {
    aliases: ['大提琴'],
    playlistQuery: '大提琴',
    seedArtists: ['Yo-Yo Ma', '2Cellos', 'Jacqueline du Pré'],
    enhancedQuery: 'cello 大提琴',
  },
  saxophone: {
    aliases: ['萨克斯', '萨克斯风'],
    playlistQuery: '萨克斯',
    seedArtists: ['Kenny G', 'John Coltrane', 'Stan Getz'],
    enhancedQuery: 'saxophone 萨克斯',
  },
  erhu: {
    aliases: ['二胡'],
    playlistQuery: '二胡',
    seedArtists: ['贾鹏芳', '宋飞', '陈军'],
    enhancedQuery: 'erhu 二胡',
  },
  guzheng: {
    aliases: ['古筝'],
    playlistQuery: '古筝',
    seedArtists: ['王中山', '袁莎', '常静'],
    enhancedQuery: 'guzheng 古筝',
  },
  pipa: {
    aliases: ['琵琶'],
    playlistQuery: '琵琶',
    seedArtists: ['方锦龙', '刘德海', '赵聪'],
    enhancedQuery: 'pipa 琵琶',
  },

  // ── Other ──
  reggae: {
    aliases: ['雷鬼'],
    playlistQuery: '雷鬼',
    seedArtists: ['Bob Marley', 'UB40', 'Ziggy Marley'],
    enhancedQuery: 'reggae 雷鬼',
  },
  country: {
    aliases: ['乡村'],
    playlistQuery: '乡村音乐',
    seedArtists: ['Johnny Cash', 'Taylor Swift', 'Luke Combs'],
    enhancedQuery: 'country 乡村',
  },
  disco: {
    aliases: ['迪斯科'],
    playlistQuery: '迪斯科',
    seedArtists: ['Bee Gees', 'Donna Summer', 'ABBA'],
    enhancedQuery: 'disco 迪斯科',
  },
  latin: {
    aliases: ['拉丁'],
    playlistQuery: '拉丁',
    seedArtists: ['Shakira', 'Enrique Iglesias', 'Bad Bunny'],
    enhancedQuery: 'latin 拉丁',
  },
  psychedelic: {
    aliases: ['迷幻', 'psychedelic rock'],
    playlistQuery: '迷幻',
    seedArtists: ['Pink Floyd', 'Tame Impala', 'King Gizzard'],
    enhancedQuery: 'psychedelic 迷幻',
  },
  dreampop: {
    aliases: ['梦幻流行', 'dream pop'],
    playlistQuery: '梦幻流行',
    seedArtists: ['Beach House', 'Cocteau Twins', 'Cigarettes After Sex'],
    enhancedQuery: 'dream pop 梦幻流行',
  },
  instrumental: {
    aliases: ['纯音乐', '器乐'],
    playlistQuery: '纯音乐',
    seedArtists: ['Joe Hisaishi', 'Hans Zimmer', 'Yiruma'],
    enhancedQuery: 'instrumental 纯音乐',
  },
  indie: {
    aliases: ['独立', 'independent'],
    playlistQuery: 'indie',
    seedArtists: ['Arctic Monkeys', 'The Strokes', 'Tame Impala'],
    enhancedQuery: 'indie 独立',
  },
  easylistening: {
    aliases: ['轻音乐', 'easy listening'],
    playlistQuery: '轻音乐',
    seedArtists: ['Richard Clayderman', 'Paul Mauriat', 'Mantovani'],
    enhancedQuery: '轻音乐 easy listening',
  },
  harmonica: {
    aliases: ['口琴'],
    playlistQuery: '口琴',
    seedArtists: ['Toots Thielemans', 'Stevie Wonder', 'Little Walter'],
    enhancedQuery: 'harmonica 口琴',
  },
};

/**
 * Match a user-provided text against the genre dictionary.
 * @param {string} text — raw user input
 * @returns {{key: string, entry: object, matchScore: number}|null}
 */
export function matchGenre(text) {
  const lower = (text || '').toLowerCase().trim();
  if (!lower) return null;

  // Phase 1: exact key match (score 1.0)
  for (const [key, entry] of Object.entries(GENRE_DICT)) {
    if (lower === key) {
      return { key, entry, matchScore: 1.0 };
    }
  }

  // Phase 2: exact alias match (score 0.9)
  for (const [key, entry] of Object.entries(GENRE_DICT)) {
    const aliases = entry.aliases || [];
    for (const alias of aliases) {
      if (lower === alias.toLowerCase()) {
        return { key, entry, matchScore: 0.9 };
      }
    }
  }

  // Phase 3: partial/contains match (score 0.5)
  // Check key first, then aliases, for longest-match priority
  let bestMatch = null;
  let bestLen = 0;
  for (const [key, entry] of Object.entries(GENRE_DICT)) {
    const candidates = [key, ...(entry.aliases || [])];
    for (const cand of candidates) {
      const candLower = cand.toLowerCase();
      if (lower.includes(candLower) && candLower.length > bestLen) {
        bestMatch = { key, entry, matchScore: 0.5 };
        bestLen = candLower.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Get a genre entry by its dictionary key.
 * @param {string} key
 * @returns {object|null}
 */
export function getGenreEntry(key) {
  return GENRE_DICT[key] || null;
}

/**
 * Return all genre keywords (keys + aliases) for backward compatibility
 * with isGenreQuery.
 * @returns {string[]}
 */
export function allGenreKeywords() {
  const keywords = [];
  for (const [key, entry] of Object.entries(GENRE_DICT)) {
    keywords.push(key);
    keywords.push(...(entry.aliases || []));
  }
  return keywords;
}
