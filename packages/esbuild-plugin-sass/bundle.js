#!/usr/bin/env node

const { configure } = require('../esbd/lib');

configure({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-sass': './src/index.ts',
  },
  external: ['esbuild', 'pnpapi', 'saas'],
  outdir: './dist',
  platform: 'node',
  target: 'node16',
});
