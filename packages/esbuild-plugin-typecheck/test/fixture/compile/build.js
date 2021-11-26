#!/usr/bin/env node

const { typecheckPlugin } = require('../../lib');
const { build } = require('esbuild');
const path = require('path');

build({
  absWorkingDir: __dirname,
  entryPoints: ['./src/index.ts'],
  bundle: true,
  format: 'esm',
  outdir: './dist',
  platform: 'node',
  plugins: [typecheckPlugin()],
  watch: !!process.env.WATCH,
  write: false,
}).catch(() => process.exit(1));
