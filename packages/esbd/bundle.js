#!/usr/bin/env node

const { configure } = require('./lib');

configure({
  absWorkingDir: __dirname,
  bundle: true,
  entryPoints: {
    index: './src/index.ts',
  },
  external: [
    '@jgoz/esbuild-plugin-livereload',
    '@jgoz/esbuild-plugin-typecheck',
    'esbuild',
    'fsevents',
  ],
  outdir: './dist',
  platform: 'node',
  target: 'node14',
});
