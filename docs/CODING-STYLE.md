# Qclaudio 88.7 — 代码书写规范

> **本规范为强制约定：每次代码更新必须遵守。**
> 配合 `ARCHITECTURE-BASELINE.md` / `TESTING-STANDARD.md` / `ERROR-HANDLING.md` 使用。
> 技术栈：Node.js ES Modules + 纯 JavaScript + React 19。主参考 **Airbnb JavaScript Style Guide**。
> 状态：规范定义。**本文档不改动任何代码。**

---

## 0. 适用范围与基线

| 项 | 现状 | 规范要求 |
|----|------|---------|
| 语言 | ES Modules 纯 JS（无 TS） | 遵循 Airbnb JS Style Guide |
| 格式化 | ❌ 无 Prettier/ESLint | 引入 Prettier + ESLint(airbnb-base) |
| 最大文件 | handler.js 800+ 行 ❌ | 类/文件 ≤ 500 行 |
| 标杆 | speech-timer.js（单一职责、纯对象、无魔法值）✅ | 全项目对齐此样板 |

---

## 1. 通用编码原则（全语言适用）

### 1.1 单一职责

```
类/方法只做一件事。
  方法长度 ≤ 80 行
  类/文件 ≤ 500 行

❌ 现状违规：socket/handler.js 800+ 行，内联冷启动+过渡+对话+主动 4 条流程
✅ 标杆：speech-timer.js — 一个类只管两阶段超时
整改：handler.js 拆为 4 个 application service（见绞杀路线）
```

### 1.2 可读性优先

```
避免过度炫技；禁止魔法值/硬编码；常量必须语义化命名。

❌ 反例（散落在现有代码）：
   setTimeout(finish, 30000)              // 30000 是什么？
   if (check.code === 803) {...}          // 803 是什么？
   music.volume = 0.1                     // 为什么 0.1？

✅ 正例：
   const SPEECH_GEN_TIMEOUT_MS = 15000;   // speech-timer 已示范
   const QR_CODE_SUCCESS = 803;           // 网易云扫码成功码
   const PROACTIVE_DUCK_VOLUME = 0.1;     // 主动发言时音乐降到 10%
```

### 1.3 最小可见性

```
内部方法/属性默认私有，仅对外必要接口 public。
  JS 无 private 关键字 → 用 # 私有字段 或 _ 前缀约定
  模块只 export 必要的；内部 helper 不 export

✅ speech-timer：_genTimer/_playTimer/_disposed 内部状态，只 export SpeechTimer 类
```

### 1.4 无副作用

```
避免方法隐式修改入参；值对象不可变。

❌ 反例：queue.addSongs(songs) 内部 _fisherYates(songs) 原地打乱了入参数组
✅ 正例：先 copy 再操作 —— const shuffled = [...songs]; shuffle(shuffled)
值对象（Transition/Song DTO）创建后不可变，变更产生新对象
```

### 1.5 禁止重复代码

```
重复逻辑超过 3 次必须抽象；重复率阈值 5%。

❌ 现状违规：
   claude.js / planner.js 各自 new OpenAI(...) —— LLM 客户端重复
   多处 .replace(/<[^>]+>/g, '') —— 情绪标签清洗重复
   多处 song.id || song.song_id —— ID 取值重复
✅ 整改：LlmPort 统一客户端；stripEmotionTags() 工具；songId(song) 工具
```

---

## 2. 主流语言开源规范参考

> 直接采用业界成熟开源规范，避免从零制定。

| 语言/场景 | 采用规范 | 配套工具 | 本项目适用 |
|----------|---------|---------|-----------|
| **JS/Node 后端** | **Airbnb JavaScript Style Guide** | ESLint `eslint-config-airbnb-base` + Prettier | ✅ 主规范 |
| **React 前端** | Airbnb JS + React Style Guide | ESLint `eslint-config-airbnb` | ✅ client/ |
| Java | 阿里巴巴 Java 开发手册（嵩山版） | p3c | 本项目不涉及 |
| Go | Uber Go 编码规范 | golangci-lint | 本项目不涉及 |
| Python | PEP 8 + Google Python Style Guide | flake8/black | 本项目不涉及 |

### 本项目落地约定（Airbnb 关键条目）

```
- 用 const/let，禁止 var
- 优先箭头函数；对象/数组解构
- 模板字符串而非字符串拼接
- === 而非 ==（已普遍遵守）
- 一行一变量声明
- import 顺序：外部包 → 内部模块 → 类型
- 文件名：领域对象 PascalCase(SpeechTimer.js)，工具 camelCase(cookieStore.js)
- 2 空格缩进，单引号，行尾分号（与现有代码一致）
```

---

## 3. 注释与文档规范

### 3.1 强制注释场景

```
必须注释：
  - 类/模块职责（顶部一句话说明）
  - 公开接口方法（功能/入参/返回/异常/约束，见 3.4）
  - 复杂业务逻辑（尤其不变量 R1-R9 相关）
  - 边界条件（为什么是这个阈值）
  - 异常抛出场景（什么条件抛什么码）

✅ speech-timer.js 顶部注释已示范：说明了它修复的 bug 与两阶段超时设计
```

### 3.2 禁止无效注释

```
❌ 不对一目了然的代码加注释：
   i++;                    // i 加一        ← 删
   const user = ...;       // 用户实体       ← 删
   music.pause();          // 暂停音乐       ← 删
```

### 3.3 业务注释说明"为什么"，而非"做了什么"

```
❌ 描述做了什么（代码已经说了）：
   // 设置音量为 0.1
   music.volume = 0.1;

✅ 说明为什么（代码说不出的意图）：
   // 主动发言时音乐降到 10% 而非暂停——保持"电台一直在播"的陪伴感(R1)
   music.volume = PROACTIVE_DUCK_VOLUME;

✅ 真实样板（来自已修 bug）：
   // NetEase QR: 800=过期 803=成功，曾被写反导致扫码成功却当过期(见 BUGFIX_LOG)
```

### 3.4 接口注释必含五要素

```
公开接口/Port 方法注释必须包含：
  1. 功能说明
  2. 入参含义
  3. 返回值
  4. 异常场景
  5. 使用约束

示例（JSDoc 风格）：
/**
 * 合成语音并落地为本地可访问 URL。           // 1功能
 * @param {string} text 待合成文本(已清洗标签)  // 2入参
 * @returns {Promise<string|null>} 本地audioUrl，失败返回 null  // 3返回(含失败语义)
 * @throws 不抛异常——内部降级(DashScope→Edge→null)，由调用方判 null 降级  // 4异常
 * 约束：text 不可为空；调用方负责 R1 降级(null 时走纯文本)  // 5约束
 */
```

---

## 4. 与现有体系的整合

### 4.1 与四层架构

```
- 文件归层后命名/可见性遵循本规范（domain 对象 PascalCase + 纯净无 IO）
- import 顺序辅助体现依赖方向（domain 文件 import 列表应为空——D2）
- npm run arch:check 守护依赖；本规范守护代码内部质量
```

### 4.2 与 TDD（编码与测试同步）

```
- 先写失败测试，再写实现代码——实现代码遵循本规范
- "方法 ≤80 行/类 ≤500 行" 难达成时，通常是设计问题→拆分(呼应 TDD"难测=难用")
- 重构阶段(GREEN 后)按本规范去重、改名、提炼，保持测试绿
```

### 4.3 自动化门禁（待落地）

```
Prettier   统一格式（保存即格式化）
ESLint(airbnb-base)  捕获风格违规 + 部分质量问题
建议 CI：  lint 通过 + arch:check 0 error + test 全绿 → 允许合并
```

---

## 5. 代码更新时的强制检查清单

```
□ 单一职责：方法 ≤80 行？类/文件 ≤500 行？只做一件事？(1.1)
□ 无魔法值：数字/字符串常量是否语义化命名？(1.2)
□ 最小可见性：内部状态是否 #/_ 私有，只 export 必要接口？(1.3)
□ 无副作用：是否未隐式修改入参？值对象是否不可变？(1.4)
□ 不重复：重复逻辑(>3次)是否已抽象？(1.5)
□ 风格：是否符合 Airbnb(const/let、解构、模板串、=== )？(第2节)
□ 强制注释：类职责/公开接口/复杂逻辑/边界/异常 是否注释？(3.1)
□ 无废注释：是否删除了一目了然的注释？(3.2)
□ 注释说为什么：业务注释是否解释意图而非复述代码？(3.3)
□ 接口五要素：公开方法注释是否含 功能/入参/返回/异常/约束？(3.4)
□ 配套：lint 是否通过？arch:check 0 error？测试是否先红后绿？
```

---

## 6. 待补齐产物（改造 backlog）

| 产物 | 状态 | 说明 |
|------|------|------|
| `.prettierrc` | ❌ 待建 | 统一格式（2空格/单引号/分号） |
| ESLint + airbnb-base 配置 | ❌ 待建 | 风格 + 质量门禁 |
| 常量提取（消除魔法值） | 🟡 部分 | speech-timer 已做；handler/tts 待整改 |
| 工具函数去重 | ❌ 待建 | stripEmotionTags / songId / LlmPort |
| JSDoc 补全（公开接口） | ❌ 待建 | Port 接口 + application service |

---

## 一句话规范

> **单一职责（方法≤80行/类≤500行）、无魔法值、最小可见性、无副作用、超3次必抽象；
> JS 遵循 Airbnb Style Guide + Prettier/ESLint；
> 注释只写"为什么"不写"做了什么"，公开接口必含功能/入参/返回/异常/约束五要素；
> 代码与测试同步（先红后绿），lint + arch:check + test 全绿才合并。**
