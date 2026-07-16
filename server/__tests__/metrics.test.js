import { describe, it, expect } from 'vitest';
import { MetricsCollector } from '../infrastructure/metrics/metrics.js';

describe('MetricsCollector', () => {
  it('initializesAllBusinessMetrics', () => {
    const mc = new MetricsCollector();
    expect(mc.songsPlayed).toBeDefined();
    expect(mc.songTransitions).toBeDefined();
    expect(mc.djSpeech).toBeDefined();
    expect(mc.chatMessages).toBeDefined();
    expect(mc.songSkips).toBeDefined();
    expect(mc.toolCalls).toBeDefined();
    expect(mc.llmCalls).toBeDefined();
    expect(mc.queueSize).toBeDefined();
    expect(mc.connectedClients).toBeDefined();
    expect(mc.djSpeechDuration).toBeDefined();
    expect(mc.toolCallDuration).toBeDefined();
    expect(mc.llmCallDuration).toBeDefined();
    expect(mc.ttsGenerationDuration).toBeDefined();
    expect(mc.coldStartDuration).toBeDefined();
  });

  it('counter_inc_incrementsValue', async () => {
    const mc = new MetricsCollector();
    mc.songsPlayed.inc();
    mc.songsPlayed.inc();
    const text = await mc.metricsText();
    expect(text).toContain('radio_songs_played_total');
    expect(text).toContain('2');
  });

  it('counter_incWithLabels_createsLabelSeries', async () => {
    const mc = new MetricsCollector();
    mc.djSpeech.inc({ type: 'transition' });
    mc.djSpeech.inc({ type: 'transition' });
    mc.djSpeech.inc({ type: 'cold-start' });
    const text = await mc.metricsText();
    expect(text).toContain('type="transition"');
    expect(text).toContain('type="cold-start"');
  });

  it('gauge_set_updatesValue', async () => {
    const mc = new MetricsCollector();
    mc.queueSize.set(42);
    const text = await mc.metricsText();
    expect(text).toContain('radio_queue_size');
    expect(text).toContain('42');
  });

  it('histogram_observe_recordsValue', async () => {
    const mc = new MetricsCollector();
    mc.toolCallDuration.observe(0.15);
    mc.toolCallDuration.observe(0.35);
    const text = await mc.metricsText();
    expect(text).toContain('radio_tool_call_duration_seconds');
  });

  it('metricsText_returnsPrometheusFormat', async () => {
    const mc = new MetricsCollector();
    mc.songsPlayed.inc();
    const text = await mc.metricsText();
    expect(text).toContain('# HELP');
    expect(text).toContain('# TYPE');
  });

  it('metricsJSON_returnsArrayOfMetricObjects', async () => {
    const mc = new MetricsCollector();
    mc.songsPlayed.inc();
    const json = await mc.metricsJSON();
    expect(Array.isArray(json)).toBe(true);
    const songsMetric = json.find(m => m.name === 'radio_songs_played_total');
    expect(songsMetric).toBeDefined();
    expect(songsMetric.type).toBe('counter');
  });

  it('snapshot_returnsFlatKeyValueObject', async () => {
    const mc = new MetricsCollector();
    mc.songsPlayed.inc();
    mc.queueSize.set(10);
    mc.chatMessages.inc({ role: 'user' });
    const snap = await mc.snapshot();
    expect(snap.radio_songs_played_total).toBe(1);
    expect(snap.radio_queue_size).toBe(10);
    expect(snap.radio_chat_messages_total_user).toBe(1);
  });

  it('includesDefaultNodejsMetrics', async () => {
    const mc = new MetricsCollector();
    const text = await mc.metricsText();
    expect(text).toContain('nodejs_');
    expect(text).toContain('process_');
  });
});
