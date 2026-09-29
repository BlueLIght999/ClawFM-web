/**
 * 队列深度保障：队列见底时补歌。
 *
 * 为什么单独抽出来：同一段「判断 + 取缓存 plan + 补歌」原先写在两处——
 *   - PlaybackService.skip()：用户手动跳歌后立即补，走 sync 路径，不阻塞响应；
 *   - socket/recurringTasks.js 的 30s 巡检：后台兜底，防止无人操作时队列枯竭。
 * 两处阈值一度都是 10/12，但一处 await、一处不 await，改动时极易只改一处。
 * 抽成单一实现后，阈值与 plan 取值规则只有一份，两条路径的差异退化为
 * 「谁来 await」这一个显式决定。
 *
 * 归属 application/ 而非 domain/：它调用端口（queue/recommender）并 await，
 * 不是纯逻辑。纯逻辑部分（needsMore）仍在 domain/playback/SongQueue.js。
 */

const DEFAULT_MIN_DEPTH = 10;
const DEFAULT_FILL_AMOUNT = 12;

/**
 * 队列不足时补歌。
 *
 * @param {{queue: object, recommender: object, getPlan: () => (object|null)}} deps
 * @param {{min?: number, fill?: number}} [options] 深度阈值与单次补充量。
 * @returns {Promise<Array|null>} 补入的歌曲；队列充足时返回 null。
 * @throws 补歌失败时向上抛出（恢复责任交给调用方）。
 */
export async function ensureQueueDepth(deps, options = {}) {
  const { recommender, getPlan } = deps;
  const fill = options.fill ?? DEFAULT_FILL_AMOUNT;

  if (!queueNeedsRefill(deps, options)) return null;

  const cachedPlan = getPlan();
  // 归一化成 null：fillQueue 对 null 与 undefined 走不同分支
  const blocks = cachedPlan?.plan?.blocks ?? null;
  return recommender.fillQueue(fill, blocks);
}

/**
 * 同步判定是否需要补歌，不发起补歌。
 *
 * 供「必须同步决定要不要保留 promise 字段」的调用方使用
 * （见 PlaybackService.skip 的 refill 契约）。深度阈值只在这里定义一次，
 * ensureQueueDepth 内部复用同一个函数，避免两处各写一个 10。
 *
 * @param {{queue: object}} deps
 * @param {{min?: number}} [options]
 * @returns {boolean}
 */
export function queueNeedsRefill(deps, options = {}) {
  return deps.queue.needsMore(options.min ?? DEFAULT_MIN_DEPTH);
}
