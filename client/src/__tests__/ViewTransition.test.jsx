import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const APP_PATH = path.resolve(__dirname, '../App.jsx');

describe('App.jsx useTransition view switching', () => {
  const source = fs.readFileSync(APP_PATH, 'utf-8');

  it('imports useTransition from react', () => {
    expect(source).toContain('useTransition');
  });

  it('creates isViewTransitionPending and startViewTransition', () => {
    expect(source).toContain('isViewTransitionPending');
    expect(source).toContain('startViewTransition');
  });

  it('wraps setView in startViewTransition', () => {
    // The onViewChange callback should use startViewTransition
    expect(source).toMatch(/startViewTransition\(/);
    expect(source).toMatch(/startViewTransition\(\s*\(\)\s*=>\s*setView/);
  });

  it('shows transition indicator when pending', () => {
    expect(source).toContain('isViewTransitionPending');
    // Should render something when pending (SWITCHING indicator)
    expect(source).toMatch(/isViewTransitionPending\s*&&/);
  });
});
