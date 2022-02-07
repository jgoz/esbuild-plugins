#!/usr/bin/env node

const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { configure } = require('../esbd/lib');

configure({
  absWorkingDir: __dirname,
  entryPoints: {
    'plugin-html': './src/index.ts',
  },
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
