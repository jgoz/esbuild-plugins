#!/usr/bin/env node

const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { build } = require('../esbd/lib');

build({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-sass': './src/index.ts',
  },
  external: ['pnpapi'],
  logLevel: 'info',
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
  target: 'node14',
});
