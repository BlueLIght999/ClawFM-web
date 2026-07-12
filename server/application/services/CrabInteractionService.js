import {
  crabAnimationForInteraction,
  crabIdleResetForInteraction,
  isCrabSkipInteraction,
} from '../../domain/hosting/crabInteractionRules.js';

/**
 * Create the application seam for crab click socket interactions.
 *
 * @param {{scheduler: object}} deps Injected playback scheduler.
 * @returns {{handleInteraction(interaction: string): Promise<object>}} Socket-ready result API.
 * @throws Scheduler failures bubble for `skip`, matching the previous direct handler behavior.
 * Constraint: service returns payloads only; socket/timer side effects stay at the boundary.
 */
export function createCrabInteractionService({ scheduler }) {
  return {
    async handleInteraction(interaction) {
      if (isCrabSkipInteraction(interaction)) {
        await scheduler.skip();
        return { radioState: scheduler.getState() };
      }

      return {
        animation: crabAnimationForInteraction(interaction),
        delayedAnimation: crabIdleResetForInteraction(interaction),
      };
    },
  };
}
