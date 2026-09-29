import { defineConfig, configDefaults } from 'vitest/config';

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
    // 墙钟预算基准移出默认门禁，改由 `npm run bench` 触发。
    //
    // 判据：这个文件里是否存在 Date.now 差值断言。存在就意味着它的红绿
    // 取决于机器负载，而门禁的红绿必须只取决于代码。留在门禁里的代价不是
    // 慢，是**可信度**——一条因机器忙而红的断言，最终会被调松阈值而不是被修。
    // 所以基准在这里排除，而不是在文件里加 skip。
    //
    // 用 configDefaults.exclude 展开而非手写：vi 的默认排除项随版本变化，
    // 硬编码一份会把 .git 之类的默认保护一起丢掉。
    exclude: [...configDefaults.exclude, '__tests__/**/*-bench.test.js'],
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
