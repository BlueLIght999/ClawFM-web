import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration with coverage thresholds per TESTING-STANDARD.md
 *
 * Thresholds (the values live in `thresholds` below; this list is a summary):
 *   domain/playback,hosting,curation  - lines ≥ 80%, branches ≥ 70%
 *   domain/community                  - lines ≥ 90%, branches ≥ 80%
 *   domain/profile                    - lines ≥ 90%, branches ≥ 75%
 *   domain/routing + application      - lines ≥ 60%
 *   services                          - lines ≥ 60%
 *   infrastructure                    - not enforced (contract tests instead)
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
        // Community + profile. Note the thresholds are computed over the matched
        // files, NOT the directory row printed in the text report -- that row is an
        // average of per-file percentages, which runs ahead of the true ratio.
        // Measured (per-file, coverage-summary.json):
        //   community  lines 97.87, branches 87.00
        //   profile    lines 96.51, branches 79.21
        // profile's branches are dragged down by the collectors and search
        // providers (ChatHistoryCollector 54, SearchQueryCollector 56,
        // NeteaseTagSearcher 64), so the branch floor sits below those actuals
        // with headroom rather than at them.
        'domain/community/**': { lines: 90, branches: 80 },
        'domain/profile/**':   { lines: 90, branches: 75 },
        // Supporting domains: medium bar
        'domain/routing/**':   { lines: 60 },
        'application/**':      { lines: 60 },
        // Services layer: medium bar
        'services/**':         { lines: 60 },
      },
    },
  },
});
