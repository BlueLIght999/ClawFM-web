# Qclaudio 88.7 — 领域划分参考（DDD）

> 重构查阅文档。配合 `ARCHITECTURE.md`（四层规则）使用。
> 本文回答：**每个东西属于哪个领域、是什么实体、受哪条不变量约束、当前在哪个文件。**

---

## 0. 三类领域总览

| 区域 | 含义 | 重构态度 | 包含 |
|------|------|---------|------|
| **核心域 CORE** | 产品差异化价值所在 | 最谨慎，必须可单测，先补特征测试再动 | ① 播放调度 ② DJ 主持 ③ 推荐与听单 |
| **支撑域 SUPPORTING** | 服务核心，可替换实现 | 接口隔离，可较激进 | ④ 意图路由 |
| **通用域 GENERIC** | 现成方案可替换 | 绞杀最先动，建防腐层 | ⑤~⑪ 音乐源/TTS/LLM/鉴权/天气/持久化/传输 |

> 决策记录：推荐与听单**从支撑域升入核心域**——个性化推荐 + 听单演化是与 DJ 人格同等的差异化价值。

---

## 1. 核心域 CORE

### ① 播放调度 Playback —— 系统心脏

> "电台"区别于"播放器"的本质：连续、无缝、有主持人介入的播放流。

| 实体 | 类型 | 职责 | 不变量 | 当前文件 |
|------|------|------|--------|---------|
| `Playhead` | 聚合根 | 播放头状态机：当前曲/起始时刻/时长/播放中 | startedAt 单调；isPlaying 与音频一致 | scheduler.js（内联） |
| `Queue` | 聚合根 | past ← current → future + 三模式 | current 唯一、去重、mode∈{seq,shuffle,fm} | queue.js |
| `SpeechSession` | 实体 | 播报两阶段超时状态机（生成→播放→终态） | **R2: 任一终态必推进队列** | speech-timer.js ✅已就位 |
| `Transition` | 值对象 | 过渡：transitionId / prev / next / say / audioUrl | **R3: transitionId 失效则丢弃（防竞态）** | scheduler+handler（散落） |

**核心流程 B（播放与曲间主持）★：**
```
歌曲播放 → 临近结束(crossfade前2.5s) → 生成过渡词 → TTS → 播报 → 推进下一首
```
**铁规则：** DJ 说话时音乐暂停/降音量；播报失败或超时必须自动推进；**永不静默**。

### ② DJ 主持 Hosting —— AI 灵魂

> "AI DJ"区别于"推荐算法"的本质：人格、语气、克制。

| 实体 | 类型 | 职责 | 不变量 | 当前文件 |
|------|------|------|--------|---------|
| `DjPersona` | 实体 | 人设模型、时段语气矩阵、模式切换 | 4 时段差异化语气 | claude.js + dj-persona.md |
| `TransitionScript` | 值对象 | 过渡词领域模型（say/reason/segue） | 字段契约、长度约束 | claude.js（内联） |
| `ProactivePolicy` | 领域服务 | "宁缺毋滥"决策规则（5 白名单条件） | **R8: 保守，没特别的事不说话** | proactive.js（含反向依赖🔴） |

**核心流程 A（冷启动）** + **流程 D（自主发言决策）** 由本域驱动。

### ③ 推荐与听单 Curation —— 个性化引擎

> 升入核心域。让电台"越来越懂你"的差异化能力。

| 实体 | 类型 | 职责 | 不变量 | 当前文件 |
|------|------|------|--------|---------|
| `Recommender` | 领域服务 | 多策略排序（genreHints→FM→相似→日推→搜索） | 去重、防最近重复 | recommender.js |
| `Planner` | 领域服务 | 听单计划演化（3-5 主题块） | 3-5 块、按时段/天气演化 | planner.js |
| `ListenerProfile` | 实体 | 画像：topArtists/seedPool/history | **R7: 源于真实播放历史，不臆造** | recommender+db（散落） |
| `SeedPool` | 值对象 | 从用户歌单拆出的候选曲库 | — | recommender+db |

---

## 2. 支撑域 SUPPORTING

### ④ 意图路由 Routing

> 唯一的纯支撑域：不产生差异化价值，只把用户输入翻译成对核心域的调用。

| 实体 | 类型 | 职责 | 不变量 | 当前文件 |
|------|------|------|--------|---------|
| `IntentRouter` | 领域服务 | Regex 快路（13 模式/40+ 关键词）+ LLM 7 分类 | **R6: 高频指令零延迟（Regex 先于 LLM）** | router.js |

**双层设计：** Regex < 1ms（约 85% 输入）→ 搜索直连 50-200ms → LLM 800-1500ms（约 15%）。
**优先级铁律：** `reject_recommend` 必须排在 `play_personalized` 之前（破坏性最高的意图优先匹配）。

---

## 3. 通用域 GENERIC

> 全部应在 `infrastructure/`，实现 application 定义的 Port，可热插拔。

| # | 领域 | 实现 Port | 包装的外部依赖 | 当前文件 | 位置 |
|---|------|----------|--------------|---------|------|
| ⑤ | 音乐源 MusicGateway | MusicSourcePort | localhost:3000 网易云 | netease.js | ✅对 |
| ⑥ | 语音合成 TTS | SpeechSynthPort | DashScope + Edge（双引擎降级） | tts.js | ✅对 |
| ⑦ | LLM 网关 | LlmPort | DeepSeek OpenAI-compat | claude.js（与人设混层⚠️） | 需拆 |
| ⑧ | 鉴权 Auth | (Auth) | 扫码/手机 + Cookie 双写 | cookie-store.js | ✅对 |
| ⑨ | 天气地理 Environment | WeatherPort | Open-Meteo + IP/GPS | weather.js | ✅对 |
| ⑩ | 持久化 Persistence | ProfileRepoPort 等 | SQLite (sql.js) | db/schema.js + db/history.js | ✅对 |
| ⑪ | 实时传输 Transport | EventPublisher | Socket.IO | socket/handler.js + events.js | ④接口层 |

---

## 4. 四条核心业务流程

```
流程A 冷启动     登录确认 → 队列预备 → DJ开场白 → TTS → 首曲切入
                  规则: 开播前必有 current(R5); 开场白失败不阻塞放歌(R1)

流程B 播放主持★  播放 → 临近结束 → 过渡词 → TTS → 播报 → 推进
                  规则: 说话时音乐让位(R4); 失败/超时必推进(R2); 永不静默(R1)

流程C 对话控制   用户输入 → 意图路由 → (操作队列|推荐|闲聊) → DJ回应
                  规则: 高频零延迟(R6); 拒绝可回滚

流程D 自主行为   定时检查 → 该不该说话/换计划 → 主动发言|刷新听单
                  规则: 宁缺毋滥(R8); 不打断进行中的播报
```

---

## 5. 不变量总表（重构全程不可破坏）

| # | 规则 | 归属域/层 | 当前状态 |
|---|------|----------|---------|
| R1 | 电台永不静默 | 核心①/application | 散落 handler+scheduler+tts |
| R2 | 播报必终结 | 核心① domain/playback/SpeechSession | ✅ speech-timer 已就位 |
| R3 | 过渡防竞态 | 核心① domain/playback/Transition | 散落 scheduler+handler |
| R4 | DJ说话音乐让位 | 前端（本次后端重构范围外） | client App.jsx |
| R5 | current 存在才开播 | 核心① domain/playback | scheduler.prepareQueue+queue |
| R6 | 高频指令零延迟 | 支撑④ domain/routing | router（Regex 先行） |
| R7 | 画像源于真实历史 | 核心③ domain/curation/ListenerProfile | recommender+db |
| R8 | 宁缺毋滥 | 核心② domain/hosting/ProactivePolicy | proactive（含反向依赖🔴） |
| R9 | 登录态持久化 | 通用⑧ infrastructure/auth | ✅ cookie-store 已就位 |

---

## 6. 绞杀重构路线（从外到内）

```
第1圈 通用域 → infrastructure  最低风险，先动
  Auth / Weather / QR 抽适配器；消灭 proactive→socket/events 反向依赖🔴

第2圈 application 服务抽离
  冷启动→ColdStartService  过渡→PlaybackService
  对话→ConversationService  主动→AutonomyService
  handler 回调体退化为"收事件→调service→发结果"

第3圈 domain 纯逻辑提炼 + Port  最危险，先补特征测试
  Queue/Playhead/SpeechSession/Transition 迁入 domain，去 socket/db 依赖
  service 通过 Port 调 infra（依赖倒置）

终态  handler.js ≈ 100 行薄 adapter
```

**护栏：** speech-timer 已有 7 个测试，是 domain 迁移的标杆样板。每迁移一个领域对象，**先写特征测试钉住现有行为（RED→GREEN 验证现状），再搬**。

**先删死代码：** `dj-ai.js` / `playlist-analyzer.js` 全仓零引用，确认可删。

---

## 7. 重构时的速查口诀

- 不确定一个文件归哪层？→ 看它 import 了什么。import 了 fs/SDK/socket 就**不是** domain。
- 不确定一个规则放哪？→ 查第 5 节不变量总表。
- 要动核心域文件？→ 先写特征测试。
- 要加生产代码？→ 先有失败的测试（TDD 铁律）。
- 跨层只传 domain 对象/DTO/原始类型，**绝不传 socket/req/res/io**。
