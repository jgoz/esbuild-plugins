#!/usr/bin/env node

import { typecheckPlugin } from '../../../../dist/plugin-typecheck.js';
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

build({
  absWorkingDir: __dirname,
  entryPoints: ['./three.ts'],
  bundle: true,
  format: 'esm',
  outdir: './dist',
  platform: 'node',
  plugins: [
    typecheckPlugin({
      buildMode: process.env.BUILD_MODE,
    }),
  ],
  watch: !!process.env.WATCH,
  write: false,
}).catch(() => process.exit(1));
