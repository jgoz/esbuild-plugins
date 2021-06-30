#!/usr/bin/env node

import { build } from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';

build({
  entryPoints: ['./src/overlay.ts'],
  bundle: true,
  format: 'esm',
  outdir: './dist',
  minify: true,
  splitting: true,
  plugins: [
    esbuildSvelte({
      compileOptions: { css: true },
      preprocess: sveltePreprocess(),
    }),
  ],
}).catch(() => process.exit(1));
