# Qclaudio 88.7 — 测试覆盖体系建设排期

> 从覆盖率工具安装到 CI 门禁落地的分阶段建设方案。
> 配合 `TESTING-STANDARD.md`（测试规范）/ `REFACTOR-PRIORITY.md`（绞杀优先级）/ `ARCHITECTURE-BASELINE.md`（架构规则）使用。

---

## 现状审计

```
客户端：28 测试文件 / 123 测试用例 / 无 coverage 工具 / 无 lint / 无 arch:check
后端：  ~105 测试文件 / ~1057 测试用例 / 有 arch:check / 有 lint / coverage 脚本已配但工具未装
金字塔：单元层 ~90%（过重）/ 集成层 ~5%（严重不足）/ E2E 层 0%（空白）
覆盖率：无法量化（@vitest/coverage-v8 未安装）
CI 门禁：不存在
```

`TESTING-STANDARD.md` 定义了 70/20/10 测试金字塔和覆盖率阈值，但 backlog 中 6 项产物全部处于 ❌ 待装状态。当前测试集中在单元层，集成、契约、E2E 三层几乎空白，无法有效防护模块交互和全链路回归。

| 维度 | 标准目标 | 当前状态 | 差距 |
|------|---------|---------|------|
| 单元测试占比 | 70% | ~90% | 过重，部分应归为集成测试 |
| 集成测试占比 | 20% | ~5% | 缺 Repository 集成测试、Adapter 包装测试 |
| E2E 测试占比 | 10% | 0% | 完全空白 |
| 覆盖率工具 | `@vitest/coverage-v8` | 未安装 | 无法量化覆盖率 |
| 覆盖率门禁 | 核心域 ≥80% 行 / ≥70% 分支 | 无 | 门禁不存在 |
| 契约测试 | REST + Socket schema | 无 | 接口变更无保护 |
| CI 管道 | test + arch + coverage + contract | 无 | 全手动执行 |
| client lint | ESLint 0 error | 无 lint 配置 | 代码风格无保障 |
| client arch:check | dependency-cruiser | 无 | 客户端无架构校验 |

---

## 客户端测试覆盖现状

### 已覆盖源文件（23 个，含间接覆盖）

| 源文件 | 测试文件 | 覆盖方式 |
|--------|---------|---------|
| `ErrorBoundary.jsx` | `ErrorBoundary.test.jsx` | 单元 |
| `main.jsx` | `main.test.jsx` | 集成 |
| `AppProviders.jsx` | `AppProviders.test.jsx` | 集成 |
| `AuthContext.jsx` | `AuthContext.test.jsx` + `AppAuthIntegration.test.jsx` | 单元 + 集成 |
| `RadioContext.jsx` | `RadioContext.test.jsx` + `AppRadioIntegration.test.jsx` | 单元 + 集成 |
| `ChatContext.jsx` | `ChatContext.test.jsx` + `AppChatIntegration.test.jsx` | 单元 + 集成 |
| `ColdStartContext.jsx` | `ColdStartContext.test.jsx` + `AppPhase456Integration.test.jsx` | 单元 + 集成 |
| `CrabContext.jsx` | `CrabContext.test.jsx` | 单元 |
| `UIContext.jsx` | `UIContext.test.jsx` | 单元 |
| `useAudioController.js` | `useAudioController.test.jsx` | 单元 |
| `useRadioSocketEvents.js` | `useRadioSocketEvents.test.jsx` | 单元 |
| `useChatSocketEvents.js` | `useChatSocketEvents.test.jsx` | 单元 |
| `useCrabSocketEvents.js` | `useCrabSocketEvents.test.jsx` | 单元 |
| `useSystemSocketEvents.js` | `useSystemSocketEvents.test.jsx` | 单元 |
| `usePerformanceMonitor.js` | `usePerformanceMonitor.test.jsx` | 单元 |
| `useSpeechPlayback.js` | `DJSpeechCancellation.test.jsx` | 单元（取消场景） |
| `useChatHistory.js` | `ChatHistory.test.jsx` | 单元 |
| `SettingsView.jsx` | `SettingsView.test.jsx` | 单元 |
| `ProfileView.jsx` | `ProfileView.test.jsx` | 单元 |
| `config.js` | `build-config.test.js` | 单元 |
| Lazy views | `LazyViews.test.jsx` | 集成 |
| View transition | `ViewTransition.test.jsx` | 集成 |
| `sw.js` cache version | `swCacheVersion.test.jsx` | 单元 |

### 未覆盖源文件（18 个）

| 源文件 | 类型 | 风险 | 优先级 |
|--------|------|------|--------|
| `App.jsx` (359 行) | 组件 | 高 — 核心组合器，仅有集成测试间接覆盖 | P1 |
| `PlayerBar.jsx` | 组件 | 高 — 播放控制 UI，含 mode 切换 | P1 |
| `ChatBox.jsx` | 组件 | 中 — 聊天输入 + 消息列表 | P1 |
| `DJDialog.jsx` | 组件 | 中 — DJ 对话框，含流式渲染 | P1 |
| `BubbleSystem.jsx` | 组件 | 中 — 气泡动画 + 点击交互 | P1 |
| `CrabMascot.jsx` | 组件 | 中 — 螨蟹动画状态机 | P2 |
| `Layout.jsx` | 组件 | 低 — 布局容器 | P2 |
| `TopBar.jsx` | 组件 | 低 — 顶栏信息展示 | P2 |
| `LoginOverlay.jsx` | 组件 | 中 — 登录表单 + QR 码 | P2 |
| `Spectrum.jsx` | 组件 | 低 — 音频频谱可视化 | P3 |
| `PlaylistList.jsx` | 组件 | 低 — 播放列表展示 | P3 |
| `LyricsDisplay.jsx` | 组件 | 低 — 歌词滚动 | P3 |
| `DJBooth.jsx` | 组件 | 低 — DJ 台展示 | P3 |
| `WeatherBar.jsx` | 组件 | 低 — 天气信息 | P3 |
| `ProfilePanel.jsx` | 组件 | 低 — Profile 面板 | P3 |
| `useSocket.js` | Hook | 高 — Socket 连接管理，整个应用依赖 | P1 |
| `useTheme.js` | Hook | 中 — 主题切换 | P2 |
| `themes.js` | 工具 | 低 — 主题常量定义 | P3 |

---

## 后端测试覆盖现状

### 已覆盖领域

后端 `domain/` 目录 73 个纯领域文件分布在 8 个子域，大部分有对应的单元测试：

| 子域 | 文件数 | 已测试 | 测试文件 |
|------|--------|--------|---------|
| playback | 8 | 8 | `speech-timer.test.js`、`playhead-rules.test.js`、`speech-completion-rules.test.js`、`song-queue-characterization.test.js`、`transition-lifecycle.test.js`、`transition-timing.test.js`、`listen-history-record.test.js`、`seek-paused-guard.test.js`、`client-lifecycle-rules.test.js` |
| hosting | 14 | 14 | `dj-speech-rules.test.js`、`dj-speech-service.test.js`、`crab-interaction-rules.test.js`、`cold-start-speech-rules.test.js`、`build-transition-prompt.test.js`、`fallback-transition-script.test.js`、`build-proactive-prompt.test.js`、`proactive-context-lines.test.js`、`get-time-of-day-mood.test.js`、`is-llm-configured.test.js`、`artist-name.test.js`、`clean-tts-text.test.js`、`proactive-characterization.test.js` |
| curation | 14 | 14 | `recommender-rules.test.js`、`recommender-characterization.test.js`、`plan-block-rules.test.js`、`plan-block-service.test.js`、`recommendation-snapshot.test.js`、`build-song-change-payload.test.js`、`to-playable-song.test.js`、`to-song-dto.test.js`、`first-truthy.test.js`、`pick-start-song.test.js`、`mood-to-query.test.js`、`user-corpus-rules.test.js`、`build-taste-markdown.test.js`、`format-user-corpus.test.js` |
| routing | 5 | 5 | `match-fast-route.test.js`、`merged-intent-chat-adapter.test.js`、`is-genre-query.test.js`、`genre-dict.test.js`、`genre-search-engine.test.js` |
| profile | 22 | 22 | 全套 collectors / analyzers / builders / search / events / ProfileOrchestrator 测试 |
| environment | 2 | 2 | `weather-mood.test.js`、`format-weather.test.js` |
| auth | 1 | 1 | `auth-session-rules.test.js` |
| errors / evaluation | 3 | 3 | `bad-case-attribution.test.js`、`product-effect-metrics.test.js` |

application/ 层 6 个 service 全部有测试：`agent-turn-service.test.js`、`streaming-conversation-service.test.js`、`plan-block-service.test.js`、`crab-interaction-service.test.js`、`cold-start-service.test.js`、`speech-completion-service.test.js`。

infrastructure/ 层部分适配器有 Port 契约测试：`port-contracts.test.js`、`port-adapters.test.js`、`music-source-port.test.js`、`netease-auth-repository.test.js`。

### 覆盖缺口

| 缺口 | TESTING-STANDARD.md 要求 | 当前状态 | 影响 |
|------|------------------------|---------|------|
| Repository 集成测试 | 内存 SQLite 验证 7 个仓储 | ❌ 无 | 仓储实现变更无回归保护 |
| Adapter 契约测试 | NeteaseMusicSource / WeatherAdapter / SpeechSynthAdapter 契约一致性 | ❌ 无 | 适配器替换时行为可能漂移 |
| REST 契约测试 | 响应体 `{code, data, traceId, msg}` schema 校验 | ❌ 无 | API 变更无前后端一致性保护 |
| Socket 契约测试 | Socket payload schema 校验 | ❌ 无 | Socket 事件格式变更无保护 |
| E2E 核心流程 | 冷启动 + 播放主持全链路 | ❌ 无 | 发布前无全链路验证 |
| services/ 单元测试 | 12 个遗留文件应有独立单元测试 | 🟡 部分（仅 characterization tests） | 遗留代码行为锁定不完整 |
| CI 门禁脚本 | test + arch:check + coverage + lint 全绿才合并 | ❌ 无 | 依赖人工自觉执行 |

---

## 建设排期

### 阶段 1：覆盖率基础设施

安装覆盖率工具并配置阈值门禁，使覆盖率从"不可量化"变为"可度量、可阻断"。

| 任务 | 具体操作 | 验收信号 |
|------|---------|---------|
| 安装 `@vitest/coverage-v8` | `cd server && npm i -D @vitest/coverage-v8`；`cd client && npm i -D @vitest/coverage-v8` | `npx vitest run --coverage` 输出报告 |
| 配置 server 覆盖率阈值 | `server/vitest.config.js` 添加 `coverage.thresholds`，按 `TESTING-STANDARD.md` 第 4 节：核心域 ≥80% 行 / ≥70% 分支，支撑域 ≥60%，新增 ≥70% | 低于阈值时 `npm run test:coverage` 退出码非 0 |
| 配置 client 覆盖率阈值 | `client/vitest.config.js` 添加 `coverage.thresholds`：全局 ≥60% 行，contexts/hooks ≥70% | 低于阈值时退出码非 0 |
| 添加 client `test:coverage` 脚本 | `client/package.json` 添加 `"test:coverage": "vitest run --coverage"` | `npm run test:coverage` 可执行 |
| 记录覆盖率基线 | 首次运行 `npm run test:coverage`，记录各目录覆盖率数值到本文档 | 基线数值写入文档 |

### 阶段 2：客户端测试补齐

为 18 个无测试组件和 hook 补充单元测试，并配置 ESLint。

| 任务 | 优先级 | 覆盖目标 | 验收信号 |
|------|--------|---------|---------|
| `useSocket.js` 测试 | P1 | 连接 / 断连 / 重连场景 | ≥3 个用例 |
| `PlayerBar.jsx` 测试 | P1 | 播放/暂停/切歌/mode 切换 UI | ≥5 个用例 |
| `ChatBox.jsx` 测试 | P1 | 消息发送 / 列表渲染 / 折叠 | ≥3 个用例 |
| `DJDialog.jsx` 测试 | P1 | 流式渲染 / REPLY 按钮 / 隐藏 | ≥3 个用例 |
| `BubbleSystem.jsx` 测试 | P1 | 气泡渲染 / 点击回调 / 可见性切换 | ≥3 个用例 |
| `CrabMascot.jsx` 测试 | P2 | 动画状态（idle/listening/talking/bouncing/loading） | ≥5 个用例 |
| `LoginOverlay.jsx` 测试 | P2 | 手机登录 / QR 登录 / 错误提示 | ≥3 个用例 |
| `Layout.jsx` / `TopBar.jsx` 测试 | P2 | 布局渲染 / view 切换 / 天气展示 | ≥3 个用例 |
| `useTheme.js` / `themes.js` 测试 | P2 | 主题切换 / override / 清除 | ≥3 个用例 |
| 其余组件测试 | P3 | Spectrum / PlaylistList / LyricsDisplay / DJBooth / WeatherBar / ProfilePanel | 每个 ≥1 个用例 |
| client ESLint 配置 | P1 | 创建 `client/eslint.config.js`，添加 `"lint": "eslint ."` 到 package.json | `npm run lint` 0 error |

阶段目标：client 测试用例数 ≥ 180，ESLint 0 error，覆盖率 ≥60% 行。

### 阶段 3：集成与契约测试

补齐 `TESTING-STANDARD.md` 要求的集成层和契约层测试。

| 任务 | 具体内容 | 验收信号 |
|------|---------|---------|
| Repository 集成测试 | 7 个仓储（AuthRepository / NeteaseAuthRepository / ListenHistoryRepository / QueueSnapshotRepository / ContextRepository / RemainingRepositories / SchedulerListenHistoryRepository）用内存 SQLite 验证 CRUD | 每仓储 ≥3 个用例（创建 / 读取 / 更新或删除） |
| Adapter 契约测试 | `LegacyNeteaseMusicSourceAdapter` / `LegacyWeatherAdapter` / `LegacySpeechSynthAdapter` 的 Port 方法签名和返回值类型一致性 | 每个 Adapter ≥2 个用例 |
| REST 契约测试 | 校验 `/api/plan/today`、`/api/health`、`/api/profile` 等端点响应体包含 `{code, data}` 或 `{code, traceId, msg}` | 每端点 ≥1 个 schema 校验用例 |
| Socket 契约测试 | 校验 `radio:state`、`radio:song-change`、`radio:dj-message`、`crab:bubbles`、`plan:update` 等 payload 的字段名和类型 | 每事件 ≥1 个 schema 校验用例 |
| 前后端 Socket 事件常量同步校验 | 对比 `client/src/App.jsx` 的 `E` 对象与 `server/socket/handler.js` 的事件名，确保无漂移 | 1 个用例覆盖全部事件名 |

阶段目标：集成测试 ≥ 30 个用例，契约测试覆盖所有公开 REST 端点和核心 Socket 事件。

### 阶段 4：E2E 与 CI 门禁

搭建端到端测试框架和 CI 管道，实现"全绿才合并"的自动化门禁。

| 任务 | 具体内容 | 验收信号 |
|------|---------|---------|
| Playwright 安装与配置 | `cd client && npm i -D @playwright/test`；创建 `playwright.config.js` | `npx playwright test` 可执行 |
| E2E 流程 A：冷启动→登录→播放 | 模拟用户连接 → 登录 → 冷启动动画 → 首歌播放 → DJ 语音 | 1 个 passing scenario |
| E2E 流程 B：切歌→气泡→队列 | 模拟切歌 → 气泡出现 → 点击气泡 → 队列更新 | 1 个 passing scenario |
| E2E 流程 C：设置→主题切换 | 进入 Settings → 切换主题 → 返回播放器 | 1 个 passing scenario |
| E2E 流程 D：聊天→DJ 回复 | 打开聊天 → 发送消息 → DJ 回复 → DJ 语音 | 1 个 passing scenario |
| E2E 流程 E：断连恢复 | 断开服务器 → 断连提示 → 恢复 → 自动重连 | 1 个 passing scenario |
| CI 管道脚本 | 创建 `.github/workflows/ci.yml`（或本地 `scripts/ci.sh`）：`npm test` → `npm run arch:check` → `npm run test:coverage` → `npm run lint` → 契约测试（接口变更时） | CI 脚本可执行，全绿才通过 |
| 合并门禁规则 | PR 合并前 CI 必须全绿；`arch:check` 0 error；覆盖率不低于阈值 | 门禁规则写入 CONTRIBUTING 或 README |

阶段目标：E2E ≥ 5 个场景全部 passing，CI 脚本本地可执行。

---

## 测试金字塔目标态

```
          ╱╲
         ╱E2E╲         10%  Playwright: 冷启动 + 播放 + 切歌 + 气泡 + 聊天 + 断连
        ╱──────╲
       ╱ 集成测试 ╲      20%  Repository(7) + Adapter(3) + 前后端契约
      ╱──────────╲      --   REST schema + Socket payload schema
     ╱   单元测试    ╲    70%  domain(73) + Context(6) + hooks(8) + components(18+)
    ╱────────────────╲  --   arch:check D1-D9
   ╱══════════════════╲
```

| 层级 | 当前用例数 | 目标用例数 | 缺口 |
|------|-----------|-----------|------|
| 单元测试（client） | 123 | ~200 | ~77 |
| 单元测试（server） | ~1057 | ~1200 | ~143 |
| 集成测试 | ~50（含 characterization） | ~150 | ~100 |
| 契约测试 | 0 | ~30 | ~30 |
| E2E | 0 | ~10 | ~10 |
| 架构测试 | 已有（server） | 补充 client | client 待建 |

绞杀重构进度与测试覆盖的关系：`REFACTOR-PRIORITY.md` 中每个绞杀任务都应同步补充对应测试。客户端组件提取（ColdStartOverlay / LoginGate / PlayerView）时为提取后的组件写单元测试；后端 P4-a~P4-e 遗留文件迁移时补充 characterization tests 锁定行为。测试覆盖不是绞杀完成后的补充，而是绞杀过程中的安全网。
