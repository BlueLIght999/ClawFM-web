import { routeIntent } from '../../services/router.js';

export function createLegacyIntentRouterAdapter(route = routeIntent, deps = {}) {
  return {
    route(text) {
      return route(text, deps);
    },
  };
}

export const legacyIntentRouterAdapter = createLegacyIntentRouterAdapter();
