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
const PORT = 3333;
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
  } catch (e) {
    console.error('[!] Build failed. Run: cd client && npm install && npx vite build');
    process.exit(1);
  }
}

// Check if server is already running
function checkServer() {
  return new Promise((resolve) => {
    http.get(`${URL}/api/auth/status`, (res) => {
      resolve(true);
    }).on('error', () => {
      resolve(false);
    });
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

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Last attempt
        http.get(`${URL}/api/auth/status`, () => resolve()).on('error', () => {
          reject(new Error('Server failed to start'));
        });
      }, 30000);

      serverProc.stdout.on('data', (data) => {
        if (data.toString().includes('ON AIR')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProc.on('error', reject);
    });
    console.log('[Server] Ready');
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
    // Keep alive on Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n[Qclaudio] Goodbye.');
      if (serverProc) serverProc.kill();
      process.exit(0);
    });
  }
}

main().catch(e => {
  console.error('[!]', e.message);
  process.exit(1);
});
