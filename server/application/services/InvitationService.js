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
   * 调用者是否为被邀请方（本次操作唯一合法的发起人）。
   *
   * 抽出来共用是因为 respond 与 bringPlaylist 的授权口径必须一致：两处若各写一份，
   * 以后只改一处就会出现「能接受邀请却拉不出歌单」这类不一致，而两个方法各自
   * 看都对。口径取被邀请方而非「任一参与方」是按最小授权——接受/拒绝只有本人能
   * 表态；歌单与 cookie 也都属于被邀请方，邀请方无权代其触发。
   *
   * 缺调用者时返回 false（fail-closed）：不能默认放行，否则校验等于可选。
   *
   * @param {object} invitation
   * @param {string|undefined} callerUserId
   * @returns {boolean}
   */
  function isInvitee(invitation, callerUserId) {
    if (!callerUserId) return false;
    return String(callerUserId) === String(invitation?.toUserId ?? '');
  }

  /**
   * @param {object} opts
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
   * 被邀请方接受/拒绝邀请（状态机转移）。
   *
   * callerUserId 是强制前提而不是可选参数：此前本方法只校验状态机合法性，
   * 从不看调用者是谁，于是任何持有效社区凭证的成员遍历到自增 id 就能替别人
   * 表态。授权判定必须在状态机之前，否则会先落库再发现越权。
   *
   * @param {number} invitationId
   * @param {string} toStatus
   * @param {string} callerUserId 当前登录成员 id（路由取自 req.communityUserId）
   * @returns {{ok:true, status:string} | {ok:false, error:string}}
   */
  function respond(invitationId, toStatus, callerUserId) {
    const inv = repo.getInvitation(Number(invitationId));
    if (!inv) return { ok: false, error: 'not_found' };
    // 授权先于一切：越权调用不该让状态机或落库产生任何副作用
    if (!isInvitee(inv, callerUserId)) {
      logger?.warn?.({ component: 'community', invitationId: Number(invitationId), callerUserId }, 'invitation respond rejected: caller is not the invitee');
      return { ok: false, error: 'not_participant' };
    }
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
   *
   * callerUserId 是强制前提：本方法会解密被邀请方的网易云 cookie，此前只要求邀请
   * active，于是任何知道 active 邀请 id 的成员都能触发对他人凭据的解密。授权判定
   * 必须在 decrypt 之前——把校验放在取歌单之后虽然也能返回错误码，但解密和外部
   * 请求已经发生了。
   *
   * @param {number} invitationId
   * @param {string} callerUserId 当前登录成员 id（必须是被邀请方本人）
   * @returns {Promise<{ok:true, playlists:Array} | {ok:false, error:string}>}
   */
  async function bringPlaylist(invitationId, callerUserId) {
    const inv = repo.getInvitation(Number(invitationId));
    if (!inv) return { ok: false, error: 'invitation_not_found' };
    if (!isInvitee(inv, callerUserId)) {
      logger?.warn?.({ component: 'community', invitationId: Number(invitationId), callerUserId }, 'bring_playlist rejected: caller is not the invitee');
      return { ok: false, error: 'not_participant' };
    }
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
