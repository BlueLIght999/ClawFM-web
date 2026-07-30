import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.{js,jsx}'],
    setupFiles: ['src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.{js,jsx}',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.{js,jsx}',
        '**/node_modules/**',
        'src/main.jsx',
        'src/vite-shims.js',
      ],
      thresholds: {
        // Baseline floors (recorded 2026-07-30): ratchet up as coverage improves
        'src/**': { lines: 40 },
        'src/contexts/**': { lines: 65 },
        'src/hooks/**': { lines: 70 },
      },
    },
  },
});
