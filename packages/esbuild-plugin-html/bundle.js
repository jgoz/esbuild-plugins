#!/usr/bin/env node

const { configure } = require('../esbd/lib');

configure({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-html': './src/index.ts',
  },
  external: ['esbuild'],
  outdir: './dist',
  platform: 'node',
  target: 'node14',
});
