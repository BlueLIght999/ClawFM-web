import { describe, it, expect, vi } from 'vitest';

import { ProfileEventBus } from '../domain/profile/events/ProfileEventBus.js';

/**
 * ProfileEventBus — domain event bus for the profile pipeline.
 *
 * Verifies each typed emit helper fires the correct event name with the
 * expected payload shape (including a numeric timestamp), and that the bus
 * behaves like a normal EventEmitter (chaining, no-throw on empty listeners).
 */

describe('ProfileEventBus', () => {
  it('constructor_createdByDefault_setsMaxListenersTo30', () => {
    const bus = new ProfileEventBus();
    expect(bus.getMaxListeners()).toBe(30);
  });

  it('emitCollectionStarted_listenerRegistered_receivesCollectorNameAndTimestamp', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('collection:started', handler);

    bus.emitCollectionStarted('netease');

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];
    expect(payload.collectorName).toBe('netease');
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emitCollectionCompleted_listenerRegistered_receivesEvidenceCount', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('collection:completed', handler);

    bus.emitCollectionCompleted('wiki', 42);

    const payload = handler.mock.calls[0][0];
    expect(payload).toMatchObject({ collectorName: 'wiki', evidenceCount: 42 });
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emitProfileUpdated_listenerRegistered_receivesProfileObject', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('profile:updated', handler);

    const profile = { id: 'p1', tags: ['pop'] };
    bus.emitProfileUpdated(profile);

    const payload = handler.mock.calls[0][0];
    expect(payload.profile).toBe(profile);
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emitSnapshotSaved_listenerRegistered_receivesSnapshotId', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('profile:snapshot', handler);

    bus.emitSnapshotSaved('snap-1');

    const payload = handler.mock.calls[0][0];
    expect(payload.snapshotId).toBe('snap-1');
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emitAnalysisCompleted_listenerRegistered_receivesResultObject', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('analysis:completed', handler);

    const result = { clusters: 3 };
    bus.emitAnalysisCompleted(result);

    const payload = handler.mock.calls[0][0];
    expect(payload.result).toBe(result);
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emitClusterChanged_listenerRegistered_receivesClusterObject', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('cluster:changed', handler);

    const cluster = { id: 'c1', size: 12 };
    bus.emitClusterChanged(cluster);

    const payload = handler.mock.calls[0][0];
    expect(payload.cluster).toBe(cluster);
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emitEnrichmentProgress_listenerRegistered_receivesSongIdProviderTagCount', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('enrichment:progress', handler);

    bus.emitEnrichmentProgress('s1', 'netease_api', 5);

    const payload = handler.mock.calls[0][0];
    expect(payload).toMatchObject({ songId: 's1', provider: 'netease_api', tagCount: 5 });
    expect(payload.timestamp).toEqual(expect.any(Number));
  });

  it('emit_eventHasNoListener_doesNotThrow', () => {
    const bus = new ProfileEventBus();
    expect(() => bus.emitCollectionStarted('noop')).not.toThrow();
  });

  it('on_multipleListenersRegistered_supportsEventEmitterChaining', () => {
    const bus = new ProfileEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('profile:updated', h1).on('profile:updated', h2);

    bus.emitProfileUpdated({ id: 'p' });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('removeListener_afterUnsubscribe_stopsReceivingEvents', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.on('collection:started', handler);
    bus.removeListener('collection:started', handler);

    bus.emitCollectionStarted('netease');

    expect(handler).not.toHaveBeenCalled();
  });

  it('once_listenerRegistered_firesOnlyOnce', () => {
    const bus = new ProfileEventBus();
    const handler = vi.fn();
    bus.once('profile:snapshot', handler);

    bus.emitSnapshotSaved('s1');
    bus.emitSnapshotSaved('s2');

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
