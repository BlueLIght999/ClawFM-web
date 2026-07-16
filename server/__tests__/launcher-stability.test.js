import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 启动器模块稳定性测试
 *
 * 覆盖三个文件:
 * - server/index.js — 进程守护器
 * - bin/qclaudio.js — CLI 入口
 * - server/server.js — 服务启动/关闭
 */
describe('launcher stability — server/index.js', () => {

  const indexPath = path.resolve(__dirname, '../index.js');
  const src = fs.readFileSync(indexPath, 'utf-8');

  // ─── Bug L1: error event handler on child process ───

  it('has_error_event_handler_on_child', () => {
    expect(src).toMatch(/child\.on\(\s*['"]error['"]/);
  });

  // ─── Bug L2: SIGTERM/SIGINT signal forwarding ───

  it('forwards_SIGTERM_to_child', () => {
    expect(src).toMatch(/SIGTERM/);
    // Accept either direct kill('SIGTERM') or variable-based kill(signal)
    expect(src).toMatch(/\.kill\(\s*['"]SIGTERM['"]\s*\)|\.kill\(signal\)/);
  });

  it('forwards_SIGINT_to_child', () => {
    expect(src).toMatch(/SIGINT/);
  });

  // ─── Bug L3: max restart limit ───

  it('has_max_restart_limit', () => {
    expect(src).toMatch(/maxRestart|MAX_RESTART|max_restart/i);
    expect(src).toMatch(/>=|>|===|!==.*null/); // comparison logic
  });

  // ─── Bug L4: exponential backoff ───

  it('has_exponential_backoff', () => {
    expect(src).toMatch(/Math\.pow|Math\.min.*pow|exponential|backoff/i);
  });

  it('does_not_use_fixed_3s_delay_only', () => {
    // Should not have a bare fixed 3000ms delay without any backoff logic
    // The old code was: setTimeout(launch, 3000) with no backoff
    expect(src).not.toMatch(/^setTimeout\(launch,\s*3000\)\s*$/m);
  });
});


describe('launcher stability — bin/qclaudio.js', () => {

  const cliPath = path.resolve(__dirname, '../../bin/qclaudio.js');
  const src = fs.readFileSync(cliPath, 'utf-8');

  // ─── Bug L5: stdout buffer accumulation for ON AIR detection ───

  it('uses_buffer_accumulation_for_on_air_detection', () => {
    // Should accumulate stdout into a buffer string, not check single data events
    expect(src).toMatch(/\+=|\.concat|Buffer|accumulat/i);
  });

  // ─── Bug L6: kill serverProc on startup failure ───

  it('kills_serverProc_on_startup_failure', () => {
    // Should kill the server process when startup promise rejects
    expect(src).toMatch(/serverProc\.kill|serverProc\?\.kill/);
  });

  // ─── Bug L7: post-startup crash handling ───

  it('handles_post_startup_crash', () => {
    // After startup, should have an exit handler that notifies or restarts
    const hasExitHandler = src.includes("serverProc.on('exit'") ||
      src.includes('serverProc.on("exit"') ||
      src.includes("serverProc.on('close'") ||
      src.includes('serverProc.on("close"');
    expect(hasExitHandler).toBe(true);
  });

  // ─── Bug L9: checkServer verifies response status code ───

  it('checkServer_verifies_status_code', () => {
    // Should check res.statusCode === 200, not just resolve on any response
    expect(src).toMatch(/statusCode|status.*code|res\.statusCode/);
  });
});


describe('launcher stability — server/server.js graceful shutdown', () => {

  const serverPath = path.resolve(__dirname, '../server.js');
  const src = fs.readFileSync(serverPath, 'utf-8');

  // ─── Bug L8: graceful shutdown handler ───

  it('has_graceful_shutdown_handler', () => {
    expect(src).toMatch(/SIGTERM|SIGINT|gracefulShutdown|shutdown/i);
  });

  it('closes_http_server_on_shutdown', () => {
    expect(src).toMatch(/httpServer\.close/);
  });

  it('kills_netease_subprocess_on_shutdown', () => {
    expect(src).toMatch(/neteaseProc\.kill/);
  });
});
