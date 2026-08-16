import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@petwhale/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@petwhale/renderer-orb': fileURLToPath(
        new URL('./packages/renderer-orb/src/index.ts', import.meta.url),
      ),
      '@petwhale/renderer-sprite': fileURLToPath(
        new URL('./packages/renderer-sprite/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
