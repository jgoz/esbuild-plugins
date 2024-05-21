import { createHash } from 'crypto';
import type { BuildOptions, BuildResult, Message, Plugin } from 'esbuild';
import { createReadStream, promises as fsp } from 'fs';
import type { ServerResponse } from 'http';
import path from 'path';

import { createLivereloadServer } from './server';

export interface ClientMessage {
  /**
   * Output files that were added since the last build.
   */
  added: readonly string[];

  /**
   * Output files that were removed since the last build.
   */
  removed: readonly string[];

  /**
   * Output files that were changed since the last build.
   */
  updated: readonly string[];

  /**
   * Reload the page even if a hot update is possible.
   */
  forceReload?: boolean;

  /**
   * Error messages.
   */
  errors?: readonly Message[];

  /**
   * Warning messages.
   */
  warnings?: readonly Message[];
}

const clients = new Set<ServerResponse>();
const errorSources = new Map<string, ClientMessage>();

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

  /**
   * Host that the livereload server will run on.
   *
   * Setting this value to '0.0.0.0' will allow external
   * connections, e.g., when running the livereload server
   * on a different system from the connecting web browser.
   * This setup likely requires setting `urlHostname` to the
   * either the IP address or local DNS name of the livereload system.
   *
   * @default 127.0.0.1
   */
  host?: string;

  /**
   * Hostname to use when connecting to the livereload server.
   *
   * This option might be useful when running the livereload
   * server on a different system from the connecting web browser.
   *
   * Defaults to the value specified in `host`.
   */
  urlHostname?: string;
}

/**
 * An esbuild plugin that sets up a livereload server and modifies the
 * build options to enable reload-on-change behavior and error reporting.
 *
 * @param options - Options for the livereload plugin.
 * @returns - An esbuild plugin that enables livereload.
 */
export function livereloadPlugin(options: LivereloadPluginOptions = {}): Plugin {
  const { port = 53099, host = '127.0.0.1', urlHostname = host } = options;
  const baseUrl = `http://${urlHostname}:${port}/`;

  return {
    name: 'livereload-plugin',
    async setup(build) {
      const { absWorkingDir: basedir = process.cwd() } = build.initialOptions;
      const bannerTemplate = await fsp.readFile(require.resolve('../banner.js'), 'utf-8');
      const banner = bannerTemplate.replace(/{baseUrl}/g, baseUrl);

      await createLivereloadServer({
        basedir,
        host,
        port,
        urlHostname,
        onSSE: res => clients.add(res),
      });

      build.initialOptions.banner ??= {};
      if (build.initialOptions.banner.js) {
        build.initialOptions.banner.js += `;${banner}`;
      } else {
        build.initialOptions.banner.js = banner;
      }

      let fullReloadOnCssUpdates = options.fullReloadOnCssUpdates;

      if (!build.initialOptions.metafile) {
        console.warn(
          '[esbuild-plugin-livereload]: "metafile" option is disabled, so all changes will trigger a full reload',
        );
        fullReloadOnCssUpdates = true;
      }
      if (!build.initialOptions.write && !options.fullReloadOnCssUpdates) {
        console.warn(
          '[esbuild-plugin-livereload]: "write" option is disabled, so CSS updates will trigger a full reload',
        );
        fullReloadOnCssUpdates = true;
      }

      const messageBuilder = clientMessageBuilder(build.initialOptions, fullReloadOnCssUpdates);

      build.onEnd(async result => {
        const message = await messageBuilder(result);
        notify('esbuild', message);
      });
    },
  };
}

/**
 * Creates a stateful function that generates messages for connected clients.
 *
 * Build outputs are tracked between builds and differentials are calculated
 * with each subsequent build.
 *
 * @param options - esbuild build options
 * @param fullReloadOnCssUpdates - If true, CSS updates will always trigger a full page reload
 * @returns - A function that generates messages for connected clients
 */
export function clientMessageBuilder(options: BuildOptions, fullReloadOnCssUpdates = false) {
  const outputHashes = new Map<string, string>();
  const { absWorkingDir: basedir = process.cwd(), outdir } = options;

  const absOutDir = outdir ? path.resolve(basedir, outdir) : undefined;

  function publicPath(file: string) {
    if (absOutDir) {
      const relative = path.relative(absOutDir, file);
      return relative.startsWith('/') ? relative : `/${relative}`;
    }
    return file;
  }

  return async function buildMessage(result: BuildResult): Promise<ClientMessage> {
    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];
    const nextHashes: [string, string][] = [];

    if (result.metafile) {
      const absOutputs = Object.keys(result.metafile.outputs)
        .filter(o => !o.endsWith('.map'))
        .map(o => path.resolve(basedir, o));

      for (const outputFile of absOutputs) {
        const prevHash = outputHashes.get(outputFile);
        const hash = await calculateHash(outputFile);

        if (prevHash) {
          outputHashes.delete(outputFile);
          if (prevHash !== hash) {
            updated.push(publicPath(outputFile));
          }
        } else {
          added.push(publicPath(outputFile));
        }

        nextHashes.push([outputFile, hash]);
      }

      for (const outputFile of outputHashes.keys()) {
        removed.push(publicPath(outputFile));
      }

      outputHashes.clear();
      for (const [outputFile, hash] of nextHashes) {
        outputHashes.set(outputFile, hash);
      }
    }

    return {
      added,
      removed,
      updated,
      warnings: result.warnings,
      errors: result.errors,
      forceReload: fullReloadOnCssUpdates,
    };
  };
}

/**
 * Notifies connected clients that errors or warnings occurred from
 * a given source. If there are no errors and the notification originates
 * from esbuild, the page will be sent a reload request.
 *
 * @param errorSource - Key to use when identifying these errors and warnings.
 *                      Previous results will be overwritten for the same `errorSource`.
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
  const added = values.flatMap(v => v.added);
  const removed = values.flatMap(v => v.removed);
  const updated = values.flatMap(v => v.updated);
  const errors = values.flatMap(v => v.errors ?? []);
  const warnings = values.flatMap(v => v.warnings ?? []);
  const forceReload = values.some(v => v.forceReload);

  const data = `data: ${JSON.stringify({
    added,
    removed,
    updated,
    warnings,
    errors,
    forceReload,
  })}\n\n`;

  connectedClients.forEach(res => {
    if (res.socket?.destroyed) {
      connectedClients.delete(res);
    }
    try {
      res.write('event: change\n');
      res.write(data);
    } catch {}
  });
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
