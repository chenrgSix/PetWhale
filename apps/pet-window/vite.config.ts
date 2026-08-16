import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The renderer bundle: workspace packages resolve to their sources so the
// pet window always runs the latest code without a prior `pnpm build`.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@petwhale/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@petwhale/renderer-orb': fileURLToPath(
        new URL('../../packages/renderer-orb/src/index.ts', import.meta.url),
      ),
      '@petwhale/renderer-sprite': fileURLToPath(
        new URL('../../packages/renderer-sprite/src/index.ts', import.meta.url),
      ),
    },
  },
});
