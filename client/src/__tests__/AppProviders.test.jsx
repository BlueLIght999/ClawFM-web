import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname_local, '..', 'contexts', 'AppProviders.jsx'), 'utf-8');

describe('AppProviders', () => {
  it('nests all 6 providers', () => {
    expect(content).toContain('AuthProvider');
    expect(content).toContain('RadioProvider');
    expect(content).toContain('ChatProvider');
    expect(content).toContain('ColdStartProvider');
    expect(content).toContain('CrabProvider');
    expect(content).toContain('UIProvider');
  });

  it('exports AppProviders function', () => {
    expect(content).toMatch(/export function AppProviders/);
  });

  it('passes socket to providers that need it', () => {
    expect(content).toMatch(/AuthProvider.*socket/);
    expect(content).toMatch(/RadioProvider.*socket/);
    expect(content).toMatch(/ChatProvider.*socket/);
    expect(content).toMatch(/UIProvider.*socket/);
  });

  it('has CrabProviderWrapper to bridge isPlaying', () => {
    expect(content).toContain('CrabProviderWrapper');
    expect(content).toContain('isPlaying');
  });

  it('calls useSocket internally', () => {
    expect(content).toContain('useSocket');
  });

  it('supports render-prop children to forward socket/connected', () => {
    expect(content).toMatch(/typeof children === 'function'/);
    expect(content).toContain('connected');
  });
});
