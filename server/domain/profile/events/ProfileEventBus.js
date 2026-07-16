/**
 * ProfileEventBus — domain event bus for the profile system.
 *
 * Extends Node.js EventEmitter to expose typed emit helpers for the
 * collection / profile / analysis / enrichment lifecycle. The bus itself
 * performs no IO — listeners (registered by the application layer) do.
 *
 * maxListeners is raised to 30 because the profile pipeline attaches many
 * independent observers (collection, snapshot, cluster, enrichment, metrics).
 */

import { EventEmitter } from 'events';

export class ProfileEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(30);
  }

  // ── Collection events ──
  emitCollectionStarted(collectorName) {
    this.emit('collection:started', { collectorName, timestamp: Date.now() });
  }

  emitCollectionCompleted(collectorName, evidenceCount) {
    this.emit('collection:completed', { collectorName, evidenceCount, timestamp: Date.now() });
  }

  // ── Profile events ──
  emitProfileUpdated(profile) {
    this.emit('profile:updated', { profile, timestamp: Date.now() });
  }

  emitSnapshotSaved(snapshotId) {
    this.emit('profile:snapshot', { snapshotId, timestamp: Date.now() });
  }

  // ── Analysis events ──
  emitAnalysisCompleted(result) {
    this.emit('analysis:completed', { result, timestamp: Date.now() });
  }

  emitClusterChanged(cluster) {
    this.emit('cluster:changed', { cluster, timestamp: Date.now() });
  }

  // ── Enrichment events ──
  emitEnrichmentProgress(songId, provider, tagCount) {
    this.emit('enrichment:progress', { songId, provider, tagCount, timestamp: Date.now() });
  }
}
