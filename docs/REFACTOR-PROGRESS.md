# Qclaudio 88.7 — 绞杀重构进度看板

> 实时反映重构进度、优先级、收益目标、灰度迁移状态。
> 配合 `ARCHITECTURE-BASELINE.md` / `TARGET-DIRECTORY.md` / `SEAMS-AND-PORTS.md` 使用。
> **进度以工具输出为准**：`npm run arch:check` 的 error 数 = 剩余架构债。

---

## 2026-07-12 P3 Legacy Lint 清零 + handler.js 绞杀完成 + 遗留债务审计

### 基线快照

```
测试：   451 passed (82 files) ✅
架构：   0 error, 1 warn (PlaybackService orphan) / 111 modules / 126 dependencies
Lint：   0 errors, 0 warnings ✅ (全目录 server/ --max-warnings 0 通过)
domain/：38 纯文件 (8 子域)
application/：11 services + 17 port 契约
infrastructure/：19 legacy adapters
services/：12 遗留文件 (2,482 行)
阶段：   P0✅ P1✅ P2✅ P3✅ — 绞杀优先级队列全清
```

### P3 完成项

**proactive.js 复杂度重构 (P2→P3)**
- 16 characterization tests 覆盖 disabled state、active speech guard、queue/plan context、TTS failure fallback
- `decideProactiveSpeech` 复杂度 31→≤10，提取 `canAttemptProactiveSpeech`、`buildProactiveContext`、`streamMessageTokens`、`maybeSynthesizeSpeech`

**recommender.js 复杂度重构 (P2→P3)**
- 43 characterization tests 覆盖 fillQueue、fillQueueByPreference、_buildSeedPool、fetch helpers、plan progress
- `fillQueue` 复杂度 23→~4，`fillQueueByPreference` 18→~4，`_buildSeedPool` 12→~2
- 提取 11 个聚焦函数：`_collectPlaylistSongs`、`_collectLikedSongs`、`_addSeedSong`、`_computeTopArtists`、`_resolveActiveBlockHints`、`_buildFillStrategies`、`_collectFromStrategies`、`_commitFillResult`、`_fillFromSeedPool`、`_fillFromSearch`、`_fillFromGenericFallback`

**Legacy lint 全清 (P3)**
- 20 warnings → 0 warnings，涉及文件：
  - `recommenderRules.js` 复杂度 17→~3 (destructuring track)
  - `LegacyNeteaseMusicSourceAdapter.js` 复杂度 17→3 (extractLyricField helper)
  - `weather.js` 复杂度 12→~5 (extractCityFromAddress, tryIpipLocation, parseIpipText)
  - `tts.js` 复杂度 15→~7 (checkDashscopeHealth, parseDashscopeError, downloadOssAudio)
  - `server.js` 复杂度 11→~2 (displayTtsHealthBanner, restoreNeteaseSession)
  - `claude.js` 复杂度 16→~6 (resolveSongTitle, buildColdOpenMessages, emitColdOpenFallback, emitStreamFallback)
  - `handler.js` 复杂度 12→~6 (logChatRoute, emitChatTurnResults)
  - `db/schema.js` 行数 81→<80 (createTables helper)
  - `dj-speech-service.test.js` 复杂度 11→~2 (destructuring + spread)
  - `router.js`、`cookie-store.js`、`proactive-characterization.test.js` 等 unused vars / prefer-template 清理

**handler.js god-object 绞杀完成 (P3)**
- `setupSocketHandler` 从 304 行 → ~20 行，仅负责组装依赖和委托
- 提取 14+ 个聚焦函数：`wireSchedulerCallbacks`、`triggerColdStart`、`handleChatMessage`、`onNewConnection`、`wireClientReady`、`wireAuthEvents`、`wirePlayerControls`、`wireChatAndCrabEvents`、`wireSpeechAndPlanEvents`、`wireLifecycleEvents`、`startRecurringTasks`、`startChatAnnouncement`、`logChatRoute`、`emitChatTurnResults`
- 结构测试更新：5 个 between-marker slice 测试改为全文件搜索，2 个隐脆性 marker 修复
- `deps` 对象模式 + `getConnectedClients()`/`setConnectedClients()` 闭包管理共享状态

### 遗留债务审计：未绞杀代码清单

#### services/ 目录 — 12 个遗留文件 (2,482 行)

| 文件 | 行数 | D1 违规 | D2 违规 | domain 提炼数 | 绞杀状态 |
|------|------|---------|---------|:---:|----------|
| `recommender.js` | 400 | 5 infra 直连 | 间接 fs | 4 | 🟡 编排逻辑未拆 |
| `claude.js` | 328 | 4 infra 直连 | **fs 硬违规** | 4 | 🟡 prompt 构建+LLM 编排未拆 |
| `scheduler.js` | 320 | 2 infra 直连 | 无 | 5 | 🟡 domain 最深但编排仍重 |
| `tts.js` | 218 | config + SDK | **fs 硬违规** | 1 | 🔴 应整体移入 infrastructure |
| `netease.js` | 201 | authRepo 直连 | 无 | 0 | 🔴 infrastructure 实现错放 services/ |
| `planner.js` | 186 | 3 infra 直连 | 无 | 2 | 🟡 缓存+校验逻辑未提炼 |
| `router.js` | 168 | musicSource 直连 | 无 | 4 | 🟡 最接近完成，`isFastRoute` 重复 |
| `context.js` | 151 | 4 infra 直连 | 间接 fs | 1 | 🟡 6 槽组装逻辑未提炼 |
| `weather.js` | 145 | config 直连 | 无 | 1 | 🔴 应整体移入 infrastructure |
| `queue.js` | 138 | queueSnapshotRepo 直连 | 无 | 0 | 🔴 纯 domain 逻辑未提炼 |
| `proactive.js` | 127 | 2 infra 直连 | 无 | 2 | 🟡 门控逻辑 `canAttemptProactiveSpeech` 应入 domain |
| `speech-timer.js` | 101 | **无违规** | **无违规** | N/A | ✅ 最干净，可直接移入 domain |

#### 反向依赖（infrastructure → services）

```
infrastructure/music/LegacyNeteaseMusicSourceAdapter.js  → services/netease.js  ⚠️
infrastructure/environment/LegacyWeatherAdapter.js        → services/weather.js  ⚠️
infrastructure/speech/LegacySpeechSynthAdapter.js         → services/tts.js      ⚠️
```

三个适配器是薄包装器，实际实现仍在遗留服务中。绞杀中间态：端口契约已建，实现未迁移。

#### services → services 耦合链

```
planner.js    → context.js
proactive.js  → claude.js, context.js
recommender.js → queue.js
router.js     → claude.js
scheduler.js  → queue.js, speech-timer.js
```

#### 可立即移动的文件（无需重构）

| 文件 | 目标位置 | 原因 |
|------|---------|------|
| `speech-timer.js` | `domain/playback/` | 零违规纯逻辑 |
| `netease.js` | `infrastructure/netease/` | 本质是 infrastructure HTTP 实现 |
| `weather.js` | `infrastructure/environment/` | 合并到 LegacyWeatherAdapter |
| `tts.js` | `infrastructure/speech/` | 合并到 LegacySpeechSynthAdapter |

#### 已基本完成绞杀

| 文件 | 状态 | 遗留项 |
|------|------|--------|
| `handler.js` (475 行) | ✅ 接口层重构完成 | `startRecurringTasks` 仍直连遗留服务 |
| `bootstrap.js` (141 行) | ✅ 组装根结构正确 | 待遗留服务被替代后逐步移除 import |
| `server.js` (322 行) | 🟡 HTTP 接口层 | 7 个 REST 端点直连遗留服务 |

### 微服务化可行性分析

#### 已有微服务

`microservices/image-generator/` — Python/FastAPI, HTTP REST, :8288
- 独立部署、Pydantic 强类型、环境变量配置、`GET /api/health` 健康检查
- 无 WebSocket、无 IPC、无共享状态

#### 微服务化候选

| 模块 | 可行性 | 优先级 | 协议 | 主要障碍 |
|------|:---:|:---:|------|------|
| **音乐源服务** | 高 | P1 | HTTP REST | Cookie 状态迁移；NeteaseCloudMusicApi 已是子进程 |
| **TTS 语音合成** | 高 | P1 | HTTP REST | 音频文件服务；Port 契约仅 2 方法 |
| **LLM 服务** | 中 | P2 | HTTP REST + SSE | 流式 token 传输需 SSE；prompt 构建逻辑归属 |
| **天气服务** | 中 | P3 | HTTP REST | 收益有限，功能过简单 |
| 播放调度器 | **不可行** | — | — | 实时定时器 + 内存状态 + Queue 共享 |
| 歌曲队列 | **不可行** | — | — | 进程内单例 + 高频同步访问 |
| 应用服务层 | **不建议** | — | — | 编排扇出 + 延迟叠加 |

**核心结论**：DDD 架构（Port + Adapter）为微服务化提供理想基础。外部 API 依赖类模块（音乐/TTS/LLM）可低成本拆分，仅需将防腐层适配器从进程内调用改为 HTTP 客户端。实时状态管理类模块必须保留在主进程内。

#### 微服务拆分的 Port 适配改造点

拆分后 **Application Service 和 Port 契约零修改**，仅改 `infrastructure/` 下适配器实现：

```javascript
// 改造前 (LegacySpeechSynthAdapter.js)
import { generateSpeech } from '../../services/tts.js';
async synthesize(text) { return await legacy.generateSpeech(text); }

// 改造后 (HttpSpeechSynthAdapter.js)
async synthesize(text) {
  const res = await fetch(`${TTS_SERVICE_URL}/api/synthesize`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  return data.audio_url || null;
}
```

### 下一阶段优先级

| 顺序 | 待办 | 紧急度 | 预期收益 | 风险 | 验收信号 |
|------|------|--------|----------|------|----------|
| **P4-a** | 移动 `speech-timer.js` → `domain/playback/` | 低 | 零违规文件归位 | 极低 | 测试全绿 |
| **P4-b** | 移动 `netease.js`/`weather.js`/`tts.js` → `infrastructure/` | 中 | 消除 3 条反向依赖 | 低 | arch:check 0 warn |
| **P4-c** | 提炼 `queue.js` 队列逻辑到 `domain/playback/` | 中 | 消除 1 条 services→infra 直连 | 中 | characterization tests |
| **P4-d** | 提炼 `context.js` 6 槽组装 + `getTimeOfDayMood` 到 domain | 中 | prompt 组装纯化 | 中 | domain rules tests |
| **P4-e** | 拆 `claude.js` prompt 构建到 infrastructure writer | 高 | 消除 D2 fs 硬违规 + 328 行最大遗留之一 | 高 | characterization tests |
| **P4-f** | 微服务化 TTS（首个微服务拆分试点） | 中 | 验证 Port→HTTP 适配模式 | 中 | HTTP 适配器测试 |
| **P4-g** | 微服务化音乐源 | 中 | 消除 NeteaseCloudMusicApi 子进程管理 | 中 | HTTP 适配器测试 |
| **P4-h** | 前端 Song 稳定字段迁移 | 中 | 防腐层最后一段外露债 | 中 | grep 无 ar/al/dt |

> 建议下一刀：先做 P4-a/P4-b（零风险归位），再按 P4-c→P4-d→P4-e 深化绞杀，最后 P4-f/P4-g 微服务化。

---

## 2026-07-05 Agent Turn Service Update

- Completed next backend strangler node: `CHAT_MESSAGE` turn orchestration now goes through `AgentTurnService`.
- Added pure domain rules in `server/domain/agent/agentTurnRules.js` for search tool text, tool-result selection, recommendation snapshot retention, and exec trace construction.
- Added `IntentRouterPort` and `LegacyIntentRouterAdapter`; `socket/handler.js` no longer imports or calls `routeIntent` directly.
- `socket/handler.js` chat branch no longer performs direct intent routing, recommendation action orchestration, search-result queue insertion, weather lookup, or context assembly. It now delegates to `agentTurnService.handleMessage(...)`, emits returned payloads, then calls `StreamingConversationService`.
- New tests added: `agent-turn-rules.test.js`, `agent-turn-service.test.js`, `intent-router-adapter.test.js`.
- Current verified baseline: `npm test` 316 passed / 68 files; `npm run arch:check` 0 dependency violations / 94 modules / 144 dependencies; `npm run lint` 0 errors / 38 warnings.
- Immediate next recommended cuts: wrap legacy `chatWithDj` behind a streaming chat port; extract direct `plan:*` socket handlers into an application service; continue moving stable event emission behind `EventPublisher`.

## 2026-07-05 Streaming Chat Port Update

- Completed the next agent seam: `StreamingConversationService` now consumes `StreamingChatPort` via `chat.stream(text, contextPrompt)`.
- Added `LegacyStreamingChatAdapter` around legacy `chatWithDj`; `socket/handler.js` no longer imports `chatWithDj` directly.
- New test added: `streaming-chat-adapter.test.js`; `streaming-conversation-service.test.js` now drives the port-shaped dependency.
- Closed the remaining handler-to-`services/claude.js` chat seam: DJ readiness now uses `deepSeekLlmAdapter.isConfigured()` and `socket/handler.js` has a static regression test preventing direct legacy Claude imports.

## 2026-07-05 Direct Plan Block Service Update

- Completed another socket-handler strangler node: direct `plan:select-block`, `plan:pin-block`, and `plan:clear-selection` events now delegate to `PlanBlockService`.
- Added pure domain rules in `server/domain/curation/planBlockRules.js` for direct plan progress patches, plan-update payload shaping, and refill eligibility.
- Added `server/application/services/PlanBlockService.js`; legacy `recommender._planProgress` mutation and `fillQueue(12, blocks)` calls are now behind an application service seam.
- `socket/handler.js` now only emits the returned `queueUpdate` and `planUpdate` payloads for these direct plan block events.
- New tests added: `plan-block-rules.test.js`, `plan-block-service.test.js`; `socket-handler-loads.test.js` now prevents handler regressions back to direct plan mutation/refill logic.
- Current verified baseline after this cut: `npm test` 327 passed / 70 files; `npm run arch:check` 0 dependency violations / 96 modules / 146 dependencies; `npm run lint` 0 errors / 37 warnings.
- Immediate next recommended cuts: keep shrinking `socket/handler.js` by moving `CRAB_CLICK` and `dj-speech-finished` into small application services, or deepen `proactive.js` with characterization tests before extracting its remaining policy flow.

## 2026-07-05 Current Priority Snapshot

Current progress:

- Backend strangler work is now centered on the socket/application seam. `CHAT_MESSAGE`, chat streaming, direct plan block events, auth, cold start, playback controls, song request, and DJ transition/refill speech all have application-service seams.
- `CRAB_CLICK` now delegates to `CrabInteractionService`, with pure rules in `domain/hosting/crabInteractionRules.js`.
- Latest verified baseline: `npm test` 338 passed / 72 files; `npm run arch:check` 0 dependency violations / 98 modules / 148 dependencies; `npm run lint` 0 errors / 37 warnings.
- `socket/handler.js` is thinner but still the largest orchestration hotspot. Remaining visible branches include `dj-speech-finished`, recurring queue refill, hourly mood refresh, and proactive polling.
- Highest remaining risk modules by lint/complexity signal: `services/proactive.js`, `services/recommender.js`, `services/claude.js`, `services/netease.js`, and `server.js` bootstrap.

Current priority order:

| Priority | Target | Why now | Expected benefit | Acceptance signal |
| --- | --- | --- | --- | --- |
| **P0 Guardrail** | Keep test/architecture/lint baseline | Every cut must stay reversible and behavior-preserving | Prevents strangler work from turning into a rewrite | `npm test` green, `npm run arch:check` 0 violations, lint 0 errors |
| **P1 Backend seam** | Extract `dj-speech-finished` completion flow | It mixes cold-start completion, normal speech completion, scheduler state, and queue emit payloads | Locks R1 "radio never silent" completion behavior behind application tests | TDD service tests for cold-start/chat/transition completion branches |
| **P1 Characterization first** | Add characterization tests around `proactive.js` before deeper extraction | Complexity is high and behavior is timing/state sensitive | Makes the next proactive-policy extraction safer | Tests cover disabled state, active speech guard, queue/plan context, TTS failure fallback |
| **P2 Product debt** | Frontend reads stable `Song` fields only | MusicSourcePort already emits stable Song, but UI still has old NetEase field compatibility | Completes anti-corruption layer toward replacing music source later | `rg "song\\.(ar|al|dt)|\\.ar\\b|\\.al\\b|\\.dt\\b" client` has no business reads |
| **P2 Core depth** | Continue `scheduler` / `recommender` rule extraction | High value but higher behavioral risk than handler seams | More playback and recommendation rules move into domain/application | New pure-rule tests plus existing scheduler/recommender regression tests pass |
| **P3 Cleanup** | Reduce legacy lint warnings | Useful but not architecturally blocking | Lower noise so real hotspots stand out | Warning count drops without broad formatting churn |

Recommended next node:

1. Extract `dj-speech-finished`, which is the next highest-value socket branch and touches playback completion behavior.
2. Then add characterization tests around `proactive.js`, before changing its timing/state-sensitive flow.
3. Keep frontend stable `Song` field migration as the next product-facing anti-corruption task.

## 2026-07-05 Crab Interaction Service Update

- Completed the next priority backend seam: `CRAB_CLICK` now delegates to `CrabInteractionService`.
- Added pure rules in `server/domain/hosting/crabInteractionRules.js` for skip detection, immediate animation selection, and delayed idle reset timing.
- Added `server/application/services/CrabInteractionService.js`; scheduler skip remains injected and socket/timer side effects stay in `socket/handler.js`.
- `socket/handler.js` no longer contains the inline `switch (interaction)` branch for crab clicks.
- New tests added: `crab-interaction-rules.test.js`, `crab-interaction-service.test.js`; `socket-handler-loads.test.js` now prevents regression back to inline crab click control flow.
- Current verified baseline after this cut: `npm test` 338 passed / 72 files; `npm run arch:check` 0 dependency violations / 98 modules / 148 dependencies; `npm run lint` 0 errors / 37 warnings.
- Immediate next recommended cut: extract `dj-speech-finished` into an application service with characterization tests for cold-start completion, chat/chat-announce no-op completion, and normal transition speech completion.

---

## 0. 当前基线快照（核对时点）

```
测试：   305 passed (64 files)
架构：   ✔ 0 error, 0 warn —— dependency-cruiser 覆盖 domain/application/infrastructure/services/socket/db/utils
domain/：31 纯文件
  auth/authSessionRules · environment/formatWeather · playback/{transitionTiming,playheadRules,transitionLifecycle,listenHistoryRecord}
  hosting/{cleanTtsText,artistName,fallbackTransitionScript,isLlmConfigured,djSpeechRules,
           buildProactivePrompt,buildTransitionPrompt,proactiveContextLines,
           listenerProfileSummary,coldStartSpeechRules,streamingChatRules}
  curation/{formatUserCorpus,buildTasteMarkdown,toSongDTO,userCorpusRules,
            toPlayableSong,firstTruthy,buildSongChangePayload,recommenderRules,
            recommendationSnapshot}
  routing/{isGenreQuery,matchFastRoute,moodToQuery,pickStartSong,planSelectionIndex}
application/：ports/{services,infra,repos} 共 12 个 Port 契约
  services/{PlaybackService,ConversationService,ColdStartService,StreamingConversationService,
            AuthenticationService,DjSpeechService} 已开始承接 handler 编排
infrastructure/：auth/LegacyNeteaseAuthClient · storage/{FileCorpus,defaultCorpus} · llm/{llmClient,DeepSeekLlmAdapter,LegacyColdOpenWriter,LegacyDjSpeechWriter}
  environment/LegacyWeatherAdapter · speech/LegacySpeechSynthAdapter
  music/LegacyNeteaseMusicSourceAdapter
  persistence/repositories/{QueueSnapshot,ListenHistory,ListenerProfile,SeedPool,ChatHistory,Plan,Auth}
阶段：   P0✅ · P1✅ · P2-Corpus✅ · P2-Port地基✅ · P2-Repo部分接线✅ · P2-MusicSource契约✅
复杂度： 已消除 5 个热点 —— toSongDTO(12) · generateDjResponse(24) ·
         decideProactiveSpeech(33) · buildProactivePrompt(12) · routeIntent(52,全项目最高)
运行：   server 启动正常(ON AIR)，向后兼容验证通过
已接线： handler→Weather/SpeechSynth · proactive→Weather/SpeechSynth · queue→QueueSnapshotRepo
         scheduler→ListenHistoryRepo+MusicSourcePort · router→MusicSourcePort
         recommender→MusicSourcePort+ListenHistory/Profile/SeedPoolRepo
         planner→WeatherPort+PlanRepo+LlmPort · claude→LlmPort+Chat/ProfileRepo
         netease→AuthRepository · server/taste→ListenerProfileRepository · server/startup→AuthenticationService · server/rest-music→MusicSourcePort
         handler 播放控制/SONG_REQUEST→PlaybackService · handler chat 快速命令→ConversationService
         handler→Chat/ProfileRepository
         handler chat 快速命令/推荐状态机/play_personalized/plan 操作→ConversationService
         handler cold-start TTS/纯文本降级/直接开播→ColdStartService
         handler cold-start 触发守卫/current 准备/safety timeout→ColdStartService
         handler cold-start LLM writing→ColdStartService + LegacyColdOpenWriter
         handler Auth 登录/QR→AuthenticationService + LegacyNeteaseAuthClient
         handler onDjSpeechNeeded 普通过渡播报/refill 播报→DjSpeechService + LegacyDjSpeechWriter
         handler chat streaming token/JSON say/fallback/announce 文本→domain streamingChatRules
         handler chat streaming loop/History/TTS announce→StreamingConversationService
待办：   前端 Song 稳定字段迁移 → scheduler/recommender/proactive 热点深化 → legacy warning 清理
```



---

## 1. 按 DDD 领域的重构进度

### 核心域 CORE

```
① 播放调度 Playback █████████████░░░░░░░  65%
   ✅ SpeechSession(speech-timer, 7测试) 已就位 domain 逻辑
   ✅ Queue 快照读写已走 QueueSnapshotRepository 接缝
   ✅ scheduler 播放历史写入已走 ListenHistoryRepository 接缝
   ✅ scheduler 播放 URL/scrobble 已走 MusicSourcePort 接缝
   ✅ transitionTiming 提炼(稳定 durationMs、legacy dt/duration、transition delay)
   ✅ playheadRules 提炼并接线(elapsed/pause/resume/seek)
   ✅ transitionLifecycle 提炼并接线(advancing guard、normal/refill speech timer plan、transitionId guard)
   ✅ listenHistoryRecord 提炼并接线(songId/title/artist/album/durationSec payload)
   ✅ PlaybackService 第一刀已接管 skip/pause/resume/seek/ended/setMode
   ✅ SONG_REQUEST 已通过 PlaybackService + MusicSourcePort 点歌入队，handler 不再动态 import netease.js
   ✅ ListenHistoryRepository 构造注入已收口，legacy adapter 退到默认参数背后
   🟡 Playhead/Transition/History 核心规则已提炼      ⬜ scheduler 仍有队列推进与 timer 编排待拆

② DJ 主持 Hosting ██████████████░░░░░░  65%
   ✅ ProactivePolicy 反向依赖🔴 已切(P0-2, EventPublisher)
   ✅ cleanTtsText 纯逻辑已提炼 domain/hosting
   ✅ artistName 提炼(统一 ar[]/artist/artists[])
   ✅ fallbackTransitionScript 提炼(R1 降级路径)
   ✅ listenerProfileSummary 提炼(top artists/fallback query)
   ✅ coldStartSpeechRules 提炼(开场白 TTS 截断/重试/降级原因)
   ✅ streamingChatRules 提炼(chat stream token/JSON say/错误兜底/播报短文本)
   ✅ StreamingConversationService 接管 chat streaming loop、history append、chat announce TTS
   ✅ ColdStartService 第一刀接管 TTS 成功/失败重试/纯文本降级/直接开播编排
   ✅ ColdStartService 第二刀接管 client-ready 触发守卫、首曲准备、安全超时
   ✅ ColdStartService 第三刀接管 cold-start LLM writing、天气/时段准备与 stream chunk payload
   ✅ DjSpeechService 第一刀接管普通过渡播报、TTS 成功/失败、陈旧 speech guard
   ✅ DjSpeechService 第二刀接管 refill 补队列播报、queue update、TTS 失败暂停/complete
   ✅ ConversationService 已接管 chat 快速命令、推荐拒绝/回滚/重试、play_personalized、plan 操作编排
   ✅ 推荐对话系统流已覆盖 play_personalized→reject→rollback
   ✅ claude.js 的非流式 LLM 调用、Chat/Profile 读写已走 Port/Repository 接缝
   ✅ proactive 天气/TTS 调用已走 WeatherPort/SpeechSynthPort 接缝
   ⬜ DjPersona 未从 claude.js 拆   ⬜ chat 流式响应仍保留 legacy client 以保持实时行为

③ 推荐与听单 Curation ███████░░░░░░░░░░░░░  30%
   ✅ formatUserCorpus 提炼(槽②格式化)
   ✅ buildTasteMarkdown 提炼(taste.md 内容构建)
   ✅ Planner → LlmPort/WeatherPort/PlanRepository 已接线
   ✅ ListenerProfile/SeedPool Repository 契约与 legacy adapter 已建
   ✅ Recommender → MusicSourcePort + ListenHistory/Profile/SeedPoolRepository 已接线
   ✅ Context → ListenHistory/Profile/SeedPoolRepository 已接线
```


### 支撑域 SUPPORTING

```
④ 意图路由 Routing ████░░░░░░░░░░░░░░░░  20%
   ✅ 搜索类路由已通过 MusicSourcePort 查询并返回稳定 Song
   ⬜ IntentRouter → claude 仍保留 legacy extractIntent；Regex 规则未完全纯化
```

### 通用域 GENERIC（Port 化）

```
⑤ 音乐源 Music      ███████████░  85% 🟡 MusicSourcePort + NetEase 防腐 adapter 已建；scheduler/router/recommender/handler 点歌/server REST 音乐接口已接，前端仍兼容旧字段
⑥ 语音合成 TTS      ████████░░░░  70% 🟡 SpeechSynthPort + legacy adapter 已建；handler/proactive 已接
⑦ LLM 网关          ████████░░░░  65% 🟡 LlmPort + DeepSeek adapter 已建；claude/planner 已部分接线
⑧ 鉴权 Auth         ██████████░░  85% 🟡 AuthRepository + AuthClient adapter 已建；handler 登录/QR 与 server 启动登录状态恢复已接 AuthenticationService
⑨ 环境 Environment  ██████████░░  80% 🟡 WeatherPort + legacy adapter 已建；handler/planner/proactive 已接
⑩ 持久化 Persistence ██████████░░  85% 🟡 7×Repository 已建；server/netease/context/recommender 等已接，handler 尚有直连
⑪ 实时传输 Transport █████████░░░  70% ✅ EventPublisher 通用 emit/toClient 已补；proactive 已切换，handler 其余 io.emit 待迁
```

---

## 2. 需求优先级（P0-P2）

| 优先级 | 需求 | 状态 | 验收信号 |
|--------|------|------|---------|
| **P0-1** | 删死代码 dj-ai/playlist-analyzer | ✅ 完成 | 测试绿 + 模块 23→21 |
| **P0-2** | EventPublisher 切 proactive🔴 | ✅ 完成 | **arch error 1→0** |
| **P1-a** | Weather 纯逻辑提炼 | ✅ 完成 | formatWeather 6测试 |
| **P1-b** | TTS 清洗逻辑提炼 | ✅ 完成 | cleanTtsText 5测试 |
| **P1-c** | LLM 纯逻辑提炼(artistName/fallbackTransition) | ✅ 完成 | artist-name 6 + fallback 3 测试 |
| **P2-a** | UserCorpus 格式化提炼 | ✅ 完成 | format-user-corpus 4 测试 |
| **P2-b** | TasteMarkdown 构建提炼 | ✅ 完成 | build-taste-markdown 4 测试 |
| **P2-a2** | CorpusPort 切 context/recommender→fs | ⬜ 待办 | arch warn 4→1 |
| **P2-c** | 7×Repository 拆 db/history/cookie-store | ✅ 基本完成 | 7×Repository 已建；queue/scheduler/planner/claude/recommender/context/server/netease/handler 已接线；旧 DB 仅留在 infrastructure adapters 内 |
| **P2-d** | MusicSourcePort 斩 ar/al/dt 透传 | 🟡 进行中 | MusicSourcePort + LegacyNeteaseMusicSourceAdapter 已建；scheduler/router/recommender/handler 点歌/server REST 音乐接口已接；前端尚未全面切稳定 Song |
| **P2-e** | handler.js 拆 application services | 🟡 进行中 | PlaybackService 已接管播放器控制和 SONG_REQUEST；ConversationService 已接管 chat 快速命令、推荐状态机、play_personalized、plan 操作；ColdStartService 已接管 TTS/降级/开播、触发守卫、首曲准备、安全超时、cold-start LLM writing；AuthenticationService 已接管 Auth 登录/QR；DjSpeechService 已接管普通过渡播报和 refill 补队列播报；StreamingConversationService 已接管 chat streaming loop |

---

## 3. 重构收益目标（可量化）

| 指标 | 起点 | 当前 | 目标 | 度量命令 |
|------|------|------|------|---------|
| 架构 error | 1 | **0** ✅ | 0 | `npm run arch:check` |
| 架构 warn | 4 | **0** ✅ | 0 | `npm run arch:check` |
| 测试数 | 7 | **305** | 覆盖核心域 + Port 契约 + 推荐/plan/冷启动/streaming/点歌/Auth/DJ 播报接缝规则 | `npm test` |
| 死代码文件 | 2 | **0** ✅ | 0 | grep 引用 |
| handler.js 行数 | 671 | 620 | ≤100 | `(Get-Content server\socket\handler.js).Length` |
| 最大函数复杂度 | 86 | 86 | ≤10 | `npm run lint` |
| 代码重复率 | ~4% | 下降 | ≤5% | `npm run dup:check` |
| domain 纯文件数 | 1 | **31** | 全核心域 | `ls domain/**` |
| application Port 契约 | 0 | **12** | 覆盖 15 接缝 | `rg --files server/application/ports` |
| infrastructure legacy adapter | 0 | **14** | 旧实现全部退到接缝背后 | `rg --files server/infrastructure` |
| 前端网易云字段透传 | 有 | 有(MusicSourcePort 已备) | 无 | grep song.ar/al/dt |

---

## 4. 总进度条

```
绞杀总进度  ██████████░░░░░░░░░░  约 50%

P0 反向依赖清零   ██████████████████  100% ✅
P1 纯逻辑提炼      ██████████████████  100% ✅ (Weather✅ TTS✅ LLM✅)
P2 依赖健康(warn)  ██████████████████  100% ✅ (fs 依赖清零 4→0 🎯)
P2 Port化+拆分     ███████████████░░░   75% (Ports✅ · Repo🟡 · Music🟡 · handler🟡)
```


---

## 5. 灰度迁移板块进度（新旧并存策略）

> 绞杀者模式核心：新代码在接缝后逐步接管，旧实现退到接口背后，全程可运行。

| 板块 | 旧实现 | 新实现 | 灰度状态 | 说明 |
|------|--------|--------|---------|------|
| 消息发射 | io.emit 散落 | SocketEventPublisher | 🟢 **proactive 已切换** | handler 其余 io.emit 仍在用旧法，待逐步迁 |
| 天气格式化 | weather.js 内联 | domain/formatWeather | 🟢 **已切换复用** | weather.js 已调用新纯函数 |
| TTS 清洗 | tts.js 两处重复 | domain/cleanTtsText | 🟢 **已切换复用** | 两处均改用新函数 |
| 艺人字段解析 | claude.js getArtistStr | domain/artistName | 🟢 **已切换复用** | getArtistStr 退化为薄委托 |
| 兜底过渡词 | claude.js fallbackTransition | domain/fallbackTransitionScript | 🟢 **已切换复用** | R1 降级路径纯函数化 |
| 用户语料格式 | context.js 内联 | domain/formatUserCorpus | 🟢 **已切换复用** | slotUserCorpus 委托 |
| taste.md 构建 | recommender.js 内联 | domain/buildTasteMarkdown | 🟢 **已切换复用** | 去 new Date 副作用 |
| Weather 调用 | handler/planner/proactive 直连 weather.js | WeatherPort + LegacyWeatherAdapter | 🟢 **已灰度切换** | handler/planner/proactive 已接；legacy weather.js 退到 adapter 背后 |
| TTS 调用 | handler/proactive 直连 tts.js | SpeechSynthPort + LegacySpeechSynthAdapter | 🟢 **已灰度切换** | handler/proactive 已接；legacy tts.js 退到 adapter 背后 |
| LLM 调用 | claude/planner 直连 client | LlmPort + DeepSeekLlmAdapter + legacy writer adapters | 🟡 **部分切换** | planner/claude 非流式已接；cold-start/transition writers 已退到 infrastructure；chat 流式保留 legacy client |
| 鉴权状态 | cookie-store / netease auth 直连 | AuthRepository + AuthenticationService + LegacyNeteaseAuthClient | 🟢 **主链路已切换** | netease cookie 读写已接；handler 登录/QR 已接；server 启动登录状态恢复已接；剩余为外围 REST 音乐接口的 NetEase 直连 |
| 数据存储 | db/history 17函数 | 7×Repository legacy adapters | 🟢 **业务层已切换** | services/socket/application/domain 不再直连 db/history；旧 DB 退到 infrastructure adapters 内 |
| 音乐源 | netease.js 直连 | MusicSourcePort + LegacyNeteaseMusicSourceAdapter | 🟡 **部分切换** | adapter 输出稳定 Song；scheduler/router/recommender/handler 点歌/server REST 音乐接口已接；前端旧字段读取待迁 |
| socket 编排 | handler 800行 | application services | 🟡 **十三刀完成** | 播放控制和 SONG_REQUEST 已委托 PlaybackService；chat 快速命令、推荐状态机、play_personalized、plan 操作已委托 ConversationService；cold-start TTS/纯文本降级/直接开播、触发守卫、首曲准备、安全超时、LLM writing 已委托 ColdStartService；Auth 登录/QR 已委托 AuthenticationService；普通 transition speech 与 refill 补队列播报已委托 DjSpeechService；chat streaming loop 已委托 StreamingConversationService |

图例：🟢 已灰度切换　🟡 部分　⚪ 未开始

---

## 6. 下一步待办（按紧急度/收益/风险）

| 顺序 | 待办 | 紧急度 | 预期收益 | 风险 | 验收信号 |
|------|------|--------|----------|------|----------|
| **P0 ✅** | 抽 `plan_refresh/plan_select/plan_pin/plan_clear` 到 `ConversationService` | 已完成 | handler chat 分支继续变薄；计划操作可单测 | 中 | `conversation-service.test.js` + system flow 覆盖；handler 只调用 service |
| **P0 ✅** | 补 `ColdStartService` 特征测试并提炼 coldStartSpeechRules | 已完成 | 锁住“冷启动 TTS 失败仍启动音乐”主链路 | 中高 | `cold-start-speech-rules.test.js` + `cold-start-service.test.js` 覆盖；不改变 socket 事件名 |
| **P1 ✅** | 建 `ColdStartService` 第一刀，只搬 TTS 失败降级编排 | 已完成 | 冷启动从 handler 退到应用服务；降低上帝对象风险 | 高 | TTS 成功/失败重试/不可用/直接开播路径全绿；`client:ready` 行为不变 |
| **P1 ✅** | `ColdStartService` 第二刀：收拢触发守卫、current 准备和安全超时 | 已完成 | handler 冷启动分支继续变薄，为完整迁移做准备 | 中高 | `client:ready` 条件、首曲准备、安全超时启动音乐均有 characterization tests |
| **P1 ✅** | `ColdStartService` 第三刀：收拢 cold-start LLM writing | 已完成 | `streamColdOpen` 退到 infrastructure writer 后面，handler 不再准备天气/时段/stream chunk payload | 中 | `writeIntro` service tests + handler 静态接缝测试；Socket 事件名不变 |
| **P1 ✅** | 提炼 chat streaming 纯规则 | 已完成 | token/JSON say/error fallback/短 TTS 文本有单测护栏 | 中 | `streaming-chat-rules.test.js` 覆盖，handler 不再内联 JSON parse/token 提取 |
| **P1 ✅** | 为 chat LLM streaming loop 建应用服务接缝 | 已完成 | 后续替换 legacy stream client 有安全网 | 高 | 流式 chunk/end 行为由 service 编排；暂不改实时协议 |
| **P1 ✅** | 把 `SONG_REQUEST` 搜索从 handler 动态 import 切到 `MusicSourcePort` | 已完成 | handler 点歌不再绕过音乐源防腐层；新增 5 条服务/接缝测试 | 低中 | handler 点歌分支不再 `import('../services/netease.js')` |
| **P1 ✅** | 把 server REST 音乐接口切到 `MusicSourcePort` | 已完成 | playlists / playlist tracks / playlist play / lyric 不再动态 import `services/netease.js` | 中 | `server-seams.test.js` 覆盖；`server.js` 不再 `import('./services/netease.js')` |
| **P1 ✅** | 把 Auth 登录/QR 从 handler 动态 import 切到 `AuthenticationService` | 已完成 | handler 不再直接动态 import NetEase auth；QR magic code 提纯到 domain | 中 | `auth-session-rules.test.js` + `authentication-service.test.js` + handler 静态接缝测试 |
| **P1 ✅** | 把 server 启动登录状态恢复切到 `AuthenticationService` | 已完成 | `server.js` 不再直接 import `getCookie` 或动态调用 `checkLoginStatus`；启动恢复保留 plan 失败降级补队列 | 中 | `auth-session-rules.test.js` + `authentication-service.test.js` + `server-seams.test.js` |
| **P1 ✅** | 收敛 `AuthenticationService` 启动恢复复杂度 warning | 已完成 | `restoreStoredSession` 退为薄编排，启动计划/计划接线/恢复摘要拆成 helper；Auth 相关 lint warning 清零 | 低 | `eslint --max-warnings 45` + Auth 相关测试通过 |
| **P1 ✅** | 收敛 `ConversationService.handlePlanAction` 复杂度 warning | 已完成 | plan refresh/select/pin/clear 改为 action handler map，`handlePlanAction` 退为薄分发 | 中 | `eslint --max-warnings 44` + conversation service tests 通过 |
| **P1 ✅** | 收敛 `ConversationService` 工厂行数 warning | 已完成 | 快速命令、个性化推荐、推荐拒绝/回滚/重试抽到模块级 helper，工厂退为依赖注入薄壳 | 低 | `eslint --max-warnings 43` + conversation service tests + 全量测试通过 |
| **P1 ✅** | 收敛 `PlaybackService` 工厂行数 warning | 已完成 | 点歌搜索/入队/失败降级抽到模块级 helper，工厂继续退为薄委托 | 低 | `eslint --max-warnings 42` + `playback-service.test.js` 通过 |
| **P1 ✅** | 收敛 `ColdStartService` 工厂行数 warning | 已完成 | TTS 重试、文本兜底、直接开播抽到模块级 helper，工厂只保留冷启动公开入口委托 | 低中 | `eslint --max-warnings 41` + `cold-start-service.test.js` + `cold-start-speech-rules.test.js` 通过 |
| **P1 ✅** | 收敛 `DjSpeechService` 工厂行数 warning | 已完成 | transition/refill 两条播报流程抽到模块级 helper，工厂只保留公开入口委托 | 中 | `eslint --max-warnings 40` + `dj-speech-service.test.js` + `dj-speech-rules.test.js` 通过 |
| **P1 ✅** | 把普通 transition speech 从 `onDjSpeechNeeded` 切到 `DjSpeechService` | 已完成 | 普通过渡播报的 TTS 成功/失败、陈旧 speech guard 和时长估算可单测 | 中 | `dj-speech-rules.test.js` + `dj-speech-service.test.js` + handler 静态接缝测试 |
| **P1 ✅** | 把 refill 补队列播报从 `onDjSpeechNeeded` 切到 `DjSpeechService` | 已完成 | 补队列、queue update、生成 refill 文案、TTS 成功/失败暂停、complete 语义可单测 | 中 | `dj-speech-rules.test.js` + `dj-speech-service.test.js` + `socket-handler-loads.test.js` |
| **P2** | 前端逐步只读稳定 `Song` 字段 | 中 | 彻底斩断 `ar/al/dt` 透传债 | 中 | `rg "song\\.(ar|al|dt)|\\.ar\\b|\\.al\\b|\\.dt\\b" client` 无业务读取 |
| **P2 ✅** | scheduler 的 ListenHistoryRepository 改为构造注入 | 已完成 | services/scheduler 对具体 legacy adapter 依赖更薄，测试可直接 fake repo | 中低 | `scheduler-listen-history-repository.test.js` 覆盖 skip/_onSongEnding record；默认行为不变 |

> 建议下一刀：优先推进 **前端 Song 稳定字段迁移**；若继续后端，则进入 scheduler/recommender/proactive 热点深化，需要先补更细的 characterization tests。

### 6.1 需求优先级说明（下一阶段）

> 排序原则：先保门禁与低风险高确定性收益，再处理会扩大解耦面的业务接缝；所有代码改动继续走 TDD + 绞杀者方法，不改 Socket 事件名、REST 路径和外部行为。

| 优先级 | 需求 | 为什么排这里 | 预期收益 | 验收信号 |
|------|------|-------------|----------|----------|
| **P0 / 守门槛** | 保持 `npm test`、`npm run arch:check`、`npm run lint` 基线 | 这是后续重构的安全网，任何新切口都不能让现有 305 测试、0 架构违规、0 lint error 倒退 | 确保每一刀可回滚、可独立验证 | `305 passed`；`arch:check` 0 violation；lint 仍 0 error，warning 不增加 |
| **P1 / 已完成快收益** | 收敛 `PlaybackService` 工厂行数 warning | 当前仅略超 80 行，作用域小，已有 `playback-service.test.js` 可做安全网 | 已把 lint warning 43→42，点歌编排从工厂抽出 | RED: `eslint --max-warnings 42` 先失败；GREEN 后通过；播放控制测试全绿 |
| **P1 / 已完成服务瘦身** | 收敛 `DjSpeechService` 工厂行数 warning | transition/refill 两条高价值播报链路已有 service tests 护栏 | 已把 lint warning 41→40，DJ 播报编排边界更清楚 | RED: `eslint --max-warnings 40` 先失败；`dj-speech-service.test.js` + rules tests 全绿 |
| **P2 / 产品债** | 前端逐步只读稳定 `Song` 字段 | MusicSourcePort 已输出稳定 Song，但前端仍兼容 `ar/al/dt`，这是防腐层最后一段外露债 | 最终切断 NetEase 旧字段向 UI 透传，为替换音乐源留空间 | `rg "song\\.(ar|al|dt)|\\.ar\\b|\\.al\\b|\\.dt\\b" client` 无业务读取 |
| **P2 / 业务接缝深化** | 继续瘦 `scheduler`、`recommender`、`proactive` 热点 | 这些模块仍有复杂度 warning，但风险高于 PlaybackService，需要更多 characterization tests | 播放推进、推荐、主动播报的领域规则继续沉入 domain/application | 新增纯规则测试先 RED 后 GREEN；相关 load/system tests 全绿 |
| **P3 / 清理项** | 清理 legacy unused vars、prefer-template、测试 helper warning | 主要是质量账，不改变架构边界，适合穿插做 | 减少 lint 噪音，让真正复杂度热点更显眼 | 每次只消一个小类 warning，避免格式化/机械改动扩大 diff |

---

## 7. 迁移纪律（每步不可破坏）

```
1. 先写失败测试(RED) → 最小实现(GREEN) → 重构(REFACTOR)
2. 每步跑 npm test 全绿 + npm run arch:check 无新增 error
3. 灰度：新实现接线后旧实现才移除，全程项目可运行
4. 不变量 R1-R9 全程不破（尤其 R1 永不静默）
5. 进度看板同步更新（本文件）
```

---

## 8. 绞杀者方法经验（实战沉淀）

> 本项目重构过程中验证/踩坑得出的可复用经验。

### 8.1 绞杀者两阶段：先提纯，再拆结构

```
阶段1 提炼纯逻辑：把函数里的表达式/映射/判断提炼成 domain 纯函数（先红后绿）
阶段2 结构性重构：补特征测试作安全网 → 拆控制流(switch→分发表)

routeIntent 实证：52→45(提纯4个函数) → ≤10(switch拆成 AI_ACTION_HANDLERS)
教训：纯逻辑提炼有天花板。复杂度的本质若是"职责过载"(一个函数干多件事)，
     提纯只能降到某点，必须靠结构性拆分才达标。
```

### 8.2 挑对接缝——提纯要挑复杂度主源

```
踩坑：routeIntent 连续两次挑错接缝(isGenreQuery/matchFastRoute)，
     产出有用纯函数但复杂度几乎没降(52→51)——因为主源是 switch 不是它们。
经验：动手前先判断"复杂度大头在哪"。ESLint 复杂度里，
     for 循环算 1-2 分支，而多 case switch + 每 case try/catch 是大头。
```

### 8.3 结构性重构必须有特征测试安全网

```
铁律：拆控制流(switch/if 链)前，先补特征测试钉住现有行为(characterization
     tests)。它们对现有代码就该通过——安全网的意义是"重构后仍绿"。
教训：曾因 recommender.js 无模块加载测试，重构漏删 import 致启动崩(未被单测
     捕获)。→ 补 recommender-loads 回归测试。集成/加载层测试不可省。
```

### 8.4 诚实区分"纯逻辑"与"接线/配置"

```
纯逻辑(domain)：无 IO，先红后绿，可无 mock 单测。占提炼主体。
接线/配置(infrastructure)：实例化 SDK/框架(llmClient/defaultCorpus)，是 TDD
     的 Configuration 例外——其决策逻辑由已测纯谓词(isLlmConfigured)保障，
     不为"new OpenAX()"这类外部实例化硬写 mock 测试。
向后兼容(方案B)：DTO 兼带旧字段，前端不改仍工作，为将来彻底斩断铺路。
```

### 8.5 自留债当轮偿还

```
拆 decideProactiveSpeech(33) 时把逻辑搬进 buildProactivePrompt 却让新函数
超标(12)。→ 下一轮立即提炼 proactiveContextLines 还清，不留"降了大的、
留个小超标"的半成品。
```

### 8.6 每步用工具量化验证

```
npm test        每步全绿(先红后绿)
npm run arch:check  依赖违规数=架构债，持续 0
npm run lint    复杂度 warning 数=剩余热点，逐个消除
指标趋势入看板：测试 7→120→143→148→156→157→162→171→176→184→192→194→203→216→221→232→239→244→247→256→263→268→276→284→290→294→296→304→305 · 违规 1e4w→0 · lint error 8→0 / warning 47→40 · domain 1→31 · 12 个 Port 契约 · 14 个 legacy adapter · application service 0→6
```

---

## 一句话进度

> **P0✅ P1✅ P2 Port 地基✅ · 305 测试全绿 · lint 0 error / 40 warnings · 0 架构违规 · domain 31 纯文件 · application 12 个 Port 契约 + 6 个 application service · infrastructure 14 个 legacy adapter。**
> **已接线：handler→Weather/Speech/PlaybackService(播放控制+SONG_REQUEST)/ConversationService/ColdStartService(cold-start writing+TTS+开播)/AuthenticationService(Auth 登录+QR)/DjSpeechService(普通 transition+refill 播报)/StreamingConversationService/ChatRepo/ProfileRepo，proactive→Weather/Speech，queue→QueueSnapshotRepo，scheduler→ListenHistoryRepo/MusicSource，router→MusicSource，recommender→MusicSource/ListenHistory/Profile/SeedPoolRepo，planner→Weather/Llm/PlanRepo，claude→Llm/Chat/ProfileRepo，netease→AuthRepo，server/taste→ProfileRepo，server/startup→AuthenticationService，server/rest-music→MusicSourcePort。**
> **下一步：推进前端 Song 稳定字段迁移；或继续后端 scheduler/recommender/proactive 深化；继续暂不改 Socket 协议，不破坏事件名和外部行为。**
