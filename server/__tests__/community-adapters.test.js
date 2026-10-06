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
          bringPlaylist: async (id, callerUserId) => { bringCalls.push({ id, callerUserId }); return { ok: true, playlists: [{ id: 1 }, { id: 2 }] }; },
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

  // 代成员行事的三个工具：身份只取运行循环注入的 context.callerUserId（socket 登录态）。
  // args 由模型生成、对话就能改写，所以 args 里混进来的身份字段一律不认。
  describe('trusted caller', () => {
    const MEMBER_TOOLS = ['comment_as_member_agent', 'invite_member_agent', 'bring_playlist'];

    it('comment_as_member_agent_commentsAsTheCallerNotWhomTheArgsName', async () => {
      registerCommunityTools({ registry, ...mocks.services });
      const r = await registry.tools.get('comment_as_member_agent').execute({ postId: 5, byUserId: 'evil' }, { callerUserId: 'u1' });
      expect(r).toEqual({ handled: true, commentId: 9 });
      expect(mocks.commentCalls).toEqual([{ postId: 5, byUserId: 'u1' }]);
    });

    it('invite_member_agent_invitesFromTheCallerNotWhomTheArgsName', async () => {
      registerCommunityTools({ registry, ...mocks.services });
      const r = await registry.tools.get('invite_member_agent').execute({ fromUserId: 'evil', toUserId: 'b', contextType: 'feed' }, { callerUserId: 'a' });
      expect(r).toEqual({ handled: true, id: 1, status: 'pending' });
      expect(mocks.inviteCalls).toEqual([{ fromUserId: 'a', toUserId: 'b', contextType: 'feed', contextId: undefined }]);
    });

    it('bring_playlist_bringsAsTheCaller', async () => {
      // 邀请双方谁可以触发、被邀请方是否还在分享，由 service 判定；工具只负责递上可信身份
      registerCommunityTools({ registry, ...mocks.services });
      const r = await registry.tools.get('bring_playlist').execute({ invitationId: 7, callerUserId: 'evil' }, { callerUserId: 42 });
      expect(r).toEqual({ handled: true, invitationId: 7, playlistCount: 2 });
      expect(mocks.bringCalls).toEqual([{ id: 7, callerUserId: '42' }]);
    });

    it('refusesWithoutCallingTheServiceWhenNobodyIsLoggedIn', async () => {
      registerCommunityTools({ registry, ...mocks.services });
      for (const name of MEMBER_TOOLS) {
        const execute = registry.tools.get(name).execute;
        const args = { postId: 5, toUserId: 'b', invitationId: 7, byUserId: 'u1', fromUserId: 'u1' };
        expect(await execute(args, { callerUserId: null })).toEqual({ handled: false, error: 'auth_required' });
        expect(await execute(args)).toEqual({ handled: false, error: 'auth_required' });
      }
      expect(mocks.commentCalls).toEqual([]);
      expect(mocks.inviteCalls).toEqual([]);
      expect(mocks.bringCalls).toEqual([]);
    });

    it('exposesNoIdentityParameterToTheModel', () => {
      // 参数表就是模型能填的全部内容：身份字段一旦出现在这里，模型就会去「填」它
      registerCommunityTools({ registry, ...mocks.services });
      for (const name of MEMBER_TOOLS) {
        const { properties, required = [] } = registry.tools.get(name).parameters;
        for (const field of ['byUserId', 'fromUserId', 'callerUserId', 'userId']) {
          expect(properties).not.toHaveProperty(field);
          expect(required).not.toContain(field);
        }
      }
      expect(registry.tools.get('invite_member_agent').parameters.required).toEqual(['toUserId']);
    });
  });

  it('skipsRegistrationWhenServicesMissing', () => {
    registerCommunityTools({ registry });
    expect(registry.tools.size).toBe(0);
  });
});
