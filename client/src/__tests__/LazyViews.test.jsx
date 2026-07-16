import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const APP_PATH = path.resolve(__dirname, '../App.jsx');

describe('App.jsx lazy loading and conditional rendering', () => {
  const source = fs.readFileSync(APP_PATH, 'utf-8');

  it('uses React.lazy for ProfileView import', () => {
    expect(source).toContain('lazy(');
    expect(source).toMatch(/lazy\(\(\)\s*=>\s*import.*ProfileView/);
  });

  it('uses React.lazy for SettingsView import', () => {
    expect(source).toMatch(/lazy\(\(\)\s*=>\s*import.*SettingsView/);
  });

  it('uses Suspense wrapper for lazy views', () => {
    expect(source).toContain('Suspense');
    expect(source).toContain('fallback');
  });

  it('conditionally renders ProfileView (not display:none)', () => {
    // Should use {view === 'profile' && ...} pattern, not display: none
    expect(source).toMatch(/view\s*===\s*['"]profile['"]\s*&&/);
    // Should NOT have display: none for profile view
    expect(source).not.toMatch(/display:\s*view\s*===\s*['"]profile['"]\s*\?\s*['"]block['"]/);
  });

  it('conditionally renders SettingsView (not display:none)', () => {
    expect(source).toMatch(/view\s*===\s*['"]settings['"]\s*&&/);
    expect(source).not.toMatch(/display:\s*view\s*===\s*['"]settings['"]\s*\?\s*['"]block['"]/);
  });

  it('keeps Player view with display:none (audio ref dependency)', () => {
    // Player view must stay display:none — audio elements need to persist
    expect(source).toMatch(/display:\s*view\s*===\s*['"]player['"]/);
  });
});
