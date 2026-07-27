import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCommunityRouter } from '../infrastructure/http/communityRoutes.js';

// mock services，专注测路由层（参数解析/状态码/响应格式），不碰真实 service 逻辑
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
      getPostWithComments: (id) => (id === 1 ? { post: { id: 1 }, comments: [] } : null),
      likePost: (id) => (id === 1 ? { id: 1, likes: 5 } : null),
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
      upsertMemberAuth: () => {},
    },
    cookieCipherPort: { encrypt: (c) => `enc:${c}`, decrypt: (s) => s.replace(/^enc:/, '') },
    roomService: {
      createRoom: ({ hostUserId, name, topicTags }) => ({ ok: true, room: { roomId: 'room_1', hostUserId, name, topicTags: topicTags || [], status: 'active' } }),
      listRooms: () => [{ roomId: 'room_1', name: 'r', status: 'active' }],
      getRoom: (id) => (id === 'room_1' ? { roomId: 'room_1', hostUserId: 'u1', status: 'active' } : null),
      joinRoom: (id) => (id === 'room_1' ? { ok: true, room: { roomId: 'room_1', status: 'active' } } : { ok: false, error: 'room_not_found' }),
      hostControl: (id, userId, state) => (userId === 'u1' ? { ok: true, payload: { isPlaying: !!state.isPlaying, skip: !!state.skip } } : { ok: false, error: 'not_host_or_inactive' }),
      endRoom: (id, userId) => (userId === 'u1' ? { ok: true } : { ok: false, error: 'not_host' }),
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
beforeEach(() => { app = makeApp(); });

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

  it('POST /posts/:id/like returns updated post', async () => {
    const res = await request(app).post('/api/community/posts/1/like');
    expect(res.status).toBe(200);
    expect(res.body.data.likes).toBe(5);
  });

  it('POST /profile/:userId/refresh returns profile', async () => {
    const res = await request(app).post('/api/community/profile/u1/refresh');
    expect(res.status).toBe(200);
    expect(res.body.data.profile.meta.source).toBe('P-B');
  });

  it('POST /profile/:userId/refresh 400 when no credentials', async () => {
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

  it('GET /profile/:userId 404 when not built', async () => {
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
    const res = await request(app).post('/api/community/rooms/room_1/join').send({ userId: 'u2' });
    expect(res.status).toBe(200);
    expect(res.body.data.roomId).toBe('room_1');
  });

  it('POST /rooms/:id/control host succeeds', async () => {
    const res = await request(app).post('/api/community/rooms/room_1/control').send({ userId: 'u1', state: { isPlaying: true } });
    expect(res.status).toBe(200);
    expect(res.body.data.isPlaying).toBe(true);
  });

  it('POST /rooms/:id/control non-host denied', async () => {
    const res = await request(app).post('/api/community/rooms/room_1/control').send({ userId: 'u2', state: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('not_host_or_inactive');
  });

  it('POST /rooms/:id/end host succeeds', async () => {
    const res = await request(app).post('/api/community/rooms/room_1/end').send({ userId: 'u1' });
    expect(res.status).toBe(200);
    expect(res.body.data.ended).toBe(true);
  });
});
