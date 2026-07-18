import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(__dirname, '../styles/global.css'), 'utf-8');
describe('Agent Radio global style contract', () => {
  it('loadsPrototypeFonts_andUsesFullDashboardDimensions', () => {
    expect(css).toContain('Inter:wght@400;500;600;700');
    expect(css).toContain('JetBrains+Mono');
    expect(css).toMatch(/max-width:\s*1120px/);
    expect(css).toMatch(/height:\s*100dvh/);
  });
});
