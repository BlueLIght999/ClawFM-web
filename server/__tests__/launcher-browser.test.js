import { describe, expect, it, vi } from 'vitest';
import { openPreferredBrowser } from '../../bin/startup/browserLauncher.js';

describe('openPreferredBrowser', () => {
  it('openPreferredBrowser_onWindows_prefersMicrosoftEdge', async () => {
    const child = { unref: vi.fn() };
    const spawnImpl = vi.fn(() => child);
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    const result = await openPreferredBrowser({
      url: 'http://localhost:3333',
      platform: 'win32',
      env: { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' },
      existsSync: candidate => candidate === edgePath,
      spawnImpl,
    });

    expect(result.browser).toBe('edge');
    expect(spawnImpl).toHaveBeenCalledWith(
      edgePath,
      ['--new-window', 'http://localhost:3333'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it('openPreferredBrowser_whenEdgeMissing_fallsBackToDefaultBrowser', async () => {
    const child = { unref: vi.fn() };
    const spawnImpl = vi.fn(() => child);

    const result = await openPreferredBrowser({
      url: 'http://localhost:3333',
      platform: 'win32',
      env: {},
      existsSync: () => false,
      spawnImpl,
    });

    expect(result.browser).toBe('default');
    expect(spawnImpl).toHaveBeenCalledWith(
      'cmd.exe',
      ['/d', '/s', '/c', 'start', '', 'http://localhost:3333'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });
});
