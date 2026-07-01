# Qclaudio 88.7 — 测试规范

> **本规范为强制约定：每次代码更新必须遵守测试金字塔与覆盖率门禁。**
> 配合 `ARCHITECTURE-BASELINE.md` / `API-CONTRACT.md` / `ERROR-HANDLING.md` 使用。
> 核心理念：**测试金字塔分层保障质量，架构校验纳入测试体系，全程 TDD（先红后绿）。**
> 状态：规范定义。**本文档不改动任何代码。**

---

## 0. 现状审计（改造基线）

| 项 | 现状 | 目标 |
|----|------|------|
| 测试框架 | vitest 4.1.9 ✅ | 保留 |
| 现有测试 | 仅 `__tests__/speech-timer.test.js`（7 个，单元测试） | 扩展到金字塔各层 |
| 架构测试 | dependency-cruiser 已搭建（arch:check）✅ | 纳入测试门禁 |
| 覆盖率工具 | ❌ 未安装 | 安装 @vitest/coverage-v8 |
| 集成/契约/E2E | ❌ 无 | 按金字塔补齐 |

> speech-timer 的 7 个测试是**单元测试样板**：纯对象 + 注入回调 + 假定时器，零外部依赖。

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
