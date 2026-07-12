/**
 * Get the time-of-day mood category.
 *
 * @param {Date=} now — injectable for testing
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
export function getTimeOfDayMood(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
