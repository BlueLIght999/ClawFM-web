import { describe, expect, it, vi } from 'vitest';
import { createDmService } from '../application/services/DmService.js';

/** 构造一个可编程的假仓储 + 假 agent 端口 + 假 publisher。 */
function makeDeps({ repo = {}, agent = {}, publisher = { emit: vi.fn() }, logger = { warn: vi.fn() } } = {}) {
  const service = createDmService({
    communityRepository: repo,
    memberAgentLoopPort: agent,
    eventPublisher: publisher,
    logger,
  });
  return { service, repo, agent, publisher, logger };
}

const noopRepo = {
  getMember: () => null,
  getOrCreateDmThread: () => null,
  getDmThread: () => null,
  listDmThreads: () => [],
  listDmMessages: () => [],
  createDmMessage: () => 1,
  getDmMessage: () => null,
  touchDmThreadLastMessage: () => {},
  getMemberAgentConfig: () => null,
  getProfile: () => null,
};

function threadDtos(userA, userB, agentAuthorUserId = null, id = 1) {
  const thread = { id, threadKey: `${userA}\u0000${userB}`, userA, userB, agentAuthorUserId, lastMessageAt: null, lastMessage: null, lastSenderUserId: null, createdAt: 't' };
  const message = (id, senderUserId, isAgent, content) => ({ id, threadId: thread.id, senderUserId, isAgent, content });
  const msgs = [message(10, userA, false, 'hi')];
  const repo = {
    ...noopRepo,
    getMember: (uid) => (uid === userA ? { userId: userA, nickname: '甲', avatarUrl: '' } : { userId: userB, nickname: '乙', avatarUrl: '' }),
    getOrCreateDmThread: () => ({ ...thread, peer: `peer-of-${agentAuthorUserId ? 'agent' : 'user'}` }),
    getDmThread: () => thread,
    listDmMessages: () => msgs,
    createDmMessage: vi.fn(({ isAgent }) => (isAgent ? 20 : 11)),
    getDmMessage: (id) => message(id, id === 20 ? userB : userA, id === 20, id === 20 ? 'agent reply' : 'hi'),
    touchDmThreadLastMessage: vi.fn(),
    getMemberAgentConfig: () => ({ personaSnapshot: 'you are a persona' }),
    getProfile: () => ({ nickname: userB }),
  };
  return { thread, msgs, repo };
}

describe('DmService', () => {
  it('openThread_otherMemberMissing_returnsError', () => {
    const { service } = makeDeps({
      repo: { ...noopRepo, getMember: () => null },
    });
    const r = service.openThread({ userId: 'u1', otherUserId: 'ghost' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('other_member_not_found');
  });

  it('openThread_returnsThreadWithPeer', () => {
    const { repo, service } = makeDeps({ repo: noopRepo });
    repo.getMember = (uid) => (uid === 'u2' ? { userId: 'u2' } : null);
    repo.getOrCreateDmThread = () => ({ id: 1, userA: 'u1', userB: 'u2', agentAuthorUserId: null });
    const r = service.openThread({ userId: 'u1', otherUserId: 'u2' });
    expect(r.ok).toBe(true);
    expect(r.thread.peer.userId).toBe('u2');
    expect(r.thread.peer.isAgent).toBe(false);
  });

  it('sendMessage_peerDm_emitsToRecipient_noAgentReply', async () => {
    const { thread } = threadDtos('u1', 'u2');
    const publisher = { emit: vi.fn() };
    const repo = {
      ...noopRepo,
      getDmThread: () => thread,
      listDmMessages: () => [{ id: 10, threadId: 1, senderUserId: 'u1', isAgent: false, content: 'hi' }],
      createDmMessage: vi.fn(() => 11),
      getDmMessage: (id) => ({ id, threadId: 1, senderUserId: 'u1', isAgent: false, content: 'hi' }),
      touchDmThreadLastMessage: vi.fn(),
    };
    const { service } = makeDeps({ repo, publisher });
    const r = await service.sendMessage({ userId: 'u1', threadId: 1, content: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.agentReply).toBeNull();
    expect(publisher.emit).toHaveBeenCalledWith('community:dm-new', { threadId: 1, message: expect.objectContaining({ content: 'hi' }) }, 'u2');
  });

  it('sendMessage_agentDm_generatesAgentReply_fromOwnerPersona', async () => {
    const { thread, repo } = threadDtos('u1', 'u2', 'u2');
    const agent = { generateReply: vi.fn().mockResolvedValue('agent reply') };
    const publisher = { emit: vi.fn() };
    const { service } = makeDeps({ repo, agent, publisher });
    const r = await service.sendMessage({ userId: 'u1', threadId: 1, content: 'hello' });
    expect(r.ok).toBe(true);
    expect(r.agentReply).not.toBeNull();
    expect(r.agentReply.content).toBe('agent reply');
    expect(r.agentReply.senderUserId).toBe('u2');
    expect(r.agentReply.isAgent).toBe(true);
    // agent 回复生成时带 persona 与上下文（上下文来源是仓储返回的最近消息 hi）
    expect(agent.generateReply).toHaveBeenCalledWith('you are a persona', expect.stringContaining('you: hi'));
    // 回执发给发起人
    expect(publisher.emit).toHaveBeenCalledWith('community:dm-new', expect.anything(), 'u1');
  });

  it('sendMessage_agentOwner_sendingNoSelfReply', async () => {
    const { thread, repo } = threadDtos('u1', 'u2', 'u1');
    const agent = { generateReply: vi.fn().mockResolvedValue('should not happen') };
    const publisher = { emit: vi.fn() };
    const { service } = makeDeps({ repo, agent, publisher });
    const r = await service.sendMessage({ userId: 'u1', threadId: 1, content: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.agentReply).toBeNull();
    expect(agent.generateReply).not.toHaveBeenCalled();
    expect(publisher.emit).not.toHaveBeenCalled();
  });

  it('sendMessage_contentBad_returnsError', async () => {
    const { thread, repo } = threadDtos('u1', 'u2');
    const { service } = makeDeps({ repo });
    const r = await service.sendMessage({ userId: 'u1', threadId: 1, content: '' });
    expect(r.ok).toBe(false);
  });

  it('listMessages_accessDenied_returnsThreadNotAccessible', () => {
    const { repo, service } = makeDeps({ repo: noopRepo });
    repo.getDmThread = () => ({ id: 1, userA: 'u1', userB: 'u2', agentAuthorUserId: null });
    const r = service.listMessages('u9', 1);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('thread_not_accessible');
  });
});