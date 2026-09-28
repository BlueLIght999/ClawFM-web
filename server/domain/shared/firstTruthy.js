/**
 * Fallback-chain helper.
 *
 * Shared kernel: collapses `a || b || default` into one call so the branch
 * complexity lives here instead of in every DTO mapper and prompt builder.
 *
 * @param {...*} vals candidate values, last acts as the default
 * @returns {*} the first truthy value, or the last value if none are truthy
 */
export function firstTruthy(...vals) {
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i]) return vals[i];
  }
  return vals[vals.length - 1];
}
