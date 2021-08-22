import { createLivereloadServer, notify } from '@jgoz/esbuild-plugin-livereload';
import { createHash } from 'crypto';
import fs from 'fs';
import { createServer, Server, ServerResponse } from 'http';
import K from 'kleur';
import Graceful from 'node-graceful';
import path from 'path';
import serveStatic from 'serve-static';
import { URL } from 'url';
import { promisify } from 'util';

import type { BuildMode, EsbdConfigWithPlugins } from './config';
import { getHtmlBuildOptions } from './get-build-options';
import { writeTemplate } from './html-entry-point/write-template';
import { incrementalBuild } from './incremental-build';
import { Logger } from './log';
import { timingPlugin } from './timing-plugin';

interface EsbdServeConfig {
  mode: BuildMode;
  host?: string;
  port?: number;
  livereload?: boolean;
  logger: Logger;
  servedir?: string;
  rewrite: boolean;
}

function calculateHash(contents: Uint8Array): string {
  const hash = createHash('md5');
  hash.update(contents);
  return hash.digest('base64');
}

export default async function esbdServe(
  [entryPath, entryName]: [string, string | undefined],
  config: EsbdConfigWithPlugins,
  { mode, host = '0.0.0.0', port = 8000, livereload, logger, servedir, rewrite }: EsbdServeConfig,
) {
  const [buildOptions, writeOptions] = await getHtmlBuildOptions(
    [entryPath, entryName],
    mode,
    config,
  );

  const publicPath = buildOptions.publicPath ?? '';
  const basedir = buildOptions.absWorkingDir;
  const absOutDir = path.resolve(basedir, buildOptions.outdir);

  const clients = new Set<ServerResponse>();
  const outputHashes = new Map<string, string>();

  let banner: string | undefined;
  let lrserver: Server | undefined;
  if (livereload) {
    const bannerTemplate = await fs.promises.readFile(
      require.resolve('@jgoz/esbuild-plugin-livereload/banner.js'),
      'utf-8',
    );
    banner = bannerTemplate.replace(/{baseUrl}/g, 'http://127.0.0.1:53099');
    lrserver = createLivereloadServer({ basedir, onSSE: res => clients.add(res), port: 53099 });
  }

  const build = await incrementalBuild({
    ...buildOptions,
    banner: banner
      ? { ...config.banner, js: `${config.banner?.js ?? ''};${banner}` }
      : config.banner,
    incremental: true,
    plugins: [...config.plugins, timingPlugin(logger)],
    watch: true,
    onBuildResult: async (result, options) => {
      await Promise.all([
        writeTemplate(result, options, writeOptions, {
          copyFile: fs.promises.copyFile,
          writeFile: fs.promises.writeFile,
        }),
        ...result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
      ]);

      if (livereload) {
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
    onWatchEvent: (event: string, filePath: string) => {
      logger.info(K.gray(`${filePath} ${event}, rebuilding`));
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

      if (
        url.pathname === '/' ||
        (url.pathname.startsWith(publicPath) && !!path.extname(url.pathname))
      ) {
        // serve static assets for index requests and for requests that have file extensions
        staticHandler(req, res, () => {
          res.writeHead(404).end();
        });
        return;
      }
      if (rewrite) {
        // rewrite extensionless requests to the index file if requested (SPA mode)
        fs.createReadStream(path.resolve(absOutDir, writeOptions.template.outputPath)).pipe(
          res.setHeader('Content-Type', 'text/html'),
        );
        return;
      }
    }

    handleRequest().catch(err => {
      logger.error(err, err.stack);
      res.writeHead(500).write(err.toString());
    });
  });

  server.listen(port, host, () => {
    const url = K.cyan(`http://${host}:${port}`);
    logger.info(`Listening on ${url}`);
  });

  async function shutdown(exitCode = 0) {
    logger.info('Shutting down…');

    await promisify(server.close)();
    if (lrserver) await promisify(lrserver.close)();
    if (build) build.stop?.();
    if (build) build.rebuild.dispose();
    clients.forEach(res => {
      res.end();
    });
    process.exitCode = exitCode;
  }

  Graceful.on('exit', () => shutdown());
}
