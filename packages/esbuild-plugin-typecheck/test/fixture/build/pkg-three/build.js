#!/usr/bin/env node

const { typecheckPlugin } = require('../../../lib');
const { build } = require('esbuild');

async function main() {
  try {
    const result = await build({
      absWorkingDir: __dirname,
      entryPoints: ['./three.ts'],
      bundle: true,
      format: 'esm',
      outdir: './dist',
      platform: 'node',
      plugins: [
        typecheckPlugin({
          buildMode: process.env.BUILD_MODE,
        }),
      ],
      watch: !!process.env.WATCH,
      write: false,
    });
    process.on('SIGTERM', () => {
      result.stop();
    });
  } catch (error) {
    process.exit(1);
  }
}

main();
