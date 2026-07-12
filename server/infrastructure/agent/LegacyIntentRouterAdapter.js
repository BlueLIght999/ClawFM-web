import { routeIntent } from '../../services/router.js';

export function createLegacyIntentRouterAdapter(route = routeIntent) {
  return {
    route(text) {
      return route(text);
    },
  };
}

export const legacyIntentRouterAdapter = createLegacyIntentRouterAdapter();
