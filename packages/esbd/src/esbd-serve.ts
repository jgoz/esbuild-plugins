import type {
  clientMessageBuilder as clientMessageBuilderFn,
  LivereloadRequestHandler,
  notify as notifyFn,
} from '@jgoz/esbuild-plugin-livereload';
import type { TypecheckRunner as TypecheckRunnerCls } from '@jgoz/esbuild-plugin-typecheck';
import dns from 'node:dns';
import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import Graceful from 'node-graceful';
import pc from 'picocolors';
import serveStatic from 'serve-static';

import type { BuildMode, ResolvedEsbdConfig, TsBuildMode } from './config';
import { getHtmlBuildOptions } from './get-build-options';
import { createElement } from './html-entry-point/html-utils';
import type { TextNode } from './html-entry-point/parse5';
import type { WriteTemplateOptions } from './html-entry-point/write-template';
import { writeTemplate } from './html-entry-point/write-template';
import { incrementalBuild } from './incremental-build';
import type { Logger } from './log';
import { timingPlugin } from './timing-plugin';

interface EsbdServeConfig {
  check?: boolean;
  host?: string;
  livereload?: boolean;
  logger: Logger;
  mode: BuildMode;
  port?: number;
  rewrite: boolean;
  servedir?: string;
  tsBuildMode?: TsBuildMode;
}

function appendLivereloadScripts(writeOptions: WriteTemplateOptions, baseUrl: string): void {
  const { head } = writeOptions.template;

  const windowScript = createElement(head, 'script', [{ name: 'type', value: 'text/javascript' }]);
  const scriptContent: TextNode = {
    nodeName: '#text',
    parentNode: windowScript,
    value: `window.__ESBUILD_LR_PLUGIN__ = '${baseUrl}'`,
  };

  windowScript.childNodes.push(scriptContent);
  head.childNodes.push(windowScript);

  head.childNodes.push(
    createElement(head, 'script', [
      { name: 'src', value: `${baseUrl}livereload-event-source.js` },
      { name: 'type', value: 'module' },
    ]),
  );
}

export default async function esbdServe(
  config: ResolvedEsbdConfig,
  {
    mode,
    host = '127.0.0.1',
    port = 8000,
    livereload,
    logger,
    servedir,
    rewrite,
    check,
    tsBuildMode,
  }: EsbdServeConfig,
) {
  const entries = Array.isArray(config.entryPoints)
    ? config.entryPoints.map(entry =>
        typeof entry === 'object' ? ([entry.out, entry.in] as const) : ([entry, entry] as const),
      )
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

  const livereloadBaseUrl = `//${host}:${port}/`;
  let lrHandler: LivereloadRequestHandler | undefined;
  let notify: typeof notifyFn | undefined;
  let messageBuilder: ReturnType<typeof clientMessageBuilderFn> | undefined;
  if (livereload) {
    const {
      clientMessageBuilder,
      createLivereloadRequestHandler,
      notify: notifyLR,
    } = await import('@jgoz/esbuild-plugin-livereload');

    lrHandler = await createLivereloadRequestHandler({
      basedir,
      host,
      port,
      onSSE: res => clients.add(res),
    });
    notify = notifyLR;
    messageBuilder = clientMessageBuilder(buildOptions);
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
  const context = await incrementalBuild({
    ...buildOptions,
    banner: config.banner,
    cleanOutdir: config.cleanOutdir,
    copy: config.copy,
    logger,
    plugins: [...config.plugins, timingPlugin(logger, config.name && `"${config.name}"`)],
    onBuildStart: ({ buildCount }) => {
      if (buildCount >= 1) {
        logger.info(pc.gray(`Source files changed, rebuilding`));
      }
    },
    onBuildEnd: async (result, options) => {
      if (!result.errors?.length) {
        // Re-parse the HTML files to pick up any changes to the template and because
        // the parse5 document is mutable, so successive builds may continue adding
        // new elements to the document incorrectly.
        [, allWriteOptions] = await getHtmlBuildOptions(entries, mode, config);

        await Promise.all([
          ...allWriteOptions.map(writeOptions => {
            if (livereload) appendLivereloadScripts(writeOptions, livereloadBaseUrl);
            return writeTemplate(result, options, writeOptions, {
              copyFile: fs.promises.copyFile,
              writeFile: fs.promises.writeFile,
            });
          }),
          ...result.outputFiles.map(async file => {
            await fs.promises.mkdir(path.dirname(file.path), { recursive: true });
            await fs.promises.writeFile(file.path, file.contents);
          }),
        ]);
      }

      if (livereload && notify && messageBuilder) {
        const message = await messageBuilder(result);
        notify('esbuild', message, clients);
      }
    },
  });

  const setHeaders: serveStatic.ServeStaticOptions['setHeaders'] = (res, path) => {
    if (res.hasHeader('content-type')) return;

    const contentType = serveStatic.mime.lookup(path);
    if (contentType) res.setHeader('content-type', contentType);

    res.setHeader('access-control-allow-origin', '*');
  };

  const outputHandler = serveStatic(absOutDir, { fallthrough: false, setHeaders });
  const servedirHandler = servedir
    ? serveStatic(servedir, { fallthrough: true, setHeaders })
    : undefined;

  const staticHandler: ReturnType<typeof serveStatic> = servedirHandler
    ? (req, res, next) => servedirHandler(req, res, () => outputHandler(req, res, next))
    : (req, res, next) => outputHandler(req, res, next);

  const rootUrl = `http://${host}:${port}`;
  const server = createServer((req, res) => {
    if (!req.url) return;
    const url = new URL(req.url, rootUrl);

    async function handleRequest() {
      await context.wait();

      let normalizedUrl = url;
      if (publicPath) {
        // Strip "publicPath" from the beginning of the URL because
        // serve-static doesn't support path remapping
        normalizedUrl = new URL(url.pathname.replace(new RegExp(`^${publicPath}`), ''), rootUrl);
        req.url = normalizedUrl.toString();
      }

      staticHandler(req, res, () => {
        // If requested, rewrite not-found requests to the best index file based on the longest
        // matching patch segment between the request URL and the template output file (SPA mode)
        if (rewrite) {
          let templateOutputPath: string | undefined;
          if (allWriteOptions.length === 1) {
            templateOutputPath = allWriteOptions[0].template.outputPath;
          } else {
            const pathParts = normalizedUrl.pathname.replace(/^\//, '').split('/');
            const templateSegmentMatchLength: Record<string, number> = {};

            for (const { template } of allWriteOptions) {
              const templatePathParts = template.outputPath.replace(/^[\\/]/, '').split(path.sep);
              for (let i = 0; i < templatePathParts.length; i++) {
                if (templatePathParts[i] === pathParts[i]) {
                  templateSegmentMatchLength[template.outputPath] = i;
                } else {
                  break;
                }
              }
            }

            const bestMatch = Object.entries(templateSegmentMatchLength).sort(
              ([, a], [, b]) => b - a,
            )[0];

            if (bestMatch) {
              logger.debug(`Best match for ${url.pathname}: ${bestMatch[0]}`);
            }

            templateOutputPath = bestMatch?.[0] ?? allWriteOptions[0].template.outputPath;
          }

          logger.debug(`Rewriting ${url.pathname} to ${templateOutputPath}`);

          fs.createReadStream(path.resolve(absOutDir, templateOutputPath)).pipe(
            res.setHeader('Content-Type', 'text/html'),
          );
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.write('404 Not Found\n');
        res.end();
      });
    }

    const handled = lrHandler?.(req, res) ?? false;
    if (!handled) {
      handleRequest().catch(err => {
        logger.error(err, err.stack);
        res.writeHead(500).write(err.toString());
      });
    }
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
    try {
      await Promise.all(shutdownPromises);
    } catch {
      // ignore errors on 'close'
    }

    if (context) await context.dispose();
    clients.forEach(res => {
      res.end();
    });
    process.exitCode = exitCode;
  }

  Graceful.on('exit', () => shutdown());

  await context.watch();
}
