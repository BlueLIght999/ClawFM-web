import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bug 1 (CRITICAL): onNewConnection 阻塞事件注册
 * - wireAuthEvents 等事件注册必须在 await onNewConnection 之前
 * - 否则客户端连接后发送 auth 事件时，服务端还未注册监听器
 *
 * Bug 6 (MEDIUM): 双重 io.on('connection') 处理器
 * - setupSocketLogger 不应注册 io.on('connection')
 * - 连接/断开日志由 handler.js 的 setupSocketHandler 负责
 */
describe('connection startup bugs', () => {

  // ─── Bug 1: onNewConnection must not block event registration ───

  it('wireAuthEvents_isCalledBefore_onNewConnection_await', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const connStart = src.indexOf("io.on('connection'");
    const connEnd = src.indexOf('startRecurringTasks', connStart);
    const connBlock = src.slice(connStart, connEnd);

    const wireAuthPos = connBlock.indexOf('wireAuthEvents');
    const onNewConnPos = connBlock.indexOf('await onNewConnection');

    expect(wireAuthPos).toBeGreaterThan(-1);
    expect(onNewConnPos).toBeGreaterThan(-1);
    // wireAuthEvents must come BEFORE the await onNewConnection
    expect(wireAuthPos).toBeLessThan(onNewConnPos);
  });

  it('allWireFunctions_calledBefore_onNewConnection_await', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const connStart = src.indexOf("io.on('connection'");
    const connEnd = src.indexOf('startRecurringTasks', connStart);
    const connBlock = src.slice(connStart, connEnd);

    const onNewConnPos = connBlock.indexOf('await onNewConnection');

    const wireFunctions = [
      'wireClientReady',
      'wireAuthEvents',
      'wirePlayerControls',
      'wireChatAndCrabEvents',
      'wireSpeechAndPlanEvents',
      'wireLifecycleEvents',
    ];

    for (const fn of wireFunctions) {
      const pos = connBlock.indexOf(fn);
      expect(pos).toBeGreaterThan(-1);
      expect(pos).toBeLessThan(onNewConnPos);
    }
  });

  // ─── Bug 6: setupSocketLogger must not register io.on('connection') ───

  it('setupSocketLogger_doesNotRegisterConnectionHandler', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../infrastructure/logging/socketLogger.js'), 'utf-8');
    // Should NOT contain io.on('connection') — only io.use() middleware
    expect(src).not.toContain("io.on('connection'");
    // Should still have io.use() middleware
    expect(src).toContain('io.use(');
  });
});
