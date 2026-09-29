/**
 * Recurring background tasks — playback position sync, queue refill,
 * mood-shift plan refresh, and proactive speech.
 * Extracted from handler.js for single-responsibility.
 *
 * M3: All intervals are tracked and clearable via stop().
 *     All callbacks have try/catch to prevent unhandled rejections.
 */
import { EVENTS } from './events.js';
import { emitQueueUpdate } from './versionedRadioEmitter.js';
import { ensureQueueDepth } from '../application/services/QueueDepthService.js';

/** 情绪切换的整点时刻（本地时区）。 */
const MOOD_SHIFT_HOURS = new Set([7, 9, 17, 22]);

/**
 * 是否到了该按当前情绪重建 plan 的时刻。
 *
 * 抽成模块级纯函数而非内联，是为了把「什么时刻该刷新」这条规则
 * 从 tick 的编排里分离出来：定时器回调的复杂度只该反映编排，不该
 * 被四个时刻的 or 链顶上去（原先 refreshMoodIfDue 复杂度 14）。
 *
 * @param {{hour: number, currentMood: string, lastMood: string}} input
 * @returns {boolean}
 */
function isMoodRefreshDue({ hour, currentMood, lastMood }) {
  return MOOD_SHIFT_HOURS.has(hour) && lastMood !== currentMood;
}

/**
 * cross-user 聚类：启动时一次 + 每 6h 一次。
 *
 * 独立成函数而不是内联在 startRecurringTasks 里：聚类与播放/情绪/播报
 * 三条路径没有任何共享状态，唯一的交集是「都往同一个 intervals 里塞定时器」。
 * 抽出去后 startRecurringTasks 只剩装配与玩歌/情绪两条 tick，
 * 行数回到 max-lines-per-function 之内。
 *
 * 失败只降级不抛出（RC2：聚类挂了不能让电台停摆），故这里用 warn 而非 error。
 *
 * @param {{clusterService?: object, logger?: object, intervals: Array}} input
 */
function startClustering({ clusterService, logger, intervals }) {
  if (!clusterService?.runClustering) return;

  // 启动时跑一次（异步，不阻塞 recurringTasks 装配）
  Promise.resolve().then(() => {
    try {
      const r = clusterService.runClustering();
      logger?.info?.({ component: 'cluster', k: r.k, degraded: r.degraded }, 'startup clustering done');
    } catch (e) {
      logger?.warn?.({ component: 'cluster', err: e?.message }, 'startup clustering failed');
    }
  });

  // 每 6h 跑一次
  intervals.push(setInterval(() => {
    try {
      const r = clusterService.runClustering();
      logger?.info?.({ component: 'cluster', k: r.k, degraded: r.degraded }, 'scheduled clustering done');
    } catch (e) {
      logger?.warn?.({ component: 'cluster', err: e?.message }, 'scheduled clustering failed');
    }
  }, 6 * 60 * 60 * 1000));
}

export function startRecurringTasks(io, deps) {
  const { scheduler, queue, recommender, getPlan, generatePlan,
    getTimeOfDayMood, maybeProactiveSpeech, eventPublisher, logger,
    clusterService } = deps;

  const intervals = [];

  // Playback position + server time sync (every 5s)
  intervals.push(setInterval(() => {
    try {
      io.emit(EVENTS.PLAYBACK_POSITION, scheduler.getPlaybackPosition());
      io.emit(EVENTS.SYNC_TIME, { serverTime: Date.now() });
    } catch (e) {
      logger?.error?.({ component: 'recurring', err: e }, 'playback position sync failed');
    }
  }, 5000));

  // Queue refill check (every 30s)
  //
  // 与 PlaybackService.skip() 共用 ensureQueueDepth：阈值与 plan 取值只有
  // 一份实现。两条调用路径的差异只在「谁来 await」——
  //   - skip()：不 await，用户响应不等补歌往返，把 promise 交给 handler；
  //   - 这里：await，失败要落日志、成功要广播队列更新，是后台兜底。
  intervals.push(setInterval(async () => {
    try {
      const filled = await ensureQueueDepth({ queue, recommender, getPlan });
      if (filled !== null) {
        emitQueueUpdate(io, { upcomingSongs: queue.upcomingSongs });
      }
    } catch (e) {
      logger?.error?.({ component: 'recurring', err: e }, 'queue refill failed');
    }
  }, 30000));

  // Mood-shift plan refresh + proactive speech check.
  //
  // 这两件事原先各占一个 60s interval，现合并成一个 tick：同周期、无时序依赖，
  // 分成两个定时器只是让事件循环每 60s 多醒一次，没有任何隔离收益——
  // 真正的隔离靠各自 try/catch，而不是靠各自的 setInterval。
  //
  // 合并的是**定时器**，不是错误边界。每条路径仍单独 try/catch，
  // 任一条抛错都不能让另一条静默停摆（见 recurring-tasks-tracking.test.js）。
  let lastMood = '';

  async function refreshMoodIfDue() {
    const currentMood = getTimeOfDayMood();
    const hour = new Date().getHours();
    if (!isMoodRefreshDue({ hour, currentMood, lastMood })) return;

    const previousMood = lastMood;
    // 标记必须在任何 await 之前落位：否则下一次 tick 会在 generatePlan
    // 尚未返回时再次判定「该刷新」，同一小时重复生成整份 plan。
    lastMood = currentMood;
    logger?.info?.({ component: 'scheduler', from: previousMood, to: currentMood }, 'mood shift, refreshing');

    // generatePlan 失败与通知失败分开兜：plan 没生成出来时，后续 emit
    // 只会把上一轮的 plan 当成新的再播一遍，比不播更糟。
    let newPlan;
    try {
      newPlan = await generatePlan(true);
    } catch (e) {
      logger?.error?.({ component: 'scheduler', err: e }, 'mood refresh failed');
      return;
    }

    try {
      io.emit(EVENTS.PLAN_UPDATE, newPlan);
      recommender.setPlanBlocks(newPlan.blocks);
      await recommender.fillQueue(15, newPlan.blocks);
      emitQueueUpdate(io, { upcomingSongs: queue.upcomingSongs });
      io.emit(EVENTS.DJ_MESSAGE, {
        text: `The clock strikes ${hour}:00. Shifting the vibe for ${currentMood}...`,
      });
    } catch (e) {
      // plan 已生成，DJ 播报已可能发出，此处失败不影响下一小时的重试
      logger?.error?.({ component: 'scheduler', err: e }, 'mood refresh notify failed');
    }
  }

  async function runProactiveSpeech() {
    try {
      await maybeProactiveSpeech({ events: eventPublisher, scheduler, queue, getPlan });
    } catch (e) {
      logger?.error?.({ component: 'proactive', err: e }, 'error');
    }
  }

  intervals.push(setInterval(async () => {
    // 外层再兜一层：refreshMoodIfDue 的取情绪/取小时两步在任何 try 之外，
    // 合并后它已经挡在播报前面了，所以这一层的存在与否直接决定
    // 「情绪读取失败会不会连播报一起吃掉」——必须保留。
    try {
      await refreshMoodIfDue();
    } catch (e) {
      logger?.error?.({ component: 'scheduler', err: e }, 'mood refresh failed');
    }
    await runProactiveSpeech();
  }, 60000));

  // F3: cross-user clustering — every 6h + once at startup (RC2: failures degrade, never crash radio)
  startClustering({ clusterService, logger, intervals });

  return {
    stop() {
      for (const id of intervals) clearInterval(id);
      intervals.length = 0;
    },
  };
}
