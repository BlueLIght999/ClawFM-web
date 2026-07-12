import { describe, it, expect } from 'vitest';
import { getTimeOfDayMood } from '../domain/hosting/getTimeOfDayMood.js';

describe('getTimeOfDayMood', () => {
  it('returns morning for 6-11', () => {
    for (const h of [6, 8, 11]) {
      expect(getTimeOfDayMood(new Date(2026, 0, 1, h))).toBe('morning');
    }
  });

  it('returns afternoon for 12-16', () => {
    for (const h of [12, 14, 16]) {
      expect(getTimeOfDayMood(new Date(2026, 0, 1, h))).toBe('afternoon');
    }
  });

  it('returns evening for 17-21', () => {
    for (const h of [17, 19, 21]) {
      expect(getTimeOfDayMood(new Date(2026, 0, 1, h))).toBe('evening');
    }
  });

  it('returns night for 22-5', () => {
    for (const h of [22, 23, 0, 3, 5]) {
      expect(getTimeOfDayMood(new Date(2026, 0, 1, h))).toBe('night');
    }
  });

  it('defaults to current time when no arg', () => {
    expect(['morning', 'afternoon', 'evening', 'night']).toContain(getTimeOfDayMood());
  });
});
