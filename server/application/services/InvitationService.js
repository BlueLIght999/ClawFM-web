/**
 * InvitationService — 邀请用例（F9）。
 *
 * invite：校验被邀请方授权(RC8)→createInvitation(pending)→emit community:invitation。
 * respond：被邀请方表态→settleResponse（接受即 active）→updateInvitationStatus。
 * bringPlaylist：任一参与方触发→重查被邀请方 sharePlaylists→解密取歌单→投到邀请上下文。
 * 依赖 CommunityRepository / domain invitationRules+memberAgentRules / eventPublisher。
 */
import { checkInvitationAuthorization, settleResponse, normalizeInvitation, isParticipant } from '../../domain/community/invitationRules.js';
import { normalizeAgentRules, evaluateAgentAction } from '../../domain/community/memberAgentRules.js';
import { clipSummary } from '../../domain/community/distributionRules.js';

/**
 * 调用者是否为被邀请方——接受/拒绝只有本人能表态。
 *
 * 与 bringPlaylist 的口径（任一参与方）不同是有意的：表态就是被邀请方的同意本身，
 * 邀请方不能替对方同意；而同意之后歌单本来就投向邀请方的上下文，由谁来触发
 * 不改变数据的去向，见 bringPlaylist。
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
 * 解密被邀请方 cookie 取 TA 的歌单。
 *
 * 放在工厂外、依赖逐个传入：这是全服务唯一碰明文 cookie 的地方（RC6），
 * 入参就是它能用到的全部。
 *
 * @param {{repo: object, cookieCipherPort?: object, neteaseHistoryPort?: object, warn: Function}} deps
 * @param {object} inv
 * @param {number} invitationId
 * @returns {Promise<{ok:true, playlists:Array} | {ok:false, error:string}>}
 */
async function fetchInviteePlaylists({ repo, cookieCipherPort, neteaseHistoryPort, warn }, inv, invitationId) {
  const auth = repo.getMemberAuth(inv.toUserId);
  if (!auth) return { ok: false, error: 'invitee_no_credentials' };
  try {
    const cookie = cookieCipherPort?.decrypt?.(auth.cookieEncrypted);
    // The optional chain yields `string | undefined`; a missing cookie would be
    // sent to Netease as the literal "undefined" and silently return nothing, so
    // treat it as the same precondition failure as missing credentials (RC6: the
    // decrypted member cookie exists only for this call and is never logged).
    if (!cookie) return { ok: false, error: 'invitee_no_credentials' };
    const playlists = await neteaseHistoryPort?.fetchMemberPlaylists?.(auth.neteaseUid, cookie);
    return { ok: true, playlists: Array.isArray(playlists) ? playlists : [] };
  } catch (e) {
    warn({ err: e?.message, invitationId }, 'bring_playlist fetch failed');
    return { ok: false, error: 'playlist_fetch_failed' };
  }
}

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

  /** logger 可缺省；component 统一挂在这里，调用点不必各写一遍可选链。 */
  function warn(fields, message) {
    logger?.warn?.({ component: 'community', ...fields }, message);
  }

  /**
   * @param {object} opts
   * @returns {{ok:true, id:number} | {ok:false, error:string, reasons?:string[]}}
   */
  function invite({ fromUserId, toUserId, contextType = 'feed', contextId = null }) {
    // 自邀：被邀请方就是本人，RC8 的「对方同意」形同虚设，feed 加权也无意义
    if (String(fromUserId) === String(toUserId)) return { ok: false, error: 'cannot_invite_self' };
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
   * 返回的 status 是实际落库的状态，不一定等于请求的 toStatus：接受即生效，
   * 请求 accepted 落的是 active（见 settleResponse），客户端应以返回值为准。
   *
   * @param {number} invitationId
   * @param {string} toStatus
   * @param {string} callerUserId 当前登录成员 id（路由取自 req.communityUserId）
   * @returns {{ok:true, status:string} | {ok:false, error:string}}
   */
  function respond(invitationId, toStatus, callerUserId) {
    const id = Number(invitationId);
    const inv = repo.getInvitation(id);
    if (!inv) return { ok: false, error: 'not_found' };
    // 授权先于一切：越权调用不该让状态机或落库产生任何副作用
    if (!isInvitee(inv, callerUserId)) {
      warn({ invitationId: id, callerUserId }, 'invitation respond rejected: caller is not the invitee');
      return { ok: false, error: 'not_participant' };
    }
    const t = settleResponse(inv, toStatus);
    if (!t.ok) {
      warn({ from: t.from, to: t.to }, 'invalid invitation transition');
      return { ok: false, error: t.error };
    }
    repo.updateInvitationStatus(id, t.status);
    notifyParticipants(inv, repo.getInvitation(id));
    return { ok: true, status: t.status };
  }

  /** 状态变更通知邀请方与被邀请方（双方均可见；自邀已在 invite 拦掉，这里仍去重）。 */
  function notifyParticipants(inv, updated) {
    eventPublisher?.emit?.('community:invitation', updated, inv.fromUserId);
    if (inv.toUserId && inv.toUserId !== inv.fromUserId) {
      eventPublisher?.emit?.('community:invitation', updated, inv.toUserId);
    }
  }

  function listForUser(userId) {
    return repo.listInvitations(userId);
  }

  /**
   * F9 bring_playlist：把被邀请方的歌单带入邀请所在的上下文（PRD：B 的 agent 携带
   * B 的歌单进入 A 的上下文）。邀请须 active；room 上下文 → emitToRoom('room:state')；
   * 其余 → community:push 推给邀请方。
   *
   * 邀请双方都能触发：被邀请方开 sharePlaylists 并接受邀请，就是同意把歌单带给
   * 邀请方，邀请方来取是这条授权的本意。但同意可以撤回——被邀请方之后关掉分享，
   * 这里要能挡住，所以每次触发都重查 TA 当前的规则，而不是只信发邀请时那次校验。
   *
   * 所有授权判定都在解密 cookie 之前：放在取歌单之后虽然也能返回错误码，但解密
   * 和对网易云的外部请求已经发生了。
   *
   * @param {number} invitationId
   * @param {string} callerUserId 当前登录成员 id（须为邀请任一方）
   * @returns {Promise<{ok:true, playlists:Array} | {ok:false, error:string}>}
   */
  async function bringPlaylist(invitationId, callerUserId) {
    const id = Number(invitationId);
    const inv = repo.getInvitation(id);
    if (!inv) return { ok: false, error: 'invitation_not_found' };
    const denial = bringDenial(inv, id, callerUserId);
    if (denial) return denial;
    const fetched = await fetchInviteePlaylists({ repo, cookieCipherPort, neteaseHistoryPort, warn }, inv, id);
    if (!fetched.ok) return fetched;
    publishBroughtPlaylists(inv, id, fetched.playlists);
    return { ok: true, playlists: fetched.playlists };
  }

  /**
   * bring_playlist 的拒绝理由；null 表示放行。只读邀请与规则，不碰凭据。
   *
   * @returns {{ok:false, error:string} | null}
   */
  function bringDenial(inv, invitationId, callerUserId) {
    if (!isParticipant(inv, callerUserId)) {
      warn({ invitationId, callerUserId }, 'bring_playlist rejected: caller is not a participant');
      return { ok: false, error: 'not_participant' };
    }
    if (inv.status !== 'active') return { ok: false, error: 'invitation_not_active' };
    const rules = normalizeAgentRules(repo.getMemberAgentConfig(inv.toUserId)?.rules);
    const sharing = evaluateAgentAction({ rules, action: 'share_playlist' });
    if (!sharing.allowed) {
      warn({ invitationId, callerUserId, reason: sharing.reason }, 'bring_playlist rejected: invitee no longer shares playlists');
      return { ok: false, error: sharing.reason };
    }
    return null;
  }

  /**
   * 把歌单投到邀请的上下文。fromUserId 指歌单来源（被邀请方），与谁触发无关；
   * 推送带 summary 与分发推送同形，通知面板才有可读的一行而不是一串 JSON。
   */
  function publishBroughtPlaylists(inv, invitationId, playlists) {
    const payload = { invitationId, fromUserId: inv.toUserId, playlists };
    if (inv.contextType === 'room' && inv.contextId) {
      eventPublisher?.emitToRoom?.('room:state', { type: 'playlists_brought', ...payload }, inv.contextId);
      return;
    }
    const summary = clipSummary(playlists.map((p) => p?.name).filter(Boolean).join(' / '));
    eventPublisher?.emit?.('community:push', { targetType: 'playlist', summary, ...payload }, inv.fromUserId);
  }

  return { invite, respond, listForUser, bringPlaylist };
}
