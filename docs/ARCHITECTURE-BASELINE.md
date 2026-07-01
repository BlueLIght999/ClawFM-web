# Qclaudio 88.7 — 重构后整体架构基线

> 这是重构的**目标蓝图（to-be baseline）**，整合了：
> `ARCHITECTURE.md`（四层规则）· `DOMAIN-MODEL.md`（领域划分）·
> `ABSTRACTION-LAYERS.md`（Repository/中间件/模型隔离）· `SEAMS-AND-PORTS.md`（接缝与 Port 契约）。
> 风格：DDD + 模块化单体（modular monolith），保留向微服务演进的拆分线。
> 状态：**架构基线定义，不改动任何代码。**

---

## 一、架构范式选型

```
选型：DDD + 模块化单体 (Modular Monolith)
理由：单人/小团队项目，单进程部署简单；按领域模块强隔离，
      每个模块自带四层，未来任一模块可独立抽成微服务而不动其他模块。

演进路径：
  现在   单进程 modular monolith（模块间用 Port 接口通信）
  未来   若某模块需独立伸缩 → 该模块 Port 换成 RPC/HTTP 适配器即可拆出
         (推荐与听单 / TTS 是最可能先拆出的候选)
```

---

## 二、四层架构（每个模块内部都遵循）

```
        ┌──────────────────────────────────────────────┐
        │ ④ interface   协议边界 socket/http/process     │  依赖↓
        │ ③ infrastructure 适配器 实现Port，防腐层        │  依赖↓
        │ ② application 用例编排 + Port接口定义           │  依赖↓
        │ ① domain      纯业务 实体/值对象/不变量 零IO     │  最内核
        └──────────────────────────────────────────────┘

依赖方向： ④→③→②→①  （永远向内）
依赖倒置： ③ 实现 ② 的 Port；运行期由 bootstrap 注入
数据流：   入站 socket→④→②→①决策    出站 ②→EventPublisher→④→emit
```

| 层 | 职责 | 允许依赖 | 禁止依赖 |
|----|------|---------|---------|
| ① domain | 业务规则、不变量、纯状态机/算法 | 仅自身 | node内置/SDK/②③④ |
| ② application | 编排领域、定义出站 Port | ① + 自身 ports | ③④、具体SDK |
| ③ infrastructure | 实现 Port、包装外部世界 | ①(类型) + ②ports | ④、其他③适配器 |
| ④ interface | 协议翻译 socket/http→用例 | ② + ①(类型) | 写业务逻辑 |

---

## 三、模块与包结构规范

```
server/
├── domain/                         ① 核心业务（零依赖，100%可单测）
│   ├── playback/   ★核心域①        Playhead Queue SpeechSession Transition invariants
│   ├── hosting/    ★核心域②        DjPersona TransitionScript ProactivePolicy
│   ├── curation/   ★核心域③        Recommender Planner ListenerProfile SeedPool
│   └── routing/    支撑域④          IntentRouter (Regex规则)
│
├── application/                    ② 用例编排 + 接口契约
│   ├── services/
│   │   ├── ColdStartService.js     流程A 冷启动
│   │   ├── PlaybackService.js      流程B 播放主持 ★心脏
│   │   ├── ConversationService.js  流程C 对话
│   │   └── AutonomyService.js      流程D 自主行为
│   └── ports/                      ★全部接缝接口（15个）
│       ├── repos/   ListenHistory SeedPool ListenerProfile ChatHistory
│       │            QueueSnapshot Plan Auth
│       ├── services/ MusicSourcePort SpeechSynthPort LlmPort WeatherPort
│       └── infra/    EventPublisher CachePort CorpusPort BlobStoragePort
│
├── infrastructure/                 ③ 通用域：适配器实现 Port
│   ├── music/        NeteaseAdapter          (MusicSourcePort)
│   ├── speech/       DashScopeAdapter EdgeAdapter (SpeechSynthPort)
│   ├── llm/          DeepSeekAdapter         (LlmPort)
│   ├── persistence/  SqliteRepos*            (7× Repository)
│   ├── environment/  OpenMeteoAdapter        (WeatherPort)
│   ├── auth/         CookieStore             (AuthRepository)
│   ├── cache/        InMemoryCache           (CachePort)
│   └── storage/      FileCorpus FileBlob     (Corpus/BlobStoragePort)
│
├── interface/                      ④ 协议边界（薄）
│   ├── socket/       handler.js（退化为薄adapter）+ events.js + SocketEventPublisher
│   ├── http/         routes.js
│   └── process/      neteaseProc.js index.js（进程守护）
│
└── bootstrap.js                    组装根（唯一跨层装配点，D8例外）
```

### 包结构规范

```
PK1  每个领域模块(playback/hosting/curation/routing)内聚，跨模块只经 application 编排
PK2  ports/ 按种类分组：repos / services / infra
PK3  infrastructure 按能力分目录，一适配器一文件，命名 XxxAdapter
PK4  一个聚合一个 Repository；不在仓储内跨聚合 join
PK5  bootstrap.js 是唯一能同时 import infrastructure + application 的文件
```

---

## 四、核心依赖禁令（红线，lint 强制）

```
═══════════════ 绝对禁令 ═══════════════
D1  domain/  禁止 import  application/ infrastructure/ interface/
D2  domain/  禁止 import  fs/http/net/path 等node内置 与 任何第三方SDK
D3  application/ 禁止 import infrastructure/ interface/（只能依赖 ports 接口）
D4  禁止任何内层 import 外层（杜绝反向依赖，如 proactive→socket🔴）
D5  禁止 DB行(DO,snake_case) 越过 infrastructure 边界
D6  禁止 外部API原始结构(网易云 ar/al/dt) 透传到前端
D7  禁止 domain/application 持有 io / 调 socket.emit（只走 EventPublisher）
D8  禁止 业务代码 直接 import db/history.js · netease.js · tts.js · OpenAI
D9  跨层只传 领域对象/DTO/原始类型
═══════════════════════════════════════
```

### 模型分层（防表结构透传全链路）

```
DO(snake_case)  ──Repository实现──▶  Domain  ──Service──▶  DTO(camelCase)  ──Adapter──▶  VO(前端)
仅infrastructure                    domain              application                  interface→client
song_id,played_at                  业务对象+行为         songId,startedAt            裁剪+格式化
```

---

## 五、四条核心业务流程归位

| 流程 | application 服务 | 调用的 domain | 经过的 Port |
|------|-----------------|--------------|-------------|
| A 冷启动 | ColdStartService | Queue Playhead DjPersona | Llm Speech MusicSource |
| B 播放主持★ | PlaybackService | Playhead SpeechSession Transition | Llm Speech MusicSource EventPublisher |
| C 对话 | ConversationService | IntentRouter Recommender | Llm MusicSource ProfileRepo |
| D 自主行为 | AutonomyService | ProactivePolicy Planner | Llm Weather EventPublisher |

---

## 六、不变量归位（R1-R9 重构后落点）

| # | 不变量 | 落点 |
|---|--------|------|
| R1 | 电台永不静默 | ② 各 Service 降级路径 |
| R2 | 播报必终结 | ① domain/playback/SpeechSession ✅已就位 |
| R3 | 过渡防竞态 | ① domain/playback/Transition |
| R4 | DJ说话音乐让位 | 前端（后端范围外） |
| R5 | current存在才开播 | ① domain/playback |
| R6 | 高频指令零延迟 | ① domain/routing |
| R7 | 画像源于真实历史 | ① domain/curation/ListenerProfile |
| R8 | 宁缺毋滥 | ① domain/hosting/ProactivePolicy |
| R9 | 登录态持久化 | ③ infrastructure/auth |

---

## 七、绞杀重构路径（从外到内，15 接缝按优先级）

```
P0  EventPublisher        ▶ 第一刀：切 proactive🔴 反向依赖（孤立明确）
P1  Weather/Speech/Llm    ▶ 验证 Port+DI 模式；合并重复 OpenAI 实例
P2  7×Repository + Cache  ▶ 收编 db 散装17函数 + 4处散落Map
P3  MusicSourcePort★      ▶ 斩断网易云字段透传前端（配套 DTO/VO）
P3  Corpus/Blob           ▶ 消灭 domain 的 fs 依赖

每圈终态：handler.js 从 800+行上帝对象 退化为 ~100行薄 adapter
```

---

## 八、TDD 护栏（重构铁律）

```
铁律  任何生产代码落地前，先有失败的测试（RED→GREEN→REFACTOR）

特征测试   迁移核心域文件前，先写特征测试钉住现有行为，再搬
契约测试   每个适配器实现前，先写契约测试验证"满足Port语义"
持续绿灯   speech-timer 的 7 个测试全程 GREEN，是 domain 纯对象样板

红线  domain 模块测试不得依赖 socket/db/网络——能脱离一切外部依赖单测，
      就是分层成功的验收标准
```

---

## 九、先决清理项

```
删死代码（全仓零引用，已核实）：
  services/dj-ai.js            （claude.js 旧版重复实现）
  services/playlist-analyzer.js
→ 删除前先确认现有测试套件不引用，删后跑全测试验证绿灯
```

---

## 十、文档体系导航

| 文档 | 作用 |
|------|------|
| **ARCHITECTURE-BASELINE.md** | 本文：整体目标蓝图（看这一份知全貌） |
| ARCHITECTURE.md | 四层规则 D1-D9 + 现状审计（违规热力图） |
| DOMAIN-MODEL.md | 领域划分 + 实体清单 + 不变量 |
| ABSTRACTION-LAYERS.md | Repository/中间件/模型隔离 RP·MW·ML 规则 |
| SEAMS-AND-PORTS.md | 15 接缝点 + Port 接口契约 + 契约测试要求 |
| BUGFIX_LOG.md | 已修复 bug 记录 |

---

## 一句话基线

> **DDD 四层 + 模块化单体；核心域（播放/主持/推荐）纯净可单测，
> 通用域全部 Port 化可热插拔；依赖只向内、表结构不透传、领域不碰 IO；
> 绞杀从 EventPublisher 第一刀起，handler 终将退化为薄 adapter。
> 全程 TDD 护栏，先红后绿。**
