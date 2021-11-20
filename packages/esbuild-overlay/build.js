#!/usr/bin/env node

const esbuildSvelte = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');
const { build } = require('../esbd/lib');

build({
  absWorkingDir: __dirname,
  entryPoints: {
    overlay: './src/overlay.ts',
  },
  format: 'esm',
  minify: true,
  outdir: './dist',
  plugins: [
    esbuildSvelte({
      compileOptions: { css: true },
      preprocess: sveltePreprocess(),
    }),
  ],
  splitting: true,
});
