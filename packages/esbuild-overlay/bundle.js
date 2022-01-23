#!/usr/bin/env node

const esbuildSvelte = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');
const { bundle } = require('../esbd/lib');

bundle({
  absWorkingDir: __dirname,
  entryPoints: {
    overlay: './src/overlay.ts',
  },
  format: 'esm',
  minify: true,
  outdir: './dist',
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: true },
      preprocess: sveltePreprocess(),
    }),
  ],
  splitting: true,
});
