import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bug 4 (HIGH): createApplicationServices 丢弃 logger/metricsCollector
 * bootstrap.js 调用 createApplicationServices 时传入 logger 和 metricsCollector，
 * 但函数签名未接收这两个参数，导致它们被静默丢弃。
 *
 * Bug 5 (MEDIUM): Metrics wrapper 被 wireSchedulerCallbacks 覆盖
 * bootstrap.js 包装了 scheduler.onSongChange/onDjSpeechNeeded，
 * 但 handler.js 的 wireSchedulerCallbacks 直接覆盖了这两个属性。
 * 应在 wireSchedulerCallbacks 中保留 metrics 调用。
 */
describe('bootstrap metrics wiring bugs', () => {

  // ─── Bug 4: createApplicationServices accepts logger and metricsCollector ───

  it('createApplicationServices_acceptsLoggerParam', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../bootstrap.js'), 'utf-8');
    // Find the function signature
    const match = src.match(/function\s+createApplicationServices\s*\(\s*\{([^}]+)\}\s*\)/);
    expect(match).toBeTruthy();
    const params = match[1];
    expect(params).toContain('logger');
  });

  it('createApplicationServices_acceptsMetricsCollectorParam', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../bootstrap.js'), 'utf-8');
    const match = src.match(/function\s+createApplicationServices\s*\(\s*\{([^}]+)\}\s*\)/);
    expect(match).toBeTruthy();
    const params = match[1];
    expect(params).toContain('metricsCollector');
  });

  // ─── Bug 5: wireSchedulerCallbacks includes metrics collection ───

  it('wireSchedulerCallbacks_includesMetricsForSongChange', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    // handler.js calls recordSongChange (imported from emitHelpers.js)
    expect(src).toContain('recordSongChange');
    // Implementation lives in emitHelpers.js (extracted)
    const emitSrc = fs.readFileSync(path.resolve(__dirname, '../socket/emitHelpers.js'), 'utf-8');
    expect(emitSrc).toContain('songsPlayed.inc');
  });

  it('wireSchedulerCallbacks_includesMetricsForDjSpeech', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    // handler.js calls recordDjSpeech (imported from emitHelpers.js)
    expect(src).toContain('recordDjSpeech');
    // Implementation lives in emitHelpers.js (extracted)
    const emitSrc = fs.readFileSync(path.resolve(__dirname, '../socket/emitHelpers.js'), 'utf-8');
    expect(emitSrc).toContain('djSpeech.inc');
  });

  it('bootstrap_doesNotWrapSchedulerCallbacks', () => {
    // bootstrap.js should NOT wrap scheduler.onSongChange since
    // handler.js's wireSchedulerCallbacks will overwrite it anyway.
    // Metrics should be collected in wireSchedulerCallbacks instead.
    const src = fs.readFileSync(path.resolve(__dirname, '../bootstrap.js'), 'utf-8');
    expect(src).not.toContain('originalOnSongChange');
    expect(src).not.toContain('originalOnDjSpeechNeeded');
  });
});
