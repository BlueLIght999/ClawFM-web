/**
 * SkipBehaviorCollector — analyzes skip behavior from listen history.
 *
 * Extends BaseCollector. Inspects played-song history and flags skipped
 * tracks. A track counts as skipped when its `skipped` flag is true OR its
 * `source` contains the substring "skip" (case-insensitive). Each skip is
 * projected to evidence: { type:'skip', songId, title, artist, playedAt }.
 *
 * Returns a skipRate (skipped / total) so the profile layer can weigh
 * negative signals. Pure domain logic; repository is injected.
 */

import { BaseCollector } from './BaseCollector.js';

const DEFAULT_LIMIT = 200;

function firstDefined(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value) return value;
  }
  return null;
}

function normalizeListenRecord(record) {
  if (!record) return null;
  return {
    songId: firstDefined(record, ['songId', 'song_id']),
    title: firstDefined(record, ['title', 'name']),
    artist: record.artist || null,
    playedAt: firstDefined(record, ['playedAt', 'played_at', 'timestamp']),
    source: record.source || null,
    skipped: record.skipped === true,
  };
}

function isSkipped(record) {
  if (record.skipped) return true;
  if (typeof record.source === 'string' && record.source.toLowerCase().includes('skip')) {
    return true;
  }
  return false;
}

export class SkipBehaviorCollector extends BaseCollector {
  /**
   * @param {Object}  [opts]
   * @param {string}  [opts.name]
   * @param {Object}  [opts.eventBus]
   * @param {number}  [opts.limit=200]
   */
  constructor({ name, eventBus, limit } = {}) {
    super({ name, eventBus });
    this.limit = limit || DEFAULT_LIMIT;
  }

  /**
   * @param {Object} sources
   * @param {Object} [sources.listenHistoryRepository]
   * @returns {Promise<{evidence:Array, count:number, skipRate:number}>}
   */
  async collect({ listenHistoryRepository } = {}) {
    const history = await this._fetchHistory(listenHistoryRepository);
    const records = history.map(normalizeListenRecord).filter(Boolean);

    const evidence = records.filter(isSkipped).map((record) => ({
      type: 'skip',
      songId: record.songId,
      title: record.title,
      artist: record.artist,
      playedAt: record.playedAt,
    }));

    const total = records.length;
    const skipRate = total > 0 ? evidence.length / total : 0;

    this.emit('collection:completed', { evidenceCount: evidence.length });

    return { evidence, count: evidence.length, skipRate };
  }

  async _fetchHistory(repo) {
    if (!repo) return [];
    let result;
    if (typeof repo.history === 'function') result = repo.history(this.limit);
    else if (typeof repo === 'function') result = repo(this.limit);
    else return [];
    return (await result) || [];
  }
}
