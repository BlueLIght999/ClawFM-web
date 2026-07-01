# Qclaudio 88.7 — 四层整洁架构规范

> 状态：架构定义 + 现状审计。**本文档不改动任何代码。**
> 依据：对 server/ 下 22 个源文件的实际 import 关系扫描（截至重构起点）。

---

## 一、四层与依赖方向

整洁架构铁律：**依赖只能向内，内层永不知道外层。**

```
┌────────────────────────────────────────────────────┐
│ ④ Interface  框架边界 (socket / http / 进程编排)      │
│  ┌──────────────────────────────────────────────┐  │
│  │ ③ Infrastructure  适配器 (网易云/TTS/LLM/DB/天气) │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │ ② Application  用例编排 + Port 接口         │  │  │
│  │  │  ┌──────────────────────────────────┐  │  │  │
│  │  │  │ ① Domain  纯业务逻辑，零外部依赖      │  │  │  │
│  │  │  └──────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

允许的依赖：  ④→③  ④→②  ④→①(类型)  ③→②(实现Port)  ③→①(类型)  ②→①
依赖倒置：    ③ 实现 ② 定义的 Port 接口（③ 编译期依赖 ②，运行期被 ④ 注入）
唯一例外：    bootstrap 组装根可同时 import ③ 与 ②
```

---

## 二、各层职责

| 层 | 职责 | 允许 import | 禁止 import |
|----|------|------------|------------|
| ① Domain | 业务规则、不变量、纯状态机/算法 | 仅自身 | 任何 node 内置(fs/http/net)、任何 SDK、②③④ |
| ② Application | 编排领域对象成用例、定义出站 Port | ① + 自身 ports | ③ ④、具体 SDK |
| ③ Infrastructure | 实现 Port，包装外部世界（防腐层） | ①(类型) + ② ports | ④、其他 ③ 适配器 |
| ④ Interface | 协议翻译（socket/http → 用例调用） | ② + ①(类型) | 不得写业务逻辑 |

---

## 三、目标目录（DDD 分层）

```
server/
├── domain/
│   ├── playback/    Playhead · Queue · SpeechSession · Transition · invariants
│   ├── hosting/     DjPersona · TransitionScript · ProactivePolicy
│   ├── curation/    Recommender · Planner · ListenerProfile · SeedPool
│   └── routing/     IntentRouter (Regex 规则)
├── application/
│   ├── services/    ColdStart · Playback · Conversation · Autonomy
│   └── ports/       MusicSourcePort · SpeechSynthPort · LlmPort · ProfileRepoPort
│                    · WeatherPort · EventPublisher
├── infrastructure/
│   ├── music/ speech/ llm/ persistence/ environment/ auth/
├── interface/
│   ├── socket/ http/ process/
└── bootstrap.js     组装根（唯一跨层装配点）
```

---

## 四、固化依赖规则（护栏，重构期强制）

```
D1  domain/        不得 import  application/ infrastructure/ interface/
D2  domain/        不得 import  任何 node 内置或第三方 SDK
D3  application/   只能 import  domain/ 与 自身 ports/
D4  application/   不得 import  infrastructure/ interface/
D5  infrastructure/可 import   domain/(类型) 与 application/ports/
D6  infrastructure/不得 import  interface/ 或其他 infra 适配器
D7  interface/     可 import   application/ 与 domain/(类型)
D8  仅 bootstrap.js 可同时 import infrastructure + application
D9  跨层只传 domain对象/DTO/原始类型，绝不传 socket/req/res/io
```

---

## 五、现状审计 — 文件到目标层的映射

> ✅ 合规　⚠️ 部分违规（混层）　❌ 严重违规（依赖方向反转）

### ① 应归 Domain 的文件

| 文件 | 现状 import | 判定 | 说明 |
|------|-----------|------|------|
| `services/speech-timer.js` | **无任何 import** | ✅ 合规 | 完美的纯领域对象，可直接迁入 `domain/playback/`，零改动。**全项目唯一的标杆样板。** |
| `services/queue.js` | `db/history.js` | ❌ 违规 D1/D2 | 领域聚合根却 import 持久化层。`init/persist` 把 DB 耦合进了 Queue。需把快照读写抽成 Port，由 application 注入 |
| `services/scheduler.js` | `queue` `db/history` `netease` `speech-timer` | ❌ 违规 D1/D2 | 调度核心却直连 DB 和网易云 API。`getAudioUrl/scrobble/recordListen` 是出站副作用，应走 Port |
| `services/recommender.js` | `queue` `fs` `path` `url` `db(间接)` `netease(间接)` | ❌ 违规 D2 | 推荐算法（核心域）却 import `fs` 直接读写 user/*.md，并直连网易云。算法应纯化，IO 走 Port |
| `services/planner.js` | `OpenAI` `config` `context` `weather` `db/history` | ❌ 违规 D2 | 听单演化算法 + 直连 DeepSeek SDK + 天气 + DB。领域算法与 LLM 调用必须拆开 |
| `services/proactive.js` | `claude` `context` `weather` `tts` `socket/events` | ❌ 违规 D1/D2 **最严重** | "宁缺毋滥"策略（R8 领域规则）却 import 了 `socket/events`（④ 接口层）+ TTS + LLM。**出现了内层 import 外层的反向依赖** |
| `services/router.js` | `netease` `claude` | ❌ 违规 D1 | Regex 路由规则（R6 领域）混入了网易云搜索和 LLM 调用。规则判定应纯化，搜索/分类走 Port |
| `services/context.js` | `fs` `path` `url` `db/history` | ⚠️ 混层 | 6 槽 prompt 组装：槽位拼装逻辑属领域，但 `fs` 读 user 语料 + DB 读历史属 infra。需拆 |
| `services/claude.js` | `OpenAI` `config` `db/history` `fs` | ⚠️ 混层 | DJ 人设（领域）+ DeepSeek 调用（infra）+ DB + 文件读人设。人设模型归 domain/hosting，LLM 调用归 infra |

### ③ 应归 Infrastructure 的文件

| 文件 | 现状 | 判定 | 说明 |
|------|------|------|------|
| `services/netease.js` | `cookie-store` | ✅ 基本合规 | 网易云适配器，位置正确。迁入 `infrastructure/music/`，需实现 `MusicSourcePort` |
| `services/tts.js` | `config` `EdgeTTS` `fs` `path` | ✅ 基本合规 | 双引擎 TTS 适配器，迁入 `infrastructure/speech/`，实现 `SpeechSynthPort` |
| `services/weather.js` | `config` | ✅ 基本合规 | 天气适配器，迁入 `infrastructure/environment/`，实现 `WeatherPort` |
| `db/schema.js` | `sql.js` `fs` `path` `config` | ✅ 合规 | 持久化适配器，迁入 `infrastructure/persistence/` |
| `db/history.js` | `db/schema.js` | ✅ 合规 | 同上。需被 `ProfileRepoPort` 等接口收敛 |
| `utils/cookie-store.js` | `fs` `path` `db/schema` `config` | ✅ 合规 | 鉴权持久化，迁入 `infrastructure/auth/` |

### ④ 应归 Interface 的文件

| 文件 | 现状 import | 判定 | 说明 |
|------|-----------|------|------|
| `socket/handler.js` | 12 个模块（queue/scheduler/recommender/claude/router/context/tts/db/weather/planner/proactive/events） | ❌ 上帝对象 | **绞杀首要目标**。当前直连全部 domain+infra 并内联编排冷启动/过渡/对话/主动。应退化为薄 adapter，仅调 application service |
| `socket/events.js` | 无 | ✅ 合规 | 事件名常量，接口层 |
| `server.js` | express/socket.io/cors + config/db/netease/handler/recommender/queue/scheduler/context/tts | ⚠️ 兼任 bootstrap | 同时是 HTTP 服务和组装根。应拆出 `bootstrap.js` 专做装配（D8 例外点） |
| `index.js` | `child_process` `path` `url` | ✅ 合规 | 进程守护/重启，迁入 `interface/process/` |
| `config.js` | `dotenv` `path` `url` | ✅ 合规 | 横切配置，可被各层读取（约定为只读常量） |

### 死代码（已确认 · 全仓零引用）

> 经全仓 grep 核实：两文件在 `server/` 下**无任何 import 引用**，可安全删除。

| 文件 | 说明 |
|------|------|
| `services/dj-ai.js` | import 与 `claude.js` 几乎一致（OpenAI+config+history），是 `claude.js` 的旧版/重复实现。全仓零引用。**确认可删** |
| `services/playlist-analyzer.js` | 全仓零引用。**确认可删** |

---

## 六、违规热力图（绞杀优先级）

```
🔴 最严重（内层 import 外层 + 内联接口职责）
   proactive.js → socket/events.js   (① 领域 import ④ 接口)
   ⮑ 不止 import 常量：领域策略层直接持有 io 并调用 io.emit
     (DJ_MESSAGE / DJ_STREAM_CHUNK / DJ_STREAM_END / DJ_SPEECH_START)
     → 完全承担了接口层的消息发射职责。绞杀第一刀的接缝点

🟠 严重（领域直连基础设施）
   scheduler.js → db + netease
   queue.js     → db   (init→getLatestQueueSnapshot / persist→saveQueueSnapshot)
   recommender.js → fs + netease
   planner.js   → OpenAI + db + weather
   router.js    → netease + claude

🟡 混层（领域逻辑与 IO 缠绕）
   claude.js    → 人设(domain) + OpenAI(infra) + db
   context.js   → 槽位组装(domain) + fs + db

🟢 上帝对象（接口层职责膨胀）
   handler.js   → 内联全部 4 条流程编排

✅ 已合规
   speech-timer.js（标杆）· netease/tts/weather/db/cookie-store（位置对）
   · events.js · index.js · config.js
```

---

## 七、不变量到层的归属（重构期不可破坏）

| # | 不变量 | 目标层 | 当前散落位置 |
|---|--------|--------|------------|
| R1 | 电台永不静默 | ② Application | handler + scheduler + tts（分散） |
| R2 | 播报必终结 | ① domain/playback/SpeechSession | ✅ speech-timer.js 已就位 |
| R3 | 过渡防竞态(transitionId) | ① domain/playback/Transition | scheduler + handler |
| R5 | current 存在才开播 | ① domain/playback | scheduler.prepareQueue + queue |
| R6 | 高频指令零延迟 | ① domain/routing | router（Regex 先行，已有逻辑） |
| R7 | 画像源于真实历史 | ① domain/curation/ListenerProfile | recommender + db |
| R8 | 宁缺毋滥 | ① domain/hosting/ProactivePolicy | proactive + claude（含反向依赖） |
| R9 | 登录态持久化 | ③ infrastructure/auth | ✅ cookie-store.js 位置对 |

---

## 八、结论与下一步（不动代码）

**合规现状：** 22 个文件中，6 个基础设施 + 3 个接口/配置文件位置基本正确；1 个领域文件（speech-timer）完全合规可作样板。

**核心问题：** 8 个本应属于领域层的文件全部违反 D1/D2（领域直连 DB/SDK/fs），其中 `proactive.js → socket/events.js` 是最严重的反向依赖。`handler.js` 是上帝对象。

**绞杀建议顺序（每步先补特征测试再迁移）：**
1. 先消灭反向依赖：`proactive.js` 不再 import `socket/events`（改为注入 EventPublisher）
2. 定义 6 个 Port 接口契约（接缝点）
3. 把领域纯逻辑从 8 个混层文件中提炼到 `domain/`
4. handler.js 内联编排上移到 `application/services/`
5. 配置 import 边界 lint 规则，自动拦截 D1-D9 违规

**护栏：** speech-timer 已有 7 个测试。后续每迁移一个领域对象，先写特征测试钉住现有行为，再搬。
