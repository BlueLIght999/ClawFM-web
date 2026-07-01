# Qclaudio 88.7 — 接口契约规范

> **本规范为强制约定：每次代码更新涉及接口（HTTP 端点 / Socket 事件）时，必须先参考并遵守本文档。**
> 配合 `ARCHITECTURE-BASELINE.md` / `SEAMS-AND-PORTS.md` 使用。
> 适配说明：本项目是 **Socket.IO 实时事件 + 少量 REST** 混合架构（非纯 REST 微服务），
> 原始规范源自 OpenAPI/Proto/Pact 体系，下文保留全部原则并标注实时事件场景的对应落地。

---

## 0. 适用范围与现状

| 接口类型 | 数量 | 位置 | 契约载体 |
|---------|------|------|---------|
| REST 端点 | 13 个 `/api/*` | server.js | OpenAPI (本规范要求补齐) |
| Socket 事件 | 26 个（server↔client） | socket/events.js + handler.js | AsyncAPI / 事件契约表 |

> 现状缺口：当前**无任何接口契约文件**，响应结构不统一（有的 `{loggedIn,profile}`、有的 `{ok,text}`、有的裸对象），无 traceId，无版本号。本规范是改造目标。

---

## 1. 接口设计原则

### 1.1 契约优先（Contract-First）

```
铁律：先定义接口契约，再写实现。禁止边写边改接口。

REST  → 先写 OpenAPI 3.x (openapi.yaml)，评审通过后再实现
Socket→ 先在 events-contract.md 定义事件名 + payload schema，再实现 handler

落地纪律：
  C1  新增/修改任何 /api 端点，先改 openapi.yaml，PR 必须包含契约 diff
  C2  新增/修改任何 socket 事件，先改 events-contract.md 的事件契约表
  C3  实现与契约不一致时，以契约为准，改实现（不改契约去迁就实现）
```

### 1.2 单一职责

```
一个接口只做一件事，禁止万能接口。

✅ 正例（本项目）  POST /api/playlist/:id/play  仅播放指定歌单
❌ 反例            一个 /api/action?type=xxx 分发所有操作

Socket 对应：一个事件一个意图。player:skip 只切歌，不兼做暂停。
            (现有 events.js 已较好遵守——每事件单一语义)
```

### 1.3 向后兼容

```
接口变更优先新增字段，禁止删除/重命名已有字段。

允许   ✅ 新增可选字段；新增事件；扩展枚举值（消费方需容忍未知值）
禁止   ❌ 删除字段；重命名字段；改字段类型；改字段语义

本项目高危点：网易云 song 对象字段（ar/al/dt）当前透传到前端——
  改造时必须经 DTO/VO 映射为稳定字段（见 ABSTRACTION-LAYERS.md ML2），
  之后前端只依赖 DTO 字段，网易云字段变化不再破坏兼容。
```

### 1.4 幂等性

```
所有写操作必须幂等：重复请求产生相同结果，不重复副作用。

通过 幂等号(idempotencyKey) 或 业务唯一标识 实现。

本项目写操作幂等要求：
  player:set-mode      天然幂等（设同一 mode 结果一致）✅
  song:request         需幂等键——同一 requestId 重复提交不重复入队
  auth:login-qr-start  需幂等——重复触发复用进行中的 QR 会话，不重开
  POST playlist/:id/play 需幂等——同 playlistId 短时间重复提交去重
```

---

## 2. 统一请求/响应规范

### 2.1 统一响应体结构（REST）

> 所有 `/api/*` 响应必须用此结构。当前 13 个端点的杂乱结构需逐步收敛到此。

```jsonc
// 成功
{
  "code": 0,                    // 0=成功，非0=失败（对应错误码）
  "data": { /* 业务数据 DTO */ },
  "traceId": "tr_20260101_abc", // 全链路排查，必带
  "msg": "ok"
}
// 失败
{
  "code": 1001,                 // 非0错误码
  "data": null,
  "traceId": "tr_20260101_abc",
  "msg": "Login expired"        // 人类可读错误信息
}
// 分页
{
  "code": 0,
  "data": { "list": [...], "total": 339, "pageNum": 1, "pageSize": 20 },
  "traceId": "...",
  "msg": "ok"
}
```

**规则：**
```
RS1  code=0 成功，非0对应错误码表（需建 error-codes.md）
RS2  所有响应必带 traceId（请求入口生成，贯穿日志/socket/外部调用）
RS3  分页请求统一 pageNum/pageSize，响应统一返回 total
RS4  data 内只放 DTO（camelCase），禁止 DB 行(snake_case) / 网易云原始结构
```

### 2.2 Socket 事件结构（实时对应）

> socket 是双向流，"响应"概念弱化，但仍需统一信封。

```jsonc
// 事件统一信封
{
  "event": "radio:song-change",
  "payload": { /* DTO */ },
  "traceId": "tr_...",          // 由触发链路透传，错误可追溯
  "ts": 1730000000000           // 服务端时间戳
}
// 错误事件 radio:error 统一携带 code
{ "event": "radio:error", "payload": { "code": 5001, "message": "..." }, "traceId": "..." }
```

```
SE1  错误统一走 radio:error 事件，携带 code + message
SE2  流式事件(dj-stream-chunk)用同一 messageId 串联，dj-stream-end 收尾
SE3  payload 只放 DTO，不放网易云原始 song 对象（同 RS4）
```

---

## 3. 接口版本管理

```
REST 采用 URL 版本化：/api/v1/order
  V1  大版本不兼容升级时递增：/api/v1 → /api/v2
  V2  旧版本至少保留 1 个大版本过渡期，下线前提前通知所有调用方

本项目现状：当前是无版本的 /api/auth/status 等。
  改造目标：迁移到 /api/v1/* 前缀；前端同步切换；保留旧路径一个过渡期做 301/兼容。

Socket 事件版本化：
  事件名内含版本或在 handshake 协商 protocolVersion；
  破坏性事件变更 → 新事件名（radio:song-change-v2），旧事件保留过渡期。
```

---

## 4. 契约测试保障

> 原规范指定 **Pact（消费者驱动契约 CDC）**。本项目为单仓库前后端 + Socket 实时，
> 适配为：**REST 用 Pact 风格 CDC，Socket 用事件契约测试（vitest 验证 payload schema）**。

### 4.1 消费者驱动契约（CDC）流程

```
1  调用方(client)定义期望的接口契约（期望的字段、类型、结构）
2  提供方(server)每次构建自动验证契约是否满足
3  接口变更未同步调用方时，流水线直接阻断 —— 避免线上联调故障
```

### 4.2 本项目落地方案

| 接口类型 | 契约测试工具 | 验证内容 |
|---------|-------------|---------|
| REST `/api/*` | Pact (@pact-foundation/pact) 或轻量 schema 断言 | 响应体满足统一结构 RS1-RS4 |
| Socket 事件 | vitest + payload schema 断言 | 事件 payload 满足 events-contract |

```
落地纪律（与 TDD 铁律一致）：
  CT1  新增/改接口，先写契约测试（描述期望契约）—— 此时测试 RED
  CT2  实现满足契约 —— 测试 GREEN
  CT3  CI 跑契约测试；契约不满足 → 流水线阻断，禁止合并
  CT4  Socket 事件 payload 变更，先改契约测试，再改 handler 与 client
```

### 4.3 与现有工具链整合

```
npm test          vitest（含契约测试 + 单元测试 + speech-timer 7 测试）
npm run arch:check dependency-cruiser 架构依赖检查（D1-D9）

CI 门禁（建议）：
  arch:check 0 error  +  test 全绿  +  契约测试全绿  →  允许合并
  任一失败 → 阻断
```

---

## 5. 代码更新时的强制检查清单

> **每次涉及接口的代码更新，提交前逐条核对：**

```
□ 契约优先：是否先改了 openapi.yaml / events-contract.md，再改实现？(C1-C3)
□ 单一职责：新接口是否只做一件事？没做成万能分发接口？(1.2)
□ 向后兼容：是否只新增字段，没删/没改名/没改类型？(1.3)
□ 幂等性：写操作是否有幂等键或业务唯一标识？(1.4)
□ 响应结构：REST 是否用 {code,data,traceId,msg}？Socket 是否带 traceId？(RS1-RS3,SE1)
□ 模型隔离：data/payload 是否只含 DTO，无 DB行/网易云原始结构？(RS4,SE3)
□ 版本管理：破坏性变更是否走新版本号，旧版保留过渡期？(第3节)
□ 契约测试：是否先写契约测试(RED)，再实现(GREEN)？CI 是否会拦截不符？(CT1-CT3)
□ 架构依赖：npm run arch:check 是否 0 error？(D1-D9)
```

---

## 6. 待补齐的契约产物（改造 backlog）

| 产物 | 状态 | 说明 |
|------|------|------|
| `openapi.yaml` | ❌ 待建 | 13 个 REST 端点的 OpenAPI 3.x 契约 |
| `events-contract.md` | ❌ 待建 | 26 个 socket 事件的 payload schema |
| `error-codes.md` | ❌ 待建 | 统一错误码表（code 非0 的含义） |
| 统一响应中间件 | ❌ 待建 | Express 中间件注入 {code,data,traceId,msg} |
| traceId 贯穿 | ❌ 待建 | 请求入口生成，透传日志/socket/外部调用 |
| 契约测试套件 | ❌ 待建 | REST CDC + Socket payload schema 测试 |

> 这些产物按需在对应接口改造时落地，每个都遵循 CT1-CT4（先契约测试 RED，再实现 GREEN）。

---

## 一句话规范

> **契约优先、单一职责、只增不删、写操作幂等；REST 统一 `{code,data,traceId,msg}`、
> 分页 `pageNum/pageSize/total`；URL 版本化、旧版留过渡期；
> 每次改接口先写契约测试（RED→GREEN），CI 拦截契约违背与架构违规。**
