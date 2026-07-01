# Qclaudio 88.7 — 重构后目标代码目录

> 重构的**目标目录树（to-be）**，供查阅与迁移对照。
> 参考业界成熟开源结构（见文末来源），收敛为 domain/application/infrastructure/interface 四层。
> 配合 `ARCHITECTURE-BASELINE.md`（四层规则）/ `SEAMS-AND-PORTS.md`（15 接缝）使用。
> 状态：目录蓝图。**本文档不创建任何文件、不改动代码。**

---

## 0. 参考的开源结构

业界 Node.js DDD/Clean Architecture boilerplate 收敛的四层（domain → application → infrastructure → interface，依赖向内）：
- node-ddd-boilerplate（joshuaalpuerto）— 文件夹布局参考
- clean-architecture-nodejs（javiertelioz）/ nodejs-clean-architecture（SandeshR98）/ clean-arch-ddd-template（juaoantonio）
- Milan Jovanović《Clean Architecture Folder Structure》— 按层组织的解释

本项目在四层基础上，domain 内按**领域模块**（playback/hosting/curation/routing）再分包——即"模块化单体"。

---

## 1. 全局目录树（目标态）

```
claude-fm/
├── client/                          # React 前端（本次后端重构不动，仅标注边界）
│   └── src/ ...
│
├── server/
│   ├── src/                         # ★所有生产代码迁入 src/（与 boilerplate 对齐）
│   │   │
│   │   ├── domain/                  # ① 领域层 — 纯业务，零外部依赖
│   │   │   ├── playback/            #   核心域① 播放调度
│   │   │   │   ├── Playhead.js
│   │   │   │   ├── Queue.js
│   │   │   │   ├── SpeechSession.js          (← services/speech-timer.js 迁入改名)
│   │   │   │   ├── Transition.js
│   │   │   │   └── invariants.js             (R1-R5 集中声明)
│   │   │   ├── hosting/             #   核心域② DJ 主持
│   │   │   │   ├── DjPersona.js
│   │   │   │   ├── TransitionScript.js
│   │   │   │   └── ProactivePolicy.js        (R8 "宁缺毋滥")
│   │   │   ├── curation/            #   核心域③ 推荐与听单
│   │   │   │   ├── Recommender.js
│   │   │   │   ├── Planner.js
│   │   │   │   ├── ListenerProfile.js        (R7 源于真实历史)
│   │   │   │   └── SeedPool.js
│   │   │   ├── routing/             #   支撑域④ 意图路由
│   │   │   │   └── IntentRouter.js           (R6 Regex 先行)
│   │   │   └── errors/              #   领域异常（ERROR-HANDLING 第2节）
│   │   │       ├── AppException.js
│   │   │       ├── ParamException.js
│   │   │       ├── BusinessException.js
│   │   │       └── SystemException.js
│   │   │
│   │   ├── application/             # ② 应用层 — 用例编排 + 出站端口
│   │   │   ├── services/
│   │   │   │   ├── ColdStartService.js       (流程A)
│   │   │   │   ├── PlaybackService.js        (流程B ★)
│   │   │   │   ├── ConversationService.js    (流程C)
│   │   │   │   └── AutonomyService.js        (流程D)
│   │   │   ├── ports/               #   ★15 接缝接口（SEAMS-AND-PORTS）
│   │   │   │   ├── repos/
│   │   │   │   │   ├── ListenHistoryRepository.js
│   │   │   │   │   ├── SeedPoolRepository.js
│   │   │   │   │   ├── ListenerProfileRepository.js
│   │   │   │   │   ├── ChatHistoryRepository.js
│   │   │   │   │   ├── QueueSnapshotRepository.js
│   │   │   │   │   ├── PlanRepository.js
│   │   │   │   │   └── AuthRepository.js
│   │   │   │   ├── services/
│   │   │   │   │   ├── MusicSourcePort.js
│   │   │   │   │   ├── SpeechSynthPort.js
│   │   │   │   │   ├── LlmPort.js
│   │   │   │   │   └── WeatherPort.js
│   │   │   │   └── infra/
│   │   │   │       ├── EventPublisher.js     (P0 第一刀)
│   │   │   │       ├── CachePort.js
│   │   │   │       ├── CorpusPort.js
│   │   │   │       └── BlobStoragePort.js
│   │   │   └── dto/                 #   DTO 定义（模型隔离 camelCase）
│   │   │       ├── SongDTO.js
│   │   │       ├── RadioStateDTO.js
│   │   │       └── ...
│   │   │
│   │   ├── infrastructure/          # ③ 基础设施层 — 适配器实现 Port（防腐）
│   │   │   ├── music/
│   │   │   │   └── NeteaseAdapter.js         (MusicSourcePort; ar/al/dt→Song 映射★)
│   │   │   ├── speech/
│   │   │   │   ├── DashScopeAdapter.js       (SpeechSynthPort 主)
│   │   │   │   └── EdgeAdapter.js            (SpeechSynthPort 备/降级)
│   │   │   ├── llm/
│   │   │   │   └── DeepSeekAdapter.js        (LlmPort; 合并 claude+planner 重复客户端)
│   │   │   ├── persistence/
│   │   │   │   ├── sqliteClient.js           (← db/schema.js)
│   │   │   │   └── repositories/             (7× Repository 实现, DO→Domain 映射)
│   │   │   │       ├── SqliteListenHistoryRepo.js
│   │   │   │       └── ...
│   │   │   ├── environment/
│   │   │   │   └── OpenMeteoAdapter.js       (WeatherPort)
│   │   │   ├── auth/
│   │   │   │   └── CookieStore.js            (AuthRepository; ← utils/cookie-store.js)
│   │   │   ├── cache/
│   │   │   │   └── InMemoryCache.js          (CachePort; 收编4处散落Map)
│   │   │   └── storage/
│   │   │       ├── FileCorpus.js             (CorpusPort; user/*.md)
│   │   │       └── FileBlobStorage.js        (BlobStoragePort; tts mp3)
│   │   │
│   │   ├── interface/               # ④ 接口层 — 协议边界（薄）
│   │   │   ├── socket/
│   │   │   │   ├── handler.js                (← 退化为薄 adapter, ~100行)
│   │   │   │   ├── events.js                 (事件名常量)
│   │   │   │   └── SocketEventPublisher.js   (EventPublisher 实现)
│   │   │   ├── http/
│   │   │   │   ├── routes.js                 (13 REST 端点)
│   │   │   │   ├── responseEnvelope.js       (统一 {code,data,traceId,msg})
│   │   │   │   └── errorMiddleware.js        (全局异常处理 EH4)
│   │   │   └── process/
│   │   │       └── neteaseProc.js            (NeteaseAPI 子进程生命周期)
│   │   │
│   │   ├── shared/                  # 横切（被各层共享的纯工具/常量）
│   │   │   ├── constants.js                  (消除魔法值: 超时/音量/QR码)
│   │   │   ├── traceId.js                    (traceId 生成/透传)
│   │   │   └── text.js                       (stripEmotionTags 等纯工具)
│   │   │
│   │   ├── config.js                # 配置（只读常量, 各层可读）
│   │   └── bootstrap.js             # ★组装根: 实例化适配器→注入service (唯一跨层装配 D8)
│   │
│   ├── index.js                     # 进程入口/守护（spawn server, 自动重启）
│   │
│   ├── __tests__/                   # 测试（镜像 src 结构）
│   │   ├── domain/
│   │   │   └── playback/
│   │   │       └── SpeechSession.test.js     (← speech-timer.test.js, 7测试样板)
│   │   ├── application/
│   │   ├── infrastructure/          (Repository/Adapter 契约测试, 内存SQLite)
│   │   └── e2e/                     (流程A/B 全链路)
│   │
│   ├── eslint.config.js             # 质量门禁配置
│   ├── .prettierrc.json
│   ├── .jscpd.json
│   ├── .dependency-cruiser.cjs      # D1-D9 架构门禁
│   └── package.json
│
├── docs/                            # ★规范文档集中（当前散在根目录, 建议归拢）
│   ├── ARCHITECTURE-BASELINE.md
│   ├── ARCHITECTURE.md
│   ├── DOMAIN-MODEL.md
│   ├── ABSTRACTION-LAYERS.md
│   ├── SEAMS-AND-PORTS.md
│   ├── API-CONTRACT.md
│   ├── ERROR-HANDLING.md
│   ├── TESTING-STANDARD.md
│   ├── CODING-STYLE.md
│   ├── QUALITY-GATES.md
│   ├── TARGET-DIRECTORY.md          (本文)
│   └── BUGFIX_LOG.md
│
├── user/                            # 用户偏好语料（FileCorpus 读取）
│   ├── taste.md  routines.md  mood-rules.md  playlists.json
├── data/                            # 运行时数据（gitignore）
│   ├── radio.db  cookies.json  tts/
├── SETUP.md
└── package.json                     # 根: npm start 编排
```

---

## 2. 现有文件 → 目标位置 迁移对照表

| 现状文件 | 目标位置 | 层 | 备注 |
|---------|---------|----|----|
| services/speech-timer.js | domain/playback/SpeechSession.js | ① | ✅样板,直接迁 |
| services/queue.js | domain/playback/Queue.js | ① | 去 db 依赖,快照走 Port |
| services/scheduler.js | domain/playback/Playhead.js + application/PlaybackService.js | ①+② | 拆分:状态机归domain,编排归app |
| services/recommender.js | domain/curation/Recommender.js | ① | 去 fs/netease,走 Port |
| services/planner.js | domain/curation/Planner.js | ① | 去 OpenAI/db,走 LlmPort |
| services/claude.js | domain/hosting/DjPersona.js + infrastructure/llm/DeepSeekAdapter.js | ①+③ | 拆:人设归domain,LLM调用归infra |
| services/proactive.js | domain/hosting/ProactivePolicy.js + application/AutonomyService.js | ①+② | 切 socket 反向依赖🔴 |
| services/router.js | domain/routing/IntentRouter.js | ① | Regex纯化,搜索/分类走Port |
| services/context.js | domain(槽位组装) + infrastructure/storage(读语料) | ①+③ | 拆 |
| services/netease.js | infrastructure/music/NeteaseAdapter.js | ③ | 实现 MusicSourcePort |
| services/tts.js | infrastructure/speech/{DashScope,Edge}Adapter.js | ③ | 实现 SpeechSynthPort |
| services/weather.js | infrastructure/environment/OpenMeteoAdapter.js | ③ | 实现 WeatherPort |
| db/schema.js | infrastructure/persistence/sqliteClient.js | ③ | |
| db/history.js | infrastructure/persistence/repositories/* | ③ | 拆成 7 个 Repo 实现 |
| utils/cookie-store.js | infrastructure/auth/CookieStore.js | ③ | |
| socket/handler.js | interface/socket/handler.js（瘦身） | ④ | 800→~100行,编排上移app |
| socket/events.js | interface/socket/events.js | ④ | ✅ |
| server.js | interface/http/* + bootstrap.js | ④ | HTTP路由与组装根分离 |
| index.js | index.js（保留进程守护） | — | ✅ |
| **services/dj-ai.js** | **删除** | — | 死代码,零引用 |
| **services/playlist-analyzer.js** | **删除** | — | 死代码,零引用 |

---

## 3. 目录组织规范

```
DIR1  生产代码全部在 server/src/ 下（与 boilerplate 对齐；index.js 进程入口在 src 外）
DIR2  domain 按领域模块(playback/hosting/curation/routing)分包，模块内聚
DIR3  ports 按种类分 repos/services/infra 三组
DIR4  infrastructure 按能力分目录，一适配器一文件，命名 XxxAdapter / XxxRepo
DIR5  __tests__ 镜像 src 结构，测试文件路径 = 被测文件路径
DIR6  bootstrap.js 是唯一可同时 import infrastructure + application 的文件
DIR7  文档归拢到 docs/（当前散在根目录）
DIR8  文件命名：领域对象/类 PascalCase；纯函数工具 camelCase；配置 kebab/dot
```

---

## 4. 迁移顺序（绞杀路线对齐，每步 TDD 护栏）

```
迁移纪律：每迁一个文件——
  1. 先写/迁移特征测试到 __tests__ 镜像位置（钉住现行为, RED→GREEN验证现状）
  2. 移动并改造文件去除越层依赖
  3. 跑 npm run arch:check 确认 0 新增 error
  4. 跑 npm test 确认全绿

阶段0  删死代码 dj-ai.js / playlist-analyzer.js（先确认测试不引用）
阶段1  建 src/ 骨架 + 迁 speech-timer→domain/playback/SpeechSession（最低风险样板）
阶段2  P0: EventPublisher 接口+实现, 切 proactive 反向依赖🔴
阶段3  P1: Weather/Speech/Llm Port + Adapter
阶段4  P2: 7×Repository + Cache, 拆 db/history
阶段5  P3: MusicSourcePort(斩 ar/al/dt 透传) + Corpus/Blob
阶段6  handler 编排上移 application/services, handler 瘦身为薄 adapter
阶段7  文档归 docs/, 全量 npm run quality 转绿
```

---

## 5. 验收标准（目录重构完成的信号）

```
✅ npm run arch:check        0 error（proactive 反向依赖消除）
✅ npm run lint              0 error（handler 拆分后无超长/超复杂度）
✅ npm run dup:check         ≤ 5%
✅ npm run test:coverage     核心域行≥80%/分支≥70%
✅ domain/ 下所有文件 import 列表不含 fs/SDK/socket（D2）
✅ 前端不再出现 song.ar/al/dt（ML2 透传消除）
✅ handler.js ≤ 100 行
✅ server.js 拆为 http/ + bootstrap.js
```

---

## 来源（开源结构参考）

- [node-ddd-boilerplate folder-structure](https://github.com/joshuaalpuerto/node-ddd-boilerplate/blob/master/docs/organization-architecture/folder-structure.md)
- [javiertelioz/clean-architecture-nodejs](https://github.com/javiertelioz/clean-architecture-nodejs/blob/main/README.md)
- [SandeshR98/nodejs-clean-architecture](https://github.com/SandeshR98/nodejs-clean-architecture)
- [juaoantonio/clean-arch-ddd-template](https://github.com/juaoantonio/clean-arch-ddd-template)
- [Milan Jovanović — Clean Architecture Folder Structure](https://www.milanjovanovic.tech/blog/clean-architecture-folder-structure)
- [Clean Architecture and DDD in Practice 2025](https://wojciechowski.app/en/articles/clean-architecture-domain-driven-design-2025)

---

## 一句话目录

> **server/src/ 下四层：domain（按 playback/hosting/curation/routing 分包）/ application（services+ports+dto）/ infrastructure（按能力分 Adapter+Repo）/ interface（socket+http+process）；bootstrap 组装、shared 横切、__tests__ 镜像；先删 2 个死代码，迁移每步 TDD + arch:check 护栏。**
