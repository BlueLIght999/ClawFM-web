/**
 * Search-direct route matcher: "play <query>", "放<query>", "来点<query>", "我想听<query>"
 *
 * Extracted from router.js searchMatch regex so preFlightCheck can detect
 * search intents WITHOUT triggering music.search IO. The full routing
 * (music.search, genre detection, filterLiveVersions) is still performed by
 * AgentTurnService → intentRouter.route() → router.routeIntentWithDependencies().
 *
 * This is a pure function (no IO). matchFastRoute is consulted BEFORE this in
 * preFlightCheck, so FAST_ROUTES words like "播放" (resume) are captured first.
 *
 * @param {string} msg lowercased, trimmed user text
 * @returns {{query: string}|null} matched query capture, or null if no match
 */
const SEARCH_ROUTE_PATTERN = /^(?:play|放|播放|搜索|搜|点播|来点|来一首|点一首|我想听|播|来些|来几首|放一首)\s*(.+)/i;

export function matchSearchRoute(msg) {
  if (!msg) return null;
  const m = msg.match(SEARCH_ROUTE_PATTERN);
  if (!m) return null;
  const query = m[1].trim();
  return query ? { query } : null;
}

export const SEARCH_ROUTE_REGEX = SEARCH_ROUTE_PATTERN;
