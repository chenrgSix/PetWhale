import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Point workspace packages at their source so the playground runs without a
// prior `pnpm build`.
export default defineConfig({
  resolve: {
    alias: {
      '@petwhale/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@petwhale/renderer-orb': fileURLToPath(
        new URL('../../packages/renderer-orb/src/index.ts', import.meta.url),
      ),
    },
  },
});
