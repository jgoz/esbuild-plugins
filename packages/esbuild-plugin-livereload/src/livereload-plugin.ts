import { createHash } from 'crypto';
import type { Message, Plugin } from 'esbuild';
import { createReadStream, promises as fsp } from 'fs';
import type { ServerResponse } from 'http';
import path from 'path';

import { createLivereloadServer } from './server';

interface ClientMessage {
  warnings?: readonly Message[];
  errors?: readonly Message[];
  cssUpdate?: boolean;
}

const clients = new Set<ServerResponse>();
const errorSources = new Map<string, ClientMessage>();
const outputHashes = new Map<string, string>();

export interface LivereloadPluginOptions {
  /**
   * Instead of hot-reloading CSS files, trigger a full page reload when CSS is updated.
   *
   * @default false
   */
  fullReloadOnCssUpdates?: boolean;

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

      let fullReloadOnCssUpdates = options.fullReloadOnCssUpdates;

      if (!build.initialOptions.metafile && !options.fullReloadOnCssUpdates) {
        console.warn(
          '[esbuild-plugin-livereload]: "metafile" option is disabled, so CSS updates will trigger a full reload',
        );
        fullReloadOnCssUpdates = true;
      }
      if (!build.initialOptions.write && !options.fullReloadOnCssUpdates) {
        console.warn(
          '[esbuild-plugin-livereload]: "write" option is disabled, so CSS updates will trigger a full reload',
        );
        fullReloadOnCssUpdates = true;
      }

      build.onEnd(async result => {
        let cssUpdate = false;
        if (result.metafile && !fullReloadOnCssUpdates) {
          const outputs = Object.keys(result.metafile.outputs).map(o => path.resolve(basedir, o));

          for (const outputFile of outputs.filter(o => o.endsWith('.css'))) {
            const prevHash = outputHashes.get(outputFile);
            const hash = await calculateHash(outputFile);
            if (prevHash !== hash) {
              outputHashes.set(outputFile, hash);
              cssUpdate = true;
            }
          }
        }

        notify('esbuild', {
          warnings: result.warnings,
          errors: result.errors,
          cssUpdate,
        });
      });
    },
  };
}

/**
 * Notifies connected clients that errors or warnings occurred from
 * a given source. If there are no errors and the notification originates
 * from esbuild, the page will be sent a reload request.
 *
 * @param errorSource - Identifier for the errors and warnings. Previous
 *                      results will be overwritten for the same errorSource.
 * @param msg - Object containing errors and warnings from the given source
 * @param connectedClients - Set of long-lived server responses representing
 *                           clients currently connected to the livereload
 *                           server. Only required if you are implementing your
 *                           own livereload server.
 */
export function notify(
  errorSource: string,
  msg: ClientMessage,
  connectedClients: Set<ServerResponse> = clients,
) {
  errorSources.set(errorSource, msg);

  const values = Array.from(errorSources.values());
  const errors = values.flatMap(v => v.errors ?? []);
  const warnings = values.flatMap(v => v.warnings ?? []);

  const reloadCss = msg.cssUpdate;
  const reloadPage = !reloadCss && errorSource === 'esbuild' && errors.length === 0;
  const event = reloadCss
    ? 'event: reload-css\n'
    : reloadPage
    ? 'event: reload\n'
    : 'event: build-result\n';
  const data = `data: ${JSON.stringify({ warnings, errors })}\n\n`;

  connectedClients.forEach(res => {
    res.write(event);
    res.write(data);
  });

  if (reloadPage) connectedClients.clear();
}

async function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);

    stream.on('data', d => hash.update(d));
    stream.on('end', () => {
      resolve(hash.digest('base64'));
    });
    stream.on('error', reject);
  });
}
