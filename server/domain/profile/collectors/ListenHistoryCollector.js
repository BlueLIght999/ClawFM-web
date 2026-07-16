/**
 * ListenHistoryCollector — gathers raw listen-history evidence.
 *
 * Extends BaseCollector. Reads played songs from an injected
 * listenHistoryRepository (exposing history(limit)) and projects them into a
 * stable evidence shape: { type:'listen', songId, title, artist, playedAt, source }.
 *
 * Pure domain logic: the repository may return legacy snake_case fields
 * (song_id / played_at) or camelCase fields; both are normalized here.
 */

import { BaseCollector } from './BaseCollector.js';

const DEFAULT_LIMIT = 100;

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
  };
}

export class ListenHistoryCollector extends BaseCollector {
  /**
   * @param {Object}  [opts]
   * @param {string}  [opts.name]
   * @param {Object}  [opts.eventBus]
   * @param {number}  [opts.limit=100] — max records to pull from the repository
   */
  constructor({ name, eventBus, limit } = {}) {
    super({ name, eventBus });
    this.limit = limit || DEFAULT_LIMIT;
  }

  /**
   * @param {Object} sources
   * @param {Object} [sources.listenHistoryRepository] — exposes history(limit) or is a fn
   * @returns {Promise<{evidence:Array, count:number}>}
   */
  async collect({ listenHistoryRepository } = {}) {
    const history = await this._fetchHistory(listenHistoryRepository);

    const evidence = history
      .map(normalizeListenRecord)
      .filter(Boolean)
      .map((record) => ({
        type: 'listen',
        songId: record.songId,
        title: record.title,
        artist: record.artist,
        playedAt: record.playedAt,
        source: record.source,
      }));

    this.emit('collection:completed', { evidenceCount: evidence.length });

    return { evidence, count: evidence.length };
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
