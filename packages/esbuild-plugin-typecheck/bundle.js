#!/usr/bin/env node

const { configure } = require('../esbd/lib');

configure({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-typecheck': './src/index.ts',
    'typescript-worker': './src/typescript-worker.ts',
  },
  external: ['@jgoz/esbuild-plugin-livereload', 'typescript'],
  outdir: './dist',
  platform: 'node',
  target: 'node14',
});
