import promClient from 'prom-client';

/**
 * MetricsCollector — central registry for all business and runtime metrics.
 *
 * Uses prom-client to define counters, gauges, and histograms. The registry
 * is exposed at GET /metrics (Prometheus format) and GET /api/metrics/json
 * (JSON snapshot for the built-in dashboard).
 */
export class MetricsCollector {
  constructor() {
    this.registry = new promClient.Registry();

    // Enable default Node.js metrics (CPU, memory, GC, event loop)
    promClient.collectDefaultMetrics({
      register: this.registry,
      prefix: 'nodejs_',
    });

    this._initCounters();
    this._initGauges();
    this._initHistograms();
  }

  _initCounters() {
    // ─── Counters ───────────────────────────────────────────
    this.songsPlayed = new promClient.Counter({
      name: 'radio_songs_played_total',
      help: 'Total songs played',
      registers: [this.registry],
    });

    this.songTransitions = new promClient.Counter({
      name: 'radio_song_transitions_total',
      help: 'Song transition count',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.djSpeech = new promClient.Counter({
      name: 'radio_dj_speech_total',
      help: 'DJ speech count',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.chatMessages = new promClient.Counter({
      name: 'radio_chat_messages_total',
      help: 'Chat message count',
      labelNames: ['role'],
      registers: [this.registry],
    });

    this.songSkips = new promClient.Counter({
      name: 'radio_song_skip_total',
      help: 'User-initiated song skips',
      registers: [this.registry],
    });

    this.toolCalls = new promClient.Counter({
      name: 'radio_tool_calls_total',
      help: 'Agent tool call count',
      labelNames: ['tool_name'],
      registers: [this.registry],
    });

    this.llmCalls = new promClient.Counter({
      name: 'radio_llm_calls_total',
      help: 'LLM call count',
      labelNames: ['route'],
      registers: [this.registry],
    });

    this.profileCollections = new promClient.Counter({
      name: 'radio_profile_collections_total',
      help: 'Profile data collection runs',
      labelNames: ['collector'],
      registers: [this.registry],
    });

    this.profileEnrichments = new promClient.Counter({
      name: 'radio_profile_enrichments_total',
      help: 'Song metadata enrichments',
      labelNames: ['source'],
      registers: [this.registry],
    });
  }

  _initGauges() {
    // ─── Gauges ─────────────────────────────────────────────
    this.queueSize = new promClient.Gauge({
      name: 'radio_queue_size',
      help: 'Current queue length',
      registers: [this.registry],
    });

    this.connectedClients = new promClient.Gauge({
      name: 'radio_connected_clients',
      help: 'Currently connected clients',
      registers: [this.registry],
    });

    this.profileTagCount = new promClient.Gauge({
      name: 'radio_profile_tag_count',
      help: 'Number of tags in current profile',
      registers: [this.registry],
    });

    this.profileSnapshotCount = new promClient.Gauge({
      name: 'radio_profile_snapshot_count',
      help: 'Total profile snapshots stored',
      registers: [this.registry],
    });
  }

  _initHistograms() {
    // ─── Histograms ─────────────────────────────────────────
    this.djSpeechDuration = new promClient.Histogram({
      name: 'radio_dj_speech_duration_seconds',
      help: 'DJ speech duration distribution',
      buckets: [1, 3, 5, 8, 12, 20, 30, 60],
      registers: [this.registry],
    });

    this.toolCallDuration = new promClient.Histogram({
      name: 'radio_tool_call_duration_seconds',
      help: 'Tool call duration distribution',
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.llmCallDuration = new promClient.Histogram({
      name: 'radio_llm_call_duration_seconds',
      help: 'LLM call duration distribution',
      buckets: [0.1, 0.3, 0.5, 1, 2, 3, 5, 10, 20],
      registers: [this.registry],
    });

    this.ttsGenerationDuration = new promClient.Histogram({
      name: 'radio_tts_generation_duration_seconds',
      help: 'TTS generation duration distribution',
      buckets: [0.5, 1, 2, 3, 5, 8, 15, 30],
      registers: [this.registry],
    });

    this.coldStartDuration = new promClient.Histogram({
      name: 'radio_cold_start_duration_seconds',
      help: 'Cold start duration distribution',
      buckets: [1, 3, 5, 10, 15, 20, 30, 60],
      registers: [this.registry],
    });

    this.profilePipelineDuration = new promClient.Histogram({
      name: 'radio_profile_pipeline_duration_seconds',
      help: 'Profile pipeline execution duration',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.profileAnalysisDuration = new promClient.Histogram({
      name: 'radio_profile_analysis_duration_seconds',
      help: 'Profile analysis execution duration',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });
  }

  /** Get Prometheus format text for /metrics endpoint. */
  async metricsText() {
    return this.registry.metrics();
  }

  /** Get JSON snapshot for dashboard. */
  async metricsJSON() {
    return this.registry.getMetricsAsJSON();
  }

  /** Get a compact snapshot suitable for dashboard WebSocket push. */
  async snapshot() {
    const metrics = await this.registry.getMetricsAsJSON();
    const values = {};
    for (const metric of metrics) {
      if (metric.type === 'counter' || metric.type === 'gauge') {
        this._extractLabeledValues(metric, values);
      } else if (metric.type === 'histogram') {
        this._extractHistogramSum(metric, values);
      }
    }
    return values;
  }

  _extractLabeledValues(metric, values) {
    for (const item of metric.values) {
      const labelStr = item.labels && Object.keys(item.labels).length > 0
        ? `_${Object.values(item.labels).join('_')}`
        : '';
      values[`${metric.name}${labelStr}`] = item.value;
    }
  }

  _extractHistogramSum(metric, values) {
    for (const item of metric.values) {
      if (item.metricName === `${metric.name}_sum`) {
        values[`${metric.name}_sum`] = item.value;
      }
    }
  }
}

/**
 * Singleton metrics collector instance.
 * Reset in tests by creating a new MetricsCollector.
 */
let _instance = null;

export function getMetricsCollector() {
  if (!_instance) {
    _instance = new MetricsCollector();
  }
  return _instance;
}
