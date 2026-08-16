import { defineConfig } from 'tsdown';

/**
 * Build config for @petwhale/dsh.
 *
 * 1. Node half + the ESM/type twin of the client entry (lib/index.mjs,
 *    lib/client/index.mjs + .d.mts).
 * 2. The browser bundle in the DeepSeek Harness ModuleLoader format
 *    (lib/client.js): `window.__ModuleLoader__.load({ id, factory })` with
 *    platform modules resolved through the injected `require` — a faithful
 *    port of the official DSH client plugin preset
 *    (vendor/deepseek-harness/packages/client/tsdown.client.ts, MIT).
 */

/**
 * The DSH loader module table: platform seed entries + the runtime client
 * exemption. These stay external in the client bundle and are answered by the
 * injected require at runtime (react, cordis services, …).
 */
export const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const;

export default defineConfig([
  {
    // Node half: the host loader entry + the ESM twin of the client entry
    // (types for ./client consumers).
    entry: ['src/index.ts', 'src/client/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: true,
    inputOptions: {
      moduleTypes: { '.png': 'dataurl' },
    },
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
    },
  },
  {
    // The DSH client bundle: CJS factory artifact named exactly lib/client.js
    // (client-modules serves /plugins/@petwhale/dsh/client.js from the
    // package's exports["./client"] target).
    name: '@petwhale/dsh/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    inputOptions: {
      moduleTypes: { '.png': 'dataurl' },
    },
    deps: {
      // Platform modules stay external (answered by the injected require);
      // everything else — @petwhale/core, both renderers, and the plugin body —
      // is inlined into the plugin bundle.
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) =>
        !CLIENT_EXTERNALS.includes(id as (typeof CLIENT_EXTERNALS)[number]),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "@petwhale/dsh", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]);
