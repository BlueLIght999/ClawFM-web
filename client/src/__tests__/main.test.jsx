import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const mainContent = readFileSync(join(__dirname_local, '..', 'main.jsx'), 'utf-8');

describe('main.jsx', () => {
  it('wraps App in ErrorBoundary', () => {
    expect(mainContent).toContain('ErrorBoundary');
    expect(mainContent).toMatch(/<ErrorBoundary>/);
  });

  it('imports ErrorBoundary component', () => {
    expect(mainContent).toContain('./components/ErrorBoundary.jsx');
  });
});
