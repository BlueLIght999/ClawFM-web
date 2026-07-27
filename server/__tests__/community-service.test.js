import { describe, expect, it, beforeEach } from 'vitest';
import { createCommunityService } from '../application/services/CommunityService.js';

// 内存 mock CommunityRepository，专注测 service 的编排逻辑（不依赖真实 DB）
function makeMockRepo() {
  let nextId = 1;
  const posts = new Map();
  const repo = {
    createPost(p) {
      const id = nextId++;
      posts.set(id, {
        id,
        userId: p.userId,
        type: p.type,
        parentId: p.parentId ?? null,
        content: p.content,
        songId: p.songId ?? null,
        playlistId: p.playlistId ?? null,
        autoTags: p.autoTags || [],
        likes: 0,
        isAgent: !!p.isAgent,
        agentAuthorUserId: p.agentAuthorUserId || null,
        createdAt: new Date().toISOString(),
      });
      return id;
    },
    getPost(id) { return posts.get(id) || null; },
    listFeed({ limit = 20, cursor = null } = {}) {
      let arr = [...posts.values()].filter((p) => p.parentId === null);
      if (cursor !== null) arr = arr.filter((p) => p.id < cursor);
      return arr.sort((a, b) => b.id - a.id).slice(0, limit);
    },
    listComments(parentId) {
      return [...posts.values()].filter((p) => p.parentId === parentId).sort((a, b) => a.id - b.id);
    },
    likePost(id) {
      const p = posts.get(id);
      if (p) p.likes += 1;
    },
  };
  return repo;
}

let service;
beforeEach(() => {
  service = createCommunityService({ communityRepository: makeMockRepo() });
});

describe('community service', () => {
  it('createPost_acceptsValidReflectionAndReturnsDto', () => {
    const r = service.createPost({ userId: 'u1', type: 'reflection', content: '  好听  ' });
    expect(r.ok).toBe(true);
    expect(r.post.type).toBe('reflection');
    expect(r.post.content).toBe('好听');
    expect(r.post.userId).toBe('u1');
    expect(r.post.parentId).toBeNull();
  });

  it('createPost_rejectsInvalidType', () => {
    const r = service.createPost({ userId: 'u1', type: 'rant', content: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_type');
  });

  it('createPost_rejectsEmptyContent', () => {
    const r = service.createPost({ userId: 'u1', type: 'reflection', content: '   ' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('content_empty');
  });

  it('createPost_commentRequiresParentId', () => {
    const r = service.createPost({ userId: 'u1', type: 'comment', content: '同感' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('comment_requires_parent');
  });

  it('createPost_recommendRequiresSongId', () => {
    const r = service.createPost({ userId: 'u1', type: 'recommend', content: '推这首' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('recommend_requires_song');
  });

  it('createPost_recommendWithSongIdSucceeds', () => {
    const r = service.createPost({ userId: 'u1', type: 'recommend', content: '推', songId: 's9' });
    expect(r.ok).toBe(true);
    expect(r.post.songId).toBe('s9');
  });

  it('createPost_passesAgentFlagsThrough', () => {
    const r = service.createPost({
      userId: 'u1', type: 'comment', content: '代发', parentId: 5,
      isAgent: true, agentAuthorUserId: 'u2', autoTags: ['rock'],
    });
    expect(r.ok).toBe(true);
    expect(r.post.isAgent).toBe(true);
    expect(r.post.agentAuthorUserId).toBe('u2');
    expect(r.post.autoTags).toEqual(['rock']);
    expect(r.post.parentId).toBe(5);
  });

  it('getFeed_returnsTopLevelDescAndCursorPaginates', () => {
    const a = service.createPost({ userId: 'u1', type: 'reflection', content: 'a' }).post.id;
    const b = service.createPost({ userId: 'u1', type: 'reflection', content: 'b' }).post.id;
    const c = service.createPost({ userId: 'u1', type: 'reflection', content: 'c' }).post.id;
    expect(service.getFeed({ limit: 10 }).map((p) => p.id)).toEqual([c, b, a]);
    expect(service.getFeed({ limit: 10, cursor: c }).map((p) => p.id)).toEqual([b, a]);
  });

  it('getFeed_excludesComments', () => {
    const parent = service.createPost({ userId: 'u1', type: 'reflection', content: 'p' }).post.id;
    service.createPost({ userId: 'u2', type: 'comment', content: 'reply', parentId: parent });
    const feed = service.getFeed({ limit: 10 });
    expect(feed.length).toBe(1);
    expect(feed[0].id).toBe(parent);
  });

  it('getPostWithComments_returnsPostAndComments', () => {
    const parent = service.createPost({ userId: 'u1', type: 'reflection', content: 'p' }).post.id;
    service.createPost({ userId: 'u2', type: 'comment', content: 'c1', parentId: parent });
    service.createPost({ userId: 'u3', type: 'comment', content: 'c2', parentId: parent });
    const result = service.getPostWithComments(parent);
    expect(result.post.id).toBe(parent);
    expect(result.comments.length).toBe(2);
    expect(result.comments[0].content).toBe('c1');
  });

  it('getPostWithComments_returnsNullForMissing', () => {
    expect(service.getPostWithComments(99999)).toBeNull();
  });

  it('likePost_incrementsAndReturnsUpdatedPost', () => {
    const created = service.createPost({ userId: 'u1', type: 'reflection', content: 'like me' });
    service.likePost(created.post.id);
    service.likePost(created.post.id);
    expect(service.getPost(created.post.id).likes).toBe(2);
  });

  it('getFeed_appliesFeedPersonalizerWhenForUserIdGiven', () => {
    // 用一个把数组反转的 personalizer 验证被调用
    const reversePersonalizer = (_uid, posts) => [...posts].reverse();
    const svc = createCommunityService({ communityRepository: makeMockRepo(), feedPersonalizer: reversePersonalizer });
    const a = svc.createPost({ userId: 'u1', type: 'reflection', content: 'a' }).post.id;
    const b = svc.createPost({ userId: 'u1', type: 'reflection', content: 'b' }).post.id;
    // 不传 forUserId → 原序（b,a）
    expect(svc.getFeed({ limit: 10 }).map((p) => p.id)).toEqual([b, a]);
    // 传 forUserId → 反序（a,b）
    expect(svc.getFeed({ limit: 10, forUserId: 'u9' }).map((p) => p.id)).toEqual([a, b]);
  });
});
