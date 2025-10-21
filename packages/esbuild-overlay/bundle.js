#!/usr/bin/env node

const esbuildSvelte = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');
const { configure } = require('../esbd/lib');

configure({
  absWorkingDir: __dirname,
  entryPoints: {
    overlay: './src/overlay.ts',
  },
  format: 'esm',
  minify: true,
  outdir: './dist',
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: 'injected' },
      preprocess: sveltePreprocess(),
    }),
  ],
  splitting: true,
});
