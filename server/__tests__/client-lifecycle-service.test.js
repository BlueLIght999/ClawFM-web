import { describe, it, expect, vi } from 'vitest';
import { createClientLifecycleService } from '../application/services/ClientLifecycleService.js';

function createDeps(overrides = {}) {
  const scheduler = {
    pause: vi.fn(() => {}),
    playhead: { currentSong: { id: 's1' }, isPlaying: true },
    coldStartState: 'done',
    ...overrides.scheduler,
  };
  return { scheduler };
}

describe('ClientLifecycleService', () => {
  it('handleDisconnect_zeroClients_pausesScheduler', () => {
    const deps = createDeps();
    const service = createClientLifecycleService(deps);

    service.handleDisconnect(0);

    expect(deps.scheduler.pause).toHaveBeenCalledOnce();
  });

  it('handleDisconnect_zeroClients_resetsPlayhead', () => {
    const deps = createDeps();
    const service = createClientLifecycleService(deps);

    service.handleDisconnect(0);

    expect(deps.scheduler.playhead.currentSong).toBeNull();
    expect(deps.scheduler.playhead.isPlaying).toBe(false);
  });

  it('handleDisconnect_zeroClients_resetsColdStartState', () => {
    const deps = createDeps();
    const service = createClientLifecycleService(deps);

    service.handleDisconnect(0);

    expect(deps.scheduler.coldStartState).toBe('pending');
  });

  it('handleDisconnect_oneClient_doesNotTouchScheduler', () => {
    const deps = createDeps();
    const service = createClientLifecycleService(deps);

    service.handleDisconnect(1);

    expect(deps.scheduler.pause).not.toHaveBeenCalled();
    expect(deps.scheduler.coldStartState).toBe('done');
  });

  it('handleDisconnect_oneClient_returnsNoStop', () => {
    const service = createClientLifecycleService(createDeps());

    const result = service.handleDisconnect(1);

    expect(result.stoppedMusic).toBe(false);
  });

  it('handleDisconnect_zeroClients_returnsStopped', () => {
    const service = createClientLifecycleService(createDeps());

    const result = service.handleDisconnect(0);

    expect(result.stoppedMusic).toBe(true);
  });
});
