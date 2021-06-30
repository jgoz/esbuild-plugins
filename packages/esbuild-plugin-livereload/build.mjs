#!/usr/bin/env node

import { build } from 'esbuild';

build({
  entryPoints: {
    'livereload-event-source': './src/event-source.ts',
  },
  bundle: true,
  format: 'esm',
  outdir: './dist',
  splitting: true,
}).catch(() => process.exit(1));
