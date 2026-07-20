/**
 * tasteResponse — builds the /api/taste response from real data sources.
 *
 * Problem (P0): The old code read `profile.analysis?.totalSongs`, but
 * `analysis` was never persisted to the user_profile KV table, so
 * totalSongs was always 0. The real play count lives in listen_history.
 */

export function buildTasteResponse({ profile, getListenCount, currentMood }) {
  const totalSongs = typeof getListenCount === 'function' ? (getListenCount() || 0) : 0;
  return {
    topArtists: (profile?.topArtists || []).slice(0, 10),
    topGenres: (profile?.analysis?.topGenres || []),
    totalSongs,
    currentMood: currentMood || null,
  };
}
