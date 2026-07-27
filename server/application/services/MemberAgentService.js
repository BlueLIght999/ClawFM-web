/**
 * MemberAgentService — 成员 agent 用例（F7 配置 / F8 触发评论）。
 *
 * commentOnPost：取帖→校验规则(RC9)→建 persona→调 MemberAgentLoopPort 生成评论→
 *   createPost(type=comment, is_agent=1, agentAuthorUserId)→emit community:agent-comment（RC7 署名）。
 * 依赖 CommunityRepository / MemberAgentLoopPort / domain agentPersonaBuilder+memberAgentRules / eventPublisher。
 */
import { buildMemberPersona } from '../../domain/community/agentPersonaBuilder.js';
import { evaluateAgentAction, normalizeAgentRules } from '../../domain/community/memberAgentRules.js';

/**
 * @param {object} deps
 * @param {import('../ports/repos/CommunityRepository.js').CommunityRepository} deps.communityRepository
 * @param {import('../ports/services/MemberAgentLoopPort.js').MemberAgentLoopPort} deps.memberAgentLoopPort
 * @param {{emit?: (event:string, payload:object, targetUserId?:string|null)=>void}} [deps.eventPublisher]
 * @param {{warn?:Function}} [deps.logger]
 */
export function createMemberAgentService({ communityRepository, memberAgentLoopPort, eventPublisher, logger } = {}) {
  const repo = communityRepository;

  /**
   * 触发成员 agent 评论某帖。
   * @returns {Promise<{ok:true, commentId:number, content:string} | {ok:false, error:string}>}
   */
  async function commentOnPost({ postId, byUserId }) {
    const post = repo.getPost(Number(postId));
    if (!post) return { ok: false, error: 'post_not_found' };

    const config = repo.getMemberAgentConfig(byUserId);
    const rules = normalizeAgentRules(config?.rules);
    const topic = (Array.isArray(post.autoTags) && post.autoTags[0]) || 'general';
    const allowed = evaluateAgentAction({ rules, action: 'comment', topic });
    if (!allowed.allowed) {
      logger?.warn?.({ component: 'community', byUserId, reason: allowed.reason }, 'agent comment denied by rules');
      return { ok: false, error: allowed.reason };
    }

    const profile = repo.getProfile(byUserId);
    const persona = config?.personaSnapshot || buildMemberPersona(profile || null, { nickname: byUserId });

    let content;
    try {
      content = await memberAgentLoopPort.generateComment(persona, post.content);
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'agent loop failed');
      return { ok: false, error: 'agent_loop_failed' };
    }
    const text = String(content || '').trim();
    if (text.length === 0) return { ok: false, error: 'empty_comment' };

    const commentId = repo.createPost({
      userId: byUserId,
      type: 'comment',
      content: text,
      parentId: Number(postId),
      isAgent: true,
      agentAuthorUserId: byUserId,
      autoTags: post.autoTags || [],
    });

    eventPublisher?.emit?.('community:agent-comment', { postId: Number(postId), commentId, agentAuthorUserId: byUserId }, null);

    return { ok: true, commentId, content: text };
  }

  function getConfig(userId) {
    return repo.getMemberAgentConfig(userId);
  }

  function setConfig(userId, rules, personaSnapshot = null) {
    const normalized = normalizeAgentRules(rules);
    repo.upsertMemberAgentConfig(userId, normalized, personaSnapshot);
    return normalized;
  }

  return { commentOnPost, getConfig, setConfig };
}
