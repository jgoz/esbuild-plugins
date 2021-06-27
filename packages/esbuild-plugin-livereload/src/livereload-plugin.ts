import { BuildFailure, BuildResult, Message, Plugin } from 'esbuild';
import { promises as fsp } from 'fs';
import type { ServerResponse } from 'http';
import path from 'path';
import { serializeError } from 'serialize-error';

import { createLivereloadServer } from './server';

export interface LivereloadPluginOptions {
  /**
   * Port that the livereload server will run on.
   *
   * @default 53099
   */
  port?: number;
}

export function livereloadPlugin(options: LivereloadPluginOptions = {}): Plugin {
  const { port = 53099 } = options;
  const clients = new Set<ServerResponse>();

  return {
    name: 'livereload-plugin',
    async setup(build) {
      const { absWorkingDir: basedir = process.cwd() } = build.initialOptions;
      const jsBanner = await fsp.readFile(__dirname + '/banner.js', 'utf-8');

      const baseUrl = `http://127.0.0.1:${port}`;
      const banner = jsBanner.replace(/{baseUrl}/g, baseUrl);

      createLivereloadServer(port, res => clients.add(res));

      build.initialOptions.banner ??= {};
      if (build.initialOptions.banner.js) {
        build.initialOptions.banner.js += `;${banner}`;
      } else {
        build.initialOptions.banner.js = banner;
      }

      build.onEnd(result => {
        if (result.errors.length === 0) {
          const data = `data: ${JSON.stringify({ warnings: result.warnings })}\n\n`;
          clients.forEach(res => {
            res.write('event: reload\n');
            res.write(data);
          });
          clients.clear();
        } else {
          const data = `data: ${JSON.stringify(applyBasedir(result, basedir))}\n\n`;
          clients.forEach(res => {
            res.write('event: build-error\n');
            res.write(data);
          });
        }
      });
    },
  };
}

function applyBasedir(result: BuildResult, basedir: string): BuildResult {
  for (const error of result.errors) {
    if (error.location) {
      error.detail ??= {};
      error.detail.fileRelative = error.location.file;
      error.location.file = path.resolve(basedir, error.location.file);
    }
  }
  for (const warning of result.warnings) {
    if (warning.location) {
      warning.detail ??= {};
      warning.detail.fileRelative = warning.location.file;
      warning.location.file = path.resolve(basedir, warning.location.file);
    }
  }
  return result;
}
