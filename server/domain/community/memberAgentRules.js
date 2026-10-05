/**
 * memberAgentRules — 成员 agent 半自主规则求值（F7/F8，RC9 不越权）。
 *
 * 规则结构：{ canComment, allowedTopics[], canBeInvited, sharePlaylists }
 * allowedTopics 为空数组 = 不限主题；非空 = 评论主题必须在其中。
 * 纯函数，零 IO，遵循 D1/D2。
 */
import { normalizeTagKey } from './tagRecall.js';

export const AGENT_ACTIONS = ['comment', 'be_invited', 'share_playlist'];

export function defaultAgentRules() {
  return { canComment: true, allowedTopics: [], canBeInvited: false, sharePlaylists: false };
}

/**
 * 主题白名单判定。白名单为空或没给主题时放行（与此前语义一致）；
 * 否则任一主题按归一键命中即放行。
 * @param {unknown} allowedTopics
 * @param {string|string[]|undefined} topic
 * @returns {boolean}
 */
function isTopicAllowed(allowedTopics, topic) {
  const allowed = Array.isArray(allowedTopics) ? allowedTopics : [];
  const topics = (Array.isArray(topic) ? topic : [topic]).filter(Boolean);
  if (allowed.length === 0 || topics.length === 0) return true;
  const allowedKeys = new Set(allowed.map(normalizeTagKey));
  return topics.some((t) => allowedKeys.has(normalizeTagKey(t)));
}

/**
 * 求值某 action 是否被规则允许。
 *
 * 形参直接解构，无 params 包装；tags 按真实形参名绑定，否则 tsc 报实参缺失。
 *
 * @param {object} opts
 * @param {object} [opts.rules] - 成员 agent 规则（缺省用 defaultAgentRules()）
 * @param {string} [opts.action] - comment / be_invited / share_playlist
 * @param {string|string[]} [opts.topic] - 评论主题（action=comment 时校验）。
 *   给数组时任一命中即放行：帖子带多个标签，只看第一个会让「流行+爵士」帖对
 *   只允许爵士的 agent 永远被拒。判等经 normalizeTagKey——帖子标签是归一键，
 *   成员在设置页写的是自己的写法（'爵士' vs 'jazz'）。
 * @returns {{allowed:true} | {allowed:false, reason:string}}
 */
export function evaluateAgentAction({ rules, action, topic } = {}) {
  const r = rules || defaultAgentRules();

  if (action === 'comment') {
    if (!r.canComment) return { allowed: false, reason: 'comment_disabled' };
    if (!isTopicAllowed(r.allowedTopics, topic)) return { allowed: false, reason: 'topic_not_allowed' };
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
