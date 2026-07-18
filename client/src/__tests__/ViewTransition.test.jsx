import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const APP_PATH = path.resolve(__dirname, '../App.jsx');

describe('App.jsx useTransition view switching', () => {
  const source = fs.readFileSync(APP_PATH, 'utf-8');

  it('uses useTransition via useUI context', () => {
    // useTransition was moved to UIContext; App.jsx delegates via useUI()
    expect(source).toContain('useUI');
    const ctxSource = fs.readFileSync(
      path.resolve(__dirname, '../contexts/UIContext.jsx'), 'utf-8',
    );
    expect(ctxSource).toContain('useTransition');
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
    // Switching indicator now lives in ViewRouter, App.jsx delegates via prop
    const routerSource = fs.readFileSync(
      path.resolve(__dirname, '../components/ViewRouter.jsx'), 'utf-8',
    );
    expect(routerSource).toContain('isViewTransitionPending');
    expect(routerSource).toMatch(/isViewTransitionPending\s*&&/);
    // App.jsx passes the prop to ViewRouter
    expect(source).toMatch(/isViewTransitionPending=\{isViewTransitionPending\}/);
  });
});
