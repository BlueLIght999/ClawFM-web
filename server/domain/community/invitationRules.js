/**
 * invitationRules — 邀请状态机 + 双向授权（F9，RC8，domain 纯逻辑）。
 *
 * 状态：pending → accepted | rejected；accepted → active；active → ended。
 * rejected / ended 为终态。RC8：被邀请方必须开 canBeInvited + sharePlaylists。
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
