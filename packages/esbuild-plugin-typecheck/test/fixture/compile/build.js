#!/usr/bin/env node

const { typecheckPlugin } = require('../../lib');
const { build } = require('esbuild');

async function main() {
  try {
    const result = await build({
      absWorkingDir: __dirname,
      entryPoints: ['./src/index.ts'],
      bundle: true,
      format: 'esm',
      outdir: './dist',
      platform: 'node',
      plugins: [typecheckPlugin()],
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
