#!/usr/bin/env node

const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { build } = require('../esbd/lib');

build([
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
    external: ['./banner.js'],
    outdir: './dist',
    platform: 'node',
    plugins: [
      nodeExternalsPlugin({
        dependencies: false,
        devDependencies: false,
        peerDependencies: true,
        packagePath: [`${__dirname}/package.json`, `${__dirname}/../../package.json`],
      }),
    ],
    target: 'node12',
  },
]);
