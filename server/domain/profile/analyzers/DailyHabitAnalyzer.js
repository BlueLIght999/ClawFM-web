/**
 * DailyHabitAnalyzer — analyzes daily listening routines.
 *
 * Domain-layer analyzer. Extends BaseAnalyzer. No IO, no infrastructure/db/
 * application imports. Derives listening time patterns from time_pattern
 * evidence and listen evidence timestamps, identifies peak hour/period,
 * calculates consistency, and generates behavior habit tags.
 *
 * Periods: morning (6-11), afternoon (12-17), evening (18-22), night (23-5).
 */

import { BaseAnalyzer } from './BaseAnalyzer.js';

const PERIODS = {
  morning: { start: 6, end: 11, label: '早晨' },
  afternoon: { start: 12, end: 17, label: '下午' },
  evening: { start: 18, end: 22, label: '晚上' },
  night: { start: 23, end: 5, label: '深夜' },
};

export class DailyHabitAnalyzer extends BaseAnalyzer {
  constructor({ eventBus = null } = {}) {
    super({ name: 'DailyHabitAnalyzer', eventBus });
  }

  async analyze(profile, options = {}) {
    const timeEvidence = options.timeEvidence || [];
    const listenEvidence = options.listenEvidence || [];

    const patterns = this._computePatterns(timeEvidence, listenEvidence);
    const routine = this._deriveRoutine(patterns);

    const result = {
      peakPeriod: routine.peakPeriod,
      peakHour: routine.peakHour,
      consistency: routine.consistency,
      habits: routine.habits,
      patterns,
    };

    this.emit('analysis:completed', { type: 'daily_habit', result });
    return result;
  }

  _computePatterns(timeEvidence, listenEvidence) {
    const hourCounts = new Array(24).fill(0);
    this._accumulateTimeEvidence(timeEvidence, hourCounts);
    this._accumulateListenEvidence(listenEvidence, hourCounts);
    const periodCounts = this._aggregateByPeriod(hourCounts);
    return { hourCounts, periodCounts };
  }

  _accumulateTimeEvidence(timeEvidence, hourCounts) {
    for (const ev of timeEvidence) {
      if (ev.type === 'time_pattern' && ev.hour !== undefined) {
        hourCounts[ev.hour] += ev.count || 1;
      }
    }
  }

  _accumulateListenEvidence(listenEvidence, hourCounts) {
    for (const ev of listenEvidence) {
      const ts = ev.playedAt || ev.timestamp || ev.createdAt;
      if (ts) {
        const hour = new Date(ts).getHours();
        if (!isNaN(hour)) hourCounts[hour]++;
      }
    }
  }

  _aggregateByPeriod(hourCounts) {
    const periodCounts = {};
    for (const [period, range] of Object.entries(PERIODS)) {
      periodCounts[period] = this._countPeriodHours(period, range, hourCounts);
    }
    return periodCounts;
  }

  _countPeriodHours(period, range, hourCounts) {
    let count = 0;
    for (let h = range.start; h <= range.end || (range.start > range.end && h <= 23); h++) {
      count += hourCounts[h] || 0;
    }
    if (period === 'night') {
      for (let h = 0; h <= 5; h++) count += hourCounts[h] || 0;
    }
    return count;
  }

  _deriveRoutine(patterns) {
    const { hourCounts, periodCounts } = patterns;
    const peakHour = this._findPeakHour(hourCounts);
    const { peakPeriod, maxCount } = this._findPeakPeriod(periodCounts);
    const consistency = this._computeConsistency(periodCounts, maxCount);
    const habits = this._generateHabits(peakPeriod, consistency);
    return { peakPeriod, peakHour, consistency, habits };
  }

  _findPeakHour(hourCounts) {
    let peakHour = 0;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourCounts[h] > maxCount) { maxCount = hourCounts[h]; peakHour = h; }
    }
    return peakHour;
  }

  _findPeakPeriod(periodCounts) {
    let peakPeriod = 'evening';
    let maxCount = 0;
    for (const [period, count] of Object.entries(periodCounts)) {
      if (count > maxCount) { maxCount = count; peakPeriod = period; }
    }
    return { peakPeriod, maxCount };
  }

  _computeConsistency(periodCounts, maxCount) {
    const total = Object.values(periodCounts).reduce((a, b) => a + b, 0);
    return total > 0 ? Math.round((maxCount / total) * 100) / 100 : 0;
  }

  _generateHabits(peakPeriod, consistency) {
    const habits = [];
    if (peakPeriod === 'night') {
      habits.push({ dimension: 'behavior', name: 'night_owl', confidence: 0.8 });
    }
    if (peakPeriod === 'morning') {
      habits.push({ dimension: 'behavior', name: 'morning_person', confidence: 0.8 });
    }
    if (consistency > 0.5) {
      habits.push({ dimension: 'behavior', name: 'loyalist', confidence: 0.7 });
    }
    if (consistency < 0.3) {
      habits.push({ dimension: 'behavior', name: 'explorer', confidence: 0.6 });
    }
    return habits;
  }
}
