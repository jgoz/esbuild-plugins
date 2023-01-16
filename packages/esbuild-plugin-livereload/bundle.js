#!/usr/bin/env node

const { configure } = require('../esbd/lib');

configure([
  {
    absWorkingDir: __dirname,
    entryPoints: {
      'livereload-event-source': './src/event-source.ts',
    },
    format: 'esm',
    outdir: './dist',
    splitting: true,
  },
  {
    absWorkingDir: __dirname,
    entryPoints: {
      'plugin-livereload': './src/index.ts',
    },
    external: ['./banner.js', 'esbuild'],
    outdir: './dist',
    platform: 'node',
    target: 'node12',
  },
]);
