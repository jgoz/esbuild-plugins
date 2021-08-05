import { watch } from 'chokidar';
import { build, BuildOptions, BuildResult, Plugin } from 'esbuild';
import { EventEmitter } from 'events';
import fastify from 'fastify';
import K from 'kleur';
import { createFsFromVolume, Volume } from 'memfs';
import path from 'path';
import { FileSystemStorage, GenericFSModule } from 'send-stream';

import type { BuildMode, EsbdConfig } from './config';
import { readTemplate } from './html-entry-point';
import { writeTemplate } from './html-entry-point/write-template';
import { logger, TimedSpinner } from './log';

function timingPlugin(): Plugin {
  let spinner: TimedSpinner;
  return {
    name: 'timing',
    setup(build) {
      build.onStart(() => {
        spinner = logger.spin('Building…');
      });
      build.onEnd(result => {
        const [time] = spinner.stop();
        const numErrors = result.errors.length;
        const numWarnings = result.warnings.length;
        const log = numErrors ? logger.error : numWarnings ? logger.warn : logger.success;
        log(
          `Finished with ${K.white(numErrors)} error(s) and ${K.white(
            numWarnings,
          )} warning(s) in ${K.gray(time)}`,
        );
      });
    },
  };
}

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

  const watchedInputs = new Set<string>();
  const watchedModules = new Set<string>();

  const inputWatcher = watch([], {
    cwd: basedir,
    disableGlobbing: true,
    ignored: ['**/node_modules/**'],
  });

  const moduleWatcher = watch([], {
    cwd: basedir,
    depth: 2,
    disableGlobbing: true,
    interval: 2000,
    usePolling: true,
  });

  const evt = new EventEmitter();
  let running = false;

  function waitForBuildToFinish(): Promise<void> {
    if (!running) return Promise.resolve();
    return new Promise(resolve => {
      evt.once('end', resolve);
    });
  }

  const esbPlugin: Plugin = {
    name: 'esb-internal-plugin',
    setup: build => {
      build.onStart(() => {
        running = true;
      });
      build.onEnd(result => {
        const inputs = Object.keys(result.metafile!.inputs);

        const addedInputs = new Set<string>();
        const addedModules = new Set<string>();
        const removedInputs: string[] = [];
        const removedModules: string[] = [];

        for (const input of inputs) {
          const index = input.indexOf('node_modules');
          if (index >= 0) {
            const mod = input.slice(0, index + 'node_modules'.length);
            if (!watchedModules.has(mod)) addedModules.add(mod);
          } else {
            if (!watchedInputs.has(input)) addedInputs.add(input);
          }
        }

        watchedInputs.forEach(input => {
          if (!addedInputs.has(input)) removedInputs.push(input);
        });
        watchedModules.forEach(mod => {
          if (!addedModules.has(mod)) removedModules.push(mod);
        });

        inputWatcher.unwatch(removedInputs);
        moduleWatcher.unwatch(removedModules);

        inputWatcher.add(Array.from(addedInputs));
        moduleWatcher.add(Array.from(addedModules));

        evt.emit('end');
        running = false;
      });
    },
  };

  const [entryPoints, writeOptions] = await readTemplate(absEntryPath, {
    basedir,
    define,
    ignoreAssets: config.ignoreAssets,
    integrity: config.integrity,
  });

  const buildOptions: BuildOptions & { write: false } = {
    ...config.esbuild,
    absWorkingDir: basedir,
    bundle: config.esbuild?.bundle ?? true,
    entryPoints,
    format: config.esbuild?.format ?? 'esm',
    incremental: true,
    inject: config.esbuild?.inject,
    minify: mode === 'production',
    outdir,
    plugins: [esbPlugin, ...(config.esbuild?.plugins ?? []), timingPlugin()],
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

  const result = await build(buildOptions);

  await Promise.all(
    result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
  );

  await writeHTMLOutput(result);

  function onWatchEvent(event: string, path: string) {
    if (running) return;
    logger.info(K.gray(`${path} ${event}, rebuilding`));
    result.rebuild!()
      .then(writeHTMLOutput)
      .catch(e => {
        console.error(e);
      });
  }

  inputWatcher.on('all', onWatchEvent);
  moduleWatcher.on('change', path => onWatchEvent('change', path));

  const app = fastify({ exposeHeadRoutes: true });

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

  app.addHook('onRequest', (_req, _reply, done) => {
    waitForBuildToFinish()
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
