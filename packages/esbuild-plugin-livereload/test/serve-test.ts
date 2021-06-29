/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';
import { build, serve, ServeResult } from 'esbuild';
import { promises as fsp } from 'fs';
import getPort from 'get-port';
import path from 'path';

import { livereloadPlugin } from '../src/livereload-plugin';

interface ServerTestFixtures {}

interface ServerWorkerFixtures {
  absWorkingDir: string;
  writeFile(index: string): Promise<void>;
  port: number;
  server: ServeResult;
}

const files = {
  '1': '1-initial.tsx',
  '2': '2-error.tsx',
  '3': '3-fixed.tsx',
};

const test = base.extend<ServerTestFixtures, ServerWorkerFixtures>({
  absWorkingDir: [
    async ({}, use, workerInfo) => {
      const dir = await fsp.mkdtemp(path.join(workerInfo.config.rootDir, 'test/fixture/out-'));
      await fsp.copyFile(
        path.join(__dirname, 'fixture', 'tsconfig.json'),
        path.join(dir, 'tsconfig.json'),
      );
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
      async function writeFile(index: string) {
        await fsp.copyFile(
          path.join(__dirname, 'fixture', files[index]),
          path.join(absWorkingDir, 'entry.tsx'),
        );
      }
      await writeFile('1');
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

  // "express" fixture starts automatically for every worker - we pass "auto" for that.
  server: [
    async ({ port, absWorkingDir, writeFile }, use, workerInfo) => {
      const lrPort = (await getPort()) + workerInfo.workerIndex;

      console.log(`Starting server (LR port: ${lrPort})...`);

      await writeFile('1');

      const watcher = await build({
        absWorkingDir,
        bundle: true,
        entryPoints: ['entry.tsx'],
        format: 'iife',
        outdir: 'js',
        plugins: [livereloadPlugin({ port: lrPort })],
        watch: true,
        write: true,
      });

      const server = await serve({ host: 'localhost', port, servedir: absWorkingDir }, {});

      console.log(`Server ready at http://localhost:${server.port}`);

      // Use the server in the tests.
      await use(server);

      // Cleanup.
      console.log('Stopping server...');
      server.stop();
      watcher.stop();
      console.log('Server stopped');

      await fsp.rm(absWorkingDir, { recursive: true, force: true });
    },
    { scope: 'worker', auto: true },
  ],
});

export default test;
