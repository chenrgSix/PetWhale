import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/client/index.ts'],
  format: ['esm'],
  outDir: 'lib',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
});
