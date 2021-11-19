#!/usr/bin/env node

import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

build({
  absWorkingDir: __dirname,
  bundle: true,
  entryPoints: {
    index: './src/index.ts',
  },
  external: ['fsevents'],
  logLevel: 'info',
  outdir: './dist',
  platform: 'node',
  plugins: [
    nodeExternalsPlugin({
      dependencies: true,
      devDependencies: false,
      peerDependencies: true,
      packagePath: ['./package.json', '../../package.json'],
    }),
  ],
  target: 'node14',
  watch: process.argv.includes('-w') || process.argv.includes('--watch'),
}).catch(() => process.exit(1));
