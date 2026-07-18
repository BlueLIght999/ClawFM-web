import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function requestReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health/ready`, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? JSON.parse(text) : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1000, () => { req.destroy(); resolve(null); });
  });
}

async function waitForReady(port, child, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Launcher exited before readiness (code ${child.exitCode})`);
    const readiness = await requestReady(port);
    if (readiness?.service === 'qclaudio' && readiness.status === 'ready') return readiness;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Qclaudio did not become ready on port ${port}`);
}

function waitForExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Launcher did not exit after shutdown')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function main() {
  const port = await reservePort();
  const neteasePort = await reservePort();
  let output = '';
  const child = spawn(process.execPath, ['bin/qclaudio.js', '--no-open'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PORT: String(port), NETEASE_API_PORT: String(neteasePort) },
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    const readiness = await waitForReady(port, child);
    if (!readiness.instanceId) throw new Error('Readiness response has no instanceId');

    child.send({ type: 'shutdown' });
    const exitCode = await waitForExit(child);
    if (exitCode !== 0) throw new Error(`Launcher exited with code ${exitCode}`);

    await new Promise(resolve => setTimeout(resolve, 500));
    if (await isPortOpen(port)) throw new Error(`HTTP port ${port} was not released`);
    if (await isPortOpen(neteasePort)) throw new Error(`Netease port ${neteasePort} was not released`);
    console.log(`Launcher system test passed on ports ${port}/${neteasePort}`);
  } catch (error) {
    if (child.connected) child.send({ type: 'shutdown' });
    else if (child.exitCode === null) child.kill('SIGTERM');
    throw new Error(`${error.message}\n${output.slice(-4000)}`, { cause: error });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
