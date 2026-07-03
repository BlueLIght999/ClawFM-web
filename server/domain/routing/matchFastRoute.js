/**
 * Fast-path intent routes: simple commands matched by regex, no AI needed.
 * Extracted from router.js to move the pattern list + matching loop out of
 * routeIntent, lowering its complexity.
 *
 * ORDER MATTERS: reject_recommend must precede recommend/retry patterns
 * (a rejection like "换一批" also matches retry). Preserve this order.
 */
const FAST_ROUTES = [
  { pattern: /^(skip|next|切歌|下一首)$/, route: 'ncm', action: 'skip', params: {} },
  { pattern: /^(pause|stop|暂停)$/, route: 'ncm', action: 'pause', params: {} },
  { pattern: /^(play|resume|播放|继续)$/, route: 'ncm', action: 'resume', params: {} },
  { pattern: /^(what'?s playing|now playing|现在放什么|当前播放)/, route: 'ncm', action: 'now_playing', params: {} },
  // Rejection — must come before recommend patterns
  { pattern: /^(不行|不好听|这些歌不行|换一批|不喜欢|不对胃口|有没有别的|再换|这些不喜欢|不好|不怎么样|都不喜欢|不太行|一般般)/, route: 'ncm', action: 'reject_recommend', params: {} },
  // Rollback / retry (follow-up to rejection)
  { pattern: /^(回到|恢复|之前|原来|回去|回滚|还原|前面的)/, route: 'ncm', action: 'recommend_rollback', params: {} },
  { pattern: /^(再推荐|再换|再来|换一批|重新|换一下|别的|换点)/, route: 'ncm', action: 'recommend_retry', params: {} },
  // Personalized recommendations
  { pattern: /^(根据你对我的了解|根据我的口味|推荐一些|推荐一下|有什么好听的|来点我喜欢的|最近有什么适合|推荐点)/, route: 'ncm', action: 'play_personalized', params: {} },
  { pattern: /^(推荐|推荐歌曲|来点推荐)$/, route: 'ncm', action: 'play_personalized', params: {} },
  { pattern: /^(换个风格|换风格|来点不一样的|换个口味|换换口味|换歌单|换个心情)$/, route: 'ncm', action: 'plan_refresh', params: {} },
  { pattern: /^(切换|选|换到).*(第[一二三四五]|[0-9]+).*(个主题|个板块|个块|主题|板块)/, route: 'ncm', action: 'plan_select', params: {} },
  { pattern: /^(钉住|锁定|固定|pin).*(这个|当前|风格|板块|主题)/, route: 'ncm', action: 'plan_pin', params: {} },
  { pattern: /^(取消|解除|自动|auto|自动推荐|自动模式|恢复自动)/, route: 'ncm', action: 'plan_clear', params: {} },
];

/**
 * Match a normalized message against the fast routes.
 * @param {string} msg lowercased, trimmed user text
 * @returns {{route,action,params}|null} first matching route, or null
 */
export function matchFastRoute(msg) {
  for (const { pattern, route, action, params } of FAST_ROUTES) {
    if (pattern.test(msg)) return { route, action, params };
  }
  return null;
}
