#!/usr/bin/env node

const { typecheckPlugin } = require('../../lib');
const esbuild = require('esbuild');

async function main() {
  try {
    const context = await esbuild.context({
      absWorkingDir: __dirname,
      entryPoints: ['./src/index.ts'],
      bundle: true,
      format: 'esm',
      outdir: './dist',
      platform: 'node',
      plugins: [typecheckPlugin({ watch: !!process.env.WATCH })],
      write: false,
    });

    process.on('SIGTERM', () => {
      context.dispose();
    });

    if (process.env.WATCH) {
      context.watch();
    } else {
      await context.rebuild();
      await context.dispose();
    }
  } catch (error) {
    process.exit(1);
  }
}

main();
