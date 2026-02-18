import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for API integration tests (E10-S3).
 * Uses `node` environment (not jsdom) since we test HTTP handlers server-side.
 * Run with: pnpm test:integration
 */
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/integration/setup.ts'],
    include: ['src/__tests__/api/**/*.integration.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Sequential execution ensures mock state isolation between test files
    pool: 'forks',
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sme-studio/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@sme-studio/subtitle-parser': path.resolve(
        __dirname,
        '../../packages/subtitle-parser/src/index.ts'
      ),
      '@sme-studio/sme-engine': path.resolve(
        __dirname,
        '../../packages/sme-engine/src/index.ts'
      ),
    },
  },
});
