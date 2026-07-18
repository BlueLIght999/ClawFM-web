# Qclaudio 88.7 — 开发文档管理体系

> 本目录是项目的**开发规范与重构文档中心**。
> **项目开发（写代码、改接口、重构、加功能）必须参照本体系。**

---

## 0. 如何使用本体系

```
开始任何开发任务前：
  1. 读 ARCHITECTURE-BASELINE.md —— 知全貌（四层 + 模块 + 依赖禁令）
  2. 按任务类型查对应规范（见下方导航）
  3. 写代码遵循 TDD（先红后绿）+ CODING-STYLE
  4. 提交前过门禁：npm run quality（lint + arch:check + dup + test）
```

---

## 1. 文档导航

### 顶层蓝图（先读这份）

| 文档 | 作用 |
|------|------|
| [ARCHITECTURE-BASELINE.md](./ARCHITECTURE-BASELINE.md) | **入口**：DDD 四层 + 模块化单体 + 核心依赖禁令 D1-D9 + 整体目标 |

### 架构与领域

| 文档 | 何时查 |
|------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 四层职责、依赖规则、现状违规热力图 |
| [DOMAIN-MODEL.md](./DOMAIN-MODEL.md) | 领域划分（核心/支撑/通用）、实体清单、不变量 R1-R9 |
| [ABSTRACTION-LAYERS.md](./ABSTRACTION-LAYERS.md) | Repository / 中间件 / 模型隔离（DO·DTO·VO） |
| [SEAMS-AND-PORTS.md](./SEAMS-AND-PORTS.md) | 15 个接缝点 + Port 接口契约 + 契约测试要求 |
| [TARGET-DIRECTORY.md](./TARGET-DIRECTORY.md) | 重构后目标目录 + 文件迁移对照表 |

### 编码规范（写代码时查）

| 文档 | 何时查 |
|------|--------|
| [CODING-STYLE.md](./CODING-STYLE.md) | 命名、单一职责、注释、Airbnb 风格 |
| [API-CONTRACT.md](./API-CONTRACT.md) | 改接口（REST/Socket）：契约优先、统一响应、版本、幂等 |
| [ERROR-HANDLING.md](./ERROR-HANDLING.md) | 错误码（6位分层）、异常三分、禁吞没/透传 |
| [TESTING-STANDARD.md](./TESTING-STANDARD.md) | 测试金字塔、命名、覆盖率门禁、架构测试 |

### 记录

| 文档 | 内容 |
|------|------|
| [BUGFIX_LOG.md](./BUGFIX_LOG.md) | 已修复 bug 记录（原因+方案） |
| [PROGRESS-2.0.0.md](./PROGRESS-2.0.0.md) | 当前 2.0.0 重构节点、门禁与下一步 |
| [DESIGN.md](./DESIGN.md) | 产品设计 |

> 终端用户安装指南 `SETUP.md` 保留在项目根目录（面向使用者，非开发者）。

---

## 2. 按任务类型查文档

| 我要做的事 | 必读文档 |
|-----------|---------|
| 加新功能 | BASELINE → DOMAIN-MODEL → CODING-STYLE → TESTING |
| 改接口 | API-CONTRACT → ERROR-HANDLING |
| 重构/迁移文件 | TARGET-DIRECTORY → SEAMS-AND-PORTS → ARCHITECTURE |
| 修 bug | TESTING（先写复现测试）→ ERROR-HANDLING → BUGFIX_LOG（记录） |
| 接外部服务 | SEAMS-AND-PORTS（定义 Port）→ ABSTRACTION-LAYERS |
| 加数据存储 | ABSTRACTION-LAYERS（Repository）→ SEAMS-AND-PORTS |

---

## 3. 强制门禁（提交前必过）

```
npm test            单元测试 + 契约测试全绿
npm run arch:check  架构依赖 D1-D9，必须 0 error
npm run lint        ESLint 风格+质量，0 error
npm run dup:check   重复率 ≤ 5%
npm run quality     一键全跑（lint + arch + dup + test）

任一不过 → 禁止合并
```

工具配置位于 `server/`：`eslint.config.js` · `.prettierrc.json` · `.jscpd.json` · `.dependency-cruiser.cjs`

---

## 4. 不可破坏的铁律

```
TDD 铁律     无失败测试，不写生产代码（RED→GREEN→REFACTOR）
依赖向内     domain 不依赖任何外层；不碰 fs/SDK/socket
模型不透传   DB行/外部API结构不越 infrastructure 边界、不达前端
永不静默     R1：任何 AI/TTS 失败都有降级，电台不沉默
不变量       R1-R9（见 DOMAIN-MODEL）重构全程不可破坏
```

---

## 5. 重构进度（绞杀者模式）

```
✅ P0-1  删死代码 dj-ai.js / playlist-analyzer.js
✅ P0-2  EventPublisher 切断 proactive→socket 反向依赖🔴（arch error 1→0）
⬜ P1    WeatherPort / SpeechSynthPort / LlmPort
⬜ P2    7×Repository / handler 拆分 / MusicSourcePort / CorpusPort

进度量化：npm run arch:check 的 error 数 = 剩余架构债
当前：0 error, 4 warn（context.js→fs，P2 范畴）
```

---

## 一句话

> **开发前读 BASELINE，写码守 TDD + CODING-STYLE，提交过 quality 门禁；
> 依赖向内、模型不透传、电台永不静默、不变量不可破。**
