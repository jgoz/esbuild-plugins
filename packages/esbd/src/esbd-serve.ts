import { build, BuildOptions, BuildResult } from 'esbuild';
import fastify from 'fastify';
import K from 'kleur';
import { createFsFromVolume, Volume } from 'memfs';
import path from 'path';
import { FileSystemStorage, GenericFSModule } from 'send-stream';

import type { BuildMode, EsbdConfig } from './config';
import { readTemplate } from './html-entry-point';
import { writeTemplate } from './html-entry-point/write-template';
import { incrementalBuilder } from './incremental-builder';
import { logger } from './log';
import { timingPlugin } from './timing-plugin';

interface EsbdServeConfig {
  mode: BuildMode;
  host?: string;
  port?: number;
  servedir?: string;
  rewrite: boolean;
}

export default async function esbServe(
  entry: string,
  { mode, host = '0.0.0.0', port = 8000, servedir, rewrite }: EsbdServeConfig,
  config: EsbdConfig,
) {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);

  // Not required for "serve" because we're writing to memory
  const outdir = config.esbuild?.outdir ?? '/';
  const publicPath = config.esbuild?.publicPath ?? '';

  const absEntryPath = path.resolve(config.basedir ?? process.cwd(), entry);
  const basedir = config.basedir ?? path.dirname(absEntryPath);

  const esbuildDefine = config.esbuild?.define ?? {};
  const define: Record<string, any> = {};
  for (const key of Object.keys(esbuildDefine)) {
    const value = esbuildDefine[key];
    if (typeof value === 'string') {
      try {
        define[key] = JSON.parse(value);
      } catch {
        define[key] = value;
      }
    } else {
      define[key] = value;
    }
  }

  const [entryPoints, writeOptions] = await readTemplate(absEntryPath, {
    basedir,
    define,
    ignoreAssets: config.ignoreAssets,
    integrity: config.integrity,
  });

  const buildOptions: BuildOptions & { incremental: true } = {
    ...config.esbuild,
    absWorkingDir: basedir,
    bundle: config.esbuild?.bundle ?? true,
    entryPoints,
    format: config.esbuild?.format ?? 'esm',
    incremental: true,
    inject: config.esbuild?.inject,
    minify: mode === 'production',
    outdir,
    plugins: [...(config.esbuild?.plugins ?? []), timingPlugin()],
    metafile: true,
    publicPath,
    target: config.esbuild?.target ?? 'es2017',
    sourcemap: config.esbuild?.sourcemap ?? (mode === 'development' ? 'inline' : undefined),
    write: false,
    watch: false,
  };

  function writeHTMLOutput(buildResult: BuildResult) {
    return writeTemplate(buildResult, buildOptions, writeOptions, {
      copyFile: fs.promises.copyFile,
      writeFile: fs.promises.writeFile as any,
    });
  }

  const incremental = incrementalBuilder({
    basedir,
    onBuildResult: async result => {
      if (!result.outputFiles) throw new Error('"write" option must be "false"');

      const writeAllOutput = result.outputFiles
        .map(file => fs.promises.writeFile(file.path, file.contents))
        .concat(writeHTMLOutput(result));

      await Promise.all(writeAllOutput);
    },
    onWatchEvent: (event: string, path: string) => {
      logger.info(K.gray(`${path} ${event}, rebuilding`));
    },
  });

  await incremental.build(() => build(buildOptions));

  const buildOutput = new FileSystemStorage(outdir, {
    dynamicCompression: true,
    fsModule: fs as unknown as GenericFSModule<number>,
    onDirectory: 'serve-index',
    weakEtags: true,
  });

  const fallback = servedir
    ? new FileSystemStorage(servedir, {
        dynamicCompression: true,
        onDirectory: 'serve-index',
        weakEtags: true,
      })
    : undefined;

  const route = publicPath
    ? `${publicPath.endsWith('/') ? publicPath.slice(0, -1) : publicPath}/*`
    : '*';

  const app = fastify({ exposeHeadRoutes: true });

  app.addHook('onRequest', (_req, _reply, done) => {
    incremental
      .wait()
      .then(() => done())
      .catch(err => done(err));
  });

  app.get(route, async (request, reply) => {
    let result = await buildOutput.prepareResponse(request.url, request.raw);
    if (result.statusCode === 404 && fallback) {
      result = await fallback.prepareResponse(request.url, request.raw);
    }
    if (result.statusCode === 404) {
      if (rewrite) {
        await buildOutput.send('/index.html', request.raw, reply.raw);
      } else {
        reply.callNotFound();
      }
      return;
    }
    await result.send(reply.raw);
  });

  app
    .listen(port, host)
    .then(() => {
      const url = K.cyan(`http://${host}:${port}`);
      logger.info(`Listening on ${url}`);
    })
    .catch(err => {
      logger.error(err);
    });
}
