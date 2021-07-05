#!/usr/bin/env node

import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const externals = nodeExternalsPlugin({
  dependencies: false,
  devDependencies: false,
  peerDependencies: true,
  packagePath: ['./package.json', '../../package.json'],
});

Promise.all([
  build({
    absWorkingDir: __dirname,
    entryPoints: {
      'plugin-typecheck': './src/index.ts',
    },
    bundle: true,
    platform: 'node',
    outdir: './dist',
    plugins: [externals],
    target: 'node14',
  }),
  build({
    absWorkingDir: __dirname,
    entryPoints: {
      'typescript-worker': './src/typescript-worker.ts',
    },
    bundle: true,
    platform: 'node',
    outdir: './dist',
    plugins: [externals],
    target: 'node14',
  }),
]).catch(() => process.exit(1));
