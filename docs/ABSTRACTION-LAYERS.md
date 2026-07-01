# Qclaudio 88.7 — 抽象层规范（Repository · 中间件 · 模型隔离）

> 重构查阅文档。配合 `ARCHITECTURE.md`（四层规则）和 `DOMAIN-MODEL.md`（领域划分）使用。
> 本文回答：**核心能力如何抽象、技术变化如何隔离、数据对象如何分层不透传。**
> 状态：抽象设计 + 现状审计。**本文档不改动任何代码。**

---

## 一、存储抽象（Repository 仓储）

### 原则

```
业务层(domain/application) ──调用──▶ Repository 接口(application/ports)
                                          ▲
                                          │ 实现
                              基础设施层(infrastructure/persistence)
                                          │
                                       SQLite / 未来换 PG/ORM
```

业务层**只依赖接口**，永不 import `db/schema.js` 或 `db/history.js`。
未来换数据库 / 换 ORM / 加读写分离，只改 infrastructure，业务代码零改动。

### 现状（违规基线）

当前 `db/history.js` 暴露 **17 个散装函数**，被业务代码直接 import：

| 调用方 | 直接 import 的 db 函数 | 违规 |
|--------|----------------------|------|
| queue.js | getLatestQueueSnapshot / saveQueueSnapshot | ❌ 领域直连 DB |
| scheduler.js | recordListen | ❌ 领域直连 DB |
| recommender.js | getUserProfile / setUserProfile / getRecentSongIds / getSeedPool / upsertSeedPool / getArtistPlayCount | ❌ |
| claude.js | getChatHistory / saveChatMessage / getUserProfile | ❌ |
| context.js | getListenHistory / getUserProfile / getSeedPool | ❌ |
| planner.js | savePlan / getPlan | ❌ |

问题：函数散装、命名不统一（get/save/upsert/record 混用）、返回原始 DB 行（snake_case 透传）、JSON 序列化逻辑散落在 history.js 各处。

### 目标 Repository 接口（按聚合划分，定义于 application/ports）

> 按**领域聚合**而非数据表来划分仓储——一个仓储服务一个聚合根。

```
ListenHistoryRepository       (listen_history 表)
  record(play: PlayRecord): void
  recentSongIds(limit): string[]
  artistPlayCount(hours): ArtistCount[]
  history(limit): PlayRecord[]

SeedPoolRepository            (seed_pool 表)
  upsert(song: SeedSong): void
  incrementPlayCount(songId): void
  all(limit): SeedSong[]

ListenerProfileRepository     (user_profile 表 — KV)
  get(): ListenerProfile          ← 聚合所有 key/value 成一个领域对象
  set(key, value): void

ChatHistoryRepository         (chat_history 表)
  recent(limit): ChatMessage[]
  append(role, content): void

QueueSnapshotRepository       (queue_snapshot 表)
  save(snapshot: QueueState): void
  latest(): QueueState | null

PlanRepository                (plan_cache 表)
  save(plan: ListeningPlan, mood): void
  latest(): { plan, mood, generatedAt } | null

AuthRepository                (netease_auth 表)
  saveCookie(cookie, profile): void
  loadCookie(): string | null
```

### 接口契约规则

```
RP1  接口定义在 application/ports/，用领域语言命名（recent 而非 SELECT...LIMIT）
RP2  接口入参/返回值只用领域对象 / DTO / 原始类型，绝不暴露 DB 行 / SQL / snake_case
RP3  JSON 序列化/反序列化封在 infrastructure 实现内，接口层进出都是结构化对象
RP4  一个聚合一个仓储；跨聚合查询走 application 编排，不在仓储里 join
RP5  infrastructure 实现负责 字段名映射（song_id ↔ songId）、类型转换、错误兜底
```

---

## 二、中间件抽象（缓存 / 消息 / 文件存储 / 外部服务）

### 原则

所有"通用基础能力"统一抽象为 Port，业务代码不耦合具体中间件实现。

### 现状审计 — 散落的中间件耦合

| 能力 | 当前实现 | 直接耦合方 | 抽象目标 Port |
|------|---------|-----------|--------------|
| **缓存** | `tts.js` 内 `Map`（100 条上限）；`scheduler.js` 内 `audioUrlCache Map`；`weather.js` 内 15min TTL 变量；`router.js` LRU | 各 service 自建 Map，散落无统一策略 | `CachePort { get/set/has, ttl }` |
| **LLM 调用** | `claude.js` / `planner.js` 各自 `new OpenAI(...)` | 两处重复实例化 DeepSeek 客户端 | `LlmPort { complete, stream }` |
| **语音合成** | `tts.js` DashScope+Edge 双引擎 | handler/proactive 直接 import | `SpeechSynthPort { synthesize }` |
| **文件存储** | `tts.js` `fs.writeFileSync` 写 mp3；`recommender.js` `fs.writeFileSync` 写 user/*.md；`context.js` `fs.readFileSync` 读语料 | 三处直接 fs 操作 | `BlobStoragePort { read/write }` + `CorpusPort` |
| **音乐源** | `netease.js` HTTP 调 localhost:3000 | router/recommender/scheduler 直接 import | `MusicSourcePort` |
| **天气** | `weather.js` 多级地理定位 | handler/planner/proactive 直接 import | `WeatherPort { current }` |
| **实时消息** | Socket.IO `io.emit` | proactive🔴/handler 直接调 | `EventPublisher { emit }` |

### 中间件抽象规则

```
MW1  缓存统一走 CachePort——业务代码不再自建 Map；TTL/上限/淘汰策略由实现层决定
MW2  外部服务（LLM/TTS/音乐/天气）一律 Port 化，infrastructure 实现可热插拔双引擎/降级
MW3  文件 IO 走 BlobStoragePort / CorpusPort——domain 永不 import fs
MW4  消息发射走 EventPublisher——domain/application 永不持有 io / 不调 socket.emit
     (修复 proactive.js → socket/events.js 反向依赖🔴)
MW5  降级策略（DashScope→Edge、DeepSeek→fallback）封在 infrastructure 实现内，
     对业务层透明——业务只看到"synthesize 成功或返回 null"
```

---

## 三、模型隔离（DO / DTO / VO / 领域对象）

### 四种模型的定义与边界

```
┌──────────┬─────────────────────────┬──────────────┬──────────────────┐
│ 模型      │ 含义                     │ 存在层        │ 字段风格          │
├──────────┼─────────────────────────┼──────────────┼──────────────────┤
│ DO       │ 数据库对象               │ infrastructure│ snake_case        │
│ Database │ 直接对应表行             │ 仅持久化内部  │ song_id, played_at│
├──────────┼─────────────────────────┼──────────────┼──────────────────┤
│ Domain   │ 领域对象                 │ domain        │ 业务语言          │
│ Object   │ 带行为与不变量            │              │ Playhead, Queue   │
├──────────┼─────────────────────────┼──────────────┼──────────────────┤
│ DTO      │ 传输对象                 │ application   │ camelCase         │
│          │ 跨层/进程传输的纯数据     │ ↔ interface  │ songId, startedAt │
├──────────┼─────────────────────────┼──────────────┼──────────────────┤
│ VO       │ 视图对象                 │ interface →  │ 前端所需形态      │
│ View     │ 前端渲染所需             │ client       │ 裁剪+格式化       │
└──────────┴─────────────────────────┴──────────────┴──────────────────┘

转换链： DO ──(Repository实现)──▶ Domain ──(Service)──▶ DTO ──(Adapter)──▶ VO
         snake_case            业务对象              camelCase         前端形态
```

### 铁律

```
ML1  DO 绝不越过 infrastructure 边界——表行(snake_case)止步于 Repository 实现内
ML2  禁止数据库表结构直接透传到前端
ML3  每跨一层做一次显式映射，不传裸对象
ML4  改表结构只影响 DO↔Domain 的映射（一处），不波及 DTO/VO/前端
```

### 现状审计 — 严重的模型透传

> 当前**完全没有模型隔离**，DB 行结构一路透传到前端：

| 透传链 | 现状 | 违规 |
|--------|------|------|
| `getListenHistory()` → `SELECT *` → 业务 | 直接返回 `getAsObject()` 原始行，`song_id/played_at/skipped` 等 snake_case 字段直达调用方 | ❌ ML1 DO 越界 |
| `getUserProfile()` → 业务 → DJ prompt | KV 表的 value 在 history.js 里 `JSON.parse`，但结构未定义，裸对象流转 | ❌ 无 DTO |
| 网易云歌曲对象 → queue → socket → 前端 | 网易云 API 原始 song 对象（`ar`/`al`/`dt`/`id`）**原封不动**经 scheduler→socket→client | ❌ ML2 外部结构透传到前端 |
| `getState()` → socket emit | scheduler 直接 emit 内部 playhead 结构 | ⚠️ 无 VO 裁剪 |

**典型问题：** 前端 `App.jsx` 直接读 `song.ar`、`song.al`、`song.dt`——这些是**网易云 API 的字段名**，等于网易云的接口结构透传到了 React 组件。一旦网易云改字段或换音乐源，前端跟着崩。

### 目标模型映射示例

```
歌曲 Song：
  DO(seed_pool表)   { song_id, title, artist, album, duration, genre_tags }
  网易云原始         { id, name, ar:[{name}], al:{name}, dt }
  Domain(Song)      { id, title, artist, album, durationMs }       ← 统一内部表示
  DTO(SongDTO)      { id, title, artist, album, durationMs }       ← 跨层传输
  VO(前端)          { id, title, artist, coverUrl, durationLabel } ← 裁剪+格式化

转换点：
  网易云原始 → Domain   由 MusicSourcePort 实现层(NeteaseAdapter)做映射 ★关键防腐点
  DO → Domain          由 Repository 实现层做映射
  Domain → DTO         由 application service 做
  DTO → VO             由 interface/socket adapter 做
```

---

## 四、抽象层与四层架构的对应

```
interface/      ← VO 在此生成；EventPublisher 实现；不碰 DO
   │
application/    ← DTO 在此流转；定义所有 Port 接口；编排但不实现
   │  ports/    ← Repository接口 + CachePort + LlmPort + ... 全部接口契约
   │
infrastructure/ ← DO↔Domain 映射在此；Repository/中间件 实现；防腐层
   │
domain/         ← 纯 Domain 对象；零 IO；不知 DO/DTO/VO 存在
```

---

## 五、重构落地顺序（配合绞杀路线）

```
步骤1  定义 ports/ 下所有接口契约（纯接口，不实现）—— 接缝点
         Repository × 7 + CachePort + LlmPort + SpeechSynthPort
         + MusicSourcePort + WeatherPort + EventPublisher + BlobStoragePort

步骤2  infrastructure 实现接口，包装现有 db/history.js / netease.js / tts.js 等
         此时做 DO→Domain 字段映射（防腐层落地）

步骤3  业务代码改为依赖注入接口，删除对 db/history / netease / tts 的直接 import
         先消灭 proactive→socket/events 反向依赖🔴（注入 EventPublisher）

步骤4  建立 DTO/VO 转换，斩断网易云字段对前端的透传（ML2）

步骤5  配 import 边界 lint，强制 RP/MW/ML 规则
```

**护栏（TDD）：** 每定义一个 Repository 接口，先写"实现层契约测试"（用真实 SQLite 验证实现满足接口语义），再让旧 history.js 函数退化为实现内部调用。`speech-timer.js` 的 7 个测试是 domain 纯对象的样板。

---

## 六、规则速查

| 类别 | 规则 | 一句话 |
|------|------|--------|
| Repository | RP1-RP5 | 业务只调接口，DB 行止步于实现层 |
| 中间件 | MW1-MW5 | 缓存/LLM/TTS/文件/消息全部 Port 化，domain 不碰 fs/io |
| 模型隔离 | ML1-ML4 | DO 不越界，表结构不透传前端，每跨层一次映射 |

**最高频违规（重构第一批要消灭的）：**
1. 🔴 `proactive.js` 持有 io 调 emit（违 MW4）
2. ❌ 网易云 song 对象透传到前端 `song.ar/al/dt`（违 ML2）
3. ❌ `db/history.js` 17 个散装函数被业务直接 import（违 RP1）
