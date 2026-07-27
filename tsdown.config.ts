import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      register: 'src/register.ts',
      'schema/index': 'src/schema/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
  },
  {
    // Self-registering bundle for CDN/script-tag embeds (unpkg/jsdelivr point here).
    entry: { 'timarro.min': 'src/register.ts' },
    format: ['iife'],
    globalName: 'Timarro',
    minify: true,
    sourcemap: true,
    dts: false,
    target: 'es2022',
    platform: 'browser',
    outputOptions: {
      entryFileNames: '[name].js',
    },
  },
]);
