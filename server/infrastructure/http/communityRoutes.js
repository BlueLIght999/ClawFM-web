/**
 * communityRoutes — 社区 REST 路由（infrastructure/http）。
 *
 * 挂载在 /api/community。依赖注入 CommunityService / MemberProfileService / CommunityRepository / CookieCipherPort。
 * 统一响应：{ ok:true, data } | { ok:false, error }。模型不透传：只返回 camelCase DTO。
 */
import express from 'express';

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}
function fail(res, error, status = 400) {
  return res.status(status).json({ ok: false, error });
}

/**
 * @param {object} services
 * @returns {import('express').Router}
 */
export function createCommunityRouter(services) {
  const { communityService, memberProfileService, communityRepository, cookieCipherPort,
          clusterService, memberAgentService, distributionService } = services;
  const router = express.Router();
  router.use(express.json());

  // ── 成员 ────────────────────────────────────────────────
  router.post('/members', (req, res) => {
    const { userId, nickname, avatarUrl } = req.body || {};
    if (!userId) return fail(res, 'user_id_required');
    const member = communityRepository.createMember({ userId, nickname: nickname || '', avatarUrl: avatarUrl || '' });
    return ok(res, member, 201);
  });

  router.put('/members/:userId/credentials', (req, res) => {
    const { userId } = req.params;
    const { neteaseUid, cookie } = req.body || {};
    if (!neteaseUid || !cookie) return fail(res, 'credentials_required');
    const cookieEncrypted = cookieCipherPort.encrypt(cookie);
    communityRepository.upsertMemberAuth({ userId, neteaseUid, cookieEncrypted });
    return ok(res, { userId, neteaseUid });
  });

  // ── 画像（P-B）──────────────────────────────────────────
  router.post('/profile/:userId/refresh', async (req, res) => {
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
    const post = communityService.likePost(Number(req.params.id));
    if (!post) return fail(res, 'not_found', 404);
    return ok(res, post);
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

  // GET /inbox?userId=... — 我的收件箱（F4 离线推送）
  router.get('/inbox', (req, res) => {
    const userId = req.query.userId ? String(req.query.userId) : null;
    if (!userId) return fail(res, 'user_id_required');
    return ok(res, communityService.listInbox(userId));
  });

  // PUT /me/agent-config — 改我的 agent 半自主规则（F7）
  router.put('/me/agent-config', (req, res) => {
    if (!memberAgentService) return fail(res, 'member_agent_not_enabled', 501);
    const { userId, rules, personaSnapshot } = req.body || {};
    if (!userId) return fail(res, 'user_id_required');
    const normalized = memberAgentService.setConfig(userId, rules || {}, personaSnapshot || null);
    return ok(res, { userId, rules: normalized });
  });

  // POST /posts/:id/agent-comment — 触发我的 agent 评论该帖（F8，RC7 署名）
  router.post('/posts/:id/agent-comment', async (req, res) => {
    if (!memberAgentService) return fail(res, 'member_agent_not_enabled', 501);
    const { byUserId } = req.body || {};
    if (!byUserId) return fail(res, 'by_user_id_required');
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
      const r = services.roomService.joinRoom(req.params.id, userId);
      if (!r.ok) return fail(res, r.error);
      return ok(res, r.room);
    });

    router.post('/rooms/:id/control', (req, res) => {
      const { userId, state } = req.body || {};
      const r = services.roomService.hostControl(req.params.id, userId, state || {});
      if (!r.ok) return fail(res, r.error);
      return ok(res, r.payload);
    });

    router.post('/rooms/:id/end', (req, res) => {
      const { userId } = req.body || {};
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

    // GET /invitations?userId=... — 列出与我相关的邀请
    router.get('/invitations', (req, res) => {
      const userId = req.query.userId ? String(req.query.userId) : null;
      if (!userId) return fail(res, 'user_id_required');
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
