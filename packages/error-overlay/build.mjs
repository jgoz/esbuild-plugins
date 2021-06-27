#!/usr/bin/env node

import esbuild from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';

esbuild
  .build({
    entryPoints: ['./src/overlay.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'ErrorOverlay',
    outdir: './dist',
    minify: true,
    plugins: [
      esbuildSvelte({
        compileOptions: { css: true },
        preprocess: sveltePreprocess(),
      }),
    ],
  })
  .catch(() => process.exit(1));
