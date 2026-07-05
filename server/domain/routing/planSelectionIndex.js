const CHINESE_ORDINALS = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
};

/**
 * Parse the listener's requested plan block into a zero-based block index.
 *
 * @param {string} text Raw user text that may contain "第二个主题" or "3".
 * @returns {number} Zero-based block index for internal arrays; defaults to 0.
 * @throws Does not throw. Invalid or missing ordinals fall back to the first block.
 * Constraint: only parses the small ordinal range currently exposed in plan UI.
 */
export function planSelectionIndex(text = '') {
  const match = String(text).match(/第?([一二三四五]|[0-9]+)/);
  if (!match) return 0;

  const raw = match[1];
  const ordinal = CHINESE_ORDINALS[raw] || parseInt(raw, 10);
  if (!Number.isFinite(ordinal) || ordinal <= 0) return 0;

  // Users speak in 1-based ordinals; recommender plan progress stores array indexes.
  return ordinal - 1;
}
