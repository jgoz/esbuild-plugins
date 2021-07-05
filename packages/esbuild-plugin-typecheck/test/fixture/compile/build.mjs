#!/usr/bin/env node

import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

import { typecheckPlugin } from '../../../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

build({
  absWorkingDir: __dirname,
  entryPoints: ['./src/index.ts'],
  bundle: true,
  format: 'esm',
  outdir: './dist',
  platform: 'node',
  splitting: true,
  plugins: [typecheckPlugin()],
  watch: process.argv.includes('-w') || process.argv.includes('--watch'),
}).catch(() => process.exit(1));
