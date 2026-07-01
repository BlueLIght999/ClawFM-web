/**
 * Returns the first truthy value; if all are falsy, returns the last (default).
 * Collapses `a || b || default` fallback chains into one call, moving the
 * branch complexity out of callers (e.g. toSongDTO).
 *
 * @param {...*} vals candidate values, last acts as the default
 * @returns the first truthy value, or the last value if none are truthy
 */
export function firstTruthy(...vals) {
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i]) return vals[i];
  }
  return vals[vals.length - 1];
}
