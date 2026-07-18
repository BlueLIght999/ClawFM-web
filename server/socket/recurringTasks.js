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

export function startRecurringTasks(io, deps) {
  const { scheduler, queue, recommender, getPlan, generatePlan,
    getTimeOfDayMood, maybeProactiveSpeech, eventPublisher, logger } = deps;

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
  intervals.push(setInterval(async () => {
    try {
      if (queue.needsMore(10)) {
        const cachedPlan = getPlan();
        await recommender.fillQueue(12, cachedPlan?.plan?.blocks || null);
        emitQueueUpdate(io, { upcomingSongs: queue.upcomingSongs });
      }
    } catch (e) {
      logger?.error?.({ component: 'recurring', err: e }, 'queue refill failed');
    }
  }, 30000));

  // Mood-shift plan refresh (every 60s, triggers only at specific hours)
  let lastMood = '';
  intervals.push(setInterval(async () => {
    try {
      const currentMood = getTimeOfDayMood();
      const hour = new Date().getHours();
      const shouldRefresh = (hour === 7 || hour === 9 || hour === 17 || hour === 22) && lastMood !== currentMood;

      if (shouldRefresh) {
        logger?.info?.({ component: 'scheduler', from: lastMood, to: currentMood }, 'mood shift, refreshing');
        lastMood = currentMood;
        const newPlan = await generatePlan(true);
        io.emit(EVENTS.PLAN_UPDATE, newPlan);
        recommender.setPlanBlocks(newPlan.blocks);
        await recommender.fillQueue(15, newPlan.blocks);
        emitQueueUpdate(io, { upcomingSongs: queue.upcomingSongs });
        io.emit(EVENTS.DJ_MESSAGE, {
          text: `The clock strikes ${hour}:00. Shifting the vibe for ${currentMood}...`,
        });
      }
    } catch (e) {
      logger?.error?.({ component: 'scheduler', err: e }, 'mood refresh failed');
    }
  }, 60000));

  // Proactive speech check (every 60s)
  intervals.push(setInterval(async () => {
    try {
      await maybeProactiveSpeech({ events: eventPublisher, scheduler, queue, getPlan });
    } catch (e) {
      logger?.error?.({ component: 'proactive', err: e }, 'error');
    }
  }, 60000));

  return {
    stop() {
      for (const id of intervals) clearInterval(id);
      intervals.length = 0;
    },
  };
}
