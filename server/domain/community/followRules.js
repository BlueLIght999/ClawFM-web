/**
 * followRules — 关注关系领域规则（domain 层，零 IO）。
 *
 * 纯函数：校验关注/取关输入。遵循 D1/D2，不 import node 内置、不碰 IO。
 */

/**
 * 校验关注操作。
 * - 两个 userId 都必填
 * - 不能关注自己
 * @param {string} followerId
 * @param {string} followeeId
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function validateFollow(followerId, followeeId) {
  if (!followerId || !followeeId) {
    return { ok: false, error: 'user_ids_required' };
  }
  if (String(followerId) === String(followeeId)) {
    return { ok: false, error: 'cannot_follow_self' };
  }
  return { ok: true };
}
