#!/usr/bin/env node

const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { bundle } = require('./lib');

bundle({
  absWorkingDir: __dirname,
  bundle: true,
  entryPoints: {
    index: './src/index.ts',
  },
  external: ['fsevents'],
  outdir: './dist',
  platform: 'node',
  plugins: [
    nodeExternalsPlugin({
      dependencies: true,
      devDependencies: false,
      peerDependencies: true,
      packagePath: [`${__dirname}/package.json`, `${__dirname}/../../package.json`],
    }),
  ],
  target: 'node14',
});
