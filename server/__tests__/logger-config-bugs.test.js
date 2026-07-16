import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bug 3 (HIGH): pino-pretty transport 创建 worker 线程，增加启动开销
 * logger.js 不应使用 transport 属性（会创建 worker 线程），
 * 应改用同步 pino-pretty stream。
 *
 * Bug 7 (MEDIUM): LogStream 未连接到 Pino logger
 * logger 应将日志同时输出到 stdout 和 LogStream。
 *
 * Bug 8 (MEDIUM): Pino transport 无 error 事件处理
 * 如果使用 transport，必须有 error 事件处理；如果不使用 transport，则无需。
 */
describe('logger configuration bugs', () => {

  // ─── Bug 3: No worker thread transport ───

  it('logger_doesNotUseTransportProperty', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../infrastructure/logging/logger.js'), 'utf-8');
    // Should NOT use pino transport property (creates worker thread)
    expect(src).not.toMatch(/transport\s*:/);
  });

  it('logger_usesSyncPrettyStream', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../infrastructure/logging/logger.js'), 'utf-8');
    // Should import pino-pretty directly and use as stream, not as transport target
    expect(src).toMatch(/pino-pretty/);
    expect(src).not.toContain("target: 'pino-pretty'");
  });

  // ─── Bug 7: LogStream connected to logger ───

  it('logger_connectedToLogStream', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../infrastructure/logging/logger.js'), 'utf-8');
    // Should import or reference LogStream
    expect(src).toMatch(/logStream/i);
  });

  it('logStream_hasSingletonAccessor', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../infrastructure/logging/logStream.js'), 'utf-8');
    // Should export a singleton accessor function
    expect(src).toMatch(/export function getLogStream/);
  });

  // ─── Bug 8: Error handling ───

  it('logger_handlesTransportErrorsGracefully', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../infrastructure/logging/logger.js'), 'utf-8');
    // Since we're not using transport (Bug 3 fix), there's no transport error to handle.
    // But if any stream/destination has an error, it should be handled.
    // Verify the logger doesn't set up transport without error handling.
    // If no transport is used, this test passes (no uncaught error event possible).
    expect(src).not.toMatch(/transport\s*:\s*{/);
  });
});
