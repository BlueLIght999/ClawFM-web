const SUPPORTED_MODES = new Set(['sequential', 'shuffle', 'fm']);
const SONG_REQUEST_SEARCH_LIMIT = 5;

function requestedSongTitle(song) {
  return song?.title || song?.name || 'Unknown';
}

function queueUpdate(queue) {
  return {
    upcomingSongs: queue.upcomingSongs,
    mode: queue.mode,
  };
}

/**
 * Searches the music source and queues the first matching song next.
 *
 * @param {{query: string, queue: object, music: object}} input Search text plus injected queue/music ports.
 * @returns {Promise<object|null>} Queue/DJ payload, search error payload, or null when no song should be queued.
 * @throws Does not throw; music source failures are returned as SEARCH_FAILED for the transport layer.
 * Constraint: keeps Socket event names outside the service and preserves the legacy "Queued: <title>" UX.
 */
async function handleSongRequest({ query, queue, music }) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (!normalizedQuery) return null;

  try {
    const songs = await music.search(normalizedQuery, SONG_REQUEST_SEARCH_LIMIT);
    const [song] = songs || [];
    if (!song) return null;

    queue.insertNext(song);
    return {
      queueUpdate: { upcomingSongs: queue.upcomingSongs },
      djMessage: { text: `Queued: ${requestedSongTitle(song)}` },
    };
  } catch (e) {
    return {
      error: { code: 'SEARCH_FAILED', message: e?.message || 'Search failed' },
    };
  }
}

/**
 * Application service for playback controls.
 *
 * It owns orchestration between queue/scheduler/recommender, but leaves event
 * names and transport concerns to the socket handler.
 */
export function createPlaybackService({
  queue,
  scheduler,
  recommender,
  music = { search: async () => [] },
  getPlan,
}) {
  return {
    async skipToIndex(index) {
      if (index === null || index === undefined || index < 0 || index >= queue.future.length) return null;
      if (index > 0) queue.future.splice(0, index);
      await scheduler.skip();
      return {
        state: scheduler.getState(),
        queueUpdate: queueUpdate(queue),
      };
    },

    async skip() {
      await scheduler.skip();
      const result = {
        state: scheduler.getState(),
        queueUpdate: queueUpdate(queue),
        refill: null,
      };
      if (queue.needsMore(10)) {
        const cachedPlan = getPlan();
        result.refill = recommender.fillQueue(12, cachedPlan?.plan?.blocks || null);
      }
      return result;
    },

    async previous() {
      await scheduler.previous();
      return {
        state: scheduler.getState(),
        queueUpdate: queueUpdate(queue),
      };
    },

    pause() {
      scheduler.pause();
      return { crabAnimation: { state: 'idle' } };
    },

    resume() {
      scheduler.resume();
      return { resume: { startedAt: scheduler.playhead.startedAt } };
    },

    setMode(mode) {
      if (!SUPPORTED_MODES.has(mode)) return null;
      queue.setMode(mode);
      return { queueUpdate: { upcomingSongs: queue.upcomingSongs, mode } };
    },

    seek(position) {
      scheduler.seek(position);
      return { playbackPosition: scheduler.getPlaybackPosition() };
    },

    async ended() {
      if (scheduler.isAdvancing) return null;
      await scheduler.skip();
      return {
        state: scheduler.getState(),
        queueUpdate: queueUpdate(queue),
      };
    },

    /**
     * Queue a requested song using the injected music source.
     *
     * @param {string} query User-entered song search text.
     * @returns {Promise<object|null>} Queue/DJ payload, search error payload, or null when no song should be queued.
     * @throws Does not throw; music source failures are returned as SEARCH_FAILED for the transport layer.
     * Constraints: keeps Socket event names outside the service and preserves the legacy "Queued: <title>" UX.
     */
    async requestSong(query) {
      return handleSongRequest({ query, queue, music });
    },
  };
}
