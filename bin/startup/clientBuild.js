import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';

const STATIC_INPUTS = ['index.html', 'package.json', 'package-lock.json', 'vite.config.js'];
const INPUT_DIRECTORIES = ['src', 'public'];

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function clientInputFiles(root) {
  const clientDir = path.resolve(root, 'client');
  const staticFiles = STATIC_INPUTS.map(file => path.join(clientDir, file)).filter(fs.existsSync);
  const directoryFiles = INPUT_DIRECTORIES.flatMap(dir => collectFiles(path.join(clientDir, dir)));
  return [...staticFiles, ...directoryFiles].sort();
}

function statePath(root) {
  return path.resolve(root, 'data', 'runtime', 'startup-state.json');
}

export function computeClientFingerprint(root) {
  const hash = createHash('sha256');
  for (const file of clientInputFiles(root)) {
    hash.update(path.relative(root, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readPreviousFingerprint(root) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(root), 'utf8'));
    return typeof state.clientFingerprint === 'string' ? state.clientFingerprint : null;
  } catch {
    return null;
  }
}

export async function inspectClientBuild(root) {
  return {
    distExists: fs.existsSync(path.resolve(root, 'client', 'dist', 'index.html')),
    currentFingerprint: computeClientFingerprint(root),
    previousFingerprint: readPreviousFingerprint(root),
  };
}

export async function ensureRuntimeDirectories(root) {
  await fs.promises.mkdir(path.resolve(root, 'data', 'runtime'), { recursive: true });
  await fs.promises.mkdir(path.resolve(root, 'data', 'tts'), { recursive: true });
}

export function resolveNpmCliPath({
  environment = process.env,
  nodeExecutable = process.execPath,
  existsSync = fs.existsSync,
} = {}) {
  const candidates = [
    environment.npm_execpath,
    path.resolve(path.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  const npmCli = candidates.find(existsSync);
  if (!npmCli) throw new Error('npm CLI was not found; reinstall Node.js with npm');
  return npmCli;
}

export async function buildClient(root) {
  const npmCli = resolveNpmCliPath();
  execFileSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: path.resolve(root, 'client'),
    stdio: 'inherit',
  });
}

export async function writeBuildState(root, fingerprint) {
  const target = statePath(root);
  const temp = `${target}.${process.pid}.tmp`;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(temp, JSON.stringify({
    clientFingerprint: fingerprint,
    builtAt: new Date().toISOString(),
  }, null, 2));
  await fs.promises.rename(temp, target);
}
