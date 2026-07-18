import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { restartDecision, restartDelayMs } from './interface/process/restartPolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_RESTARTS = 10;
const STABLE_RUN_MS = 60000;

let restartCount = 0;
let currentChild = null;
let shuttingDown = false;
let restartTimer = null;

function scheduleRestart() {
  restartCount += 1;
  const delay = restartDelayMs(restartCount);
  console.log(`[Launcher] Restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})...`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    launch();
  }, delay);
}

function handleChildExit({ code, error, wasReady, readyAt }) {
  currentChild = null;
  if (wasReady && Date.now() - readyAt >= STABLE_RUN_MS) restartCount = 0;

  const decision = restartDecision({
    wasReady,
    shuttingDown,
    exitCode: code,
    restartCount,
    maxRestarts: MAX_RESTARTS,
  });

  if (decision === 'stop') {
    process.exit(0);
  } else if (decision === 'fail') {
    const reason = error?.message || `exit code ${code}`;
    console.error(`[Launcher] Server failed: ${reason}`);
    process.exit(1);
  } else {
    scheduleRestart();
  }
}

function launch() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: process.env,
  });
  currentChild = child;

  let handled = false;
  let wasReady = false;
  let readyAt = 0;
  const finish = (code, error = null) => {
    if (handled) return;
    handled = true;
    handleChildExit({ code, error, wasReady, readyAt });
  };

  child.on('message', (message) => {
    if (message?.type === 'ready') {
      wasReady = true;
      readyAt = Date.now();
    }
  });
  child.on('error', error => finish(1, error));
  child.on('close', code => finish(code));
}

function forwardSignal(signal) {
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (!currentChild) return process.exit(0);

  if (currentChild.connected) currentChild.send({ type: 'shutdown' });
  else currentChild.kill(signal);
}

process.on('message', (message) => {
  if (message?.type === 'shutdown') forwardSignal('SIGTERM');
});
process.on('SIGTERM', () => forwardSignal('SIGTERM'));
process.on('SIGINT', () => forwardSignal('SIGINT'));

launch();
