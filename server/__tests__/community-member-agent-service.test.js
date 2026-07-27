import { describe, expect, it, beforeEach } from 'vitest';
import { createMemberAgentService } from '../application/services/MemberAgentService.js';

function makeMockRepo({ post, config, profile }) {
  const created = [];
  return {
    created,
    getPost: () => post || null,
    getMemberAgentConfig: () => config || null,
    getProfile: () => profile || null,
    createPost: (p) => { const id = created.length + 1; created.push({ id, ...p }); return id; },
  };
}

function makePublisher() {
  const emits = [];
  return { emits, emit: (event, payload, target) => { emits.push({ event, payload, target }); } };
}

let publisher;
beforeEach(() => { publisher = makePublisher(); });

describe('member agent service', () => {
  it('commentOnPost_generatesAndCreatesAgentComment', async () => {
    const repo = makeMockRepo({
      post: { id: 5, content: '好歌', autoTags: ['rock'] },
      config: { rules: { canComment: true, allowedTopics: [] } },
      profile: { tags: { genre: { rock: 1 } } },
    });
    const loopPort = { generateComment: async (_persona, content) => `同感，${content}确实棒` };
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: loopPort, eventPublisher: publisher });

    const r = await service.commentOnPost({ postId: 5, byUserId: 'u1' });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('同感');
    expect(repo.created[0].isAgent).toBe(true);
    expect(repo.created[0].agentAuthorUserId).toBe('u1');
    expect(repo.created[0].parentId).toBe(5);
    expect(repo.created[0].type).toBe('comment');
    expect(publisher.emits[0].event).toBe('community:agent-comment');
  });

  it('commentOnPost_deniedWhenCanCommentFalse', async () => {
    const repo = makeMockRepo({
      post: { id: 5, content: 'x', autoTags: [] },
      config: { rules: { canComment: false, allowedTopics: [] } },
    });
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: { generateComment: async () => 'x' }, eventPublisher: publisher });
    const r = await service.commentOnPost({ postId: 5, byUserId: 'u1' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('comment_disabled');
    expect(repo.created.length).toBe(0);
  });

  it('commentOnPost_deniedWhenTopicNotAllowed', async () => {
    const repo = makeMockRepo({
      post: { id: 5, content: 'x', autoTags: ['pop'] },
      config: { rules: { canComment: true, allowedTopics: ['rock'] } },
    });
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: { generateComment: async () => 'x' }, eventPublisher: publisher });
    const r = await service.commentOnPost({ postId: 5, byUserId: 'u1' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('topic_not_allowed');
  });

  it('commentOnPost_postNotFound', async () => {
    const repo = makeMockRepo({ post: null });
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: { generateComment: async () => 'x' }, eventPublisher: publisher });
    const r = await service.commentOnPost({ postId: 99, byUserId: 'u1' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('post_not_found');
  });

  it('commentOnPost_agentLoopFailed', async () => {
    const repo = makeMockRepo({ post: { id: 5, content: 'x', autoTags: [] }, config: { rules: { canComment: true, allowedTopics: [] } } });
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: { generateComment: async () => { throw new Error('llm down'); } }, eventPublisher: publisher });
    const r = await service.commentOnPost({ postId: 5, byUserId: 'u1' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('agent_loop_failed');
  });

  it('commentOnPost_emptyCommentRejected', async () => {
    const repo = makeMockRepo({ post: { id: 5, content: 'x', autoTags: [] }, config: { rules: { canComment: true, allowedTopics: [] } } });
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: { generateComment: async () => '   ' }, eventPublisher: publisher });
    const r = await service.commentOnPost({ postId: 5, byUserId: 'u1' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('empty_comment');
  });

  it('setConfig_normalizesAndPersists', () => {
    const repo = makeMockRepo({});
    const upserts = [];
    repo.upsertMemberAgentConfig = (uid, rules, persona) => upserts.push({ uid, rules, persona });
    const service = createMemberAgentService({ communityRepository: repo, memberAgentLoopPort: { generateComment: async () => 'x' }, eventPublisher: publisher });
    const n = service.setConfig('u1', { canComment: false, allowedTopics: ['rock', '', 5] });
    expect(n.canComment).toBe(false);
    expect(n.allowedTopics).toEqual(['rock']);
    expect(upserts[0].rules.allowedTopics).toEqual(['rock']);
  });
});
