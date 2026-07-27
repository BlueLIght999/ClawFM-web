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
  const { communityService, memberProfileService, communityRepository, cookieCipherPort } = services;
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

  return router;
}

/**
 * 在 Express app 上挂载社区路由（供 httpRoutes.js / server.js 调用）。
 */
export function registerCommunityRoutes(app, services) {
  app.use('/api/community', createCommunityRouter(services));
}
