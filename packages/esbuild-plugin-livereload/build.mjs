#!/usr/bin/env node

import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

Promise.all([
  build({
    absWorkingDir: __dirname,
    bundle: true,
    entryPoints: {
      'livereload-event-source': './src/event-source.ts',
    },
    format: 'esm',
    outdir: './dist',
    splitting: true,
    watch: process.argv.includes('-w') || process.argv.includes('--watch'),
  }),
  build({
    absWorkingDir: __dirname,
    bundle: true,
    entryPoints: {
      'plugin-livereload': './src/index.ts',
    },
    external: ['./banner.js'],
    outdir: './dist',
    platform: 'node',
    plugins: [
      nodeExternalsPlugin({
        dependencies: false,
        devDependencies: false,
        peerDependencies: true,
        packagePath: ['./package.json', '../../package.json'],
      }),
    ],
    target: 'node14',
    watch: process.argv.includes('-w') || process.argv.includes('--watch'),
  }),
]).catch(() => process.exit(1));
