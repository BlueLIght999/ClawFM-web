/**
 * communityRoutes — 社区 REST 路由（infrastructure/http）。
 *
 * 挂载在 /api/community。依赖注入 CommunityService / MemberProfileService / CommunityRepository / CookieCipherPort。
 * 统一响应：{ ok:true, data } | { ok:false, error }。模型不透传：只返回 camelCase DTO。
 *
 * 鉴权：所有路由经 requireCommunityAuth 中间件，校验当前网易云登录态（authRepository.currentUid）。
 * 涉及身份的写操作（改凭据/发帖/agent 配置等）额外校验 body.userId === 当前登录 uid。
 */
import express from 'express';
import { SELF_TAG_ERRORS, validateSelfTags } from '../../domain/community/selfTagRules.js';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB（解码后）

/** 自填标签校验失败 → HTTP 状态码映射（长度/类型/数量属入参问题，一律 400）。 */
const SELF_TAG_ERROR_STATUS = {
  [SELF_TAG_ERRORS.NOT_ARRAY]: 400,
  [SELF_TAG_ERRORS.INVALID_ENTRY]: 400,
  [SELF_TAG_ERRORS.TOO_LONG]: 400,
  [SELF_TAG_ERRORS.TOO_MANY]: 400,
};

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}
function fail(res, error, status = 400) {
  return res.status(status).json({ ok: false, error });
}

/** 校验并解码 base64 图片数据，返回 Buffer；超限/非法返回 null。 */
function decodeImageData(data) {
  if (!data || typeof data !== 'string') return null;
  const body = data.includes(',') ? data.split(',')[1] : data;
  const cleaned = body.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0) return null;
  try {
    const buf = Buffer.from(cleaned, 'base64');
    if (buf.length === 0 || buf.length > AVATAR_MAX_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/** 校验当前网易云登录态，挂 req.communityUserId。未登录返回 401。 */
function requireCommunityAuth(authRepository) {
  return (req, res, next) => {
    const uid = authRepository?.currentUid?.() || '';
    if (!uid) return fail(res, 'auth_required', 401);
    req.communityUserId = String(uid);
    next();
  };
}

/** 校验请求内的 userId 与当前登录 uid 一致（防越权操作他人数据）。 */
function assertSelf(req, res, claimedUserId) {
  if (!claimedUserId || String(claimedUserId) !== String(req.communityUserId)) {
    fail(res, 'forbidden', 403);
    return false;
  }
  return true;
}

/**
 * @param {object} services
 * @returns {import('express').Router}
 */
export function createCommunityRouter(services) {
  const { communityService, memberProfileService, communityRepository, cookieCipherPort,
          clusterService, memberAgentService, authRepository, dmService,
          similarMembersService } = services;
  const router = express.Router();
  // 加大 body 限制以支持头像 base64 上传
  router.use(express.json({ limit: '5mb' }));
  router.use(requireCommunityAuth(authRepository));

  // ── 成员 ────────────────────────────────────────────────
  router.post('/members', (req, res) => {
    const { userId, nickname, avatarUrl } = req.body || {};
    if (!userId) return fail(res, 'user_id_required');
    if (!assertSelf(req, res, userId)) return;
    const member = communityRepository.createMember({ userId, nickname: nickname || '', avatarUrl: avatarUrl || '' });
    // 自动绑定当前登录态的网易云凭据（前端不持有 cookie）
    const cookie = authRepository?.currentCookie?.() || '';
    const neteaseUid = req.communityUserId;
    if (cookie && neteaseUid && cookieCipherPort) {
      const cookieEncrypted = cookieCipherPort.encrypt(cookie);
      communityRepository.upsertMemberAuth({ userId, neteaseUid, cookieEncrypted });
    }
    return ok(res, member, 201);
  });

  router.put('/members/:userId/credentials', (req, res) => {
    const { userId } = req.params;
    if (!assertSelf(req, res, userId)) return;
    const { neteaseUid, cookie } = req.body || {};
    if (!neteaseUid || !cookie) return fail(res, 'credentials_required');
    const cookieEncrypted = cookieCipherPort.encrypt(cookie);
    communityRepository.upsertMemberAuth({ userId, neteaseUid, cookieEncrypted });
    return ok(res, { userId, neteaseUid });
  });

  // 更新成员资料（昵称 / 头像 URL）
  router.put('/members/:userId/profile', (req, res) => {
    const { userId } = req.params;
    if (!assertSelf(req, res, userId)) return;
    const { nickname, avatarUrl } = req.body || {};
    if (nickname !== undefined && (typeof nickname !== 'string' || nickname.trim().length > 32)) {
      return fail(res, 'nickname_invalid');
    }
    const member = communityRepository.updateMemberProfile(userId, {
      nickname: nickname !== undefined ? nickname.trim() : undefined,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
    });
    if (!member) return fail(res, 'not_found', 404);
    return ok(res, member);
  });

  // 上传并保存头像（base64 JSON body：{ data, mimeType }）
  router.post('/members/:userId/avatar', (req, res) => {
    const { userId } = req.params;
    if (!assertSelf(req, res, userId)) return;
    const { data, mimeType } = req.body || {};
    const buf = decodeImageData(data);
    if (!buf) return fail(res, 'avatar_invalid_or_too_large');
    const member = communityRepository.saveAvatar(userId, buf, typeof mimeType === 'string' ? mimeType : 'image/png');
    if (!member) return fail(res, 'not_found', 404);
    return ok(res, member, 201);
  });

  /**
   * 重建画像并让相似成员索引失效；失败降级为 profileBuilt:false。
   *
   * 与「校验 + 落库」分开：这段是「写完之后要连带做什么」，与「这次写入是否
   * 合法」是两回事。混在一起时 handler 同时承担校验分支、异常分支与失效分支，
   * 圈复杂度会叠过上限——而它们本来不该在一个抽象层上。
   */
  async function rebuildProfileAfterTagWrite(req, userId) {
    try {
      const result = await memberProfileService.buildProfile(userId);
      if (!result?.ok) return false;
      // 画像重建会重写 profile.userTags（相似成员的查询标签取自它），故要再失效一次。
      // 幂等：连续调用只是把缓存置空。
      similarMembersService?.invalidate?.();
      return true;
    } catch (e) {
      req.log?.warn?.({ component: 'community', userId, err: e?.message }, 'profile rebuild after self-tags failed');
      return false;
    }
  }

  // 更新自填兴趣标签（PRD F1）。自填标签是画像融合路 3，也是跨用户「相似词条」匹配的显式信号。
  // 写入后立即重建画像：标签是用户显式声明，理应即时反映到 persona 与相似度，而非等下次定时刷新。
  async function updateSelfTags(req, res) {
    const { userId } = req.params;
    if (!assertSelf(req, res, userId)) return;

    const validated = validateSelfTags(req.body?.selfTags);
    if (!validated.ok) {
      return fail(res, validated.error, SELF_TAG_ERROR_STATUS[validated.error] ?? 400);
    }
    if (!communityRepository.getMember(userId)) return fail(res, 'not_found', 404);

    communityRepository.setMemberSelfTags(userId, validated.tags);
    // 标签变了，相似成员索引必须跟着失效——否则用户写完标签立刻看「相似成员」，
    // 看到的还是按旧标签算出来的人。服务侧的 TTL 是兜底，不是这里的替代品。
    similarMembersService?.invalidate?.();

    const profileBuilt = await rebuildProfileAfterTagWrite(req, userId);
    return ok(res, { userId, selfTags: validated.tags, profileBuilt });
  }

  router.put('/members/:userId/self-tags', updateSelfTags);

  // 与我兴趣标签最重合的其他成员（F1 自填标签的下游消费）。
  // 仅本人可读：返回的是**别人**的昵称/头像/共享标签，但这些字段本就在公开成员接口里，
  // 而查询用的标签是调用者自己声明的——所以不泄露调用者没写过的信息。若放开给他人读，
  // 就等于把别人声明的兴趣标签集合暴露出去，那是 /profile/:userId 的隐私注释要挡住的东西。
  router.get('/members/:userId/similar', (req, res) => {
    if (!similarMembersService) return fail(res, 'similar_members_not_enabled', 501);
    const { userId } = req.params;
    if (!assertSelf(req, res, userId)) return;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    return ok(res, similarMembersService.findSimilar({ userId, limit }));
  });

  // 取上传的头像图片（<img src> 直连；未上传返回 404 -> 前端回落派生占位）
  router.get('/members/:userId/avatar', (req, res) => {
    const row = communityRepository.getAvatarBinary(req.params.userId);
    if (!row || !row.avatar_binary) return fail(res, 'avatar_missing', 404);
    res.set('Content-Type', row.avatar_mime || 'image/png');
    return res.send(Buffer.from(row.avatar_binary));
  });

  // ── 画像（P-B）──────────────────────────────────────────
  router.post('/profile/:userId/refresh', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
      const result = await memberProfileService.buildProfile(req.params.userId);
      if (!result.ok) return fail(res, result.error);
      return ok(res, { profile: result.profile, degraded: result.degraded });
    } catch {
      return fail(res, 'profile_refresh_failed', 500);
    }
  });

  // 画像含听歌偏好/活跃时段等隐私数据，与 /refresh 一致：仅本人可读
  router.get('/profile/:userId', (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    const profile = memberProfileService.getProfile(req.params.userId);
    if (!profile) return fail(res, 'not_found', 404);
    return ok(res, profile);
  });

  // ── 帖子 / Feed ─────────────────────────────────────────
  router.post('/posts', (req, res) => {
    if (!assertSelf(req, res, req.body?.userId)) return;
    const result = communityService.createPost(req.body || {});
    if (!result.ok) return fail(res, result.error);
    return ok(res, result.post, 201);
  });

  router.get('/feed', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const forUserId = req.query.forUserId ? String(req.query.forUserId) : null;
    return ok(res, communityService.getFeed({ limit, cursor, forUserId }));
  });

  router.get('/posts/:id', (req, res) => {
    const result = communityService.getPostWithComments(Number(req.params.id));
    if (!result) return fail(res, 'not_found', 404);
    return ok(res, result);
  });

  router.post('/posts/:id/like', (req, res) => {
    // 社交化点赞：toggle（已赞则取消），需登录态 userId 记录谁赞的
    const result = communityService.toggleLike(req.communityUserId, Number(req.params.id));
    if (!result) return fail(res, 'not_found', 404);
    return ok(res, result);
  });

  router.get('/posts/:id/like', (req, res) => {
    // 查询当前用户是否已赞
    return ok(res, { liked: communityService.hasLiked(req.communityUserId, Number(req.params.id)) });
  });

  router.get('/posts/:id/likers', (_req, res) => {
    // 谁赞过此帖（成员信息，不含敏感字段）
    return ok(res, communityService.listLikers(Number(_req.params.id)));
  });

  // ── 评论（帖子可被讨论，真正社交） ─────────────────────────
  router.get('/posts/:id/comments', (req, res) => {
    const result = communityService.getPostWithComments(Number(req.params.id));
    if (!result) return fail(res, 'not_found', 404);
    return ok(res, result.comments);
  });

  router.post('/posts/:id/comments', (req, res) => {
    const { content } = req.body || {};
    const r = communityService.createComment(req.communityUserId, Number(req.params.id), content);
    if (!r.ok) return fail(res, r.error, r.error === 'parent_not_found' ? 404 : 400);
    return ok(res, r.comment, 201);
  });

  // ── 成员主页 / timeline / 关注关系（社交图谱） ───────────────
  router.get('/members/:userId', (req, res) => {
    const member = communityRepository.getMember(req.params.userId);
    if (!member) return fail(res, 'not_found', 404);
    // 附带当前用户是否关注此人 + 统计
    const isFollowing = communityService.isFollowing(req.communityUserId, req.params.userId);
    const followers = communityRepository.listFollowers(req.params.userId).length;
    const following = communityRepository.listFollowing(req.params.userId).length;
    return ok(res, { ...member, isFollowing, followersCount: followers, followingCount: following });
  });

  router.get('/members/:userId/posts', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    return ok(res, communityService.listPostsByUser(req.params.userId, { limit, cursor }));
  });

  router.post('/members/:userId/follow', (req, res) => {
    // follower = 当前登录用户，followee = :userId（从 auth 取 follower，防冒充）
    const r = communityService.follow(req.communityUserId, req.params.userId);
    if (!r.ok) return fail(res, r.error);
    return ok(res, r, 201);
  });

  router.delete('/members/:userId/follow', (req, res) => {
    const r = communityService.unfollow(req.communityUserId, req.params.userId);
    if (!r.ok) return fail(res, r.error);
    return ok(res, r);
  });

  router.get('/members/:userId/followers', (req, res) => {
    return ok(res, communityRepository.listFollowers(req.params.userId));
  });

  router.get('/members/:userId/following', (req, res) => {
    return ok(res, communityRepository.listFollowing(req.params.userId));
  });

  // 关注流（我关注的人的帖子）
  router.get('/feed/following', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    return ok(res, communityService.listFeedFromFollowing(req.communityUserId, { limit, cursor }));
  });

  // ── P1: 聚类 / 收件箱 / 成员 Agent 配置 / Agent 互评 ─────────────
  // GET /clusters — 列出所有簇+标签+成员数（F3）
  router.get('/clusters', (_req, res) => {
    if (!clusterService) return fail(res, 'cluster_not_enabled', 501);
    return ok(res, clusterService.getClusters());
  });

  // GET /clusters/:id/members — 指定簇的成员列表（F3）
  router.get('/clusters/:id/members', (req, res) => {
    if (!clusterService) return fail(res, 'cluster_not_enabled', 501);
    const members = clusterService.getClusterMembers(req.params.id);
    return ok(res, members);
  });

  // GET /inbox?userId=... — 我的收件箱（F4 离线推送，私密）
  router.get('/inbox', (req, res) => {
    const userId = req.query.userId ? String(req.query.userId) : null;
    if (!userId) return fail(res, 'user_id_required');
    if (!assertSelf(req, res, userId)) return;
    return ok(res, communityService.listInbox(userId));
  });

  // PUT /me/agent-config — 改我的 agent 半自主规则（F7）
  router.put('/me/agent-config', (req, res) => {
    if (!memberAgentService) return fail(res, 'member_agent_not_enabled', 501);
    const { userId, rules, personaSnapshot } = req.body || {};
    if (!userId) return fail(res, 'user_id_required');
    if (!assertSelf(req, res, userId)) return;
    const normalized = memberAgentService.setConfig(userId, rules || {}, personaSnapshot || null);
    return ok(res, { userId, rules: normalized });
  });

  // POST /posts/:id/agent-comment — 触发我的 agent 评论该帖（F8，RC7 署名）
  router.post('/posts/:id/agent-comment', async (req, res) => {
    if (!memberAgentService) return fail(res, 'member_agent_not_enabled', 501);
    const { byUserId } = req.body || {};
    if (!byUserId) return fail(res, 'by_user_id_required');
    if (!assertSelf(req, res, byUserId)) return;
    try {
      const r = await memberAgentService.commentOnPost({ postId: Number(req.params.id), byUserId: String(byUserId) });
      if (!r.ok) return fail(res, r.error);
      return ok(res, { commentId: r.commentId, content: r.content });
    } catch {
      return fail(res, 'agent_comment_failed', 500);
    }
  });

  // ── 一起听房间（F5）──────────────────────────────────────
  if (services.roomService) {
    router.post('/rooms', (req, res) => {
      const { hostUserId, name, topicTags } = req.body || {};
      if (!assertSelf(req, res, hostUserId)) return;
      const r = services.roomService.createRoom({ hostUserId, name, topicTags });
      if (!r.ok) return fail(res, r.error);
      return ok(res, r.room, 201);
    });

    router.get('/rooms', (_req, res) => {
      return ok(res, services.roomService.listRooms({ activeOnly: true }));
    });

    router.get('/rooms/:id', (req, res) => {
      const room = services.roomService.getRoom(req.params.id);
      if (!room) return fail(res, 'not_found', 404);
      return ok(res, room);
    });

    router.post('/rooms/:id/join', (req, res) => {
      const { userId } = req.body || {};
      if (!assertSelf(req, res, userId)) return;
      const r = services.roomService.joinRoom(req.params.id, userId);
      if (!r.ok) return fail(res, r.error);
      return ok(res, r.room);
    });

    router.post('/rooms/:id/control', (req, res) => {
      const { userId, state } = req.body || {};
      if (!assertSelf(req, res, userId)) return;
      const r = services.roomService.hostControl(req.params.id, userId, state || {});
      if (!r.ok) return fail(res, r.error);
      return ok(res, r.payload);
    });

    router.post('/rooms/:id/end', (req, res) => {
      const { userId } = req.body || {};
      if (!assertSelf(req, res, userId)) return;
      const r = services.roomService.endRoom(req.params.id, userId);
      if (!r.ok) return fail(res, r.error);
      return ok(res, { ended: true });
    });
  }

  // ── 邀请引入（F9）──────────────────────────────────────
  if (services.invitationService) {
    // POST /invitations — 邀请某人的 agent（默认 context_type=feed）
    router.post('/invitations', (req, res) => {
      const { fromUserId, toUserId, contextType, contextId } = req.body || {};
      if (!fromUserId || !toUserId) return fail(res, 'user_ids_required');
      if (!assertSelf(req, res, fromUserId)) return;
      const r = services.invitationService.invite({ fromUserId, toUserId, contextType, contextId });
      if (!r.ok) return fail(res, r.error, r.reasons ? 403 : 400);
      return ok(res, r, 201);
    });

    // POST /invitations/:id/respond — 接受/拒绝
    router.post('/invitations/:id/respond', (req, res) => {
      const { status } = req.body || {};
      if (!status) return fail(res, 'status_required');
      const r = services.invitationService.respond(Number(req.params.id), status);
      if (!r.ok) return fail(res, r.error, r.error === 'not_found' ? 404 : 400);
      return ok(res, r);
    });

    // GET /invitations?userId=... — 列出与我相关的邀请（私密）
    router.get('/invitations', (req, res) => {
      const userId = req.query.userId ? String(req.query.userId) : null;
      if (!userId) return fail(res, 'user_id_required');
      if (!assertSelf(req, res, userId)) return;
      return ok(res, services.invitationService.listForUser(userId));
    });

    // POST /invitations/:id/bring-playlist — 触发被邀请方 agent 把歌单带入上下文
    router.post('/invitations/:id/bring-playlist', async (req, res) => {
      try {
        const r = await services.invitationService.bringPlaylist(Number(req.params.id));
        if (!r.ok) return fail(res, r.error, r.error === 'invitation_not_found' ? 404 : 400);
        return ok(res, r);
      } catch {
        return fail(res, 'bring_playlist_failed', 500);
      }
    });
  }

  // ── 私信 / agent 私信（DM）─────────────────────────────────
  if (dmService) {
    // 补全与会话/消息展示相关的成员资料（昵称/头像），仅读公开字段
    const withPeer = (thread) => {
      if (!thread || !thread.peer) return thread;
      const m = thread.peer.userId ? communityRepository.getMember(thread.peer.userId) : null;
      return {
        ...thread,
        peer: {
          ...thread.peer,
          nickname: m?.nickname || '',
          avatarUrl: m?.avatarUrl || '',
        },
      };
    };
    const withMsgAuthors = (messages) => (messages || []).map((msg) => {
      const m = msg.senderUserId ? communityRepository.getMember(msg.senderUserId) : null;
      return {
        ...msg,
        nickname: m?.nickname || '',
        avatarUrl: m?.avatarUrl || '',
      };
    });

    // POST /dm/open { otherUserId, agent? } — 开启/复用会话（agent=true 与对端 agent 私信）
    router.post('/dm/open', (req, res) => {
      const { otherUserId, agent } = req.body || {};
      if (!otherUserId) return fail(res, 'user_id_required');
      const r = dmService.openThread({ userId: req.communityUserId, otherUserId, agent: !!agent });
      if (!r.ok) return fail(res, r.error, r.error === 'other_member_not_found' ? 404 : 400);
      return ok(res, withPeer(r.thread), 201);
    });

    // GET /dm/threads — 我的会话列表
    router.get('/dm/threads', (req, res) => {
      const threads = dmService.listThreads(req.communityUserId).map(withPeer);
      return ok(res, threads);
    });

    // GET /dm/:threadId/messages — 拉某会话消息
    router.get('/dm/:threadId/messages', (req, res) => {
      const r = dmService.listMessages(req.communityUserId, Number(req.params.threadId));
      if (!r.ok) return fail(res, r.error, r.error === 'thread_not_accessible' ? 403 : 400);
      return ok(res, { thread: withPeer(r.thread), messages: withMsgAuthors(r.messages) });
    });

    // POST /dm/:threadId/messages { content } — 发送消息（agent 会话自动生成 agent 回复）
    router.post('/dm/:threadId/messages', async (req, res) => {
      const { content } = req.body || {};
      try {
        const r = await dmService.sendMessage({ userId: req.communityUserId, threadId: Number(req.params.threadId), content });
        if (!r.ok) return fail(res, r.error, r.error === 'thread_not_accessible' ? 403 : 400);
        const data = { message: withMsgAuthors([r.message])[0], agentReply: r.agentReply ? withMsgAuthors([r.agentReply])[0] : null };
        return ok(res, data, 201);
      } catch {
        return fail(res, 'dm_send_failed', 500);
      }
    });
  }

  return router;
}

/**
 * 在 Express app 上挂载社区路由（供 httpRoutes.js / server.js 调用）。
 */
export function registerCommunityRoutes(app, services) {
  app.use('/api/community', createCommunityRouter(services));
}
