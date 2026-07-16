import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx phase 4-6 integration', () => {
  it('imports useColdStart', () => {
    expect(appContent).toContain('useColdStart');
  });

  it('imports useCrab', () => {
    expect(appContent).toContain('useCrab');
  });

  it('imports useUI', () => {
    expect(appContent).toContain('useUI');
  });

  it('no longer has local coldPhase useState', () => {
    expect(appContent).not.toMatch(/const\s*\[coldPhase[^]]*\]\s*=\s*useState/);
  });

  it('no longer has local crabState useState', () => {
    expect(appContent).not.toMatch(/const\s*\[crabState[^]]*\]\s*=\s*useState/);
  });

  it('no longer has local view useState', () => {
    expect(appContent).not.toMatch(/const\s*\[view[^]]*\]\s*=\s*useState/);
  });

  it('no longer has local weather useState', () => {
    expect(appContent).not.toMatch(/const\s*\[weather[^]]*\]\s*=\s*useState/);
  });

  it('no longer has weather fetch useEffect', () => {
    expect(appContent).not.toMatch(/fetchWeather/);
  });

  it('no longer has scheduleNext idle toggle', () => {
    expect(appContent).not.toMatch(/scheduleNext/);
  });
});
