import {
  planProgressPatch,
  planUpdatePayload,
  shouldRefillForPlanBlocks,
} from '../../domain/curation/planBlockRules.js';

const QUEUE_FILL_COUNT = 12;

function queueUpdate(queue) {
  return {
    upcomingSongs: queue.upcomingSongs,
    mode: queue.mode,
  };
}

function cachedPlanState(planner) {
  const cachedPlan = planner.getPlan();
  const plan = cachedPlan?.plan || null;
  return {
    plan,
    blocks: plan?.blocks || [],
  };
}

function applyProgressPatch(recommender, patch) {
  Object.assign(recommender._planProgress, patch);
}

async function refillIfPossible({ blocks, recommender, queue }) {
  if (!shouldRefillForPlanBlocks(blocks)) return null;
  await recommender.fillQueue(QUEUE_FILL_COUNT, blocks);
  return queueUpdate(queue);
}

/**
 * Create the application seam for direct `plan:*` socket events.
 *
 * @param {object} deps Injected legacy collaborators.
 * @returns {object} Methods that return socket-ready plan and queue payloads.
 * @throws Injected recommender/planner errors bubble to preserve existing handler behavior.
 * Constraint: keeps event names and payload shapes stable while moving mutation out of handler.
 */
export function createPlanBlockService({ planner, recommender, queue }) {
  return {
    async selectBlock(blockIndex) {
      applyProgressPatch(recommender, planProgressPatch('select', blockIndex));
      const { plan, blocks } = cachedPlanState(planner);
      const nextQueueUpdate = await refillIfPossible({ blocks, recommender, queue });
      return {
        queueUpdate: nextQueueUpdate,
        planUpdate: planUpdatePayload(plan, { activeBlockIndex: blockIndex }),
      };
    },

    async pinBlock(blockIndex) {
      applyProgressPatch(recommender, planProgressPatch('pin', blockIndex));
      const { plan, blocks } = cachedPlanState(planner);
      const nextQueueUpdate = await refillIfPossible({ blocks, recommender, queue });
      return {
        queueUpdate: nextQueueUpdate,
        planUpdate: planUpdatePayload(plan, {
          activeBlockIndex: blockIndex,
          pinnedBlockIndex: blockIndex,
        }),
      };
    },

    async clearSelection() {
      applyProgressPatch(recommender, planProgressPatch('clear'));
      const { plan, blocks } = cachedPlanState(planner);
      const nextQueueUpdate = await refillIfPossible({ blocks, recommender, queue });
      return {
        queueUpdate: nextQueueUpdate,
        planUpdate: planUpdatePayload(plan, {
          activeBlockIndex: null,
          pinnedBlockIndex: null,
        }),
      };
    },
  };
}
