import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function launch() {
  const child = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('close', (code) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`[Launcher ${ts}] Server exited (code ${code}), restarting in 3s...`);
    setTimeout(launch, 3000);
  });
}

launch();
