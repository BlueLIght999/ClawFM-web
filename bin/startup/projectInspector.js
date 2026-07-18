import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { evaluatePreflight } from './preflightRules.js';
import { loadStartupConfig } from './startupConfig.js';

const REQUIRED_FILES = [
  'package.json',
  'package-lock.json',
  'server/package.json',
  'server/package-lock.json',
  'client/package.json',
  'client/package-lock.json',
  'bin/qclaudio.js',
  '.env.example',
];

const WORKSPACES = [
  { name: 'root', dir: '.', includeDev: false },
  { name: 'server', dir: 'server', includeDev: false },
  { name: 'client', dir: 'client', includeDev: true },
];

function defaultNpmAvailable() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) return true;
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  return spawnSync(command, ['npm'], { stdio: 'ignore' }).status === 0;
}

function defaultResolveDependency(manifestPath, dependency) {
  try {
    createRequire(manifestPath).resolve(dependency);
    return true;
  } catch {
    return false;
  }
}

function dependenciesFor(manifest, includeDev) {
  return {
    ...(manifest.dependencies || {}),
    ...(includeDev ? manifest.devDependencies || {} : {}),
  };
}

function findMissingDependencies(root, resolveDependency) {
  const missing = {};
  for (const workspace of WORKSPACES) {
    const manifestPath = path.resolve(root, workspace.dir, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    missing[workspace.name] = Object.keys(dependenciesFor(manifest, workspace.includeDev))
      .filter(dependency => !resolveDependency(manifestPath, dependency));
  }
  return missing;
}

export async function inspectProject(root, options = {}) {
  const envPath = path.resolve(root, '.env');
  const envPresent = fs.existsSync(envPath);
  const startupConfig = loadStartupConfig(root, options.environment || process.env);
  const resolveDependency = options.resolveDependency || defaultResolveDependency;

  return evaluatePreflight({
    nodeVersion: options.nodeVersion || process.version,
    npmAvailable: options.npmAvailable ?? defaultNpmAvailable(),
    missingFiles: REQUIRED_FILES.filter(file => !fs.existsSync(path.resolve(root, file))),
    missingDependencies: findMissingDependencies(root, resolveDependency),
    envPresent,
    port: startupConfig.port,
    neteasePort: startupConfig.neteasePort,
  });
}
