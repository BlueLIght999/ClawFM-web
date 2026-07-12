import { describe, expect, it, vi } from 'vitest';
import { createLegacyIntentRouterAdapter } from '../infrastructure/agent/LegacyIntentRouterAdapter.js';

describe('LegacyIntentRouterAdapter', () => {
  it('route_delegatesToLegacyRouterAndReturnsRoutingResult', async () => {
    const routeIntent = vi.fn(async text => ({
      route: 'ncm',
      action: 'play_search',
      params: { query: text },
    }));
    const adapter = createLegacyIntentRouterAdapter(routeIntent);

    await expect(adapter.route('Song Name')).resolves.toEqual({
      route: 'ncm',
      action: 'play_search',
      params: { query: 'Song Name' },
    });
    expect(routeIntent).toHaveBeenCalledWith('Song Name');
  });
});
