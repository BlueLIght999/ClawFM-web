/**
 * dmRules — 私信 / agent 私信领域规则（domain，纯函数，零 IO）。
 *
 * 覆盖消息校验、会话规范序键、参与者判定。agent 私信不设人格生成逻辑（在应用层），
 * 仅承载「谁可以在此会话发言/查看」的约束。
 */

/** 规范序（min,max），让 A↔B 只对应一个 thread_key，无论谁发起。 */
export function dmThreadKey(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? [x, y] : [y, x];
}

/**
 * 消息内容校验：非空、限长。
 *
 * 返回类型是判别式联合而非裸 `{ok: boolean}`——`ok` 一旦被推成 boolean，
 * 调用方（DmService）按 `ok` 收窄的类型守卫就全部失效（TS2322）。
 *
 * @param {string} content
 * @returns {{ok: true, content: string} | {ok: false, error: string}}
 */
export function validateDmMessage(content) {
  if (typeof content !== 'string') return { ok: false, error: 'content_required' };
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: 'content_required' };
  if (trimmed.length > 2000) return { ok: false, error: 'content_too_long' };
  return { ok: true, content: trimmed };
}

/**
 * 是否允许本人开启私信：不能对自己。
 *
 * @param {string|number} userId
 * @param {string|number} otherUserId
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateOpenThread(userId, otherUserId) {
  if (!userId || !otherUserId) return { ok: false, error: 'user_ids_required' };
  if (String(userId) === String(otherUserId)) return { ok: false, error: 'cannot_dm_self' };
  return { ok: true };
}

/**
 * 成员是否可参与某会话（查看/发言）。peer 会话：双方都可；agent 会话：agent 主人一方 + 发起人。
 * @param {object} thread
 * @param {string} userId
 */
export function canParticipate(thread, userId) {
  if (!thread) return false;
  return String(thread.userA) === String(userId) || String(thread.userB) === String(userId);
}

/**
 * 会话的「对端」是谁。
 * @param {object} thread
 * @param {string} viewerUserId 当前查看者
 * @returns {string} 对端 userId（peer 会话为对方；agent 会话恒为 agent 主人，这里返回对端的 user）
 */
export function peerUserId(thread, viewerUserId) {
  return String(thread.userA) === String(viewerUserId) ? thread.userB : thread.userA;
}