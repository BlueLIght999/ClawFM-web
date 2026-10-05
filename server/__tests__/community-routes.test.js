import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCommunityRouter } from '../infrastructure/http/communityRoutes.js';

// mock services，专注测路由层（参数解析/状态码/响应格式），不碰真实 service 逻辑
const mockAuth = { uid: 'u1' };
// 记录 setMemberSelfTags 的落库值，供断言验证路由传下去的是归一后列表
const savedSelfTags = { tags: null };
// 记录相似成员索引的显式失效次数：写标签后必须失效，否则用户立刻查相似成员会看到旧结果
const invalidationCount = { n: 0 };
// 邀请的「被邀请方」身份，可被单个用例改写以模拟越权（默认与登录身份一致）
const invitationInvitee = { uid: 'u1' };
// 同一条邀请的邀请方：bring-playlist 双方都能触发，respond 只认被邀请方
const INVITATION_INVITER_UID = 'u2';
// likeSong 收到的入参：断言身份取自登录态而不是请求体
const songLikes = [];

function makeMockServices() {
  const profiles = new Map();
  return {    communityService: {
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
      likeSong: ({ userId, songId, title, artist }) => {
        songLikes.push({ userId, songId, title, artist });
        if (!String(songId || '').trim()) return { ok: false, error: 'song_id_required' };
        if (userId === 'u3') return { ok: false, error: 'not_member' };
        return { ok: true, liked: true, alreadyLiked: false };
      },
    },
    memberProfileService: {
      buildProfile: async (userId) => {
        if (userId === 'noref' || userId === 'u3') return { ok: false, error: 'no_credentials' };
        const profile = { meta: { totalPlays: 10, source: 'P-B' } };
        profiles.set(userId, profile);
        return { ok: true, profile, degraded: false };
      },
      getProfile: (userId) => profiles.get(userId) || null,
    },
    communityRepository: {
      createMember: ({ userId, nickname, avatarUrl }) => ({ userId, nickname, avatarUrl, clusterId: null, selfTags: [] }),
      getMember: (userId) => ['u1', 'u2', 'u3'].includes(userId)
        ? { userId, nickname: userId === 'u1' ? '阿七' : '阿八', avatarUrl: '', clusterId: 1, selfTags: [] }
        : null,
      setMemberSelfTags: (userId, selfTags) => { savedSelfTags.tags = selfTags; },
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
      // 认身份的 mock：路由必须把调用者传下来，否则这里一律 not_participant。
      // 一个忽略第三参的 mock 会让越权路径测不出来——这正是缺口此前存活的原因。
      respond: (invitationId, status, callerUserId) => {
        if (invitationId === 999) return { ok: false, error: 'not_found' };
        if (callerUserId !== invitationInvitee.uid) return { ok: false, error: 'not_participant' };
        return { ok: true, status };
      },
      listForUser: (userId) => [{ id: 1, fromUserId: 'u2', toUserId: userId, status: 'pending', contextType: 'feed' }],
      bringPlaylist: async (invitationId, callerUserId) => {
        if (invitationId === 999) return { ok: false, error: 'invitation_not_found' };
        if (![INVITATION_INVITER_UID, invitationInvitee.uid].includes(callerUserId)) return { ok: false, error: 'not_participant' };
        return { ok: true, playlists: [{ id: 'pl1', name: 'MyPlaylist' }] };
      },
    },
    similarMembersService: {
      findSimilar: ({ userId, limit }) => ({
        userId,
        hasTags: true,
        candidates: [
          { userId: 'u2', nickname: '阿八', avatarUrl: '', score: 0.5, sharedTags: ['后摇'] },
        ].slice(0, limit === undefined ? 50 : limit),
      }),
      invalidate: () => { invalidationCount.n += 1; },
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
beforeEach(() => { mockAuth.uid = 'u1'; invitationInvitee.uid = 'u1'; savedSelfTags.tags = null; invalidationCount.n = 0; app = makeApp(); });

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

  // ── F4：点赞正在听的歌 ──
  it('POST /songs/:songId/like likes as the logged-in member, ignoring a userId in the body', async () => {
    songLikes.length = 0;
    const res = await request(app).post('/api/community/songs/s9/like').send({ userId: 'u2', title: '晴天', artist: '周杰伦' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ liked: true, alreadyLiked: false });
    expect(songLikes).toEqual([{ userId: 'u1', songId: 's9', title: '晴天', artist: '周杰伦' }]);
  });

  it('POST /songs/:songId/like 403 when the logged-in user is not a member', async () => {
    mockAuth.uid = 'u3';
    try {
      const res = await request(app).post('/api/community/songs/s9/like').send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('not_member');
    } finally {
      mockAuth.uid = 'u1';
    }
  });

  it('POST /songs/:songId/like 400 for a blank song id', async () => {
    const res = await request(app).post('/api/community/songs/%20/like').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('song_id_required');
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

  it('GET /feed passes the caller own forUserId through', async () => {
    const res = await request(app).get('/api/community/feed?forUserId=u1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('GET /feed rejects a forUserId that is not the caller', async () => {
    // 个性化 feed 按「谁邀请了谁」加权：替别人取等于把对方的邀请关系与被邀请方品味泄露出去
    const res = await request(app).get('/api/community/feed?forUserId=u9');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
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

  // ── 邀请参与方校验（授权缺口修复，路由层）────────────────
  // 这两条端点此前不看调用者，任何成员遍历到自增 id 即可替他人表态或触发他人
  // cookie 解密。断言路由确实把 req.communityUserId 传下去、且越权回 403。

  it('POST /invitations/:id/respond 403 when caller is not the invitee', async () => {
    invitationInvitee.uid = 'someone-else';
    const res = await request(app).post('/api/community/invitations/1/respond').send({ status: 'accepted' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_participant');
  });

  it('POST /invitations/:id/bring-playlist 403 when caller is not a participant', async () => {
    invitationInvitee.uid = 'someone-else';
    const res = await request(app).post('/api/community/invitations/1/bring-playlist');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_participant');
  });

  it('POST /invitations/:id/bring-playlist lets the inviter trigger it', async () => {
    // 路由不得另加「仅被邀请方」的守卫：邀请方来取歌单正是 F9 的本意
    mockAuth.uid = INVITATION_INVITER_UID;
    app = makeApp();
    const res = await request(app).post('/api/community/invitations/1/bring-playlist');
    expect(res.status).toBe(200);
    expect(res.body.data.playlists[0].id).toBe('pl1');
  });

  it('POST /invitations/:id/bring-playlist 403 when the invitee has turned sharing off', async () => {
    // 与 not_participant 同属「无权」，而不是 400 的请求格式错
    const services = makeMockServices();
    services.invitationService.bringPlaylist = async () => ({ ok: false, error: 'sharing_disabled' });
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/community', createCommunityRouter(services));
    const res = await request(app2).post('/api/community/invitations/1/bring-playlist');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('sharing_disabled');
  });

  it('POST /invitations/:id/bring-playlist 409 when the invitation is not active', async () => {
    // 409 而非 400：请求本身合法，是与当前资源状态冲突
    const services = makeMockServices();
    services.invitationService.bringPlaylist = async () => ({ ok: false, error: 'invitation_not_active' });
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/community', createCommunityRouter(services));
    const res = await request(app2).post('/api/community/invitations/1/bring-playlist');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('invitation_not_active');
  });

  it('POST /invitations/:id/respond 401 when not logged in', async () => {
    mockAuth.uid = '';
    app = makeApp();
    const res = await request(app).post('/api/community/invitations/1/respond').send({ status: 'accepted' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('auth_required');
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

  describe('PUT /members/:userId/self-tags', () => {
    it('persists normalized tags and rebuilds profile', async () => {
      const res = await request(app).put('/api/community/members/u1/self-tags').send({ selfTags: [' 后摇 ', '爵士小号'] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.selfTags).toEqual(['后摇', '爵士小号']);
      expect(res.body.data.profileBuilt).toBe(true);
      // 落库的是归一后的列表
      expect(savedSelfTags.tags).toEqual(['后摇', '爵士小号']);
    });

    it('accepts empty array (clearing all tags)', async () => {
      const res = await request(app).put('/api/community/members/u1/self-tags').send({ selfTags: [] });
      expect(res.status).toBe(200);
      expect(res.body.data.selfTags).toEqual([]);
    });

    it('rejects non-array body', async () => {
      const res = await request(app).put('/api/community/members/u1/self-tags').send({ selfTags: '后摇' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('self_tags_not_array');
    });

    it('rejects a tag over the length limit', async () => {
      const res = await request(app).put('/api/community/members/u1/self-tags').send({ selfTags: ['x'.repeat(13)] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('self_tag_too_long');
    });

    it('forbids editing another user tags', async () => {
      const res = await request(app).put('/api/community/members/u2/self-tags').send({ selfTags: ['后摇'] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('404 when authenticated member has no member row', async () => {
      // 登录态有效但尚未建档（未 POST /members）——标签无处可写
      mockAuth.uid = 'ghost';
      const res = await request(app).put('/api/community/members/ghost/self-tags').send({ selfTags: ['后摇'] });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('succeeds with profileBuilt=false when profile rebuild fails', async () => {
      // 网易云无凭据时画像建不出来，但标签本身已落库，不应整体失败
      mockAuth.uid = 'u3';
      const res = await request(app).put('/api/community/members/u3/self-tags').send({ selfTags: ['后摇'] });
      expect(res.status).toBe(200);
      expect(res.body.data.profileBuilt).toBe(false);
      expect(savedSelfTags.tags).toEqual(['后摇']);
    });

    it('invalidates the similarity index on write', async () => {
      // 只失效一次：画像重建失败时不再多失效一次（重建没写 userTags，没什么可失效的）
      mockAuth.uid = 'u3';
      await request(app).put('/api/community/members/u3/self-tags').send({ selfTags: ['后摇'] });
      expect(invalidationCount.n).toBe(1);
    });

    it('invalidates again after a successful profile rebuild', async () => {
      // 重建会重写 profile.userTags，相似成员的查询标签取自它——所以要第二次失效
      await request(app).put('/api/community/members/u1/self-tags').send({ selfTags: ['后摇'] });
      expect(invalidationCount.n).toBe(2);
    });

    it('does not invalidate when the write is rejected', async () => {
      await request(app).put('/api/community/members/u1/self-tags').send({ selfTags: '后摇' });
      expect(invalidationCount.n).toBe(0);
    });
  });

  describe('GET /members/:userId/similar', () => {
    it('returns the top matches for the logged-in user', async () => {
      const res = await request(app).get('/api/community/members/u1/similar');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.userId).toBe('u1');
      expect(res.body.data.hasTags).toBe(true);
      expect(res.body.data.candidates[0].userId).toBe('u2');
    });

    it('passes the limit through as a number', async () => {
      const res = await request(app).get('/api/community/members/u1/similar?limit=0');
      expect(res.status).toBe(200);
      expect(res.body.data.candidates).toEqual([]);
    });

    it('forbids asking for another user similarity', async () => {
      // 别人的自填标签集合不是公开信息（与 /profile/:userId 的隐私口径一致）
      const res = await request(app).get('/api/community/members/u2/similar');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('501 when the similarity service is not wired', async () => {
      const bare = express();
      bare.use(express.json());
      const services = makeMockServices();
      delete services.similarMembersService;
      bare.use('/api/community', createCommunityRouter(services));
      const res = await request(bare).get('/api/community/members/u1/similar');
      expect(res.status).toBe(501);
      expect(res.body.error).toBe('similar_members_not_enabled');
    });
  });
});
