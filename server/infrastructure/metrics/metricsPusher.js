/**
 * MetricsPusher — periodically collects metric snapshots and pushes them to
 * connected dashboard clients via Socket.IO.
 */
export class MetricsPusher {
  /**
   * @param {{ metricsCollector: import('./metrics.js').MetricsCollector, io: import('socket.io').Server, intervalMs?: number }} deps
   */
  constructor({ metricsCollector, io, intervalMs = 5000 }) {
    this._collector = metricsCollector;
    this._io = io;
    this._intervalMs = intervalMs;
    this._timer = null;
    this._history = {
      songsPlayed: [],
      djSpeech: [],
      chatMessages: [],
      toolCalls: [],
      llmCalls: [],
      queueSize: [],
      connectedClients: [],
      memoryUsage: [],
      eventLoopLag: [],
    };
    this._maxHistory = 20;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._push(), this._intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _push() {
    this._collector.snapshot().then(snapshot => {
      this._updateHistory(snapshot);
      this._emitMetrics(snapshot);
    }).catch(e => console.warn('[MetricsPusher] Snapshot failed (degraded):', e.message));
  }

  _updateHistory(snapshot) {
    const keyMap = {
      songsPlayed: 'radio_songs_played_total',
      djSpeech: 'radio_dj_speech_total',
      chatMessages: 'radio_chat_messages_total',
      toolCalls: 'radio_tool_calls_total',
      llmCalls: 'radio_llm_calls_total',
      queueSize: 'radio_queue_size',
      connectedClients: 'radio_connected_clients',
      memoryUsage: 'nodejs_process_resident_memory_bytes',
      eventLoopLag: 'nodejs_eventloop_lag_seconds',
    };

    for (const [histKey, metricKey] of Object.entries(keyMap)) {
      const val = snapshot[metricKey];
      if (val !== undefined) {
        this._history[histKey].push(val);
        if (this._history[histKey].length > this._maxHistory) {
          this._history[histKey].shift();
        }
      }
    }
  }

  _emitMetrics(snapshot) {
    const payload = this._buildPayload(snapshot);
    this._io.of('/dashboard').emit('dashboard:metrics', payload);
  }

  _buildPayload(snapshot) {
    return {
      timestamp: Date.now(),
      counters: this._extractCounters(snapshot),
      gauges: {
        queueSize: snapshot.radio_queue_size || 0,
        connectedClients: snapshot.radio_connected_clients || 0,
      },
      runtime: this._extractRuntime(snapshot),
      history: this._history,
    };
  }

  _extractCounters(s) {
    return {
      songsPlayed: s.radio_songs_played_total || 0,
      songTransitions: s.radio_song_transitions_total || 0,
      djSpeech: s.radio_dj_speech_total || 0,
      chatMessages: s.radio_chat_messages_total || 0,
      songSkips: s.radio_song_skip_total || 0,
      toolCalls: s.radio_tool_calls_total || 0,
      llmCalls: s.radio_llm_calls_total || 0,
    };
  }

  _extractRuntime(s) {
    return {
      memoryUsage: (s.nodejs_process_resident_memory_bytes || 0) / (1024 * 1024),
      eventLoopLag: (s.nodejs_eventloop_lag_seconds || 0) * 1000,
    };
  }
}
