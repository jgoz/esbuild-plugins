import type { notify as notifyFn } from '@jgoz/esbuild-plugin-livereload';
import type { TypecheckRunner as TypecheckRunnerCls } from '@jgoz/esbuild-plugin-typecheck';
import { createHash } from 'crypto';
import dns from 'dns';
import fs from 'fs';
import type { Server, ServerResponse } from 'http';
import { createServer } from 'http';
import Graceful from 'node-graceful';
import path from 'path';
import pc from 'picocolors';
import serveStatic from 'serve-static';
import { URL } from 'url';
import { promisify } from 'util';

import type { BuildMode, ResolvedEsbdConfig, TsBuildMode } from './config';
import { getHtmlBuildOptions } from './get-build-options';
import { writeTemplate } from './html-entry-point/write-template';
import { incrementalBuild } from './incremental-build';
import type { Logger } from './log';
import { timingPlugin } from './timing-plugin';

interface EsbdServeConfig {
  check?: boolean;
  host?: string;
  livereload?: boolean;
  livereloadHost?: string;
  logger: Logger;
  mode: BuildMode;
  port?: number;
  rewrite: boolean;
  servedir?: string;
  tsBuildMode?: TsBuildMode;
}

function calculateHash(contents: Uint8Array): string {
  const hash = createHash('md5');
  hash.update(contents);
  return hash.digest('base64');
}

export default async function esbdServe(
  config: ResolvedEsbdConfig,
  {
    mode,
    host = '127.0.0.1',
    port = 8000,
    livereload,
    livereloadHost = '127.0.0.1',
    logger,
    servedir,
    rewrite,
    check,
    tsBuildMode,
  }: EsbdServeConfig,
) {
  const entries = Array.isArray(config.entryPoints)
    ? config.entryPoints.map(entry => [entry, entry] as const)
    : Object.entries(config.entryPoints);

  let [buildOptions, allWriteOptions] = await getHtmlBuildOptions(entries, mode, config);

  if (allWriteOptions.length === 0) {
    logger.error('At least one HTML entry point is required for "serve" but none were found.');
    logger.debug(`Found ${entries.length} entry points:`);
    logger.debug(JSON.stringify(config.entryPoints, null, 2));
    process.exitCode = 1;
    return;
  }

  const publicPath = buildOptions.publicPath ?? '';
  const basedir = buildOptions.absWorkingDir;
  const absOutDir = path.resolve(basedir, buildOptions.outdir);

  const clients = new Set<ServerResponse>();
  const outputHashes = new Map<string, string>();

  let banner: string | undefined;
  let lrserver: Server | undefined;
  let notify: typeof notifyFn | undefined;
  if (livereload) {
    const { createLivereloadServer, notify: notifyLR } = await import(
      '@jgoz/esbuild-plugin-livereload'
    );
    const bannerTemplate = await fs.promises.readFile(
      require.resolve('@jgoz/esbuild-plugin-livereload/banner.js'),
      'utf-8',
    );
    banner = bannerTemplate.replace(/{baseUrl}/g, `http://${livereloadHost}:53099`);
    lrserver = createLivereloadServer({
      basedir,
      onSSE: res => clients.add(res),
      host: livereloadHost,
      port: 53099,
    });
    notify = notifyLR;
  }

  if (check) {
    const TypecheckRunner: typeof TypecheckRunnerCls =
      require('@jgoz/esbuild-plugin-typecheck').TypecheckRunner;

    const runner = new TypecheckRunner({
      absWorkingDir: buildOptions.absWorkingDir,
      build: tsBuildMode ? true : undefined,
      buildMode: tsBuildMode,
      configFile: config.tsconfig,
      logger,
      watch: true,
    });

    runner.logger.info('Type checking enabled');
    runner.start();
  }

  // TODO: watch HTML entry points
  const build = await incrementalBuild({
    ...buildOptions,
    banner: banner
      ? { ...config.banner, js: `${config.banner?.js ?? ''};${banner}` }
      : config.banner,
    cleanOutdir: config.cleanOutdir,
    copy: config.copy,
    incremental: true,
    logger,
    plugins: [...config.plugins, timingPlugin(logger, config.name && `"${config.name}"`)],
    watch: true,
    onBuildResult: async (result, options) => {
      if (!result.errors?.length) {
        // Re-parse the HTML files to pick up any changes to the template and because
        // the parse5 document is mutable, so successive builds may continue adding
        // new elements to the document incorrectly.
        [, allWriteOptions] = await getHtmlBuildOptions(entries, mode, config);

        await Promise.all([
          ...allWriteOptions.map(writeOptions =>
            writeTemplate(result, options, writeOptions, {
              copyFile: fs.promises.copyFile,
              writeFile: fs.promises.writeFile,
            }),
          ),
          ...result.outputFiles.map(async file => {
            await fs.promises.mkdir(path.dirname(file.path), { recursive: true });
            await fs.promises.writeFile(file.path, file.contents);
          }),
        ]);
      }

      if (livereload && notify) {
        let cssUpdate = false;
        for (const outputFile of result.outputFiles.filter(o => o.path.endsWith('.css'))) {
          const prevHash = outputHashes.get(outputFile.path);
          const hash = calculateHash(outputFile.contents);
          if (prevHash !== hash) {
            outputHashes.set(outputFile.path, hash);
            cssUpdate = true;
          }
        }
        notify('esbuild', { cssUpdate, errors: result.errors, warnings: result.warnings }, clients);
      }
    },
    onWatchEvent: events => {
      if (events.length === 1) {
        const [event, filePath] = events[0];
        logger.info(pc.gray(`${filePath} ${event}, rebuilding`));
      } else {
        logger.info(pc.gray(`${events.length} files changed, rebuilding`));
      }
    },
  });

  const outputHandler = serveStatic(absOutDir, { fallthrough: false });
  const servedirHandler = servedir ? serveStatic(servedir, { fallthrough: true }) : undefined;

  const staticHandler: ReturnType<typeof serveStatic> = servedirHandler
    ? (req, res, next) => servedirHandler(req, res, () => outputHandler(req, res, next))
    : (req, res, next) => outputHandler(req, res, next);

  const rootUrl = `http://${host}:${port}`;
  const server = createServer((req, res) => {
    if (!req.url) return;
    const url = new URL(req.url, rootUrl);

    async function handleRequest() {
      await build.wait();

      if (publicPath) {
        // Strip "publicPath" from the beginning of the URL because
        // serve-static doesn't support path remapping
        req.url = new URL(
          url.pathname.replace(new RegExp(`^${publicPath}`), ''),
          rootUrl,
        ).toString();
      }

      staticHandler(req, res, () => {
        if (rewrite) {
          // rewrite not-found requests to the index file if requested (SPA mode)
          // TODO: how do we handle multiple HTML files here?
          fs.createReadStream(path.resolve(absOutDir, allWriteOptions[0].template.outputPath)).pipe(
            res.setHeader('Content-Type', 'text/html'),
          );
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.write('404 Not Found\n');
        res.end();
      });
    }

    handleRequest().catch(err => {
      logger.error(err, err.stack);
      res.writeHead(500).write(err.toString());
    });
  });

  // https://github.com/nodejs/node/issues/40537
  dns.setDefaultResultOrder('ipv4first');

  server.listen(port, host, () => {
    const url = pc.cyan(`http://${host}:${port}`);
    logger.info(`Listening on ${url}`);
  });

  async function shutdown(exitCode = 0) {
    logger.info('Shutting down…');

    const shutdownPromises: Promise<void>[] = [];
    if (server) shutdownPromises.push(promisify(server.close)());
    if (lrserver) shutdownPromises.push(promisify(lrserver.close)());
    try {
      await Promise.all(shutdownPromises);
    } catch {
      // ignore errors on 'close'
    }

    if (build) build.stop?.();
    if (build) build.rebuild.dispose();
    clients.forEach(res => {
      res.end();
    });
    process.exitCode = exitCode;
  }

  Graceful.on('exit', () => shutdown());
}
