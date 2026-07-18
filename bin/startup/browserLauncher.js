import { win32 } from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

function edgeCandidates(env) {
  return [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA]
    .filter(Boolean)
    .map(base => win32.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
}

function spawnDetached(spawnImpl, command, args) {
  const child = spawnImpl(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

export async function openPreferredBrowser({
  url,
  platform = process.platform,
  env = process.env,
  existsSync = fs.existsSync,
  spawnImpl = spawn,
}) {
  if (platform === 'win32') {
    const edgePath = edgeCandidates(env).find(existsSync);
    if (edgePath) {
      spawnDetached(spawnImpl, edgePath, ['--new-window', url]);
      return { browser: 'edge' };
    }
    spawnDetached(spawnImpl, 'cmd.exe', ['/d', '/s', '/c', 'start', '', url]);
    return { browser: 'default' };
  }

  const command = platform === 'darwin' ? 'open' : 'xdg-open';
  spawnDetached(spawnImpl, command, [url]);
  return { browser: 'default' };
}
