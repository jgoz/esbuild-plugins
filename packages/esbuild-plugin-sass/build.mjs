#!/usr/bin/env node

import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

build({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-sass': './src/index.ts',
  },
  bundle: true,
  external: ['pnpapi'],
  platform: 'node',
  outdir: './dist',
  plugins: [
    nodeExternalsPlugin({
      dependencies: false,
      devDependencies: false,
      peerDependencies: true,
      packagePath: ['./package.json', '../../package.json'],
    }),
  ],
  target: 'node14',
}).catch(() => process.exit(1));
