#!/usr/bin/env node

import { build } from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';

build({
  entryPoints: ['./src/overlay.ts'],
  bundle: true,
  format: 'esm',
  minify: true,
  logLevel: 'info',
  outdir: './dist',
  plugins: [
    esbuildSvelte({
      compileOptions: { css: true },
      preprocess: sveltePreprocess(),
    }),
  ],
  splitting: true,
  watch: process.argv.includes('-w') || process.argv.includes('--watch'),
}).catch(() => process.exit(1));
