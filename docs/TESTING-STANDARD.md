# Qclaudio 88.7 — 测试规范

> **本规范为强制约定：每次代码更新必须遵守测试金字塔与覆盖率门禁。**
> 配合 `ARCHITECTURE-BASELINE.md` / `API-CONTRACT.md` / `ERROR-HANDLING.md` 使用。
> 核心理念：**测试金字塔分层保障质量，架构校验纳入测试体系，全程 TDD（先红后绿）。**
> 状态：规范定义。**本文档不改动任何代码。**

---

## 0. 现状审计（改造基线）

> 下表数据取自已落地的门禁实测值（`npm run quality` / `npm run test:coverage`，2026-09-29）。
> 早先版本此处写「仅 7 个测试、未装覆盖率工具」，早已过时，据实更正。
> 本表的数字会随代码漂移，读数时以命令输出为准；**漂移本身不算缺陷，
> 但不更新会让后来者按错误的地板判断「这次是不是回归了」**。

| 项 | 现状 | 目标 |
|----|------|------|
| 测试框架 | vitest 4.1.9 ✅ | 保留 |
| 现有测试 | **218 个文件 / 2250 个用例，全部通过** ✅ | 随功能同步增长 |
| 覆盖率工具 | @vitest/coverage-v8 ✅ 已接入 | 保留 |
| 实测覆盖率 | 语句 89.99% / 分支 80.41% / 函数 90.9% / 行 91.94% ✅ | 只升不降 |
| 架构测试 | dependency-cruiser ✅（`arch:check`，275 模块零违规） | 纳入门禁 |
| 类型检查 | typescript 5.9.3 + `checkJs` ✅（`types:check`，0 error） | 纳入门禁 |
| 静态门禁 | eslint 10 ✅（0 error） | 纳入门禁 |
| 集成/契约 | 14 个路由/契约/集成测试文件 ✅ | 按金字塔补齐 E2E |

`domain/playback`、`domain/hosting`、`domain/curation` 的覆盖率下限已写入
`vitest.config.js`（行 ≥ 80%、分支 ≥ 70%），`domain/community` 为行 ≥ 90%、
分支 ≥ 80%，`domain/profile` 为行 ≥ 90%、分支 ≥ 75%。

> 三个数字以 `vitest.config.js` 的 `thresholds` 为准，本行不复制其具体值，
> 只描述口径：**门禁是下限，不是目标值**。profile 的分支地板（75）刻意低于
> 实测（86.88），因为它的分支被 ChatHistoryCollector / SearchQueryCollector /
> NeteaseTagSearcher 三个采集器拖住，把地板顶到实测值会让任何一次无关改动
> 都可能踩线。

---

## 0.1 统一门禁（`npm run quality`）

顺序即优先级 —— **先架构冲突，再代码质量**：

| 序 | 命令 | 拦截什么 |
|----|------|---------|
| 1 | `npm run lint` | 风格、复杂度、潜在缺陷 |
| 2 | `npm run arch:check` | D1–D10 依赖禁令、循环、孤儿模块 |
| 3 | `npm run types:check` | JSDoc 与实现分歧、空值路径 |
| 4 | `npm run dup:check` | 重复代码 |
| 5 | `npm test` | 行为回归 |

> 顺序不可调换：架构违规（如 domain 跨上下文 import）会让后续所有修复都建在
> 错误地基上，所以它必须先于类型与风格检查被拦下。

### 墙钟基准不进这条链（`npm run bench`）

判据只有一条：**该文件的红绿是否取决于机器负载**。断言里出现 `Date.now()`
差值（overhead < 100ms、并行总跨度 < 130ms 之类）就算基准，一律移出默认门禁，
文件名以 `-bench.test.js` 结尾，由 `vitest.bench.config.js` 单独收编。

理由不是「跑得慢」，是**可信度**。一条因 CI 跑分机忙而变红的断言，处理方式
几乎总是把阈值调松；调松之后，性能回归就再也没人拦得住。所以基准是在配置里
`exclude`，不是在文件里 `skip` —— 门禁的覆盖面不该取决于调用者当时的环境。

但也不能因此把延迟断言删光：延迟若是这套系统的核心卖点，就必须留一个按需
可跑的信号，否则「优化是否还在省时间」彻底失明。

**移出门禁的断言必须在门禁里留下等价物。** 例：并行派发原用「两工具 start
相差 < 5ms」，移走后由 `react-loop-contract.test.js` 用确定性判据接管
（让先声明的工具 sleep，后声明的检查前者是否已结束）。只移不补＝净损失。


---

## 1. 测试金字塔架构

```
              ╱╲
             ╱E2E╲          10%  端到端：核心业务全链路    发布前灰度
            ╱──────╲
           ╱ 集成测试 ╲       20%  模块交互/DB/外部服务      每日夜间构建
          ╱──────────╲       --   契约测试：接口契约一致性   接口变更时触发
         ╱   单元测试    ╲     70%  领域逻辑/方法/工具,无外部依赖  每次提交必跑
        ╱────────────────╲    --   架构测试：分层依赖/边界规则   每次提交必跑
       ╱══════════════════╲
```

| 层级 | 占比 | 测试范围 | 执行时机 | 本项目工具 |
|------|------|---------|---------|-----------|
| **单元测试** | 70% | 领域逻辑、单个方法、工具类，无外部依赖 | 每次提交必跑 | vitest |
| **架构测试** | — | 分层依赖、模块边界、架构规则校验 | 每次提交必跑 | dependency-cruiser ✅ |
| **集成测试** | 20% | 模块间交互、DB 读写、外部服务调用 | 每日夜间构建 | vitest + 内存 SQLite |
| **契约测试** | — | 跨层/前后端接口契约一致性 | 接口变更时触发 | vitest schema / Pact |
| **端到端测试** | 10% | 核心业务全链路流程验证 | 发布前灰度验证 | (按需) |

### 本项目各层映射

```
单元测试70%  → domain/ 全部纯对象：Playhead Queue SpeechSession Transition
              Recommender Planner ProactivePolicy IntentRouter
              (speech-timer 已是样板)
架构测试     → npm run arch:check：D1-D9 依赖禁令 + 无循环 + 无孤儿
集成测试20%  → Repository 实现(真实内存SQLite) + 各 Adapter 包装外部服务
契约测试     → REST 响应体 {code,data,traceId,msg} + Socket payload schema
E2E 10%      → 流程A冷启动 / 流程B播放主持 全链路
```

---

## 2. 测试用例编写规范

### 2.1 命名规范

```
格式：方法名_场景_预期结果

✅ 例（本项目）：
  speechStarted_afterGenerationTimeout_isNoOp
  fillQueue_seedPoolEmpty_throwsBusinessException
  routeIntent_skipKeyword_returnsNcmSkipWithoutLLM
  cookieStore_windowsPath_writesFileNotDirectory   ← 对应已修 bug

❌ 反例：test1 / works / testQueue
```

### 2.2 结构规范（Given-When-Then）

```js
it('speechStarted_afterGenerationTimeout_isNoOp', () => {
  // Given 前置条件
  const onPlaybackTimeout = vi.fn();
  const timer = new SpeechTimer({ generationTimeoutMs: 10000, onPlaybackTimeout });
  timer.startGeneration();
  vi.advanceTimersByTime(10000); // 生成已超时

  // When 执行操作
  timer.speechStarted(5);

  // Then 验证结果
  vi.advanceTimersByTime(15000);
  expect(onPlaybackTimeout).not.toHaveBeenCalled();
});
```

### 2.3 数据隔离

```
DI1  测试用独立测试数据，禁止依赖公共/生产环境数据
DI2  DB 测试用内存 SQLite（sql.js 本就内存态，每个测试 fresh new Database()）
DI3  禁止测试间共享可变状态；afterEach 清理（vi.useRealTimers / 重置单例）
DI4  外部服务（网易云/DeepSeek/TTS）在单元测试中用注入的 fake Port，不打真实网络
```

### 2.4 核心域全覆盖

```
核心域(playback/hosting/curation)每个业务场景必须覆盖：
  ✅ 正常流程
  ✅ 边界条件（空队列、单曲、超长文本、时长=0）
  ✅ 异常分支（生成超时、播放超时、依赖失败降级）

样板：speech-timer 7 测试 = 正常(started→finished) + 边界(最小超时floor)
      + 异常(生成超时/播放超时/超时后started no-op) + 清理(dispose)
```

---

## 3. 模块与架构测试要求

```
MT1  每个模块的公开API(application service / Port)必须有对应集成测试
MT2  架构测试独立成模块(dependency-cruiser)，与单元测试一同执行，作为架构门禁
MT3  新增模块必须同步补充架构校验规则，纳入统一守护体系
     —— 新增 domain 子模块 → 在 .dependency-cruiser.cjs 加对应 D1-D9 规则
```

### 架构测试作为门禁（已落地）

```
npm run arch:check  →  当前捕获：
  error no-domain-to-interface: proactive.js→socket/events.js  (D4🔴)
  warn  no-domain-to-node-builtins: recommender/context→fs     (D2🟠)

门禁规则：error 数必须为 0 才允许合并（warn 追踪不阻断）
绞杀进度度量：proactive 重构后 error 1→0 即 P0 验收信号
```

---

## 4. 覆盖率门禁

```
核心域(domain/playback,hosting,curation)  行覆盖 ≥ 80%  分支覆盖 ≥ 70%
支撑域(domain/routing + application)        行覆盖 ≥ 60%
新增代码                                    行覆盖 ≥ 70%
核心功能新增                                 必须 100% 覆盖

通用域(infrastructure) 不强制行覆盖率，但每个 Adapter 必须有契约测试(集成层)
```

### 落地配置（待补）

```
安装：  npm i -D @vitest/coverage-v8
配置：  vitest.config.js 设 coverage.thresholds 按上表分目录设阈值
门禁：  npm run test:coverage 低于阈值 → CI 失败
```

---

## 4.1 变异测试门禁（覆盖率的补集）

覆盖率回答的是「这行代码被执行过吗」，变异测试回答的是「这行代码改错
了，测试会不会红」。二者不是同一件事，且**前者不能推出后者**：本项目
实测有三个模块覆盖率数字漂亮却几乎没有一个变异体被杀死——
`domain/community/followRules.js` 0/19 杀死，`domain/routing/mergedIntentResolver.js`
22 个 NoCoverage，`domain/community/dmRules.js` 18 个 NoCoverage。
三者共同的形态是**只有正常路径被测，错误路径从未执行**，而错误路径正是
畸形/恶意输入唯一会走到的分支。

```
工具：  @stryker-mutator/core + @stryker-mutator/vitest-runner (10.x)
配置：  server/stryker.conf.json
运行：  npm run mutate              全量（按 conf 的 mutate 范围）
        npm run mutate:community | mutate:routing | mutate:playback  单域
门禁：  mutation score < 70 → 退出码 1
产物：  server/reports/mutation/{index.html,mutation.json}
```

### 范围与阈值取舍

```
mutate 范围    仅 domain/routing + domain/community + domain/playback
               这是「静默行为改变代价最高」的三个域：选哪首歌、别人看到
               什么、队列完整性。扩大范围是成本决策，不是正确性决策。

break = 70     刻意低于覆盖率地板。变异体存活的原因有两种，只有一种是
               缺陷：等价变异体（equivalence）改的是同一数据的另一种写法，
               no behavioural test can kill it。把阈值抬到覆盖率地板，
               代价是逼着测试去断言内部浮点分数——而这恰恰是变异测试
               想要劝阻的行为。
```

### 等价变异体的判定纪律

```
发现存活的变异体，先问「有没有任何输入能让它和原代码行为不同」，
再决定是补测试还是标记等价。判定必须用 node -e 实测，不能靠推理：

  例 1  L25 去重守卫 `part && !seen.has(part)`
        普通用例里 label 与 second-loop 剥离结果同源，守卫永不起作用；
        只有「label 用 featureToLabelPart（genre_rock→rock），而质心里
        另有一个字面量 'rock' 键」时两条路径才碰撞。实测
        clusterKeywords({genre_rock:1, rock:0.5}) → ["rock"] 才能杀死。

  例 2  stripPrefix 的 artist_top/user_tags_count 别名
        原测试的 {artist_top:1, user_tags_count:0.5} 两个键都进了 label，
        label 路径先供给 'artist'/'tags'，second-loop 根本用不到别名。
        必须把别名键压到第 4/5 位让它跌出 label：
        {genre_rock:1, mood_happy:0.9, ts_night:0.8, artist_top:0.7}
        → ["rock","happy","night","artist"]。

  例 3  ArrayDeclaration 占位符 `["Stryker was here"]`
        Array.isArray 守卫后的空数组换成单元素数组，输出完全一致——
        等价，不补测试。

  例 4  计时器句柄清理的 `if (h)` 守卫被改成恒真
        speechTimer.js 的 speechFinished/dispose 里，每个 clearTimeout
        都包在 `if (this._genTimer)` / `if (this._playTimer)` 中。把守卫
        改成恒真后，最坏情况是 clearTimeout(null)——node 里就是空操作，
        最终状态与原来逐字段相同（实测 clearTimeout(null) → undefined）。
        这类守卫是防御性的，不是行为分支：真实调用路径里句柄一定非空，
        「恒真」这一变异体在全部输入等价。7 个存活者全是这一形状
        （L58/L76/L77/L78/L96/L100/L101），86.27% 即为该模块的可达上限，
        不必再补测试。
```

### 变异分数的读法

```
分数不是越高越好，是「还差多少没解释」。收尾时必须能把每个存活者
逐条归到「等价」或「无输入可达」，归不出来的才算欠账：
  - 已归零的模块（如 TransitionOrchestrator 96.25% 的 3 个存活者是
    console.log 字符串）视为收口；
  - 归不出来的，先怀疑测试的输入选错了点（用 speechStarted(0.5) 这类
    变异不敏感的取值，等于没测），而不是先怀疑等价性。
```

### 与 TDD 铁律的关系

```
变异测试不改变 TDD 的先后顺序，只改变了「一个测试写完了没有」的判据。
测试一次就过的，不构成证据；把对应变异体杀死才构成证据。
stryker.conf.json 设 inPlace:true，直接在工作树上跑变异——
七个断言按相对路径读取 client/ 源码，沙箱拷不出去。代价是：
  1. 不得与其他门禁并发运行；
  2. 中途被杀会留下改过的文件，用 git checkout -- domain/ 复原。
因此变异门禁只在夜间构建跑，不进每次提交的 npm run quality。
```

---

## 5. 与 TDD 铁律的关系

```
本规范的金字塔是"结果形态"，TDD 是"达成路径"——两者一致：

TDD铁律     生产代码落地前必先有失败的测试(RED→GREEN→REFACTOR)
金字塔      这些测试按 70/20/10 分布到 单元/集成/E2E

冲突时以 TDD 铁律为准：
  - 单元测试永远先写(测试驱动设计)
  - 集成/契约/E2E 在用例成形后补，但仍遵循"先看它失败"
  - 覆盖率是结果指标，不是写测试的目的——为覆盖率而写的空测试无意义
```

---

## 6. 执行时机与 CI 门禁

```
每次提交(必跑·快)：
  npm test            单元测试 + 架构测试
  npm run arch:check  D1-D9 (0 error)

每日夜间构建：
  集成测试(真实内存DB + Adapter)

接口变更触发：
  契约测试(REST schema + Socket payload)

发布前灰度：
  E2E 核心流程(冷启动 + 播放主持)

合并门禁(全绿才允许)：
  单元测试✓ + 架构测试0error✓ + 覆盖率达标✓ + (改接口则)契约测试✓
```

---

## 7. 代码更新时的强制检查清单

```
□ 先红后绿：生产代码是否先有失败测试？(TDD铁律)
□ 命名：测试是否 方法名_场景_预期结果？(2.1)
□ 结构：是否 Given-When-Then 三段式？(2.2)
□ 隔离：是否用独立数据/内存DB/fake Port，不碰公共环境与真实网络？(DI1-DI4)
□ 核心域覆盖：正常+边界+异常三类分支是否都覆盖？(2.4)
□ 公开API：新 service/Port 是否有集成测试？(MT1)
□ 新模块：是否同步加了架构校验规则？(MT3)
□ 架构门禁：npm run arch:check 是否 0 error？(MT2)
□ 覆盖率：核心域≥80%行/70%分支，新增≥70%，核心新增100%？(第4节)
□ 输出洁净：测试输出无报错无警告？(TDD验收)
```

---

## 8. 待补齐产物（改造 backlog）

| 产物 | 状态 | 说明 |
|------|------|------|
| @vitest/coverage-v8 + 阈值配置 | ❌ 待装 | 覆盖率门禁落地 |
| domain 单元测试套件 | 🟡 部分 | speech-timer ✅；Queue/Playhead/等待补 |
| Repository 集成测试 | ❌ 待建 | 内存 SQLite 验证 7 个仓储 |
| 契约测试套件 | ❌ 待建 | REST schema + Socket payload |
| E2E 核心流程 | ❌ 待建 | 冷启动 + 播放主持全链路 |
| CI 门禁脚本 | ❌ 待建 | 整合 test+arch+coverage+contract |

---

## 一句话规范

> **金字塔 70/20/10（单元/集成/E2E），架构测试与契约测试纳入门禁；
> 命名"方法名_场景_预期"、Given-When-Then、数据隔离、核心域正常+边界+异常全覆盖；
> 核心域行覆盖≥80%分支≥70%、新增≥70%、核心新增100%；
> 全程 TDD 先红后绿，每次提交跑单元+架构(0 error)，CI 全绿才合并。**
