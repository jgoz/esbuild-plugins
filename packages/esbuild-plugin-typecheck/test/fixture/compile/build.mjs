#!/usr/bin/env node

import { typecheckPlugin } from '@jgoz/esbuild-plugin-typecheck';
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

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
  watch: process.argv.includes('-w'),
  write: false,
})
  .then(res => {
    for (const err of res.errors) {
      console.error(err.text);
    }
  })
  .catch(() => process.exit(1));
