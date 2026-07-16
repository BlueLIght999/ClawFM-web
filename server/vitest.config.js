import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration with coverage thresholds per TESTING-STANDARD.md
 *
 * Thresholds:
 *   domain/playback,hosting,curation  — lines ≥ 80%, branches ≥ 70%
 *   domain/routing + application       — lines ≥ 60%
 *   infrastructure                     — not enforced (contract tests instead)
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'domain/**/*.js',
        'application/**/*.js',
        'services/**/*.js',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.js',
        '**/node_modules/**',
      ],
      thresholds: {
        // Core domains: high bar
        'domain/playback/**': { lines: 80, branches: 70 },
        'domain/hosting/**':  { lines: 80, branches: 70 },
        'domain/curation/**': { lines: 80, branches: 70 },
        // Supporting domains: medium bar
        'domain/routing/**':   { lines: 60 },
        'application/**':      { lines: 60 },
        // Services layer: medium bar
        'services/**':         { lines: 60 },
      },
    },
  },
});
