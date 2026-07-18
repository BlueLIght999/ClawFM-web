/**
 * NeteaseProcessManager — manages the NeteaseCloudMusicApi subprocess lifecycle.
 *
 * Responsibilities:
 *   - spawn child process with correct cwd + PORT env
 *   - pipe stdout/stderr to logger
 *   - auto-restart on crash with exponential backoff (max 5 retries)
 *   - health-check polling via waitForReady()
 *   - graceful termination
 *
 * Extracted from server.js to enable testable subprocess management.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_RESTARTS = 5;
const STABLE_RUN_MS = 60000;

export class NeteaseProcessManager {
  constructor({ logger = console, config: cfg = null, fetchImpl = null, probeTimeoutMs = 1500 } = {}) {
    this.logger = logger;
    this.config = cfg || config;
    this.process = null;
    this.restartCount = 0;
    this.restartTimer = null;
    this.stableRunTimer = null;
    this.ownsProcess = false;
    this.stopping = false;
    this.fetchImpl = fetchImpl;
    this.probeTimeoutMs = probeTimeoutMs;
  }

  start() {
    if (this.process && !this.process.killed) return this.process;

    const neteaseApiDir = path.resolve(__dirname, '..', '..', 'node_modules', 'NeteaseCloudMusicApi');
    const child = spawn(process.execPath, ['app.js'], {
      cwd: neteaseApiDir,
      env: { ...process.env, PORT: String(this.config.netease.apiPort) },
      stdio: 'pipe',
      shell: false,
    });
    this.process = child;
    this.ownsProcess = true;
    this.stopping = false;

    // H6: Reset restartCount after stable run to give fresh restart budget
    if (this.stableRunTimer) clearTimeout(this.stableRunTimer);
    this.stableRunTimer = setTimeout(() => {
      this.stableRunTimer = null;
      if (this.restartCount > 0) {
        this.logger.info({ component: 'netease' }, 'stable run reached — resetting restart count');
        this.restartCount = 0;
      }
    }, STABLE_RUN_MS);

    child.on('error', (err) => {
      this.logger.error({ component: 'netease', err: err.message }, 'spawn error');
    });

    child.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) this.logger.info({ component: 'netease' }, msg);
    });

    child.stderr.on('data', (d) => {
      this.logger.error({ component: 'netease' }, d.toString().trim());
    });

    child.on('close', (code) => {
      if (this.process === child) this.process = null;
      if (this.stableRunTimer) {
        clearTimeout(this.stableRunTimer);
        this.stableRunTimer = null;
      }
      this.logger.info({ component: 'netease', code }, 'process exited');
      if (!this.stopping && code !== 0 && code !== null) {
        this._handleCrash();
      }
    });

    return child;
  }

  async ensureStarted() {
    const probe = await this._probeExisting();
    if (probe === 'ready') {
      this.ownsProcess = false;
      this.logger.info({ component: 'netease', port: this.config.netease.apiPort }, 'reusing existing API');
      return { mode: 'reused' };
    }
    if (probe === 'foreign') {
      throw new Error(`Port ${this.config.netease.apiPort} is occupied by a non-Netease service`);
    }

    this.start();
    return { mode: 'started' };
  }

  _handleCrash() {
    if (this.restartCount >= MAX_RESTARTS) {
      this.logger.error(
        { component: 'netease', port: this.config.netease.apiPort, attempts: MAX_RESTARTS },
        'max restart attempts reached — giving up',
      );
      return;
    }
    this.restartCount++;
    const delay = Math.min(3000 * Math.pow(2, this.restartCount - 1), 30000);
    this.logger.warn(
      { component: 'netease', attempt: this.restartCount, max: MAX_RESTARTS, delayMs: delay },
      'auto-restarting',
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopping) this.start();
    }, delay);
  }

  terminate() {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.stableRunTimer) {
      clearTimeout(this.stableRunTimer);
      this.stableRunTimer = null;
    }
    if (this.ownsProcess && this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      this.logger.info({ component: 'netease' }, 'subprocess terminated');
    }
  }

  async _probeExisting() {
    const healthUrl = `http://localhost:${this.config.netease.apiPort}/login/status`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.probeTimeoutMs);
    try {
      const fetcher = this.fetchImpl || globalThis.fetch;
      const res = await fetcher(healthUrl, { signal: controller.signal });
      let body;
      try {
        body = await res.json();
      } catch {
        return 'foreign';
      }
      return res.ok && this._isNeteaseResponse(body) ? 'ready' : 'foreign';
    } catch (error) {
      // AbortError (probe timeout) is ambiguous — the port may be free but
      // slow to respond, or genuinely occupied. Treat as 'absent' so
      // ensureStarted() spawns a new process rather than fatally exiting.
      return 'absent';
    } finally {
      clearTimeout(timeout);
    }
  }

  async waitForReady(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this._probeExisting() === 'ready') return true;
      const remainingMs = timeoutMs - (Date.now() - start);
      if (remainingMs > 0) await new Promise(r => setTimeout(r, Math.min(500, remainingMs)));
    }
    return false;
  }

  _isNeteaseResponse(body) {
    if (!body || typeof body !== 'object') return false;
    if ('code' in body) return true;
    return body.data && typeof body.data === 'object' && 'code' in body.data;
  }
}
