import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx socket split', () => {
  it('imports useRadioSocketEvents', () => {
    expect(appContent).toContain('useRadioSocketEvents');
  });

  it('imports useChatSocketEvents', () => {
    expect(appContent).toContain('useChatSocketEvents');
  });

  it('imports useCrabSocketEvents', () => {
    expect(appContent).toContain('useCrabSocketEvents');
  });

  it('imports useSystemSocketEvents', () => {
    expect(appContent).toContain('useSystemSocketEvents');
  });

  it('no longer has inline socket.on for radio:state', () => {
    expect(appContent).not.toMatch(/socket\.on\(['"]radio:state['"]/);
  });

  it('no longer has inline socket.on for crab:bubbles', () => {
    expect(appContent).not.toMatch(/socket\.on\(['"]crab:bubbles['"]/);
  });
});
