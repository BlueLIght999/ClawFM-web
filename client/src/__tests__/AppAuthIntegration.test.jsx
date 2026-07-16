import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx auth integration', () => {
  it('imports useAuth from AuthContext', () => {
    expect(appContent).toContain("from './contexts/AuthContext.jsx'");
    expect(appContent).toContain('useAuth');
  });

  it('no longer declares local loggedIn useState', () => {
    expect(appContent).not.toMatch(/const\s*\[loggedIn[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local handleLoginPhone', () => {
    expect(appContent).not.toMatch(/const\s+handleLoginPhone\s*=\s*useCallback/);
  });

  it('no longer declares local handleLoginQr', () => {
    expect(appContent).not.toMatch(/const\s+handleLoginQr\s*=\s*useCallback/);
  });
});
