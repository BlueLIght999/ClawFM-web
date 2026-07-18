import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const APP_PATH = path.resolve(__dirname, '../App.jsx');
const VIEW_ROUTER_PATH = path.resolve(__dirname, '../components/ViewRouter.jsx');

describe('lazy loading and conditional rendering (ViewRouter)', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf-8');
  const routerSource = fs.readFileSync(VIEW_ROUTER_PATH, 'utf-8');

  it('uses React.lazy for ProfileView import', () => {
    expect(routerSource).toContain('lazy(');
    expect(routerSource).toMatch(/lazy\(\(\)\s*=>\s*import.*ProfileView/);
  });

  it('uses React.lazy for SettingsView import', () => {
    expect(routerSource).toMatch(/lazy\(\(\)\s*=>\s*import.*SettingsView/);
  });

  it('uses Suspense wrapper for lazy views', () => {
    expect(routerSource).toContain('Suspense');
    expect(routerSource).toContain('fallback');
  });

  it('conditionally renders ProfileView (not display:none)', () => {
    expect(routerSource).toMatch(/view\s*===\s*['"]profile['"]\s*&&/);
    expect(routerSource).not.toMatch(/display:\s*view\s*===\s*['"]profile['"]/);
  });

  it('conditionally renders SettingsView (not display:none)', () => {
    expect(routerSource).toMatch(/view\s*===\s*['"]settings['"]\s*&&/);
    expect(routerSource).not.toMatch(/display:\s*view\s*===\s*['"]settings['"]/);
  });

  it('keeps Player view with display:none (audio ref dependency)', () => {
    const playerViewSource = fs.readFileSync(
      path.resolve(__dirname, '../components/PlayerView.jsx'), 'utf-8',
    );
    expect(playerViewSource).toMatch(/display:\s*visible\s*\?\s*['"]flex['"]/);
    expect(appSource).toMatch(/visible=\{view\s*===\s*['"]player['"]\}/);
  });
});
