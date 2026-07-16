import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_RESTARTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

let restartCount = 0;
let currentChild = null;

function launch() {
  const child = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });

  currentChild = child;

  // Bug L1: Handle spawn errors (e.g. node binary not found)
  child.on('error', (err) => {
    const ts = new Date().toLocaleTimeString();
    console.error(`[Launcher ${ts}] Spawn error: ${err.message}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, restartCount - 1), MAX_DELAY_MS);
      console.log(`[Launcher ${ts}] Retrying in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})...`);
      setTimeout(launch, delay);
    }
  });

  child.on('close', (code) => {
    const ts = new Date().toLocaleTimeString();
    currentChild = null;

    // Normal exit (code 0 or null via signal) — don't restart
    if (code === 0 || code === null) {
      console.log(`[Launcher ${ts}] Server exited normally (code ${code}), shutting down.`);
      process.exit(0);
    }

    // Abnormal exit — check restart limit (Bug L3)
    if (restartCount >= MAX_RESTARTS) {
      console.error(`[Launcher ${ts}] Max restart attempts (${MAX_RESTARTS}) reached — giving up.`);
      process.exit(1);
    }

    restartCount++;
    // Bug L4: Exponential backoff (1s → 2s → 4s → ... → 30s cap)
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, restartCount - 1), MAX_DELAY_MS);
    console.log(`[Launcher ${ts}] Server exited (code ${code}), restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})...`);
    setTimeout(launch, delay);
  });
}

// Bug L2: Forward SIGTERM/SIGINT to child process for graceful shutdown
function forwardSignal(signal) {
  if (currentChild && !currentChild.killed) {
    currentChild.kill(signal);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => forwardSignal('SIGTERM'));
process.on('SIGINT', () => forwardSignal('SIGINT'));

launch();
