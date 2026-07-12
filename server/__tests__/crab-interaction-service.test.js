import { describe, it, expect, vi } from 'vitest';
import { createCrabInteractionService } from '../application/services/CrabInteractionService.js';

function createDeps(overrides = {}) {
  const scheduler = {
    skip: vi.fn(async () => {}),
    getState: vi.fn(() => ({ currentSong: { id: 'next' } })),
    ...overrides.scheduler,
  };
  return { scheduler };
}

describe('CrabInteractionService', () => {
  it('handleInteraction_skip_skipsAndReturnsRadioState', async () => {
    const deps = createDeps();
    const service = createCrabInteractionService(deps);

    const result = await service.handleInteraction('skip');

    expect(deps.scheduler.skip).toHaveBeenCalledOnce();
    expect(deps.scheduler.getState).toHaveBeenCalledOnce();
    expect(result).toEqual({ radioState: { currentSong: { id: 'next' } } });
  });

  it('handleInteraction_chat_returnsTalkingAnimationWithoutSkipping', async () => {
    const deps = createDeps();
    const service = createCrabInteractionService(deps);

    const result = await service.handleInteraction('chat');

    expect(deps.scheduler.skip).not.toHaveBeenCalled();
    expect(result).toEqual({ animation: { state: 'talking' }, delayedAnimation: null });
  });

  it('handleInteraction_boop_returnsBounceAndIdleReset', async () => {
    const service = createCrabInteractionService(createDeps());

    await expect(service.handleInteraction('boop')).resolves.toEqual({
      animation: { state: 'bouncing' },
      delayedAnimation: { delayMs: 2000, animation: { state: 'idle' } },
    });
  });

  it('handleInteraction_unknown_returnsLegacyBounceOnly', async () => {
    const service = createCrabInteractionService(createDeps());

    await expect(service.handleInteraction('unknown')).resolves.toEqual({
      animation: { state: 'bouncing' },
      delayedAnimation: null,
    });
  });
});
