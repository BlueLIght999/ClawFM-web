import { firstTopArtistQuery, topArtistNames } from '../../../domain/hosting/listenerProfileSummary.js';
import { createRecommendationSnapshot } from '../../../domain/curation/recommendationSnapshot.js';
import { planSelectionIndex } from '../../../domain/routing/planSelectionIndex.js';

function queueUpdate(queue) {
  return {
    upcomingSongs: queue.upcomingSongs,
    mode: queue.mode,
  };
}

const REJECTION_ACTIONS = new Set(['reject_recommend', 'recommend_rollback', 'recommend_retry']);

function cachedPlanState(planner) {
  const cachedPlan = planner.getPlan();
  return {
    cachedPlan,
    blocks: cachedPlan?.plan?.blocks || [],
  };
}

async function handlePlanRefresh({ planner, recommender, queue }) {
  const newPlan = await planner.generatePlan(true);
  recommender.setPlanBlocks(newPlan.blocks);
  await recommender.fillQueue(15, newPlan.blocks);
  return {
    handled: true,
    planUpdate: newPlan,
    queueUpdate: queueUpdate(queue),
    toolResults: 'Generated a fresh listening plan with a different vibe. Acknowledge the style shift naturally in Chinese.',
  };
}

async function handlePlanSelect({ planner, recommender, queue, text }) {
  const idx = planSelectionIndex(text);
  const { cachedPlan, blocks } = cachedPlanState(planner);
  if (blocks.length > 0) {
    recommender._planProgress.autoMode = false;
    recommender._planProgress.currentBlockIndex = idx;
    recommender._planProgress.songsFilledInBlock = 0;
    await recommender.fillQueue(12, blocks);
  }
  return {
    handled: true,
    planUpdate: blocks.length > 0 ? { ...cachedPlan?.plan, activeBlockIndex: idx } : null,
    queueUpdate: blocks.length > 0 ? { upcomingSongs: queue.upcomingSongs } : null,
    toolResults: `Switched to block #${idx + 1}. Acknowledge this briefly.`,
  };
}

async function handlePlanPin({ planner, recommender, queue }) {
  const { cachedPlan, blocks } = cachedPlanState(planner);
  const activeIdx = recommender._planProgress.currentBlockIndex;
  if (blocks.length > 0) {
    recommender._planProgress.pinned = true;
    recommender._planProgress.autoMode = false;
    await recommender.fillQueue(12, blocks);
  }
  return {
    handled: true,
    planUpdate: blocks.length > 0
      ? { ...cachedPlan?.plan, activeBlockIndex: activeIdx, pinnedBlockIndex: activeIdx }
      : null,
    queueUpdate: blocks.length > 0 ? { upcomingSongs: queue.upcomingSongs } : null,
    toolResults: 'Pinned the current block style. Acknowledge briefly.',
  };
}

async function handlePlanClear({ planner, recommender, queue }) {
  recommender._planProgress.autoMode = true;
  recommender._planProgress.pinned = false;
  const { cachedPlan, blocks } = cachedPlanState(planner);
  await recommender.fillQueue(12, blocks);
  return {
    handled: true,
    planUpdate: { ...cachedPlan?.plan, activeBlockIndex: null, pinnedBlockIndex: null },
    queueUpdate: { upcomingSongs: queue.upcomingSongs },
    toolResults: 'Back to auto mode. Acknowledge briefly.',
  };
}

const PLAN_ACTION_HANDLERS = {
  plan_refresh: handlePlanRefresh,
  plan_select: handlePlanSelect,
  plan_pin: handlePlanPin,
  plan_clear: handlePlanClear,
};

async function handleFastAction({
  routing,
  scheduler,
  recommender,
  repositories,
  queue,
}) {
  if (routing?.route !== 'ncm') {
    return { handled: false, toolResults: '' };
  }

  if (routing.action === 'skip') {
    await scheduler.skip();
    return { handled: true, state: scheduler.getState() };
  }

  if (routing.action === 'pause') {
    scheduler.pause();
    return { handled: true, pause: true };
  }

  if (routing.action === 'resume') {
    scheduler.resume();
    return { handled: true, resume: { startedAt: scheduler.playhead.startedAt } };
  }

  if (routing.action === 'now_playing') {
    return { handled: true, toClient: { state: scheduler.getState() } };
  }

  if (routing.action === 'recommend') {
    const snapshot = createRecommendationSnapshot(queue);
    const added = await recommender.fillQueue(10);
    const profile = repositories.profile.get();
    return {
      handled: false,
      snapshot,
      queueUpdate: queueUpdate(queue),
      toolResults: `DJ picked ${added.length} fresh tracks based on the listener's taste profile. Top artists: ${topArtistNames(profile)}. Acknowledge briefly and naturally in Chinese.`,
    };
  }

  return { handled: false, toolResults: '' };
}

async function handlePlanAction({
  routing,
  text,
  planner,
  recommender,
  queue,
}) {
  if (routing?.route !== 'ncm') return { handled: false, toolResults: '' };

  const handler = PLAN_ACTION_HANDLERS[routing.action];
  return handler
    ? handler({ planner, recommender, queue, text })
    : { handled: false, toolResults: '' };
}

async function handlePersonalizedRecommendation({
  routing,
  queue,
  recommender,
  repositories,
  music,
}) {
  const snapshot = createRecommendationSnapshot(queue);
  const oldFuture = [...queue.future];
  queue.future = [];

  const preference = routing?.params?.preference;
  let added = preference
    ? await recommender.fillQueueByPreference(preference, 10)
    : await recommender.fillQueue(10);

  if (added.length === 0) {
    const profile = repositories.profile.get();
    const fallbackQuery = firstTopArtistQuery(profile, preference);
    let songs;
    try {
      songs = (await music.search(fallbackQuery, 10)).slice(0, 5);
    } catch {
      songs = [];
    }
    for (const song of songs) queue.future.push(song);
    added = songs;
  }

  queue.future.push(...oldFuture);
  const profile = repositories.profile.get();

  return {
    handled: false,
    snapshot,
    queueUpdate: queueUpdate(queue),
    toolResults: `DJ used personalized recommendation pipeline${preference ? ` for "${preference}"` : ''}. Added ${added.length} songs to queue. Listener's top artists: ${topArtistNames(profile, 5, 'none yet')}. Seed pool: ${recommender.seedPool?.length || 0} songs. Queue now has ${queue.future.length} upcoming tracks. Pre-recommendation snapshot saved. Respond naturally in Chinese 閳?mention 1-2 highlights, don't list all. If added=0, apologize briefly.`,
  };
}

async function handleRecommendationAction({ routing, snapshot, queue, recommender }) {
  if (routing?.action === 'reject_recommend') {
    if (snapshot) {
      return {
        handled: false,
        snapshot,
        toolResults: `Listener rejected the last batch of recommendations. Pre-recommendation queue snapshot is available (${snapshot.future.length} songs). You MUST ask the listener: "瑕佷笉瑕佸洖鍒版帹鑽愪箣鍓嶇殑姝屽崟锛岃繕鏄垜鍐嶆崲涓€鎵圭粰浣狅紵" Keep it brief and natural in Chinese. Do NOT take any action yet 鈥?just ask the question.`,
      };
    }
    return {
      handled: false,
      snapshot: null,
      toolResults: 'Listener seems unhappy with the music but no snapshot is available to roll back. Sympathize briefly and offer to find something different. Do NOT take any action 鈥?just respond naturally in Chinese.',
    };
  }

  if (routing?.action === 'recommend_rollback') {
    if (snapshot) {
      queue.future = snapshot.future;
      return {
        handled: false,
        snapshot: null,
        queueUpdate: queueUpdate(queue),
        toolResults: `Restored the pre-recommendation queue (${snapshot.future.length} songs). Acknowledge briefly in Chinese 鈥?"宸茬粡鍥炲埌涔嬪墠鐨勬瓕鍗曚簡" style.`,
      };
    }
    return {
      handled: false,
      snapshot: null,
      toolResults: 'No snapshot available to roll back to. Apologize briefly and offer to find something fresh. Respond in Chinese.',
    };
  }

  if (routing?.action === 'recommend_retry') {
    const next = createRecommendationSnapshot(queue);
    const added = await recommender.fillQueue(10);
    return {
      handled: false,
      snapshot: next,
      queueUpdate: queueUpdate(queue),
      toolResults: `Re-recommended ${added.length} fresh tracks using different sources. Acknowledge naturally in Chinese 鈥?"杩欐鎹簡涓€鎵归鏍硷紝甯屾湜浣犲枩娆? style. Do not list all songs.`,
    };
  }

  return { handled: false, snapshot, toolResults: '' };
}

export function createConversationService({
  queue,
  scheduler,
  recommender,
  repositories,
  music = { search: async () => [] },
  planner = {
    generatePlan: async () => null,
    getPlan: () => null,
  },
}) {
  return {
    nextSnapshot(routing, snapshot) {
      if (!snapshot) return null;
      return REJECTION_ACTIONS.has(routing?.action) ? snapshot : null;
    },

    async handleFastAction(routing) {
      return handleFastAction({ routing, scheduler, recommender, repositories, queue });
    },

    /**
     * Run chat-triggered listening-plan actions behind the socket seam.
     *
     * @param {{routing: object, text: string}} input Routed chat intent and raw text.
     * @returns {Promise<object>} Event payloads for the handler to emit.
     * @throws Does not intentionally throw; injected planner/recommender failures bubble
     * so the existing chat error path keeps surfacing operational issues.
     * Constraint: only handles chat NCM plan actions, not direct `plan:*` socket events.
     */
    async handlePlanAction({ routing, text }) {
      return handlePlanAction({ routing, text, planner, recommender, queue });
    },

    async handlePersonalizedRecommendation(routing) {
      return handlePersonalizedRecommendation({
        routing,
        queue,
        recommender,
        repositories,
        music,
      });
    },

    async handleRecommendationAction({ routing, snapshot }) {
      return handleRecommendationAction({ routing, snapshot, queue, recommender });
    },
  };
}
