# Qclaudio 88.7 — 错误码与异常处理规范

> **本规范为强制约定：每次代码更新涉及错误处理、异常捕获、错误返回时，必须遵守本文档。**
> 配合 `API-CONTRACT.md`（统一响应体 code 字段）/ `ARCHITECTURE-BASELINE.md` 使用。
> 适配说明：原规范的模块编码（用户/订单/支付）已映射为本项目真实领域模块。
> 状态：规范定义。**本文档不改动任何代码。**

---

## 0. 现状审计（改造基线）

> 当前**无统一错误码、无异常分层、存在吞没异常**，是本规范要消灭的问题：

| 问题 | 现状位置 | 违规 |
|------|---------|------|
| 吞没异常（catch 后静默） | router.js `catch {}`（多处）、handler.js QR 轮询 `catch { /* keep polling */ }` | ❌ 禁止吞没 |
| 底层异常透传 | netease.js `callApi` 直接 `throw e`（fetch/JSON 异常裸抛） | ❌ 禁止透传 |
| 错误结构不统一 | `{loggedIn,error}`、`radio:error{code,message}`、裸 throw 混用 | ❌ 需统一 |
| 无 traceId | 全项目无 | ❌ 无法全链路排查 |
| socket 错误码非数字 | `radio:error{code:'AUTH_FAILED'}` 用字符串码 | ⚠️ 需改 6 位数字码 |

---

## 1. 分层错误码设计

采用 **6 位数字错误码**，分层定位问题。

```
┌────────┬──────────┬──────────────────────────────────────┐
│ 位数    │ 含义      │ 取值                                   │
├────────┼──────────┼──────────────────────────────────────┤
│ 1-2 位 │ 模块编码  │ 见下方本项目模块表                       │
│ 3-4 位 │ 错误类型  │ 01参数校验 02业务规则 03系统异常 04权限   │
│ 5-6 位 │ 具体编号  │ 模块内自增                              │
└────────┴──────────┴──────────────────────────────────────┘
```

### 本项目模块编码（适配音乐电台领域）

| 编码 | 模块 | 对应领域 |
|------|------|---------|
| 00 | 通用系统 | 跨模块通用 |
| 01 | 鉴权 Auth | 扫码/手机登录、cookie |
| 02 | 播放 Playback | 调度、队列、播放头 |
| 03 | 音乐源 Music | 网易云搜索/URL/歌词 |
| 04 | DJ 主持 Hosting | 人设、过渡词、TTS |
| 05 | 推荐听单 Curation | 推荐、听单计划 |
| 06 | 意图路由 Routing | 意图识别 |
| 07 | 环境 Environment | 天气、地理 |

### 错误类型（3-4 位）

```
01 = 参数校验错误（ParamException）
02 = 业务规则错误（BusinessException）
03 = 系统异常（SystemException）
04 = 权限错误
```

### 示例（本项目）

```
000101  通用-参数错误-参数为空
010401  鉴权-权限错误-登录已过期（netease cookie 301）
030301  音乐源-系统错误-网易云API调用失败
030201  音乐源-业务错误-歌曲无可用播放URL
040301  DJ-系统错误-TTS双引擎均不可用
050201  推荐-业务错误-种子池为空无法推荐
```

> 全部错误码集中在 `error-codes.js`（常量）+ `error-codes.md`（文档），新增错误必须登记。

---

## 2. 统一异常体系

按异常性质分三类，全局统一处理。

```
                    AppException (基类: code, message, traceId, context)
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
ParamException     BusinessException   SystemException
(参数异常)          (业务异常)          (系统异常)
3-4位=01           3-4位=02            3-4位=03
```

| 异常类 | 性质 | 是否告警 | 前端返回 |
|--------|------|---------|---------|
| **ParamException** | 入参校验不通过 | 否 | 直接返回前端修正提示 |
| **BusinessException** | 可预期的业务规则不满足（无可用URL、种子池空、登录过期） | 否 | 用户友好提示 |
| **SystemException** | 非预期技术故障（网易云超时、DB写失败、TTS全挂） | **是，必须告警** | 通用错误提示（不暴露内部细节） |

### 本项目典型映射

```
登录过期(cookie 301)        → BusinessException 010402  （可预期，提示重新登录）
搜索关键词为空              → ParamException   060101
网易云 API fetch 失败       → SystemException  030301  （告警）
歌曲全音质无 URL            → BusinessException 030201  （降级跳过该曲）
TTS 双引擎均失败            → SystemException  040301  （告警，降级纯文本）
DeepSeek API 超时          → SystemException  040302  （告警，降级 fallback 文案）
```

> 注意：本项目大量"失败即降级"（R1 永不静默）的场景，应抛 **BusinessException** 并由 application 层降级，而非 SystemException——只有真正非预期的技术故障才用 SystemException 并告警。

---

## 3. 异常处理约定

```
EH1  禁止吞没异常
     禁止 catch 后不打日志、不抛出、不处理。
     ❌ 现状违规：router.js `catch {}`、handler.js `catch { /* keep polling */ }`
     ✅ 至少：记录日志(带traceId) + 决定 重抛/降级/转换，三选一并写明意图

EH2  禁止底层异常透传
     数据库/中间件/第三方异常必须包装后抛出，禁止把 SQL/fetch 异常直接返回前端。
     ❌ 现状违规：netease.js `callApi` 直接 throw 原始 fetch error
     ✅ 包装：catch(rawErr) → throw new SystemException(030301, '音乐源不可用', {cause: rawErr})

EH3  异常必须携带上下文
     日志打印 traceId + userId + 关键入参（脱敏），便于排查。
     AppException 构造必带 context: { traceId, userId?, ...keyParams }

EH4  全局统一异常处理器
     接口层(interface)统一拦截所有异常，转换为标准响应体返回。
     REST   → Express error middleware → {code,data:null,traceId,msg}
     Socket → handler 统一 try/catch → emit radio:error{code,message,traceId}
     domain/application 只抛 AppException，不碰 res/socket（D7）
```

### 降级与异常的边界（本项目特有）

```
R1 永不静默 与 异常处理的协作：
  - 可预期失败(BusinessException) → application 捕获 → 执行降级 → 不向用户报错
    例: 歌曲无URL → 跳过该曲；TTS失败 → 纯文本模式
  - 非预期故障(SystemException) → 告警 + 降级 + 记录
    例: 网易云整体不可达 → 告警，用缓存/兜底
  - 降级动作本身要记日志，禁止"静默降级"（用户感知不到但日志必须有痕迹）
```

---

## 4. 与现有体系的整合

### 4.1 与统一响应体（API-CONTRACT.md）

```
AppException.code  →  响应体 code 字段（6位数字）
AppException.message → 响应体 msg 字段
traceId 贯穿 → 响应体 traceId 字段
code=0 仅代表成功；任何 AppException 的 code 非0
```

### 4.2 与四层架构（依赖禁令）

```
domain/        定义并抛 AppException 子类（纯对象，无IO）
application/   捕获 domain 异常 → 决定降级 或 重抛
infrastructure/包装底层异常为 SystemException（EH2 防腐）
interface/     全局异常处理器，转标准响应（EH4）
              —— domain/application 禁止持有 res/socket（D7）
```

### 4.3 与 TDD（异常也要测）

```
ET1  每个 AppException 抛出点，必须有测试验证"在X条件下抛出码Y"（先RED）
ET2  降级路径必须有测试：模拟依赖失败，验证降级行为而非崩溃
ET3  全局异常处理器必须有测试：抛 SystemException → 返回通用提示，不泄漏内部
ET4  契约测试验证错误响应也满足 {code,data:null,traceId,msg} 结构
```

---

## 5. 代码更新时的强制检查清单

> **每次涉及错误/异常处理的代码更新，提交前逐条核对：**

```
□ 错误码：新错误是否分配了 6 位数字码并登记到 error-codes？(第1节)
□ 异常分类：是否用了正确的异常类(Param/Business/System)？(第2节)
□ 告警：SystemException 是否触发告警？业务/参数异常是否未误告警？(第2节)
□ 不吞没：catch 块是否 记日志+重抛/降级/转换 三选一，无静默 catch？(EH1)
□ 不透传：底层(fetch/SQL)异常是否包装后抛出，未裸传前端？(EH2)
□ 带上下文：异常是否携带 traceId + 关键入参(脱敏)？(EH3)
□ 全局处理：是否经 interface 层统一处理器转标准响应？(EH4)
□ 降级有痕：R1降级路径是否记日志，无静默降级？(第3节)
□ 异常测试：抛出点/降级路径是否有测试(先RED)？(ET1-ET4)
□ 架构依赖：domain/application 是否未碰 res/socket？npm run arch:check 0 error？
```

---

## 6. 待补齐产物（改造 backlog）

| 产物 | 状态 | 说明 |
|------|------|------|
| `domain/errors/AppException.js` 等 3 子类 | ❌ 待建 | 异常基类 + Param/Business/System |
| `error-codes.js` + `error-codes.md` | ❌ 待建 | 6位码常量 + 文档登记表 |
| REST 全局异常中间件 | ❌ 待建 | Express error handler → 标准响应 |
| Socket 统一异常处理 | ❌ 待建 | handler 统一 catch → radio:error |
| infrastructure 异常包装 | ❌ 待建 | netease/tts/db 的底层异常包装(EH2) |
| 告警钩子 | ❌ 待建 | SystemException → 日志告警通道 |

> 每个产物落地遵循 TDD：先写"X 条件抛码 Y"的失败测试，再实现。

---

## 一句话规范

> **6位分层错误码（模块+类型+编号）；异常三分 Param/Business/System，仅 System 告警；
> 禁止吞没、禁止底层透传、必带 traceId 上下文、接口层全局统一处理；
> 降级不静默、异常先写测试（RED→GREEN）、domain 不碰 res/socket。**
