import type { Plugin } from 'esbuild';
import { promises as fsp } from 'fs';
import type { ServerResponse } from 'http';

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
  const baseUrl = `http://127.0.0.1:${port}`;
  const clients = new Set<ServerResponse>();

  return {
    name: 'livereload-plugin',
    async setup(build) {
      const { absWorkingDir: basedir = process.cwd() } = build.initialOptions;
      const bannerTemplate = await fsp.readFile(require.resolve('../banner.js'), 'utf-8');
      const banner = bannerTemplate.replace(/{baseUrl}/g, baseUrl);

      createLivereloadServer({ basedir, port, onSSE: res => clients.add(res) });

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
          const data = `data: ${JSON.stringify(result)}\n\n`;
          clients.forEach(res => {
            res.write('event: build-result\n');
            res.write(data);
          });
        }
      });
    },
  };
}
