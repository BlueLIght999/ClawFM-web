import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Server module seams.
 *
 * After D8 fix: server.js receives wired services from bootstrap.js
 * and no longer imports infrastructure adapters or application service
 * factories directly.
 */
describe('server module seams', () => {
  it('doesNotImportLegacyHistoryDbDirectly', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');

    expect(source).not.toContain("from './db/history.js'");
  });

  it('doesNotBypassAuthServiceForLoginStatus', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');

    expect(source).toContain('restoreStoredSession');
    expect(source).not.toContain("import { getCookie } from './infrastructure/netease/neteaseApi.js'");
    expect(source).not.toContain('checkLoginStatus');
  });

  it('doesNotBypassMusicSourcePortForRestMusicEndpoints', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');

    // server.js should access musicSource through bootstrap services, not import directly
    expect(source).not.toContain("import('./infrastructure/netease/neteaseApi.js')");
    expect(source).not.toContain('getUserPlaylists');
    expect(source).not.toContain('getPlaylistTracks');
    expect(source).not.toContain('getLyric');
  });
});
