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
 * @param {object} params
 * @param {object} params.toRules — 被邀请方 agent 规则（须 canBeInvited + sharePlaylists）
 * @param {object} [params.fromRules] — 邀请方规则（预留，目前不限制）
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
