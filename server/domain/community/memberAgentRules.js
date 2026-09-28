/**
 * memberAgentRules — 成员 agent 半自主规则求值（F7/F8，RC9 不越权）。
 *
 * 规则结构：{ canComment, allowedTopics[], canBeInvited, sharePlaylists }
 * allowedTopics 为空数组 = 不限主题；非空 = 评论主题必须在其中。
 * 纯函数，零 IO，遵循 D1/D2。
 */

export const AGENT_ACTIONS = ['comment', 'be_invited', 'share_playlist'];

export function defaultAgentRules() {
  return { canComment: true, allowedTopics: [], canBeInvited: false, sharePlaylists: false };
}

/**
 * 求值某 action 是否被规则允许。
 *
 * 形参直接解构，无 params 包装；tags 按真实形参名绑定，否则 tsc 报实参缺失。
 *
 * @param {object} opts
 * @param {object} [opts.rules] - 成员 agent 规则（缺省用 defaultAgentRules()）
 * @param {string} [opts.action] - comment / be_invited / share_playlist
 * @param {string} [opts.topic] - 评论主题（action=comment 时校验）
 * @returns {{allowed:true} | {allowed:false, reason:string}}
 */
export function evaluateAgentAction({ rules, action, topic } = {}) {
  const r = rules || defaultAgentRules();

  if (action === 'comment') {
    if (!r.canComment) return { allowed: false, reason: 'comment_disabled' };
    const allowed = Array.isArray(r.allowedTopics) ? r.allowedTopics : [];
    if (allowed.length > 0 && topic && !allowed.includes(topic)) {
      return { allowed: false, reason: 'topic_not_allowed' };
    }
    return { allowed: true };
  }

  if (action === 'be_invited') {
    return r.canBeInvited ? { allowed: true } : { allowed: false, reason: 'not_invitable' };
  }

  if (action === 'share_playlist') {
    return r.sharePlaylists ? { allowed: true } : { allowed: false, reason: 'sharing_disabled' };
  }

  return { allowed: false, reason: 'unknown_action' };
}

/**
 * 规范化用户提交的规则（补默认值、过滤非法字段）。
 */
export function normalizeAgentRules(input) {
  const i = input || {};
  return {
    canComment: i.canComment !== false,
    allowedTopics: Array.isArray(i.allowedTopics) ? i.allowedTopics.filter((t) => typeof t === 'string' && t) : [],
    canBeInvited: !!i.canBeInvited,
    sharePlaylists: !!i.sharePlaylists,
  };
}
