#!/usr/bin/env node

const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { build } = require('../esbd/lib');

build({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-typecheck': './src/index.ts',
    'typescript-worker': './src/typescript-worker.ts',
  },
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
