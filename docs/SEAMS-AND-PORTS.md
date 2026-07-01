# Qclaudio 88.7 — 接缝点与 Port 接口契约

> 重构查阅文档。配合 `ARCHITECTURE.md` / `DOMAIN-MODEL.md` / `ABSTRACTION-LAYERS.md` 使用。
> 本文回答：**绞杀重构的每一条接缝（seam）在哪里、接口签名是什么、契约测试要验证什么。**
> 状态：接口契约定义。**本文档不实现任何接口，不改动代码。**

---

## 0. 什么是接缝点（Seam）

> 接缝 = 业务层与外部世界之间可以"切开并替换"的位置。
> 绞杀重构的本质：**在接缝处插入接口，让旧实现退到接口背后，再逐步替换。**

```
重构前:  业务代码 ──直接调用──▶ db/history.js / netease.js / tts.js (具体实现)

接缝插入: 业务代码 ──调用──▶ Port 接口  ◀──实现── infrastructure 适配器
                          (application/ports)      (包装旧实现)

最终:    旧实现退到接口背后，可整体替换而业务零改动
```

每个 Port 接口都是一道接缝。下面定义全部接缝点。

> 签名用 TypeScript 风格描述**契约**（项目是 JS，运行时不强制；契约靠测试守护）。

---

## 1. 存储接缝（Repository Ports）

> 现状：`db/history.js` 17 个散装函数被 6 个业务文件直接 import。
> 接缝：按聚合切成 7 个仓储接口。旧 history.js 函数退化为实现内部调用。

### 1.1 领域对象（接口进出只用这些，不用 DB 行）

```ts
// 跨接缝传递的领域形态 —— camelCase，无 snake_case，无 SQL 痕迹
type PlayRecord    = { songId: string; title: string; artist: string;
                       album: string; durationSec: number; source: string; playedAt?: string }
type SeedSong      = { songId: string; title: string; artist: string; album: string;
                       durationMs: number; source: string; genreTags: string[]; playCount: number }
type ChatMessage   = { role: 'user' | 'assistant'; content: string }
type ArtistCount   = { artist: string; count: number }
type QueueState    = { past: Song[]; current: Song | null; future: Song[]; mode: QueueMode; version: number }
type ListeningPlan = { planId: string; mood: string; blocks: PlanBlock[]; ... }
type ListenerProfile = { topArtists: ArtistCount[]; topGenres: string[]; totalSongs: number; ... }
type AuthCredential  = { cookie: string; userId: string; nickname: string; avatarUrl: string }
```

### 1.2 七个仓储接口

```ts
interface ListenHistoryRepository {
  record(play: PlayRecord): void
  recentSongIds(limit: number): string[]
  artistPlayCount(hours: number): ArtistCount[]
  history(limit: number): PlayRecord[]
}

interface SeedPoolRepository {
  upsert(song: SeedSong): void
  incrementPlayCount(songId: string): void
  all(limit: number): SeedSong[]
}

interface ListenerProfileRepository {
  get(): ListenerProfile          // 聚合 user_profile KV 表为一个领域对象
  set(key: string, value: unknown): void
}

interface ChatHistoryRepository {
  recent(limit: number): ChatMessage[]   // 已按时间正序
  append(role: string, content: string): void
}

interface QueueSnapshotRepository {
  save(state: QueueState): void
  latest(): QueueState | null
}

interface PlanRepository {
  save(plan: ListeningPlan, mood: string): void
  latest(): { plan: ListeningPlan; mood: string; generatedAt: string } | null
}

interface AuthRepository {
  saveCookie(cred: AuthCredential): void
  loadCookie(): string | null
}
```

### 1.3 映射点（实现层负责，关键防腐）

| DB 行 (DO, snake_case) | 领域对象 (camelCase) | 谁映射 |
|------------------------|---------------------|--------|
| `song_id, played_at, duration` | `songId, playedAt, durationSec` | Repository 实现 |
| `user_profile` 的 KV 行 → `JSON.parse(value)` | 聚合成 `ListenerProfile` | ListenerProfileRepository 实现 |
| `state_json` 字符串 → parse | `QueueState` 对象 | QueueSnapshotRepository 实现 |
| `plan_json` 字符串 → parse | `ListeningPlan` 对象 | PlanRepository 实现 |

---

## 2. 外部服务接缝（Service Ports）

### 2.1 LlmPort —— 消灭 claude.js / planner.js 重复 new OpenAI

```ts
interface LlmPort {
  // 一次性补全，可选 JSON 模式
  complete(messages: LlmMessage[], opts?: {
    maxTokens?: number; temperature?: number; jsonMode?: boolean
  }): Promise<string | null>          // 失败返回 null（不抛，由业务降级）

  // 流式，逐 token 回调
  stream(messages: LlmMessage[], opts?: {
    maxTokens?: number; temperature?: number
  }, onToken?: (t: string) => void): Promise<string | null>

  isConfigured(): boolean
}
type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }
```
> 现状：`claude.js` 和 `planner.js` 各自 `new OpenAI(...)`。接缝插入后两者共享一个 LlmPort 实现（DeepSeekAdapter）。

### 2.2 SpeechSynthPort —— 双引擎降级对业务透明

```ts
interface SpeechSynthPort {
  synthesize(text: string): Promise<string | null>   // 返回本地 audioUrl 或 null
  health(): { available: boolean | null; provider: 'dashscope' | 'edge' | null; reason: string }
}
```
> 现状：`tts.js` 内部 DashScope→Edge 降级 + Map 缓存。接缝后业务只看到"成功 url 或 null"，**降级策略封在实现内**（MW5）。

### 2.3 MusicSourcePort —— 网易云防腐层 ★最关键

```ts
interface MusicSourcePort {
  search(keywords: string, limit: number): Promise<Song[]>
  songUrl(songId: string): Promise<string | null>     // 内部做四级音质降级
  lyric(songId: string): Promise<Lyric | null>
  similar(songId: string): Promise<Song[]>
  personalFm(): Promise<Song[]>
  dailyRecommend(): Promise<Song[]>
  userPlaylists(uid: string): Promise<Playlist[]>
  playlistTracks(playlistId: string): Promise<Song[]>
  scrobble(songId: string): Promise<void>
}
// ★ Song 是统一领域形态，NeteaseAdapter 负责把 {id,name,ar,al,dt} 映射成它
type Song = { id: string; title: string; artist: string; album: string; durationMs: number; coverUrl?: string }
```
> **这是斩断 `song.ar/al/dt` 透传前端（ML2）的关键接缝。** NeteaseAdapter 在此把网易云原始字段映射成统一 `Song`，前端永不再见网易云字段。

### 2.4 WeatherPort

```ts
interface WeatherPort {
  current(): Promise<string>                    // 格式化字符串 "西安, 23°C, 阴, 湿度50%"
  setClientLocation(lat: number, lon: number): void
}
```

---

## 3. 中间件接缝（Infra Capability Ports）

### 3.1 EventPublisher —— 消灭 proactive🔴 反向依赖（最高优先）

```ts
interface EventPublisher {
  emit(event: string, payload?: unknown): void
  toClient(socketId: string, event: string, payload?: unknown): void
}
```
> 现状：`proactive.js` 直接 `import { EVENTS }` 并持有 `io` 调 `io.emit`（4 处）。
> 接缝后：proactive 接收注入的 `EventPublisher`，不再 import socket/events，不再碰 io。
> **这是绞杀第一刀**——切断唯一的内层→外层反向依赖。

### 3.2 CachePort —— 统一散落的 4 处自建 Map

```ts
interface CachePort {
  get(key: string): unknown | undefined
  set(key: string, value: unknown, ttlMs?: number): void
  has(key: string): boolean
}
```
> 现状：tts.js / scheduler.js / weather.js / router.js 各自建 Map。接缝后共享 CachePort，TTL/上限/淘汰策略统一在实现层。

### 3.3 CorpusPort + BlobStoragePort —— 消灭 domain 直连 fs

```ts
interface CorpusPort {                  // 读 user/*.md 偏好语料
  readTaste(): string
  readRoutines(): string
  readMoodRules(): string
  writeTaste(content: string): void     // recommender 自动生成画像时用
  writeRoutines(content: string): void
}

interface BlobStoragePort {             // TTS mp3 等二进制落盘
  write(name: string, data: Buffer): string   // 返回可访问 url
  exists(name: string): boolean
}
```
> 现状：context.js / recommender.js 直接 `fs.readFileSync/writeFileSync`；tts.js 直接 `fs.writeFileSync` 写 mp3。接缝后 domain/application 永不 import fs（MW3）。

---

## 4. 接缝插入顺序（绞杀路线对齐）

```
接缝切入优先级（从低风险到高风险）:

P0  EventPublisher        切 proactive🔴 反向依赖 —— 第一刀，孤立且明确
P1  WeatherPort           最简单的外部服务，验证 Port+DI 模式跑通
P1  SpeechSynthPort       封装已有降级逻辑，业务面零变化
P1  LlmPort               合并 claude/planner 的重复 OpenAI 实例
P2  7× Repository         按聚合逐个切，旧 history.js 函数退化为实现内部
P2  CachePort             收编 4 处散落 Map
P3  MusicSourcePort       ★最关键也最大——斩断网易云字段透传，需配套 DTO/VO
P3  CorpusPort/BlobPort   消灭 domain 的 fs 依赖
```

---

## 5. 每个接缝的 TDD 契约测试要求

> **铁律：接缝处的每个适配器实现，落地时必须先有失败的契约测试。**
> 契约测试 = 验证"实现满足接口语义"，而非验证内部细节。

| Port | 契约测试要验证（落地实现时先写这些 RED） |
|------|------------------------------------------|
| `*Repository` | 用真实 SQLite：record→recent 能读回；映射后字段是 camelCase 无 snake_case；空表返回 [] 不抛 |
| `LlmPort` | 未配置 key 时 isConfigured()=false 且 complete 返回 null（不抛）；jsonMode 解析失败返回兜底 |
| `SpeechSynthPort` | 主引擎失败时自动降级到备引擎；双失败返回 null；health() 反映当前 provider |
| `MusicSourcePort` | ★网易云原始 {id,name,ar,al,dt} 正确映射为统一 Song；songUrl 四级音质降级；空结果返回 [] |
| `EventPublisher` | emit 被调用时承载正确 event 名与 payload；不依赖真实 socket（可注入 spy） |
| `CachePort` | set 后 get 命中；TTL 过期后 get 返回 undefined；超上限淘汰最旧 |
| `CorpusPort` | 文件不存在返回 ''（不抛）；write 后 read 一致 |

> 现成样板：`speech-timer.js` 的 7 个测试展示了"纯对象 + 注入回调 + 假定时器"的契约测试写法，可复用到 EventPublisher / SpeechSession。

---

## 6. 接缝点总表（速查）

| # | Port | 切断的耦合 | 优先级 | 修复的违规 |
|---|------|-----------|--------|-----------|
| 1 | EventPublisher | proactive→socket/events | **P0** | 🔴 反向依赖 MW4 |
| 2 | WeatherPort | handler/planner/proactive→weather.js | P1 | MW2 |
| 3 | SpeechSynthPort | handler/proactive→tts.js | P1 | MW2 |
| 4 | LlmPort | claude/planner→OpenAI×2 | P1 | MW2 重复实例 |
| 5 | ListenHistoryRepository | scheduler→db | P2 | RP1 |
| 6 | SeedPoolRepository | recommender→db | P2 | RP1 |
| 7 | ListenerProfileRepository | recommender/claude/context→db | P2 | RP1 |
| 8 | ChatHistoryRepository | claude→db | P2 | RP1 |
| 9 | QueueSnapshotRepository | queue→db | P2 | RP1 |
| 10 | PlanRepository | planner→db | P2 | RP1 |
| 11 | AuthRepository | netease→cookie-store→db | P2 | RP1 |
| 12 | CachePort | tts/scheduler/weather/router 自建 Map | P2 | MW1 |
| 13 | MusicSourcePort | router/recommender/scheduler→netease | **P3** | ML2 字段透传前端 |
| 14 | CorpusPort | context/recommender→fs | P3 | MW3 |
| 15 | BlobStoragePort | tts→fs | P3 | MW3 |

---

## 7. 落地纪律

```
1. 每个接缝先在 application/ports/ 写接口（纯契约，无实现）
2. infrastructure 写适配器实现接口前，先写契约测试（RED）
3. 适配器实现让契约测试 GREEN —— 内部可直接复用旧 history.js/netease.js 逻辑
4. 业务代码改为依赖注入接口，删掉对具体实现的 import
5. 全程不破坏 R1-R9 不变量；speech-timer 的 7 个测试持续 GREEN
6. P0 EventPublisher 先行——它孤立、明确、消灭唯一反向依赖
```

**红线提醒：** 任何适配器实现代码落地，必须遵守 TDD 铁律——先有失败的契约测试，再写实现。本文档只定义契约，不含任何实现。
