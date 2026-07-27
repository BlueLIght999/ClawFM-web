# ClawFM-web 社区模块 · 需求文档（PRD v0.3）

> 范围：在 ClawFM-web（v2.0.0）server 内新增 **community DDD 模块**。
> 起草：WorkBuddy ｜ 审核：千里江山图 ｜ 日期 2026-07-20
> 状态：**9 项决策已确认，可进 P0 设计与 TDD 编码**。
> 变更：v0.3 在 v0.2 基础上新增 F7 成员 Agent / F8 Agent 互评 / F9 邀请引入。

---

## 0. 一句话目标

让电台听众从"独自听 DJ 说话"变成"一群品味相投的人一起听、一起聊、一起发现"——Agent 用听歌数据把相似的人聚类，把合适的帖子/歌单/歌曲推给同类人；每个成员还有自己的**个人 Agent** 代其评论、可被邀请把歌单与喜好带入他人的发现流。

---

## 1. 背景与现状差距

### 现状（已确认，源码核对）
| 维度 | 现状 | 社区需要 |
|------|------|----------|
| 用户身份 | **单用户**：`netease_auth` 单行（id=1），电台一个网易云账号 | 多成员身份 |
| 听歌数据 | `listen_history` 表 **无 user_id**，全电台共享 | 按成员归属 |
| 实时通道 | Socket.IO **广播**，无 room/join | 房间隔离 |
| 聚类 | `UserClusterAnalyzer` 已有 33 维向量+KMeans，但只做**单用户时序**聚类 | **跨用户**聚类 |
| Agent 工具 | `ToolFactory` 注册 12 个工具（skip/recommend/search_by_genre…） | 新增 community 分发 + 成员 agent 工具 |
| Agent persona | 单一 `prompts/dj-persona.md`，`persona` 作为字符串参数注入 | **每成员一个 persona**（模板拼） |
| 事件 | `profile:cluster` 事件已存在（单用户） | 跨用户 cluster 事件 |

### 关键资产（可直接复用，别重造）
- `server/domain/profile/analyzers/UserClusterAnalyzer.js` — 33 维特征提取 + KMeansClusterStrategy（silhouette 自动选 K，minK=2 maxK=8）+ 质心标签生成
- `server/domain/profile/ProfileOrchestrator.js` — 个人画像编排
- `server/domain/profile/analyzers/{EmotionAnalyzer,DailyHabitAnalyzer,ChatStyleAnalyzer}.js` — 情绪/时段/聊天风格
- `server/agent/application/services/ToolFactory.js` + `domain/toolDefinition.js` — 工具注册模式
- `server/agent/application/services/AgentTurnService.js` + `domain/reactPromptBuilder.js` — agent 循环 + persona 注入（`persona` 是字符串参数，可换成员 persona）
- `server/socket/SocketEventPublisher.js` — 事件发布（领域不直接 emit）
- `server/db/schema.js` — SQLite(sql.js)，`execute()`/`queryAll()` 已带去抖保存
- `server/netease-api`（NeteaseCloudMusicApi）— 支持 **per-request cookie**，可按成员 cookie 调用

---

## 2. 身份与画像模型（已确认）

> 决策：① 身份＝每个成员用自己的网易云账号登录（netease uid 为社区唯一身份）
> ② 画像数据源＝**方案 P-B**：Agent 通过网易云 API 拉取该成员自己账号的听歌历史，融合本电台交互

1. **电台不变**：现有单台（电台的网易云账号驱动）保持原样，与社区解耦。
2. **社区身份**：成员用自己的**网易云账号**登录（复用 `auth:login-qr-start` / `auth:login-phone` 流程），以 **netease uid** 作为社区唯一身份。⚠️ 电台账号 与 成员账号 是**两套独立 cookie**，互不污染。
3. **个人画像数据源 = P-B（三路融合）**：
   - **路 1 · 成员网易云历史**：Agent 用成员 cookie 调 `netease-api` 的 `/user/record`（最近 100 首听歌排行）+ `/user/playlist`（歌单）→ 提取 top artists / 曲风推断 / 听歌量 → 喂入 `artist_affinity` + `genre` 维
   - **路 2 · 本电台交互**：成员在主电台的点赞/跳过/完播/聊天（落 `community_listens`）→ 喂入 `behavior` + `mood` + `chat` 维
   - **路 3 · 自填标签**：成员选的兴趣 tag → `user_tags` 维
   - 融合由 `ProfileOrchestrator` 编排，输出 36 维向量（见 §4）
4. **刷新策略**：成员登录后首次拉取；之后每日刷新一次；画像变更触发增量聚类

> P-B 的代价（已知，接受）：需多账号 cookie 隔离 + 加密存储；netease-api 并发按成员 cookie 调用。

---

## 3. 功能需求

### F1 · 社区成员身份与个人画像
- 成员用网易云登录 → 拿到 netease uid + 昵称 + 头像（复用 `qrLoginHandler`）
- 首次登录：建 `community_members` 记录 + 存成员 cookie（加密，见 §5）
- Agent 触发 `ProfileOrchestrator`：拉网易云历史（路 1）+ 读本电台交互（路 2）+ 自填标签（路 3）→ 生成 36 维个人画像
- 成员可补填/修改兴趣标签

### F2 · 公共帖子（听歌感悟 / 听歌历史分享）
- 成员发帖：文本 + 可选关联歌曲/歌单（从当前电台正在播或搜索）
- 帖子类型：`reflection`（听歌感悟）/ `history`（听歌历史片段）/ `recommend`（推荐一首）/ `comment`（评论，`parent_id` 指向父帖）
- 帖子带自动标签：发帖时 Agent 用 LLM 打 1-3 个标签（曲风/情绪/场景），用于分发
- 支持点赞、评论

### F3 · Agent 跨用户聚类（核心）
- 触发：定时（每 6h）+ 画像变更时增量
- 输入：所有活跃成员的当前画像 → 各自 36 维特征向量
- 算法：复用 `KMeansClusterStrategy`（silhouette 自动选 K，已确认沿用 minK=2 maxK=8），把 N 个成员向量喂进去 → 得到成员簇
- 输出：每成员归入一个 `cluster_id` + 簇标签 + 簇成员列表
- 事件：`community:cluster-updated`

### F4 · Agent 分发（帖子 + 歌单 + 歌曲 → 同类人）
- **Agent 工具** `distribute_to_cluster`（仿 `search_by_genre`）：把目标内容推送给指定簇（或成员所在簇）的所有成员
- 推送通道：Socket 事件 `community:push`（实时在线）+ 落 `community_inbox` 表（离线可见）
- 触发时机：成员发帖 → Agent 判适合哪些簇分发；DJ 播到某歌单 → 推给曲风匹配的簇；成员点赞某歌 → 推给同簇其他人

### F5 · 一起听房间（已确认：房主自有歌单）
- 成员可创建房间（房间名 + 主题标签）；同簇成员优先推荐加入
- 同步模型：**主从同步**——房主用自己的网易云歌单控制播放，成员被动同步——复用现有 `radio:*` 事件机制，但用 **Socket.IO room** 隔离
- 房间内独立聊天（`room:chat`），不影响主电台

### F6 · 社区动态（Feed）
- 全局时间线：最近 N 条帖子 + "谁在听什么"（成员正在听的歌，可选上报）
- 个性化：按成员所在簇加权（同簇成员动态排前）
- 接口：`GET /api/community/feed?cursor=...`

### F7 · 成员 Agent（个人代言人，半自主）🆕
- 每个成员一个 agent，persona 由其 36 维画像 + self_tags **用模板拼**生成（纯函数 `agentPersonaBuilder`）
- **复用现有 agent 循环**：`AgentTurnService` / `ConversationService` / `ToolFactory`，不另起一套；成员 agent 只是用不同 persona + 受限工具集
- **半自主规则**存 `community_member_agent_config`（JSON）：`{ canComment, allowedTopics[], canBeInvited, sharePlaylists }`（无配额字段）
- 成员可在设置页改规则；规则外的行动被 `memberAgentRules`（domain）拒绝

### F8 · Agent 互评（成员触发）🆕
- 成员 B 在 A 的帖子上点"让我的 agent 评论" → B 的 agent 用 B 的 persona 生成评论 → 落 `community_posts`（type=`comment`, `agent_author_user_id`=B, `is_agent`=1）
- 可链式：B 的 agent 评论后，A 可触发自己的 agent 回复 → agent↔agent 评论链（每步成员触发）
- **署名透明**（RC7）：必须标注"由 B 的 agent 代发"，不冒充真人
- 评论受 B 的 `allowedTopics` 约束；无硬配额，靠举报兜底

### F9 · 邀请引入（带歌单 + 喜好，发现流优先）🆕
- 成员 A 邀请成员 B 的 agent → B 的 agent 携带 **B 的歌单 + B 的品味画像**进入 A 的上下文
- **目的地优先级（已定）**：
  1. **A 的发现流**（主）：B 的画像作为"品味信号"融入 A 的 feed 排序/推荐——A 看到的动态/歌单按"B 的品味加权"重排
  2. 一起听房间（次，P2）：B 的歌单加入房间队列
  3. agent 对话（次）：A 与 B 的 agent 对话，它用 B 的歌单推荐
- **双向授权**（RC8）：B 必须在规则里开 `canBeInvited` + `sharePlaylists`，否则邀请被拒
- 邀请状态机：`pending → accepted/rejected → active → ended`

---

## 4. 聚类维度与算法

**结论：复用现有 33 维 + 扩展 3 维 = 36 维向量，跨用户 KMeans（沿用自动选 K）。**

### 现有 33 维（直接用，已在 `UserClusterAnalyzer` 实现）
| 类别 | 维度数 | 标签 | 对应你说的 |
|------|--------|------|-----------|
| genre | 10 | pop/rock/folk/electronic/hiphop/jazz/classical/rnb/metal/indie | 曲风 ✓ |
| mood | 8 | happy/sad/energetic/calm/nostalgic/romantic/angry/dreamy | 听歌品味（情绪面）✓ |
| region | 5 | chinese/english/japanese/korean/instrumental | 地域偏好 |
| behavior | 6 | skip_prone/replay_lover/night_owl/morning_person/explorer/loyalist | 听歌习惯+时段 ✓ |
| chat | 4 | concise/detailed/casual/formal | 聊天风格 |

### 扩展 3 维（新增）
| 新维度 | 来源 | 说明 |
|--------|------|------|
| **artist_affinity** | 成员网易云历史 top-N 歌手权重（路 1） | "歌手/乐队偏爱"——33 维里没有 |
| **time_slot** | 听歌 `played_at` 时段分布（晨/午/晚/夜/深夜 5 桶） | 比 behavior 的 night_owl 更细 |
| **user_tags** | 成员自填兴趣标签 | "tag 标签"聚类 |

### 算法
- 三路数据 → `ProfileOrchestrator` 归一化为 36 维向量
- `KMeansClusterStrategy.cluster(vectors)`（silhouette 自动选 K）
- 相似度兜底：新成员未入簇时，用余弦相似度找最近簇
- 簇标签：复用质心 top-3 特征生成（如 `rock·night_owl·nostalgic`）

---

## 5. 数据模型（新增 SQLite 表）

> 遵循现有 `schema.js` 风格（sql.js）。全部带 `user_id`（netease uid）。**不动现有 `listen_history`**；成员交互单独存 `community_listens`。

```sql
-- 社区成员（netease uid 为主键）
CREATE TABLE community_members (
  user_id TEXT PRIMARY KEY,
  nickname TEXT, avatar_url TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME,
  cluster_id INTEGER,
  self_tags TEXT
);

-- 成员网易云凭据（独立表，加密存储）
CREATE TABLE community_member_netease_auth (
  user_id TEXT PRIMARY KEY,
  netease_uid TEXT NOT NULL,
  cookie_encrypted TEXT NOT NULL,    -- AES 加密
  fetched_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 成员在本电台的交互
CREATE TABLE community_listens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  song_id TEXT, title TEXT, artist TEXT,
  action TEXT NOT NULL,              -- liked/skipped/completed
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 帖子（含 agent 代发标记，v0.3 新增 is_agent/agent_author_user_id）
CREATE TABLE community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,                -- reflection/history/recommend/comment
  parent_id INTEGER,
  content TEXT NOT NULL,
  song_id TEXT, playlist_id TEXT,
  auto_tags TEXT,
  likes INTEGER DEFAULT 0,
  is_agent INTEGER DEFAULT 0,              -- 🆕 是否 agent 代发
  agent_author_user_id TEXT,               -- 🆕 代发的 agent 主人 uid
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 聚类结果（快照）
CREATE TABLE community_clusters (
  cluster_id INTEGER PRIMARY KEY,
  label TEXT,
  centroid TEXT,
  member_count INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 分发收件箱（离线推送）
CREATE TABLE community_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,         -- post/playlist/song
  target_id TEXT NOT NULL,
  from_cluster INTEGER,
  reason TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 一起听房间
CREATE TABLE community_rooms (
  room_id TEXT PRIMARY KEY,
  host_user_id TEXT NOT NULL,
  name TEXT, topic_tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  active INTEGER DEFAULT 1
);

-- 成员 agent 配置（半自主规则，无配额）🆕 v0.3
CREATE TABLE community_member_agent_config (
  user_id TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL,          -- canComment/allowedTopics/canBeInvited/sharePlaylists
  persona_snapshot TEXT,             -- 模板拼出的 persona 文本（缓存）
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 邀请记录 🆕 v0.3
CREATE TABLE community_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  context_type TEXT NOT NULL,        -- feed/room/conversation（feed 优先）
  context_id TEXT,
  status TEXT DEFAULT 'pending',     -- pending/accepted/rejected/active/ended
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. 接口契约

### REST（遵循 `docs/API-CONTRACT.md` 统一响应）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/community/feed` | 动态时间线（游标分页） |
| POST | `/api/community/posts` | 发帖 |
| GET | `/api/community/posts/:id` | 帖子详情+评论 |
| POST | `/api/community/posts/:id/like` | 点赞 |
| GET | `/api/community/clusters` | 簇列表+标签 |
| GET | `/api/community/clusters/:id/members` | 簇成员 |
| POST | `/api/community/rooms` | 建一起听房间 |
| POST | `/api/community/rooms/:id/join` | 加入房间 |
| GET | `/api/community/inbox` | 我的收件箱 |
| POST | `/api/community/profile/refresh` | 拉我的网易云历史刷新画像 |
| PUT | `/api/community/me/agent-config` | 🆕 改我的 agent 规则 |
| POST | `/api/community/posts/:id/agent-comment` | 🆕 触发我的 agent 评论该帖 |
| POST | `/api/community/invitations` | 🆕 邀请某人的 agent（默认 context_type=feed） |
| POST | `/api/community/invitations/:id/respond` | 🆕 接受/拒绝 |

### Socket 新事件（加进 `socket/events.js`）
```
community:push            S→C   Agent 分发推送（帖子/歌单/歌曲）
community:cluster-updated S→C   我的簇变更通知
community:post-new        S→C   动态时间线新帖
community:agent-comment   S→C   🆕 有 agent 代发了评论（带署名标记）
community:invitation      S→C   🆕 收到邀请
room:state / room:chat / room:sync   一起听房间
```

### Agent 工具（注册到 ToolFactory，仿 search_by_genre）
- `distribute_to_cluster` — 把帖子/歌单/歌曲推送给指定簇
- 🆕 `comment_as_member_agent` — 成员触发后，agent 生成评论
- 🆕 `invite_member_agent` — 发起邀请
- 🆕 `bring_playlist` — 被邀请的 agent 把主人歌单带入目标上下文

---

## 7. DDD 落点（server 内新模块）

```
server/domain/community/
  clustering/CrossUserClusterAnalyzer.js   ← 扩展 UserClusterAnalyzer 到跨用户
  clustering/FeatureExtractor.js           ← 36 维向量提取
  profileFusionRules.js                    ← 三路数据融合规则
  postRules.js                             ← 帖子领域规则
  roomRules.js                             ← 房间状态机
  distributionRules.js                     ← 分发策略
  memberAgentRules.js                      ← 🆕 半自主规则求值（允许/主题/授权）
  agentPersonaBuilder.js                   ← 🆕 36维画像+self_tags → persona 文本（纯模板函数）
  invitationRules.js                       ← 🆕 邀请状态机 + 双向授权校验

server/application/services/
  CommunityService.js                      ← 发帖/feed/点赞
  ClusterService.js                        ← 触发跨用户聚类
  DistributionService.js                   ← Agent 分发
  RoomService.js                           ← 一起听房间
  MemberProfileService.js                  ← 拉网易云历史 + 融合 + 存画像
  MemberAgentService.js                    ← 🆕 触发成员 agent 行动（评论/携带歌单）
  InvitationService.js                     ← 🆕 邀请用例

server/application/ports/
  repos/CommunityRepository.js
  repos/ClusterSnapshotRepository.js
  services/ClusterStrategyPort.js
  services/RoomSyncPort.js
  services/NeteaseMemberHistoryPort.js     ← 【P-B】成员网易云历史拉取 Port
  services/MemberAgentLoopPort.js          ← 🆕 复用 agent 循环的 Port（注入 persona+工具子集）

server/infrastructure/persistence/repositories/
  SqliteCommunityRepository.js
  SqliteClusterSnapshotRepository.js

server/infrastructure/netease/
  NeteaseMemberHistoryAdapter.js           ← 【P-B】用成员 cookie 调 netease-api
  CookieCipher.js                          ← AES 加解密成员 cookie

server/infrastructure/
  MemberAgentLoopAdapter.js                ← 🆕 用 AgentTurnService 跑成员 agent（不同 persona）

server/interface/socket/
  communityHandler.js                      ← community:* / room:* 事件处理
server/interface/http/
  communityRoutes.js                       ← REST 路由

server/agent/application/services/ToolFactory.js  ← 注册 distribute_to_cluster + 3 个成员 agent 工具
```
> 仅 `bootstrap.js` 做跨层装配；domain 零 IO；模型不透传（DO→DTO→VO）。
> `agentPersonaBuilder` 与 `memberAgentRules` 是纯函数，优先 TDD；成员 agent 循环复用现有 agent 基础设施，只换 persona + 工具白名单。

---

## 8. Agent 工具定义（仿 search_by_genre）

```js
// 分发工具
registry.register(createToolDefinition({
  name: 'distribute_to_cluster',
  description: '把帖子/歌单/歌曲推送给指定簇或成员所在簇的所有成员',
  parameters: {
    targetType: { type: 'string', enum: ['post','playlist','song'], required: true },
    targetId:   { type: 'string', required: true },
    clusterId:  { type: 'number', description: '不填则用调用者所在簇' },
    reason:     { type: 'string' }
  },
  handler: async (args, ctx) => { /* DistributionService.distribute */ }
}));

// 成员 agent 评论（v0.3 新增）
registry.register(createToolDefinition({
  name: 'comment_as_member_agent',
  description: '成员触发：用我的 persona 在指定帖子下生成评论',
  parameters: { postId: { type: 'number', required: true } },
  handler: async (args, ctx) => { /* MemberAgentService.comment，经 memberAgentRules 校验 */ }
}));

// 邀请某人 agent（v0.3 新增）
registry.register(createToolDefinition({
  name: 'invite_member_agent',
  description: '邀请某成员的 agent 携带其歌单+画像进入我的上下文（默认发现流）',
  parameters: { toUserId: { type: 'string', required: true }, contextType: { type: 'string', enum: ['feed','room','conversation'], default: 'feed' } },
  handler: async (args, ctx) => { /* InvitationService.invite，双向授权校验 */ }
}));

// 携带歌单（v0.3 新增）
registry.register(createToolDefinition({
  name: 'bring_playlist',
  description: '被邀请的 agent 把主人歌单带入目标上下文',
  parameters: { invitationId: { type: 'number', required: true } },
  handler: async (args, ctx) => { /* 需 toUser 的 sharePlaylists 已开 */ }
}));
```

---

## 9. 不变量与约束（社区专属，并入 R 体系）

- **RC1**：分发不骚扰——同一成员同一内容 24h 内只推 1 次（inbox 去重）
- **RC2**：聚类永不阻塞电台——聚类异步跑，失败降级到上次结果（呼应 R1 电台永不静默）
- **RC3**：房间隔离——房间事件绝不泄漏到主电台广播
- **RC4**：隐私下限——成员可关闭"听歌动态上报"，关闭后不进 feed 但仍可发帖
- **RC5**：分发可撤回——成员举报/Agent 误判后，后台可批量撤回一次分发
- **RC6（P-B）cookie 隔离**：成员 cookie 仅用于拉取该成员自己的网易云历史，绝不混用、绝不用于驱动电台、绝不写日志、绝不返回前端
- **RC7（v0.3）署名透明**：agent 代发的帖子/评论必须带 `is_agent=1` + 主人 uid，前端显式标注"由 X 的 agent 代发"，禁止冒充真人
- **RC8（v0.3）邀请双向授权**：被邀请方必须在 config 开 `canBeInvited`+`sharePlaylists`，否则邀请发不出/被拒
- **RC9（v0.3）agent 不越权**：成员 agent 行动必须经 `memberAgentRules` 求值通过（主题/授权），规则外一律拒绝并记日志；无硬配额，靠举报兜底

---

## 10. 非功能需求
- **性能**：聚类在成员 ≤1000 时 <3s；feed 接口 P95 <200ms；P-B 拉历史按成员串行/低并发
- **隐私/安全**：成员 cookie **AES 加密存库**（`CookieCipher`）；仅服务端持有；netease-api 调用走内网；成员听歌数据不跨成员可见（除非自填上报/授权邀请）
- **降级**：拉网易云历史失败 → 仅用本电台交互兜底画像 + 提示重新登录；LLM 打标签失败 → 规则关键词兜底；聚类失败 → 沿用上次簇；成员 agent persona 用模板拼，无 LLM 依赖（稳定）
- **测试**：遵循 `docs/TESTING-Standard.md`，domain 层 100% 单测（跨用户聚类 + 三路融合 + `agentPersonaBuilder` + `memberAgentRules` 优先 TDD）

---

## 11. MVP 范围与里程碑（已确认节奏）

| 阶段 | 范围 | 产出 |
|------|------|------|
| **P0**（2 周） | F1 身份+画像（P-B） + F2 帖子 + F6 feed | 成员登录、拉网易云历史建画像、发帖、刷动态 |
| **P1**（2 周） | F3 跨用户聚类 + F4 Agent 分发 + **F7 成员 agent** + **F8 agent 互评** | Agent 自动分发；成员触发自己的 agent 代评论 |
| **P2**（2 周） | F5 一起听房间 + **F9 邀请引入**（发现流优先） | 同簇人开房同步听歌；邀请他人 agent 把歌单+喜好融入我的 feed |

> P1 增量重点：`agentPersonaBuilder`（纯模板函数 TDD）+ `MemberAgentLoopAdapter`（复用 agent 循环）+ `memberAgentRules`。
> P2 的 F9 因发现流优先，主要在 feed 排序逻辑里融入"被邀请方画像权重"，房间带入歌单是次要分支。
> P0 因 P-B 较重，若超时可把"自填标签(路 3)"挪到 P1。

---

## 12. 已确认决策（v0.3 锁定）

| # | 问题 | 决策 |
|---|------|------|
| 1 | 成员身份 | 每个成员用自己的网易云账号登录（netease uid 为社区身份） |
| 2 | 画像数据源 | **P-B**：拉成员自己网易云历史 + 融合本电台交互 + 自填标签 |
| 3 | 一起听房间 | 房主自有歌单控制播放，成员被动同步 |
| 4 | KMeans K | 沿用现有 silhouette 自动选 K(2-8) |
| 5 | 听歌归属 | 新建 `community_listens`，不动现有 `listen_history` |
| 6 | 节奏 | P0 / P1 / P2 顺序 OK |
| 7 | F9 目的地优先 🆕 | 发现流优先，房间/对话次之 |
| 8 | agent 评论配额 🆕 | 不设硬配额，靠主题规则 + 举报 |
| 9 | persona 生成 🆕 | 模板拼（稳、可预测，非 LLM） |
