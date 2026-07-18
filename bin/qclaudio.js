#!/usr/bin/env node
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launchApplication } from './startup/launchApplication.js';
import { probeInstance } from './startup/instanceProbe.js';
import { waitForQclaudioReady } from './startup/readinessWaiter.js';
import { openPreferredBrowser } from './startup/browserLauncher.js';
import { requestShutdown } from './startup/processControl.js';
import { initializeProject } from './startup/initializeProject.js';
import { inspectProject } from './startup/projectInspector.js';
import {
  buildClient,
  ensureRuntimeDirectories,
  inspectClientBuild,
  writeBuildState,
} from './startup/clientBuild.js';
import { formatDoctorReport } from './startup/doctorReport.js';
import { loadStartupConfig, startupPortsValid } from './startup/startupConfig.js';
import {
  installWorkspaceDependencies,
  repairProjectDependencies,
} from './startup/dependencyRepair.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER_DIR = resolve(ROOT, 'server');
const startupConfig = loadStartupConfig(ROOT);
const URL = `http://localhost:${startupConfig.port}`;
const doctorMode = process.argv[2] === 'doctor';
const repairMode = process.argv[2] === 'repair';
const noOpen = process.argv.includes('--no-open');
const forceBuild = process.argv.includes('--force-build');

console.log(`
Qclaudio 88.7
24/7 AI Radio Station
`);

function startServerProcess() {
  console.log('[Server] Starting backend...');
  return spawn(process.execPath, ['index.js'], {
    cwd: SERVER_DIR,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(startupConfig.port),
      NETEASE_API_PORT: String(startupConfig.neteasePort),
      QCLAUDIO_INSTANCE_ID: randomUUID(),
    },
  });
}

async function runDoctor() {
  const [report, buildState] = await Promise.all([
    inspectProject(ROOT),
    inspectClientBuild(ROOT),
  ]);
  console.log(formatDoctorReport({ report, buildState }));
  if (report.status === 'fail') process.exitCode = 1;
}

async function runRepair() {
  console.log('Qclaudio Dependency Repair');
  const result = await repairProjectDependencies({
    root: ROOT,
    deps: {
      inspectProject,
      installWorkspace: async (root, workspace) => {
        console.log(`[Repair] ${workspace.name}: restoring ${workspace.dependencies.join(', ')}`);
        await installWorkspaceDependencies(root, workspace);
      },
    },
  });
  if (result.repairedWorkspaces.length === 0) {
    console.log('[Repair] No missing dependencies detected.');
    return;
  }
  console.log(`[Repair] Verified workspaces: ${result.repairedWorkspaces.join(', ')}`);
}

async function initializeForStartup() {
  const result = await initializeProject({
    root: ROOT,
    forceBuild,
    deps: {
      inspectProject,
      ensureRuntimeDirectories,
      inspectClientBuild,
      buildClient: async root => {
        console.log('[Build] Client inputs changed; rebuilding frontend...');
        await buildClient(root);
      },
      writeBuildState,
    },
  });
  for (const warning of result.report.warnings) console.warn(`[Preflight] ${warning}`);
  return result;
}

async function main() {
  if (repairMode) return runRepair();
  if (doctorMode) return runDoctor();
  if (!startupPortsValid(startupConfig)) {
    await initializeForStartup();
    throw new Error('Startup ports are invalid');
  }

  const result = await launchApplication({
    url: URL,
    noOpen,
    deps: {
      probeInstance,
      initialize: initializeForStartup,
      startServer: startServerProcess,
      waitUntilReady: processHandle => waitForQclaudioReady({ baseUrl: URL, processHandle }),
      openBrowser: openPreferredBrowser,
      stopServer: requestShutdown,
    },
  });

  console.log(`[Server] ${result.mode === 'reused' ? 'Reused existing instance' : 'Ready'}`);
  if (!result.processHandle) return;

  const serverProc = result.processHandle;
  serverProc.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[Server] Launcher exited with code ${code}`);
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\n[Qclaudio] Shutting down...');
    await requestShutdown(serverProc);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('message', (message) => {
    if (message?.type === 'shutdown') shutdown();
  });
}

main().catch((error) => {
  console.error('[Startup]', error.message);
  process.exit(1);
});
