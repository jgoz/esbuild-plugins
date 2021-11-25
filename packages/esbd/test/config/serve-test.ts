/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';
import type { ExecaChildProcess } from 'execa';
import { node } from 'execa';
import { promises as fsp } from 'fs';
import getPort from 'get-port';
import path from 'path';
import waitOn from 'wait-on';

import type { EsbdConfig } from '../lib';

interface ServerTestFixtures {
  absWorkingDir: string;
  port: number;
  writeFiles(files: { [relativePath: string]: string | Buffer }): Promise<void>;
  startServer(config: ServerConfig): Promise<{
    write: (fileIndex: number) => Promise<void>;
  }>;
}

interface ServerConfig {
  config?: Partial<EsbdConfig>;
  disableRewrite?: boolean;
  files: { [relativePath: string]: string | Buffer }[];
  livereload?: boolean;
  serveDir?: string;
}

const test = base.extend<ServerTestFixtures>({
  absWorkingDir: async ({}, use, workerInfo) => {
    const dir = await fsp.mkdtemp(path.join(workerInfo.config.rootDir, 'test', 'tmp-'));
    await fsp.mkdir(dir, { recursive: true });
    await use(dir);
  },

  writeFiles: async ({ absWorkingDir }, use) => {
    async function writeFiles(files: { [relativePath: string]: string }) {
      await Promise.all(
        Object.entries(files).map(async ([relativePath, content]) => {
          const absPath = path.join(absWorkingDir, relativePath);
          await fsp.mkdir(path.dirname(absPath), { recursive: true });
          await fsp.writeFile(absPath, content);
        }),
      );
    }
    await use(writeFiles);
  },

  port: async ({}, use) => {
    await use(await getPort({ port: 10000 }));
  },

  startServer: async ({ port, absWorkingDir, writeFiles }, use) => {
    let proc: ExecaChildProcess;

    const startServer = async (serverConfig: ServerConfig) => {
      const { livereload, config, disableRewrite, files, serveDir } = serverConfig;

      const initialFiles = files[0];
      if (!initialFiles) {
        throw new Error('At least one set of files is required');
      }
      const index = Object.keys(initialFiles).find(file => file.endsWith('index.html'));
      if (!index) {
        throw new Error('index.html is required');
      }

      const fullConfig: EsbdConfig = {
        format: 'esm',
        metafile: true,
        splitting: true,
        sourcemap: false,
        ...config,
        absWorkingDir,
        outdir: './out',
        entryPoints: {
          'index.html': index,
        },
      };

      const bundleFile = path.join(absWorkingDir, 'bundle.js');
      const writeBundle = fsp.writeFile(
        bundleFile,
        `require('../../lib').bundle(${JSON.stringify(fullConfig)});`,
      );

      await Promise.all([writeBundle, writeFiles(initialFiles)]);

      proc = node(
        bundleFile,
        [
          'serve',
          '-l',
          'info',
          '-p',
          String(port),
          livereload && '-r',
          disableRewrite && '--no-rewrite',
          serveDir && '-d',
          serveDir,
        ].filter(Boolean),
        {
          encoding: 'utf8',
          reject: false,
          cwd: absWorkingDir,
          env: { ...process.env, FORCE_COLOR: '0' },
        },
      );

      await waitOn({ resources: [`http-get://127.0.0.1:${port}`], timeout: 10000 });

      return {
        write: async (fileIndex: number) => {
          await writeFiles(files[fileIndex]);
        },
      };
    };

    // Tests execute here
    await use(startServer);

    proc.cancel();
    try {
      const { stderr } = await proc;
      if (stderr) {
        console.error('Error output from esbd:');
        console.error(stderr);
      }
    } catch (e) {
      console.error('Server stopped with error', e);
    }

    await fsp.rm(absWorkingDir, { recursive: true, force: true });
  },
});

export default test;
