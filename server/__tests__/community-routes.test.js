import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCommunityRouter } from '../infrastructure/http/communityRoutes.js';

// mock services，专注测路由层（参数解析/状态码/响应格式），不碰真实 service 逻辑
const mockAuth = { uid: 'u1' };

function makeMockServices() {
  const profiles = new Map();
  return {
    communityService: {
      createPost: (input) => {
        if (!input.userId) return { ok: false, error: 'user_id_required' };
        if (!input.content) return { ok: false, error: 'content_empty' };
        return { ok: true, post: { id: 1, ...input, likes: 0, isAgent: false } };
      },
      getFeed: ({ limit, cursor }) => [{ id: 2 }, { id: 1 }].filter((p) => cursor === null || p.id < cursor).slice(0, limit),
      getPostWithComments: (id) => (id === 1 ? { post: { id: 1 }, comments: [{ id: 50, userId: 'u2', content: '好评论', parentId: 1 }] } : null),
      likePost: (id) => (id === 1 ? { id: 1, likes: 5 } : null),
      toggleLike: (userId, id) => id === 1 ? { liked: true, likes: 6 } : null,
      hasLiked: () => false,
      listLikers: (id) => id === 1 ? [{ userId: 'u1', nickname: '阿七' }] : [],
      createComment: (userId, postId, content) => {
        if (postId !== 1) return { ok: false, error: 'parent_not_found' };
        if (!content) return { ok: false, error: 'content_empty' };
        return { ok: true, comment: { id: 100, userId, postId, content, type: 'comment', parentId: postId } };
      },
      follow: (followerId, followeeId) => {
        if (!followerId || !followeeId) return { ok: false, error: 'user_ids_required' };
        if (followerId === followeeId) return { ok: false, error: 'cannot_follow_self' };
        return { ok: true, following: true };
      },
      unfollow: (followerId, followeeId) => {
        if (!followerId || !followeeId) return { ok: false, error: 'user_ids_required' };
        return { ok: true, following: false };
      },
      isFollowing: () => false,
      listFollowers: () => [],
      listFollowing: () => [],
      listPostsByUser: (userId) => [{ id: 1, userId, type: 'reflection', content: '我的帖' }],
      listFeedFromFollowing: (userId) => [{ id: 2, userId: 'u2', type: 'reflection', content: '关注的人的帖' }],
      listInbox: (userId) => [{ id: 1, userId, targetType: 'post', targetId: '5', fromCluster: 1, reason: 'test', read: false }],
    },
    memberProfileService: {
      buildProfile: async (userId) => {
        if (userId === 'noref') return { ok: false, error: 'no_credentials' };
        const profile = { meta: { totalPlays: 10, source: 'P-B' } };
        profiles.set(userId, profile);
        return { ok: true, profile, degraded: false };
      },
      getProfile: (userId) => profiles.get(userId) || null,
    },
    communityRepository: {
      createMember: ({ userId, nickname, avatarUrl }) => ({ userId, nickname, avatarUrl, clusterId: null, selfTags: [] }),
      getMember: (userId) => userId === 'u1' || userId === 'u2'
        ? { userId, nickname: userId === 'u1' ? '阿七' : '阿八', avatarUrl: '', clusterId: 1, selfTags: [] }
        : null,
      updateMemberProfile: (userId, { nickname, avatarUrl } = {}) => ({ userId, nickname: nickname || '', avatarUrl: avatarUrl || '', clusterId: 1, selfTags: [] }),
      saveAvatar: (userId, binary, mimeType) => ({ userId, nickname: '阿七', avatarUrl: `/api/community/members/${userId}/avatar`, clusterId: 1, selfTags: [] }),
      getAvatarBinary: (userId) => userId === 'u1' ? { avatar_binary: Buffer.from('img'), avatar_mime: 'image/png' } : null,
      upsertMemberAuth: () => {},
      listFollowers: () => [{ userId: 'u2', nickname: '阿八' }],
      listFollowing: () => [],
      listInbox: (userId) => [{ id: 1, userId, targetType: 'post', targetId: '5', fromCluster: 1, reason: 'test', read: false }],
    },
    cookieCipherPort: { encrypt: (c) => `enc:${c}`, decrypt: (s) => s.replace(/^enc:/, '') },
    authRepository: { currentUid: () => mockAuth.uid, currentCookie: () => 'MUSIC_U=test' },
    clusterService: {
      getClusters: () => [{ clusterId: 1, label: 'rock·night_owl', memberCount: 2, memberUserIds: ['u1', 'u2'] }],
      getClusterMembers: (id) => id === '1'
        ? [{ userId: 'u1', nickname: '阿七', clusterId: 1, selfTags: ['rock'] },
           { userId: 'u2', nickname: '阿八', clusterId: 1, selfTags: [] }]
        : [],
    },
    memberAgentService: {
      setConfig: (userId, rules) => ({ canComment: !!rules.canComment, allowedTopics: rules.allowedTopics || [], canBeInvited: !!rules.canBeInvited, sharePlaylists: !!rules.sharePlaylists }),
      commentOnPost: async ({ postId, byUserId }) => postId === 1
        ? { ok: true, commentId: 99, content: `——${byUserId} 的 agent 代发：好歌` }
        : { ok: false, error: 'post_not_found' },
    },
    roomService: {
      createRoom: ({ hostUserId, name, topicTags }) => ({ ok: true, room: { roomId: 'room_1', hostUserId, name, topicTags: topicTags || [], status: 'active' } }),
      listRooms: () => [{ roomId: 'room_1', name: 'r', status: 'active' }],
      getRoom: (id) => (id === 'room_1' ? { roomId: 'room_1', hostUserId: 'u1', status: 'active' } : null),
      joinRoom: (id) => (id === 'room_1' ? { ok: true, room: { roomId: 'room_1', status: 'active' } } : { ok: false, error: 'room_not_found' }),
      hostControl: (id, userId, state) => (userId === 'u1' ? { ok: true, payload: { isPlaying: !!state.isPlaying, skip: !!state.skip } } : { ok: false, error: 'not_host_or_inactive' }),
      endRoom: (id, userId) => (userId === 'u1' ? { ok: true } : { ok: false, error: 'not_host' }),
    },
    invitationService: {
      invite: ({ fromUserId, toUserId, contextType, contextId }) => {
        if (toUserId === 'blocked') return { ok: false, error: 'not_authorized', reasons: ['canBeInvited=false'] };
        return { ok: true, id: 1, fromUserId, toUserId, contextType: contextType || 'feed', contextId: contextId || null, status: 'pending' };
      },
      respond: (invitationId, status) => {
        if (invitationId === 999) return { ok: false, error: 'not_found' };
        return { ok: true, status };
      },
      listForUser: (userId) => [{ id: 1, fromUserId: 'u2', toUserId: userId, status: 'pending', contextType: 'feed' }],
      bringPlaylist: async (invitationId) => {
        if (invitationId === 999) return { ok: false, error: 'invitation_not_found' };
        return { ok: true, playlists: [{ id: 'pl1', name: 'MyPlaylist' }] };
      },
    },
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/community', createCommunityRouter(makeMockServices()));
  return app;
}

let app;
beforeEach(() => { mockAuth.uid = 'u1'; app = makeApp(); });

describe('community routes', () => {
  it('POST /members creates member', async () => {
    const res = await request(app).post('/api/community/members').send({ userId: 'u1', nickname: '阿七', avatarUrl: 'http://x' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.userId).toBe('u1');
    expect(res.body.data.nickname).toBe('阿七');
  });

  it('POST /members rejects missing userId', async () => {
    const res = await request(app).post('/api/community/members').send({ nickname: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('user_id_required');
  });

  it('PUT /members/:userId/credentials encrypts cookie and upserts', async () => {
    const res = await request(app).put('/api/community/members/u1/credentials').send({ neteaseUid: '123', cookie: 'MUSIC_U=abc' });
    expect(res.status).toBe(200);
    expect(res.body.data.neteaseUid).toBe('123');
  });

  it('PUT /credentials rejects missing fields', async () => {
    const res = await request(app).put('/api/community/members/u1/credentials').send({ neteaseUid: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('credentials_required');
  });

  it('POST /posts creates post', async () => {
    const res = await request(app).post('/api/community/posts').send({ userId: 'u1', type: 'reflection', content: '好歌' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(1);
  });

  it('POST /posts rejects invalid with 400', async () => {
    const res = await request(app).post('/api/community/posts').send({ userId: 'u1', type: 'reflection', content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content_empty');
  });

  it('GET /feed returns list', async () => {
    const res = await request(app).get('/api/community/feed');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('GET /feed respects cursor', async () => {
    const res = await request(app).get('/api/community/feed?cursor=2&limit=10');
    expect(res.body.data.map((p) => p.id)).toEqual([1]);
  });

  it('GET /posts/:id returns post with comments', async () => {
    const res = await request(app).get('/api/community/posts/1');
    expect(res.status).toBe(200);
    expect(res.body.data.post.id).toBe(1);
  });

  it('GET /posts/:id 404 for missing', async () => {
    const res = await request(app).get('/api/community/posts/999');
    expect(res.status).toBe(404);
  });

  it('POST /posts/:id/like toggles like (returns liked+likes)', async () => {
    const res = await request(app).post('/api/community/posts/1/like');
    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likes).toBe(6);
  });

  it('POST /posts/:id/like 404 for missing post', async () => {
    const res = await request(app).post('/api/community/posts/999/like');
    expect(res.status).toBe(404);
  });

  it('GET /posts/:id/like returns whether current user liked', async () => {
    const res = await request(app).get('/api/community/posts/1/like');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('liked');
  });

  it('GET /posts/:id/likers returns liker members', async () => {
    const res = await request(app).get('/api/community/posts/1/likers');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('u1');
  });

  // ── 评论（社交讨论） ──
  it('GET /posts/:id/comments returns comments', async () => {
    const res = await request(app).get('/api/community/posts/1/comments');
    expect(res.status).toBe(200);
    expect(res.body.data[0].content).toBe('好评论');
  });

  it('GET /posts/:id/comments 404 for missing post', async () => {
    const res = await request(app).get('/api/community/posts/999/comments');
    expect(res.status).toBe(404);
  });

  it('POST /posts/:id/comments creates comment', async () => {
    const res = await request(app).post('/api/community/posts/1/comments').send({ content: '说得好' });
    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('说得好');
    expect(res.body.data.parentId).toBe(1);
  });

  it('POST /posts/:id/comments 400 when content empty', async () => {
    const res = await request(app).post('/api/community/posts/1/comments').send({ content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content_empty');
  });

  it('POST /posts/:id/comments 404 when parent missing', async () => {
    const res = await request(app).post('/api/community/posts/999/comments').send({ content: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('parent_not_found');
  });

  // ── 成员主页 / timeline / 关注关系 ──
  it('GET /members/:userId returns member with follow stats', async () => {
    const res = await request(app).get('/api/community/members/u1');
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe('u1');
    expect(res.body.data).toHaveProperty('isFollowing');
    expect(res.body.data).toHaveProperty('followersCount');
    expect(res.body.data).toHaveProperty('followingCount');
  });

  it('GET /members/:userId 404 for unknown member', async () => {
    const res = await request(app).get('/api/community/members/ghost');
    expect(res.status).toBe(404);
  });

  it('GET /members/:userId/posts returns user timeline', async () => {
    const res = await request(app).get('/api/community/members/u1/posts');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('u1');
  });

  it('POST /members/:userId/follow follows another user', async () => {
    const res = await request(app).post('/api/community/members/u2/follow');
    expect(res.status).toBe(201);
    expect(res.body.data.following).toBe(true);
  });

  it('POST /members/:userId/follow 400 when following self', async () => {
    const res = await request(app).post('/api/community/members/u1/follow');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('cannot_follow_self');
  });

  it('DELETE /members/:userId/follow unfollows', async () => {
    const res = await request(app).delete('/api/community/members/u2/follow');
    expect(res.status).toBe(200);
    expect(res.body.data.following).toBe(false);
  });

  it('GET /members/:userId/followers returns follower list', async () => {
    const res = await request(app).get('/api/community/members/u1/followers');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('u2');
  });

  it('GET /members/:userId/following returns following list', async () => {
    const res = await request(app).get('/api/community/members/u1/following');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /feed/following returns posts from followed users', async () => {
    const res = await request(app).get('/api/community/feed/following');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('u2');
  });

  it('POST /profile/:userId/refresh returns profile', async () => {
    const res = await request(app).post('/api/community/profile/u1/refresh');
    expect(res.status).toBe(200);
    expect(res.body.data.profile.meta.source).toBe('P-B');
  });

  it('POST /profile/:userId/refresh 400 when no credentials', async () => {
    mockAuth.uid = 'noref';
    const res = await request(app).post('/api/community/profile/noref/refresh');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_credentials');
  });

  it('GET /profile/:userId returns cached profile', async () => {
    await request(app).post('/api/community/profile/u1/refresh');
    const res = await request(app).get('/api/community/profile/u1');
    expect(res.status).toBe(200);
    expect(res.body.data.meta.source).toBe('P-B');
  });

  it('GET /profile/:userId 403 when reading another member profile', async () => {
    await request(app).post('/api/community/profile/u1/refresh');
    const res = await request(app).get('/api/community/profile/u2');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  it('GET /profile/:userId 404 when own profile not built', async () => {
    mockAuth.uid = 'ghost';
    const res = await request(app).get('/api/community/profile/ghost');
    expect(res.status).toBe(404);
  });

  it('GET /feed passes forUserId through', async () => {
    const res = await request(app).get('/api/community/feed?forUserId=u9');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('POST /rooms creates room', async () => {
    const res = await request(app).post('/api/community/rooms').send({ hostUserId: 'u1', name: '夜猫房', topicTags: ['rock'] });
    expect(res.status).toBe(201);
    expect(res.body.data.roomId).toBe('room_1');
    expect(res.body.data.hostUserId).toBe('u1');
  });

  it('GET /rooms lists active rooms', async () => {
    const res = await request(app).get('/api/community/rooms');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /rooms/:id 404 for missing', async () => {
    const res = await request(app).get('/api/community/rooms/ghost');
    expect(res.status).toBe(404);
  });

  it('POST /rooms/:id/join returns room', async () => {
    mockAuth.uid = 'u2';
    const res = await request(app).post('/api/community/rooms/room_1/join').send({ userId: 'u2' });
    expect(res.status).toBe(200);
    expect(res.body.data.roomId).toBe('room_1');
  });

  it('POST /rooms/:id/control host succeeds', async () => {
    const res = await request(app).post('/api/community/rooms/room_1/control').send({ userId: 'u1', state: { isPlaying: true } });
    expect(res.status).toBe(200);
    expect(res.body.data.isPlaying).toBe(true);
  });

  it('POST /rooms/:id/control non-host denied', async () => {mockAuth.uid = 'u2';
    const res = await request(app).post('/api/community/rooms/room_1/control').send({ userId: 'u2', state: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('not_host_or_inactive');
  });

  it('POST /rooms/:id/end host succeeds', async () => {
    const res = await request(app).post('/api/community/rooms/room_1/end').send({ userId: 'u1' });
    expect(res.status).toBe(200);
    expect(res.body.data.ended).toBe(true);
  });

  // ── P1 gap: clusters / inbox / agent-config / agent-comment ──
  it('GET /clusters returns cluster snapshot', async () => {
    const res = await request(app).get('/api/community/clusters');
    expect(res.status).toBe(200);
    expect(res.body.data[0].clusterId).toBe(1);
    expect(res.body.data[0].label).toBe('rock·night_owl');
    expect(res.body.data[0].memberCount).toBe(2);
  });

  it('GET /clusters/:id/members returns members of cluster', async () => {
    const res = await request(app).get('/api/community/clusters/1/members');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].userId).toBe('u1');
  });

  it('GET /clusters/:id/members empty for unknown cluster', async () => {
    const res = await request(app).get('/api/community/clusters/999/members');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('GET /inbox rejects missing userId', async () => {
    const res = await request(app).get('/api/community/inbox');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('user_id_required');
  });

  it('GET /inbox?userId=u1 returns user inbox', async () => {
    const res = await request(app).get('/api/community/inbox?userId=u1');
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe('u1');
    expect(res.body.data[0].targetType).toBe('post');
  });

  it('PUT /me/agent-config normalizes and stores rules', async () => {
    const res = await request(app).put('/api/community/me/agent-config').send({
      userId: 'u1',
      rules: { canComment: true, allowedTopics: ['rock', 'jazz'], canBeInvited: true, sharePlaylists: false },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe('u1');
    expect(res.body.data.rules.canComment).toBe(true);
    expect(res.body.data.rules.allowedTopics).toEqual(['rock', 'jazz']);
  });

  it('PUT /me/agent-config rejects missing userId', async () => {
    const res = await request(app).put('/api/community/me/agent-config').send({ rules: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('user_id_required');
  });

  it('POST /posts/:id/agent-comment triggers member agent comment', async () => {
    const res = await request(app).post('/api/community/posts/1/agent-comment').send({ byUserId: 'u1' });
    expect(res.status).toBe(200);
    expect(res.body.data.commentId).toBe(99);
    expect(res.body.data.content).toContain('u1');
  });

  it('POST /posts/:id/agent-comment 400 when post missing', async () => {
    mockAuth.uid = 'u2';
    const res = await request(app).post('/api/community/posts/999/agent-comment').send({ byUserId: 'u2' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('post_not_found');
  });

  it('POST /posts/:id/agent-comment rejects missing byUserId', async () => {
    const res = await request(app).post('/api/community/posts/1/agent-comment').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('by_user_id_required');
  });

  // ── F9: invitations ──
  it('POST /invitations creates invitation', async () => {
    const res = await request(app).post('/api/community/invitations').send({ fromUserId: 'u1', toUserId: 'u2' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.fromUserId).toBe('u1');
    expect(res.body.data.contextType).toBe('feed');
  });

  it('POST /invitations rejects missing userIds', async () => {
    const res = await request(app).post('/api/community/invitations').send({ fromUserId: 'u1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('user_ids_required');
  });

  it('POST /invitations 403 when not authorized', async () => {
    const res = await request(app).post('/api/community/invitations').send({ fromUserId: 'u1', toUserId: 'blocked' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_authorized');
  });

  it('POST /invitations/:id/respond accepts invitation', async () => {
    const res = await request(app).post('/api/community/invitations/1/respond').send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('accepted');
  });

  it('POST /invitations/:id/respond 404 when not found', async () => {
    const res = await request(app).post('/api/community/invitations/999/respond').send({ status: 'accepted' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('POST /invitations/:id/respond rejects missing status', async () => {
    const res = await request(app).post('/api/community/invitations/1/respond').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('status_required');
  });

  it('GET /invitations?userId=u1 returns list', async () => {
    const res = await request(app).get('/api/community/invitations?userId=u1');
    expect(res.status).toBe(200);
    expect(res.body.data[0].toUserId).toBe('u1');
    expect(res.body.data[0].status).toBe('pending');
  });

  it('GET /invitations rejects missing userId', async () => {
    const res = await request(app).get('/api/community/invitations');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('user_id_required');
  });

  it('POST /invitations/:id/bring-playlist triggers playlist bring', async () => {
    const res = await request(app).post('/api/community/invitations/1/bring-playlist');
    expect(res.status).toBe(200);
    expect(res.body.data.playlists[0].id).toBe('pl1');
  });

  it('POST /invitations/:id/bring-playlist 404 when not found', async () => {
    const res = await request(app).post('/api/community/invitations/999/bring-playlist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('invitation_not_found');
  });

  // ── 改头像 / 改昵称（B-Fix）──
  it('PUT /members/:userId/profile updates nickname', async () => {
    const res = await request(app).put('/api/community/members/u1/profile').send({ nickname: '新昵称' });
    expect(res.status).toBe(200);
    expect(res.body.data.nickname).toBe('新昵称');
  });

  it('PUT /members/:userId/profile rejects overly long nickname', async () => {
    const res = await request(app).put('/api/community/members/u1/profile').send({ nickname: 'x'.repeat(33) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('nickname_invalid');
  });

  it('POST /members/:userId/avatar uploads base64 avatar', async () => {
    const data = Buffer.from('fake-image-bytes').toString('base64');
    const res = await request(app).post('/api/community/members/u1/avatar').send({ data, mimeType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.avatarUrl).toBe('/api/community/members/u1/avatar');
  });

  it('POST /members/:userId/avatar rejects invalid base64', async () => {
    const res = await request(app).post('/api/community/members/u1/avatar').send({ data: '%%%', mimeType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('avatar_invalid_or_too_large');
  });

  it('GET /members/:userId/avatar returns binary with mime', async () => {
    const res = await request(app).get('/api/community/members/u1/avatar');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('GET /members/:userId/avatar 404 when none uploaded', async () => {
    const res = await request(app).get('/api/community/members/u2/avatar');
    expect(res.status).toBe(404);
  });

  it('PUT /members/:userId/profile forbids editing another user', async () => {
    const res = await request(app).put('/api/community/members/u2/profile').send({ nickname: '篡改' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
