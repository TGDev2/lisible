import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Exclude barrel file (index.ts) from coverage thresholds
      exclude: ['**/index.ts', '**/.eslintrc.js', '**/node_modules/**', '**/dist/**'],
    },
  },
});
