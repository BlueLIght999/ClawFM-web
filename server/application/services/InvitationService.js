/**
 * InvitationService — 邀请用例（F9）。
 *
 * invite：校验被邀请方授权(RC8)→createInvitation(pending)→emit community:invitation。
 * respond：状态机转移(RC8)→updateInvitationStatus。
 * 依赖 CommunityRepository / domain invitationRules+memberAgentRules / eventPublisher。
 */
import { checkInvitationAuthorization, transition, normalizeInvitation } from '../../domain/community/invitationRules.js';
import { normalizeAgentRules } from '../../domain/community/memberAgentRules.js';

/**
 * @param {{communityRepository: import('../ports/repos/CommunityRepository.js').CommunityRepository, neteaseHistoryPort?: import('../ports/services/NeteaseMemberHistoryPort.js').NeteaseMemberHistoryPort, cookieCipherPort?: import('../ports/services/CookieCipherPort.js').CookieCipherPort, eventPublisher?: {emit?: (event:string, payload:object, targetUserId?:string|null)=>void, emitToRoom?: (event:string, payload:object, roomId:string)=>void}, logger?: {warn?:Function}}} [deps]
 */
// The `= {}` default is cast rather than the dependency being marked optional:
// communityRepository is genuinely required (every method dereferences it), so
// typing it optional would trade one honest error for ~100 false
// possibly-undefined ones. A caller that omits it fails at first use -- which is
// the existing behaviour -- and the cast keeps that contract documented.
export function createInvitationService({communityRepository, neteaseHistoryPort, cookieCipherPort, eventPublisher, logger} = /** @type {any} */ ({})) {
  const repo = communityRepository;

  /**
   * @returns {{ok:true, id:number} | {ok:false, error:string, reasons?:string[]}}
   */
  function invite({ fromUserId, toUserId, contextType = 'feed', contextId = null }) {
    const toConfig = repo.getMemberAgentConfig(toUserId);
    const toRules = normalizeAgentRules(toConfig?.rules);
    const auth = checkInvitationAuthorization({ toRules });
    if (!auth.allowed) {
      return { ok: false, error: 'not_authorized', reasons: auth.reasons };
    }

    const inv = normalizeInvitation({ fromUserId, toUserId, contextType, contextId, status: 'pending' });
    const created = repo.createInvitation(inv);
    eventPublisher?.emit?.('community:invitation', created, toUserId);
    return { ok: true, ...created };
  }

  /**
   * @returns {{ok:true, status:string} | {ok:false, error:string}}
   */
  function respond(invitationId, toStatus) {
    const inv = repo.getInvitation(Number(invitationId));
    if (!inv) return { ok: false, error: 'not_found' };
    const t = transition(inv, toStatus);
    if (!t.ok) {
      logger?.warn?.({ component: 'community', from: t.from, to: t.to }, 'invalid invitation transition');
      return { ok: false, error: t.error };
    }
    repo.updateInvitationStatus(Number(invitationId), toStatus);
    // 通知邀请方与被邀请方状态变更（双方均可见）
    const updated = repo.getInvitation(Number(invitationId));
    eventPublisher?.emit?.('community:invitation', updated, inv.fromUserId);
    if (inv.toUserId && inv.toUserId !== inv.fromUserId) {
      eventPublisher?.emit?.('community:invitation', updated, inv.toUserId);
    }
    return { ok: true, status: toStatus };
  }

  function listForUser(userId) {
    return repo.listInvitations(userId);
  }

  /**
   * F9 bring_playlist：被邀请方 agent 把主人歌单带入目标上下文。
   * 邀请须 active；room 上下文 → emitToRoom('room:state' 带 playlists)；feed 上下文 → emit 给邀请方。
   * @returns {Promise<{ok:true, playlists:Array} | {ok:false, error:string}>}
   */
  async function bringPlaylist(invitationId) {
    const inv = repo.getInvitation(Number(invitationId));
    if (!inv) return { ok: false, error: 'invitation_not_found' };
    if (inv.status !== 'active') return { ok: false, error: 'invitation_not_active' };

    const auth = repo.getMemberAuth(inv.toUserId);
    if (!auth) return { ok: false, error: 'invitee_no_credentials' };

    let playlists;
    try {
      const cookie = cookieCipherPort?.decrypt?.(auth.cookieEncrypted);
      // The optional chain yields `string | undefined`; a missing cookie would be
      // sent to Netease as the literal "undefined" and silently return nothing, so
      // treat it as the same precondition failure as missing credentials (RC6: the
      // decrypted member cookie exists only for this call and is never logged).
      if (!cookie) return { ok: false, error: 'invitee_no_credentials' };
      playlists = await neteaseHistoryPort?.fetchMemberPlaylists?.(auth.neteaseUid, cookie) || [];
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message, invitationId }, 'bring_playlist fetch failed');
      return { ok: false, error: 'playlist_fetch_failed' };
    }

    const payload = { invitationId: Number(invitationId), fromUserId: inv.toUserId, playlists };
    if (inv.contextType === 'room' && inv.contextId) {
      eventPublisher?.emitToRoom?.('room:state', { type: 'playlists_brought', ...payload }, inv.contextId);
    } else {
      eventPublisher?.emit?.('community:push', { targetType: 'playlist', ...payload }, inv.fromUserId);
    }
    return { ok: true, playlists };
  }

  return { invite, respond, listForUser, bringPlaylist };
}
