/**
 * TimePatternCollector — analyzes listening time-of-day patterns.
 *
 * Extends BaseCollector. Groups played songs by the local hour-of-day
 * extracted from each record's playedAt timestamp, producing one evidence
 * entry per active hour: { type:'time_pattern', hour, count, period }.
 *
 * Period mapping (local hour):
 *   06-11 morning | 12-17 afternoon | 18-22 evening | 23-05 night
 *
 * Returns the peakHour / peakPeriod so the profile layer knows when the
 * listener is most active. Pure domain logic; repository is injected.
 */

import { BaseCollector } from './BaseCollector.js';

const DEFAULT_LIMIT = 200;

function periodForHour(hour) {
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night'; // 23 and 00-05
}

function hourFromTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

function normalizeListenRecord(record) {
  if (!record) return null;
  return {
    playedAt: record.playedAt || record.played_at || record.timestamp || null,
  };
}

export class TimePatternCollector extends BaseCollector {
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
   * @returns {Promise<{evidence:Array, count:number, peakHour:number|null, peakPeriod:string|null}>}
   */
  async collect({ listenHistoryRepository } = {}) {
    const history = await this._fetchHistory(listenHistoryRepository);

    const hourCounts = new Map();
    for (const raw of history) {
      const record = normalizeListenRecord(raw);
      if (!record) continue;
      const hour = hourFromTimestamp(record.playedAt);
      if (hour === null) continue;
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    const sortedHours = [...hourCounts.keys()].sort((a, b) => a - b);
    const evidence = sortedHours.map((hour) => ({
      type: 'time_pattern',
      hour,
      count: hourCounts.get(hour),
      period: periodForHour(hour),
    }));

    let peakHour = null;
    let peakPeriod = null;
    if (evidence.length > 0) {
      // Iterate in hour order; the first hour reaching the max count wins ties.
      let maxCount = -1;
      for (const entry of evidence) {
        if (entry.count > maxCount) {
          maxCount = entry.count;
          peakHour = entry.hour;
          peakPeriod = entry.period;
        }
      }
    }

    this.emit('collection:completed', { evidenceCount: evidence.length });

    return { evidence, count: evidence.length, peakHour, peakPeriod };
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
