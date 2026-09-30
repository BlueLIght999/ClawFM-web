import { describe, expect, it, beforeEach } from 'vitest';
import { createCommunityEventPublisher } from '../infrastructure/community/CommunityEventPublisher.js';
import { createMemberAgentLoopAdapter } from '../infrastructure/community/MemberAgentLoopAdapter.js';
import { registerCommunityTools } from '../agent/application/services/CommunityTools.js';

function makeIo() {
  const calls = [];
  return {
    calls,
    to(room) { return { emit: (event, payload) => { calls.push({ room, event, payload }); } }; },
    emit(event, payload) { calls.push({ event, payload }); },
  };
}

describe('community event publisher adapter', () => {
  it('emit_withTargetUserId_sendsToUserRoom', () => {
    const io = makeIo();
    const pub = createCommunityEventPublisher({ io });
    pub.emit('community:push', { x: 1 }, 'u1');
    expect(io.calls[0]).toEqual({ room: 'user:u1', event: 'community:push', payload: { x: 1 } });
  });

  it('emit_withoutTargetUserId_broadcasts', () => {
    const io = makeIo();
    const pub = createCommunityEventPublisher({ io });
    pub.emit('community:post-new', { y: 2 });
    expect(io.calls[0]).toEqual({ event: 'community:post-new', payload: { y: 2 } });
  });

  it('emit_handlesNullIoGracefully', () => {
    const pub = createCommunityEventPublisher({ io: null });
    expect(() => pub.emit('x', {}, 'u1')).not.toThrow();
  });
});

describe('member agent loop adapter', () => {
  it('generateComment_callsGenerateWithPersonaAndPrompt', async () => {
    let received;
    const adapter = createMemberAgentLoopAdapter({
      generate: async (messages) => { received = messages; return '同感，好歌'; },
    });
    const text = await adapter.generateComment('你是阿七的 agent', '这首歌真棒');
    expect(text).toBe('同感，好歌');
    expect(received[0].role).toBe('system');
    expect(received[0].content).toContain('阿七');
    expect(received[1].role).toBe('user');
    expect(received[1].content).toContain('这首歌真棒');
  });

  it('generateComment_handlesNullGenerateReturningEmpty', async () => {
    const adapter = createMemberAgentLoopAdapter({ generate: async () => null });
    const text = await adapter.generateComment(null, '');
    expect(text).toBe('');
  });
});

describe('register community tools', () => {
  function makeMocks() {
    const distCalls = [];
    const commentCalls = [];
    const inviteCalls = [];
    const bringCalls = [];
    return {
      services: {
        distributionService: { distribute: (a) => { distCalls.push(a); return { pushedTo: 2, skipped: 0, matchedClusters: [{ clusterId: 0, score: 1, label: 'rock' }] }; } },
        memberAgentService: { commentOnPost: async (a) => { commentCalls.push(a); return { ok: true, commentId: 9, content: '同感' }; } },
        invitationService: {
          invite: (a) => { inviteCalls.push(a); return { ok: true, id: 1, status: 'pending' }; },
          listForUser: () => [],
          // 记录调用者实参：该工具拿不到可信身份，必须显式传 null 而不是编一个
          bringPlaylist: async (id, callerUserId) => { bringCalls.push({ id, callerUserId }); return { ok: false, error: 'not_participant' }; },
        },
      },
      distCalls, commentCalls, inviteCalls, bringCalls,
    };
  }

  function makeRegistry() {
    const tools = new Map();
    return {
      tools,
      register(def) { tools.set(def.name, def); },
    };
  }

  let mocks, registry;
  beforeEach(() => { mocks = makeMocks(); registry = makeRegistry(); });

  it('registersFourTools', () => {
    registerCommunityTools({ registry, ...mocks.services });
    expect(registry.tools.size).toBe(4);
    expect(registry.tools.has('distribute_to_cluster')).toBe(true);
    expect(registry.tools.has('comment_as_member_agent')).toBe(true);
    expect(registry.tools.has('invite_member_agent')).toBe(true);
    expect(registry.tools.has('bring_playlist')).toBe(true);
  });

  it('distribute_to_cluster_callsDistributionService', async () => {
    registerCommunityTools({ registry, ...mocks.services });
    const r = await registry.tools.get('distribute_to_cluster').execute({ targetType: 'post', targetId: '5', contentTags: ['rock'] });
    expect(r.handled).toBe(true);
    expect(r.pushedTo).toBe(2);
    expect(mocks.distCalls[0].targetType).toBe('post');
  });

  it('comment_as_member_agent_callsMemberAgentService', async () => {
    registerCommunityTools({ registry, ...mocks.services });
    const r = await registry.tools.get('comment_as_member_agent').execute({ postId: 5, byUserId: 'u1' });
    expect(r.handled).toBe(true);
    expect(r.commentId).toBe(9);
    expect(mocks.commentCalls[0]).toEqual({ postId: 5, byUserId: 'u1' });
  });

  it('invite_member_agent_callsInvitationService', async () => {
    registerCommunityTools({ registry, ...mocks.services });
    const r = await registry.tools.get('invite_member_agent').execute({ fromUserId: 'a', toUserId: 'b', contextType: 'feed' });
    expect(r.handled).toBe(true);
    expect(r.id).toBe(1);
    expect(mocks.inviteCalls[0]).toEqual({ fromUserId: 'a', toUserId: 'b', contextType: 'feed', contextId: undefined });
  });

  it('bring_playlist_failsExplicitlyWithoutTrustedIdentity', async () => {
    registerCommunityTools({ registry, ...mocks.services });
    const r = await registry.tools.get('bring_playlist').execute({ invitationId: 7 });
    // 工具的 args 全由 LLM 生成，没有可信调用者身份。不能编一个传下去——
    // 那等于把「模型自报身份」当身份用。显式传 null，由 service 的 fail-closed 挡下。
    expect(mocks.bringCalls[0]).toEqual({ id: 7, callerUserId: null });
    expect(r.handled).toBe(false);
    expect(r.error).toBe('not_participant');
  });

  it('skipsRegistrationWhenServicesMissing', () => {
    registerCommunityTools({ registry });
    expect(registry.tools.size).toBe(0);
  });
});
