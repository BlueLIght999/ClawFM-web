import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx radio integration', () => {
  it('imports useRadio from RadioContext', () => {
    expect(appContent).toContain("from './contexts/RadioContext.jsx'");
    expect(appContent).toContain('useRadio');
  });

  it('imports useAudioController', () => {
    expect(appContent).toContain("from './hooks/useAudioController.js'");
    expect(appContent).toContain('useAudioController');
  });

  it('no longer declares local radioState useState', () => {
    expect(appContent).not.toMatch(/const\s*\[radioState[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local handleSkip useCallback', () => {
    expect(appContent).not.toMatch(/const\s+handleSkip\s*=\s*useCallback/);
  });
});
