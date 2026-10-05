/**
 * invitationRules — 邀请状态机 + 双向授权（F9，RC8，domain 纯逻辑）。
 *
 * 状态：pending → accepted | rejected；accepted → active；active → ended。
 * rejected / ended 为终态。RC8：被邀请方必须开 canBeInvited + sharePlaylists。
 * 被邀请方「接受」即生效：accepted 只是途经态，见 settleResponse。
 * 纯函数，零 IO，遵循 D1/D2。
 */

export const INVITATION_STATUS = ['pending', 'accepted', 'rejected', 'active', 'ended'];

const TRANSITIONS = {
  pending: ['accepted', 'rejected'],
  accepted: ['active'],
  active: ['ended'],
  rejected: [],
  ended: [],
};

/**
 * 状态转移是否合法。
 */
export function canTransition(from, to) {
  if (!INVITATION_STATUS.includes(from) || !INVITATION_STATUS.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * 执行状态转移。返回 {ok:true, status} 或 {ok:false, error}。
 *
 * 返回类型写成判别式联合：`ok` 一旦被推成 boolean，调用方（InvitationService）
 * 按 `!t.ok` 收窄后拿到的 `error` 是 `string | undefined`，赋值给 string 即报错。
 *
 * @param {object} invitation
 * @param {string} toStatus
 * @returns {{ok:true, status:string} | {ok:false, error:string, from?:string, to?:string}}
 */
export function transition(invitation, toStatus) {
  const from = invitation?.status || 'pending';
  if (!canTransition(from, toStatus)) {
    return { ok: false, error: 'invalid_transition', from, to: toStatus };
  }
  return { ok: true, status: toStatus };
}

/**
 * 被邀请方表态后邀请应落到的状态：接受直接推进到 active，其余同 transition。
 *
 * accepted → active 这条边此前没有任何调用方会走——客户端只发 accepted/rejected，
 * 服务端也不推进，邀请于是永远停在 accepted：bring_playlist 只认 active，发现流
 * 加权也只认 active，整个 F9 在端到端上从未生效。推进放在 domain 而不是服务里，
 * 是因为「接受即生效」是业务规则：RC8 的双向授权在发邀请时已校验，接受是
 * 被邀请方最后一道同意，中间没有别的步骤可等。
 *
 * @param {object} invitation
 * @param {string} toStatus
 * @returns {{ok:true, status:string} | {ok:false, error:string, from?:string, to?:string}}
 */
export function settleResponse(invitation, toStatus) {
  const t = transition(invitation, toStatus);
  if (!t.ok || t.status !== 'accepted') return t;
  return transition({ status: 'accepted' }, 'active');
}

/**
 * 调用者是否为这条邀请的参与方（邀请方或被邀请方）。
 *
 * 缺调用者时返回 false（fail-closed）：不能默认放行，否则校验等于可选；
 * 空串调用者也不能与一条缺 fromUserId 的脏记录「相等」。
 *
 * @param {object|null|undefined} invitation
 * @param {string|null|undefined} callerUserId
 * @returns {boolean}
 */
export function isParticipant(invitation, callerUserId) {
  if (!invitation || !callerUserId) return false;
  const caller = String(callerUserId);
  return caller === String(invitation.fromUserId ?? '') || caller === String(invitation.toUserId ?? '');
}

/**
 * 某成员发现流要按谁的品味加权：只取 TA 发出、已生效、目的地是 feed 的邀请的被邀请方。
 *
 * 方向必须看：仓储 listInvitations 返回与该成员相关的双向邀请。若不分方向，
 * 被邀请方自己的 feed 也会按这些邀请「加权」——取到的是 TA 本人的画像，等于
 * 按自己的品味给自己重排，与 F9「B 的品味融入 A 的发现流」恰好相反。
 * 同一被邀请方多条邀请只算一次（保持首次出现顺序）。
 *
 * @param {Array<object>|null|undefined} invitations
 * @param {string} viewerUserId
 * @returns {string[]}
 */
export function feedInviteeIds(invitations, viewerUserId) {
  if (!viewerUserId) return [];
  const viewer = String(viewerUserId);
  const ids = new Set();
  for (const inv of Array.isArray(invitations) ? invitations : []) {
    if (String(inv?.fromUserId ?? '') !== viewer) continue;
    if (!isActive(inv) || inv.contextType !== 'feed') continue;
    ids.add(String(inv.toUserId));
  }
  return [...ids];
}

/**
 * 校验邀请是否被允许（RC8 双向授权）。
 *
 * toRules 标记为可选只是为了让 JSDoc 通过形参绑定：调用方必须传，运行期缺省
 * 时两条规则都读不到，等于拒绝。
 *
 * @param {object} opts
 * @param {object} [opts.toRules] - 被邀请方 agent 规则（须 canBeInvited + sharePlaylists）
 * @param {object} [opts.fromRules] - 邀请方规则（预留，目前不限制）
 * @returns {{allowed:boolean, reasons:string[]}}
 */
export function checkInvitationAuthorization({ toRules, fromRules } = {}) {
  const reasons = [];
  const to = toRules || {};
  if (!to.canBeInvited) reasons.push('invitee_not_invitable');
  if (!to.sharePlaylists) reasons.push('invitee_sharing_disabled');
  return { allowed: reasons.length === 0, reasons };
}

/**
 * 规范化邀请记录（补默认字段）。
 */
export function normalizeInvitation(input) {
  const i = input || {};
  return {
    id: i.id ?? null,
    fromUserId: String(i.fromUserId || ''),
    toUserId: String(i.toUserId || ''),
    contextType: ['feed', 'room', 'conversation'].includes(i.contextType) ? i.contextType : 'feed',
    contextId: i.contextId || null,
    status: INVITATION_STATUS.includes(i.status) ? i.status : 'pending',
  };
}

/**
 * 邀请是否处于活跃态（可携带歌单/画像生效）。
 */
export function isActive(invitation) {
  return invitation?.status === 'active';
}
