import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'lib',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ['@petwhale/core', 'pixi.js', 'untitled-pixi-live2d-engine/cubism'],
  },
});
