#!/usr/bin/env node

import esbuild from 'esbuild';

esbuild
  .build({
    entryPoints: ['./src/banner.js'],
    bundle: true,
    format: 'iife',
    outdir: './dist',
    minify: true,
  })
  .catch(() => process.exit(1));
