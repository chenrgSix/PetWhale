import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/settings.ts'],
  format: ['esm', 'cjs'],
  outDir: 'lib',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
});
