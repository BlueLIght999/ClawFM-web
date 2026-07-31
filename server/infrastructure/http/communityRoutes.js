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

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}
function fail(res, error, status = 400) {
  return res.status(status).json({ ok: false, error });
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
          clusterService, memberAgentService, distributionService, authRepository } = services;
  const router = express.Router();
  router.use(express.json());
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

  router.get('/profile/:userId', (req, res) => {
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

  return router;
}

/**
 * 在 Express app 上挂载社区路由（供 httpRoutes.js / server.js 调用）。
 */
export function registerCommunityRoutes(app, services) {
  app.use('/api/community', createCommunityRouter(services));
}
