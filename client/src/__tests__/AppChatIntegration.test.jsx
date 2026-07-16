import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx chat integration', () => {
  it('imports useChat from ChatContext', () => {
    expect(appContent).toContain("from './contexts/ChatContext.jsx'");
    expect(appContent).toContain('useChat');
  });

  it('no longer declares local chatOpen useState', () => {
    expect(appContent).not.toMatch(/const\s*\[chatOpen[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local djDialogText useState', () => {
    expect(appContent).not.toMatch(/const\s*\[djDialogText[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local handleChatMessage useCallback', () => {
    expect(appContent).not.toMatch(/const\s+handleChatMessage\s*=\s*useCallback/);
  });
});
