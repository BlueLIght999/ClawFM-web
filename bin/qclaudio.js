#!/usr/bin/env node
import { spawn, execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER_DIR = resolve(ROOT, 'server');
const CLIENT_DIR = resolve(ROOT, 'client');
const PORT = parseInt(process.env.PORT || '3333', 10);
const URL = `http://localhost:${PORT}`;

console.log(`
╔══════════════════════════════════════╗
║        🦀   Qclaudio 88.7            ║
║   24/7 AI Radio Station              ║
╚══════════════════════════════════════╝
`);

// Check .env
const envPath = resolve(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  if (envContent.includes('DEEPSEEK_API_KEY=sk-xxx')) {
    console.warn('[!] DEEPSEEK_API_KEY not set in .env — AI DJ disabled\n');
  }
}

// Ensure client is built
if (!fs.existsSync(resolve(CLIENT_DIR, 'dist', 'index.html'))) {
  console.log('[Build] Building frontend...');
  try {
    execSync('npx vite build', { cwd: CLIENT_DIR, stdio: 'inherit' });
  } catch (_e) {
    console.error('[!] Build failed. Run: cd client && npm install && npx vite build');
    process.exit(1);
  }
}

// Bug L9: Check server status with proper status code verification
function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/api/auth/status`, (res) => {
      // Drain response to free the socket
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const alreadyRunning = await checkServer();

  let serverProc;
  if (!alreadyRunning) {
    console.log('[Server] Starting backend...');
    serverProc = spawn('node', ['index.js'], {
      cwd: SERVER_DIR,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    // Bug L6: Kill serverProc on startup failure to prevent orphaned process
    try {
      await new Promise((resolve, reject) => {
        let stdoutBuffer = '';
        let settled = false;

        const timeout = setTimeout(() => {
          if (settled) return;
          // Last attempt
          http.get(`${URL}/api/auth/status`, (res) => {
            res.resume();
            if (res.statusCode === 200) {
              settled = true;
              resolve();
            } else {
              settled = true;
              reject(new Error('Server failed to start within 30s timeout'));
            }
          }).on('error', () => {
            settled = true;
            reject(new Error('Server failed to start within 30s timeout'));
          });
        }, 30000);

        // Bug L5: Accumulate stdout into buffer to avoid missing 'ON AIR' across chunk splits
        serverProc.stdout.on('data', (data) => {
          stdoutBuffer += data.toString();
          if (stdoutBuffer.includes('ON AIR') && !settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
          // Trim buffer to prevent unbounded growth
          if (stdoutBuffer.length > 1024) {
            stdoutBuffer = stdoutBuffer.slice(-512);
          }
        });

        serverProc.stderr.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.error('[Server]', msg);
        });

        serverProc.on('error', (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(err);
          }
        });

        serverProc.on('exit', (code) => {
          if (code !== 0 && code !== null && !settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`Server process exited with code ${code}`));
          }
        });
      });
      console.log('[Server] Ready');
    } catch (e) {
      // Bug L6: Clean up orphaned process on startup failure
      if (serverProc && !serverProc.killed) {
        serverProc.kill('SIGTERM');
      }
      console.error('[!]', e.message);
      process.exit(1);
    }

    // Bug L7: Handle post-startup crashes
    serverProc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`\n[Server] Process crashed (code ${code}). The launcher (index.js) will auto-restart it.`);
      }
    });
  } else {
    console.log('[Server] Already running');
  }

  // Open in browser
  const pyScript = resolve(ROOT, 'bin', 'window.py');
  if (fs.existsSync(pyScript)) {
    console.log('[Window] Opening Qclaudio...\n');
    const windowProc = spawn('python', [pyScript], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, QCLAUDIO_URL: URL },
    });
    windowProc.on('close', () => {
      console.log('\n[Qclaudio] Goodbye.');
      if (serverProc) serverProc.kill();
      process.exit(0);
    });
  } else {
    // Fallback: open default browser
    const cmd = process.platform === 'win32' ? 'cmd' :
                process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', URL] : [URL];
    spawn(cmd, args, { stdio: 'ignore' });
    console.log(`[Window] Opened ${URL} in browser. Press Ctrl+C to stop.\n`);

    // Kill server child process on any exit signal
    function shutdown() {
      console.log('\n[Qclaudio] Goodbye.');
      if (serverProc && !serverProc.killed) {
        // Send SIGTERM and wait for child to exit before parent exits.
        // The child's gracefulShutdown calls io.close() to disconnect
        // clients immediately, then closes HTTP server.
        serverProc.kill('SIGTERM');
        const forceKillTimer = setTimeout(() => {
          if (!serverProc.killed) {
            console.log('[Qclaudio] Force-killing server...');
            serverProc.kill('SIGKILL');
          }
        }, 6000);
        serverProc.on('exit', () => {
          clearTimeout(forceKillTimer);
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    }
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

main().catch(e => {
  console.error('[!]', e.message);
  process.exit(1);
});
