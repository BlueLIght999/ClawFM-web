/**
 * DmService — 私信 / agent 私信用例（application 层）。
 *
 * openThread / listThreads / listMessages / sendMessage。
 * - peer 私信：消息落库后定向 emit community:dm-new 给对端。
 * - agent 私信：真人发消息后，用对端成员 agent 的 persona 生成一条回复（is_agent=1），
 *   定向 emit 回发起人；agent 主人自身发消息不触发自回复（防链式自举）。
 *
 * 依赖 CommunityRepository / MemberAgentLoopPort / domain dmRules+agentPersonaBuilder / eventPublisher。
 * 模型不透传：返回 camelCase DTO。RC7 署名：agent 私信消息带 isAgent + sender=agent 主人。
 */
import { dmThreadKey, validateDmMessage, validateOpenThread, canParticipate } from '../../domain/community/dmRules.js';
import { buildMemberPersona } from '../../domain/community/agentPersonaBuilder.js';

/**
 * @param {{communityRepository: import('../ports/repos/CommunityRepository.js').CommunityRepository, memberAgentLoopPort: import('../ports/services/MemberAgentLoopPort.js').MemberAgentLoopPort, eventPublisher?: {emit?: (event:string, payload:object, targetUserId?:string|null)=>void}, logger?: {warn?:Function}}} [deps]
 */
// `= {}` cast rather than weakening the deps to optional: communityRepository /
// memberAgentLoopPort are required (every method dereferences them), and typing
// them optional would replace one honest error with many false ones.
export function createDmService({ communityRepository, memberAgentLoopPort, eventPublisher, logger } = /** @type {any} */ ({})) {
  const repo = communityRepository;

  /**
   * 开启或复用会话。agent=true 开「与对端 agent」的会话。
   * @param {{userId: string, otherUserId: string, agent?: boolean}} [input]
   * @returns {{ok:true, thread:object} | {ok:false, error:string}}
   */
  function openThread({ userId, otherUserId, agent = false } = /** @type {any} */ ({})) {
    const check = validateOpenThread(userId, otherUserId);
    if (!check.ok) return check;
    const other = repo.getMember(String(otherUserId));
    if (!other) return { ok: false, error: 'other_member_not_found' };

    // agent 会话对端=agent 主人，peer 会话对端=对方
    const [a, b] = dmThreadKey(String(userId), String(otherUserId));
    const agentAuthorUserId = agent ? String(otherUserId) : null;

    const thread = repo.getOrCreateDmThread({ userA: a, userB: b, agentAuthorUserId });
    const peer = peerInfo(thread, String(userId));
    return { ok: true, thread: { ...thread, peer } };
  }

  /**
   * 列出我的会话（含对端信息 + 最近一条 + 未读数）。
   * @returns {Array}
   */
  function listThreads(userId) {
    const threads = repo.listDmThreads(String(userId));
    return threads.map((t) => ({ ...t, peer: peerInfo(t, String(userId)) }));
  }

  /** 拉某会话消息。仅参与者可见。 */
  function listMessages(userId, threadId) {
    const thread = repo.getDmThread(Number(threadId));
    if (!thread || !canParticipate(thread, String(userId))) return { ok: false, error: 'thread_not_accessible' };
    const messages = repo.listDmMessages(Number(threadId));
    return { ok: true, thread: { ...thread, peer: peerInfo(thread, String(userId)) }, messages };
  }

  /**
   * 发送消息。agent 会话会同步生成 agent 回复（RC7 署名）。
   * @returns {Promise<{ok:true, message:object, agentReply?:object|null} | {ok:false, error:string}>}
   */
  async function sendMessage({ userId, threadId, content }) {
    const thread = repo.getDmThread(Number(threadId));
    if (!thread || !canParticipate(thread, String(userId))) return { ok: false, error: 'thread_not_accessible' };

    const check = validateDmMessage(content);
    if (!check.ok) return check;

    const messageId = repo.createDmMessage({ threadId: Number(threadId), senderUserId: String(userId), isAgent: false, content: check.content });
    repo.touchDmThreadLastMessage(Number(threadId));
    const message = repo.getDmMessage(messageId);

    // ── peer 私信：定向通知对端
    if (!thread.agentAuthorUserId) {
      const recipient = String(thread.userA) === String(userId) ? thread.userB : thread.userA;
      eventPublisher?.emit?.('community:dm-new', { threadId: thread.id, message }, recipient);
      return { ok: true, message, agentReply: null };
    }

    // ── agent 私信：真人（非 agent 主人）发消息 → 生成 agent 回复
    if (String(userId) === String(thread.agentAuthorUserId)) {
      return { ok: true, message, agentReply: null };
    }

    let agentReply = null;
    try {
      const ownerConfig = repo.getMemberAgentConfig(thread.agentAuthorUserId);
      const ownerProfile = repo.getProfile(thread.agentAuthorUserId);
      const persona = ownerConfig?.personaSnapshot || buildMemberPersona(ownerProfile || null, { nickname: thread.agentAuthorUserId });
      const recent = repo.listDmMessages(Number(threadId), 6);
      const context = recent.map((m) => `${m.senderUserId === thread.agentAuthorUserId ? 'agent' : 'you'}: ${m.content}`).join('\n');
      const reply = await memberAgentLoopPort.generateReply(persona, context);
      const text = String(reply || '').trim();
      if (text) {
        const replyId = repo.createDmMessage({
          threadId: Number(threadId),
          senderUserId: String(thread.agentAuthorUserId),
          isAgent: true,
          content: text,
        });
        repo.touchDmThreadLastMessage(Number(threadId));
        agentReply = repo.getDmMessage(replyId);
        // 定向 push 回发起人
        eventPublisher?.emit?.('community:dm-new', { threadId: thread.id, message: agentReply }, String(userId));
      }
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'agent dm reply failed');
    }

    return { ok: true, message, agentReply };
  }

  return { openThread, listThreads, listMessages, sendMessage };
}

/** 计算对端展示信息（昵称/头像/是否 agent）。 */
function peerInfo(thread, viewerUserId) {
  const isAgent = !!thread.agentAuthorUserId;
  // peer 会话：对端 = 另一个 user；agent 会话：对端 = agent 主人
  const peerId = String(thread.userA) === String(viewerUserId) ? thread.userB : thread.userA;
  return { userId: peerId, isAgent };
}