/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';
import type { ServeResult } from 'esbuild';
import { context as createContext } from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import { promises as fsp } from 'fs';
import getPort from 'get-port';
import path from 'path';
import sveltePreprocess from 'svelte-preprocess';

import { livereloadPlugin } from '../';

interface ServerTestFixtures {}

interface ServerWorkerFixtures {
  absWorkingDir: string;
  writeFile(fixture: [input: string, output: string]): Promise<void>;
  port: number;
  server: ServeResult;
}

const test = base.extend<ServerTestFixtures, ServerWorkerFixtures>({
  absWorkingDir: [
    async ({}, use, workerInfo) => {
      const dir = path.join(workerInfo.config.rootDir, 'test/fixture/out');
      await fsp.mkdir(dir, { recursive: true });
      await fsp.copyFile(
        path.join(__dirname, 'fixture', 'index.html'),
        path.join(dir, 'index.html'),
      );
      await use(dir);
    },
    { scope: 'worker' },
  ],

  writeFile: [
    async ({ absWorkingDir }, use) => {
      async function writeFile(fixture: [input: string, output: string]) {
        await fsp.copyFile(
          path.join(__dirname, 'fixture', fixture[0]),
          path.join(absWorkingDir, fixture[1]),
        );
      }
      await use(writeFile);
    },
    { scope: 'worker' },
  ],

  port: [
    async ({}, use, workerInfo) => {
      const port = await getPort();
      // "port" fixture uses a unique value of the worker process index.
      await use(port + workerInfo.workerIndex);
    },
    { scope: 'worker' },
  ],

  server: [
    async ({ port, absWorkingDir, writeFile }, use, workerInfo) => {
      const lrPort = (await getPort()) + workerInfo.workerIndex;

      console.log(`Starting server (LR port: ${lrPort})...`);

      await writeFile(['1-initial.svelte', 'entry.svelte']);
      await writeFile(['style-1.css', 'style.css']);

      const context = await createContext({
        absWorkingDir,
        bundle: true,
        entryPoints: ['entry.svelte', 'style.css'],
        format: 'esm',
        metafile: true,
        outdir: 'js',
        plugins: [
          esbuildSvelte({
            compilerOptions: { css: true },
            preprocess: sveltePreprocess(),
          }),
          livereloadPlugin({ port: lrPort }),
        ],
        write: true,
      });

      await context.rebuild();
      context.watch();
      const server = await context.serve({ host: '127.0.0.1', port, servedir: absWorkingDir });

      console.log(`Server ready at http://127.0.0.1:${server.port}`);

      // Use the server in the tests.
      await use(server);

      // Cleanup.
      console.log('Stopping server...');
      await context.dispose();
      console.log('Server stopped');

      await fsp.rm(absWorkingDir, { recursive: true, force: true });
    },
    { scope: 'worker', auto: true },
  ],
});

export default test;
