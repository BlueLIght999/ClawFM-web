import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('server module seams', () => {
  it('doesNotImportLegacyHistoryDbDirectly', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');

    expect(source).not.toContain("from './db/history.js'");
  });

  it('doesNotBypassAuthServiceForLoginStatus', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');

    expect(source).toContain('createAuthenticationService');
    expect(source).toContain('restoreStoredSession');
    expect(source).not.toContain("import { getCookie } from './services/netease.js'");
    expect(source).not.toContain('checkLoginStatus');
  });

  it('doesNotBypassMusicSourcePortForRestMusicEndpoints', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');

    expect(source).toContain('legacyNeteaseMusicSourceAdapter');
    expect(source).not.toContain("import('./services/netease.js')");
    expect(source).not.toContain('getUserPlaylists');
    expect(source).not.toContain('getPlaylistTracks');
    expect(source).not.toContain('getLyric');
  });
});
