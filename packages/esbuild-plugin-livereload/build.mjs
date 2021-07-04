#!/usr/bin/env node

import { typecheckPlugin } from '@jgoz/esbuild-plugin-typecheck';
import { build } from 'esbuild';

build({
  entryPoints: {
    'livereload-event-source': './src/event-source.ts',
  },
  bundle: true,
  format: 'esm',
  outdir: './dist',
  splitting: true,
  plugins: [typecheckPlugin()],
}).catch(() => process.exit(1));
