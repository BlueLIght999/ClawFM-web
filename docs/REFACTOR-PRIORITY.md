# Qclaudio 88.7 — 绞杀重构优先级文档

> 前后端 Strangler Fig 绞杀进度、优先级矩阵与实现方式。
> 配合 `REFACTOR-PROGRESS.md`（后端进度看板）/ `TEST-COVERAGE-SCHEDULE.md`（测试覆盖排期）/ `ARCHITECTURE-BASELINE.md`（架构规则）使用。

---

## 总览

```
客户端：App.jsx 584→359 行，6 Context + 4 socket hook + 组合根已落地，123 测试通过
后端：  P0-P3 全清，~1057 测试 / 0 架构违规 / 0 lint 错误，services/ 仍余 12 文件 2,482 行
```

前后端均采用 Strangler Fig 模式：先用安全网（客户端 ErrorBoundary、后端 characterization tests）包裹遗留代码，再逐子系统提取到新结构。每步遵循 TDD（Red → Green → Refactor），保证行为不变。`npm test` 全绿和 `npm run arch:check` 0 error 是每次提取的唯一合并门禁。

客户端的绞杀目标是 `App.jsx` 从 584 行瘦身至 ~120 行的薄壳组合器。后端的目标是 `services/` 12 个遗留文件（2,482 行）逐步迁移到 `domain/`、`infrastructure/` 或微服务化，最终消除全部 D1/D2 架构违规。

---

## 客户端绞杀进度

### 已完成 Phase 0-9

| Phase | 产出文件 | 测试文件 | App.jsx 削减 |
|-------|---------|---------|-------------|
| 0 ErrorBoundary | `components/ErrorBoundary.jsx` | `ErrorBoundary.test.jsx` + `main.test.jsx` | 安全网就位 |
| 1 AuthContext | `contexts/AuthContext.jsx` | `AuthContext.test.jsx` + `AppAuthIntegration.test.jsx` | 移除 auth state + login 方法 |
| 2 RadioContext | `contexts/RadioContext.jsx` + `hooks/useAudioController.js` | `RadioContext.test.jsx` + `useAudioController.test.jsx` + `AppRadioIntegration.test.jsx` | 移除 radio state + 3 个 audio effect |
| 3 ChatContext | `contexts/ChatContext.jsx` | `ChatContext.test.jsx` + `AppChatIntegration.test.jsx` | 移除 chat messages + DJ dialog state |
| 4-6 ColdStart/Crab/UI | `contexts/ColdStartContext.jsx` + `contexts/CrabContext.jsx` + `contexts/UIContext.jsx` | 3 个 test + `AppPhase456Integration.test.jsx` | 移除 3 组 domain state |
| 7 Socket Split | `hooks/useRadioSocketEvents.js` + `useChatSocketEvents.js` + `useCrabSocketEvents.js` + `useSystemSocketEvents.js` | 4 个 test + `AppSocketSplit.test.jsx` | 115 行 monolithic useEffect → 4 行 hook 调用 |
| 8-9 AppProviders + Perf | `contexts/AppProviders.jsx` + `hooks/usePerformanceMonitor.js` | `AppProviders.test.jsx` + `usePerformanceMonitor.test.jsx` + `swCacheVersion.test.jsx` | `main.jsx` 50→21 行，SW cache v4→v5 |

组合根 `AppProviders.jsx` 按 Auth → Radio → Chat → ColdStart → Crab → UI 顺序嵌套，通过 render-prop 将 `{ socket, connected }` 传给 App，避免 `useSocket()` 被多次调用产生重复连接。`CrabProviderWrapper` 桥接 RadioContext 的 `isPlaying` 到 CrabProvider。

### 当前残留（App.jsx 359 行）

以下逻辑仍内联在 `App.jsx` 中，等待提取：

| 残留块 | 行数范围 | 内容 | 提取目标 |
|--------|---------|------|---------|
| audio onError 重试 | 203-226 | 2 次重试 + 800ms 退避 + skip-to-next | `hooks/useAudioErrorHandler.js` |
| Cold-start overlay JSX | 230-258 | 全屏覆盖层 + 阶段文本 + 螃蟹动画 | `components/ColdStartOverlay.jsx` |
| Login gate JSX | 187-199 | 未登录态渲染 + LoginOverlay | `components/LoginGate.jsx` |
| Player view JSX | 272-323 | Layout + PlaylistList + LyricsDisplay + PlayerBar 组合 | `components/PlayerView.jsx` |
| handleCrabClick / handleBubbleClick / handleDJDialogReply | 164-176 | 3 个事件处理回调 | 并入对应 Context 或 `hooks/useCrabInteraction.js` |
| geolocation effect | 153-162 | `navigator.geolocation.getCurrentPosition` 上报 | `hooks/useGeolocation.js` |
| client:ready effect | 146-150 | `socket.emit('client:ready')` 就绪信号 | 并入 ColdStartContext |
| deferred speech effect | 178-185 | 冷启动退出后播放待处理语音 | 并入 ColdStartContext |
| audio element expose | 94-100 | `setAudioEl(musicAudioRef.current)` 供 Spectrum | 并入 PlayerView 或 RadioContext |
| speech pause on disconnect | 112-116 | 断连时暂停 speech audio | 并入 useAudioController |

提取完成后 `App.jsx` 预期降至 ~120 行，仅保留：provider 消费、view 路由、JSX 组合。

---

## 后端绞杀进度

### 已完成 P0-P3

```
测试：   ~1057 passed (~105 files)
架构：   0 error / 0 warn / 111 modules / 126 dependencies
Lint：   0 errors / 0 warnings
domain/：73 纯文件 (8 子域)
application/：12 Port 契约 + 6 application services
infrastructure/：14 legacy adapters
阶段：   P0✅ P1✅ P2✅ P3✅
```

| 阶段 | 核心产出 |
|------|---------|
| P0 安全网 | `handler.js` characterization tests 锁定行为；`arch:check` 纳入门禁 |
| P1 Socket 绞杀 | `setupSocketHandler` 304→~20 行；提取 14+ 聚焦函数（`wireSchedulerCallbacks`、`handleChatMessage`、`wirePlayerControls` 等） |
| P2 领域提炼 | `AgentTurnService`、`StreamingConversationService`、`PlanBlockService`、`CrabInteractionService`、`ColdStartService`、`SpeechCompletionService` 共 6 个 application service 落地 |
| P3 复杂度清零 | `proactive.js` 31→≤10、`recommender.js` 23→~4；legacy lint 20 warnings→0；`handler.js` god-object 绞杀完成 |

### 当前遗留：services/ 12 文件

| 文件 | 行数 | D1 违规 | D2 违规 | 绞杀状态 |
|------|------|---------|---------|----------|
| `recommender.js` | 400 | 5 infra 直连 | 间接 fs | 🟡 编排逻辑未拆 |
| `claude.js` | 328 | 4 infra 直连 | **fs 硬违规** | 🟡 prompt 构建 + LLM 编排未拆 |
| `scheduler.js` | 320 | 2 infra 直连 | 无 | 🟡 domain 最深但编排仍重 |
| `tts.js` | 218 | config + SDK | **fs 硬违规** | 🔴 应整体移入 infrastructure |
| `netease.js` | 201 | authRepo 直连 | 无 | 🔴 infrastructure 实现错放 services/ |
| `planner.js` | 186 | 3 infra 直连 | 无 | 🟡 缓存 + 校验逻辑未提炼 |
| `router.js` | 168 | musicSource 直连 | 无 | 🟡 最接近完成，`isFastRoute` 重复 |
| `context.js` | 151 | 4 infra 直连 | 间接 fs | 🟡 6 槽组装逻辑未提炼 |
| `weather.js` | 145 | config 直连 | 无 | 🔴 应整体移入 infrastructure |
| `queue.js` | 138 | queueSnapshotRepo 直连 | 无 | 🔴 纯 domain 逻辑未提炼 |
| `proactive.js` | 127 | 2 infra 直连 | 无 | 🟡 门控逻辑应入 domain |
| `speech-timer.js` | 101 | **无违规** | **无违规** | ✅ 最干净，可直接移入 domain |

3 条反向依赖（infrastructure → services）尚未消除：`LegacyNeteaseMusicSourceAdapter` → `services/netease.js`、`LegacyWeatherAdapter` → `services/weather.js`、`LegacySpeechSynthAdapter` → `services/tts.js`。三个适配器是薄包装器，实际实现仍在遗留服务中。

services → services 耦合链：`planner → context`、`proactive → claude + context`、`recommender → queue`、`router → claude`、`scheduler → queue + speech-timer`。

### P4 优先级队列

| 顺序 | 待办 | 紧急度 | 预期收益 | 风险 | 验收信号 |
|------|------|--------|----------|------|----------|
| P4-a | `speech-timer.js` → `domain/playback/` | 低 | 零违规文件归位 | 极低 | `npm test` 全绿 |
| P4-b | `netease.js` / `weather.js` / `tts.js` → `infrastructure/` | 中 | 消除 3 条反向依赖 | 低 | `arch:check` 0 warn |
| P4-c | 提炼 `queue.js` → `domain/playback/` | 中 | 消除 1 条 services→infra 直连 | 中 | characterization tests 通过 |
| P4-d | 提炼 `context.js` 6 槽组装 → domain | 中 | prompt 组装纯化 | 中 | domain rules tests 通过 |
| P4-e | 拆 `claude.js` prompt 构建 → infrastructure | 高 | 消除 D2 fs 硬违规 | 高 | characterization tests 通过 |
| P4-f | 微服务化 TTS | 中 | 验证 Port→HTTP 适配模式 | 中 | HTTP 适配器测试通过 |
| P4-g | 微服务化音乐源 | 中 | 消除 NeteaseCloudMusicApi 子进程管理 | 中 | HTTP 适配器测试通过 |
| P4-h | 前端 Song 稳定字段迁移 | 中 | 防腐层最后一段外露债 | 中 | `grep "song\.(ar|al|dt)" client` 无业务读取 |

微服务化可行性：音乐源和 TTS 可行性高（Port 契约仅 2 方法，NeteaseCloudMusicApi 已是子进程），LLM 中等（需 SSE 流式传输），播放调度器和歌曲队列不可行（实时定时器 + 进程内单例）。详见 `REFACTOR-PROGRESS.md` 微服务可行性分析。

---

## 统一优先级矩阵

客户端和后端待办合并为统一 P0-P3 矩阵，按风险从低到高、收益从高到低排列：

| 优先级 | 来源 | 待办 | 理由 | 验收信号 |
|--------|------|------|------|----------|
| P0 | 后端 | P4-a `speech-timer.js` 归位 | 零违规纯逻辑文件，零风险移动 | `npm test` 全绿 |
| P0 | 后端 | P4-b `netease` / `weather` / `tts` 移入 infrastructure | 消除 3 条反向依赖，3 个文件本质是 infra 实现 | `arch:check` 0 warn |
| P1 | 客户端 | 提取 `ColdStartOverlay` + `LoginGate` 组件 | App.jsx JSX 内联块组件化，降低渲染复杂度 | App.jsx < 300 行 |
| P1 | 客户端 | 提取 `useAudioErrorHandler` hook | 音频重试逻辑独立可测，当前 24 行内联无法单测 | 新 hook 有独立测试 |
| P1 | 后端 | P4-c `queue.js` 领域提炼 | 消除 services→infra 直连，队列逻辑本属 domain | characterization tests 通过 |
| P2 | 客户端 | 提取 `PlayerView` 组件 | 52 行最大 JSX 组合块独立化 | App.jsx < 200 行 |
| P2 | 客户端 | 提取 `useGeolocation` + 并入 `client:ready` / `deferred speech` 到 ColdStartContext | 消除 App.jsx 中 3 个游离 effect | App.jsx effect 数 ≤ 2 |
| P2 | 后端 | P4-d `context.js` 提炼 | 6 槽 prompt 组装纯化为 domain rules | domain rules tests 通过 |
| P2 | 后端 | P4-e `claude.js` prompt 拆分 | 消除 D2 fs 硬违规，328 行最大遗留之一 | characterization tests 通过 |
| P3 | 后端 | P4-f 微服务化 TTS | 验证 Port→HTTP 适配模式，为后续微服务铺路 | HTTP 适配器测试通过 |
| P3 | 后端 | P4-g 微服务化音乐源 | 消除 NeteaseCloudMusicApi 子进程管理复杂度 | HTTP 适配器测试通过 |
| P3 | 客户端 | App.jsx 最终瘦身至 ~120 行 | 前端绞杀完成标志 | 行数达标 + 全测试通过 |
| P3 | 后端 | P4-h 前端 Song 稳定字段迁移 | 防腐层最后一段外露债清除 | `grep` 无 `ar` / `al` / `dt` 业务读取 |

建议执行顺序：P4-a / P4-b（零风险归位）→ 客户端组件提取（ColdStartOverlay / LoginGate / useAudioErrorHandler）→ P4-c → P4-d → P4-e → 客户端 PlayerView + effect 清理 → P4-f / P4-g → P4-h + App.jsx 最终瘦身。

---

## 实现方式

**安全网先行**：客户端用 `ErrorBoundary` 包裹整个应用，任何提取回归显示 fallback UI 而非白屏；后端在动遗留文件前先写 characterization tests 锁定现有行为，提取后用同一组测试验证行为不变。

**TDD 循环**：每个提取任务遵循 Red（写失败测试定义新 Context/hook/service 的期望行为）→ Green（最小实现让测试通过）→ Refactor（将 App.jsx / handler.js 中的旧逻辑替换为新组件调用，验证全测试通过后 commit）。

**Strangler Fig 提取**：新建 Context/hook/service → 在 App.jsx / handler.js 中委托给新组件 → 验证行为不变 → 移除旧代码。每个 Phase 产出独立可测试的单元，不依赖后续 Phase。

**架构门禁**：每次 commit 前必须通过 `npm test`（全绿）和 `npm run arch:check`（0 error）。后端 dependency-cruiser 执行 D1-D9 依赖规则校验，捕获 domain → infrastructure 等违规依赖。warn 追踪不阻断，但 P4-b 完成后应降至 0。

**Subagent 驱动**：每个 Phase 派出独立 subagent 执行完整 TDD 循环，主会话审查测试结果和代码质量后合并。subagent 拿到完整的 Phase 定义文件（含代码、测试、验证命令），无需上下文补充。

**render-prop 避坑**：`AppProviders` 是唯一调用 `useSocket()` 的位置。通过 `{typeof children === 'function' ? children({ socket, connected }) : children}` 将 socket 实例传给 App，避免 App 或其他 Context 重复调用 `useSocket()` 创建第二个连接。`CrabProviderWrapper` 以同样模式桥接 RadioContext 的 `isPlaying` 到 CrabProvider。
