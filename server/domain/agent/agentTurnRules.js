const REJECTION_ACTIONS = new Set(['reject_recommend', 'recommend_rollback', 'recommend_retry']);

function songTitle(song) {
  return song?.title || song?.name || 'Unknown';
}

function songArtist(song) {
  if (song?.artist) return song.artist;
  if (Array.isArray(song?.ar)) return song.ar.map(artist => artist.name).filter(Boolean).join(', ');
  if (Array.isArray(song?.artists)) return song.artists.map(artist => artist.name || artist).filter(Boolean).join(', ');
  return '';
}

export function buildSearchToolResults(songs = []) {
  const songList = songs
    .map(song => `${songTitle(song)} by ${songArtist(song)}`)
    .join('; ');

  return `Search matched ${songs.length} song(s): ${songList}. These are now queued. Acknowledge this briefly and naturally in your DJ style - mention 1-2 highlights, don't list all of them.`;
}

export function latestToolResults(...values) {
  const found = values.filter(Boolean).at(-1);
  return found || '';
}

export function nextRecommendationSnapshot(routing, snapshot) {
  if (!snapshot) return null;
  return REJECTION_ACTIONS.has(routing?.action) ? snapshot : null;
}

export function buildAgentExecTrace({ routing, queue }) {
  return {
    lastAction: routing?.action,
    queueLength: queue.length,
    mode: queue.mode,
  };
}
