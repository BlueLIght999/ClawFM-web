import { savePlan, getPlan } from '../../../db/history.js';

/**
 * Wraps legacy plan cache helpers behind PlanRepository.
 *
 * @param {{savePlan: (planJson: string, mood: string) => void, getPlan: () => object|null}=} legacy
 */
export function createLegacyPlanRepository(legacy = { savePlan, getPlan }) {
  return {
    save(plan, mood) {
      legacy.savePlan(JSON.stringify(plan), mood);
    },
    latest() {
      return legacy.getPlan() || null;
    },
  };
}

export const legacyPlanRepository = createLegacyPlanRepository();
