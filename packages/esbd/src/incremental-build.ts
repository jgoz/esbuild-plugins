import { watch } from 'chokidar';
import type { BuildContext, BuildOptions, BuildResult, Metafile } from 'esbuild';
import { context as createContext } from 'esbuild';
import { EventEmitter } from 'events';
import { copyFile, rm } from 'fs/promises';
import mkdirp from 'mkdirp';
import path from 'path';
import pc from 'picocolors';

import type { Logger } from './log';

type RequiredBuildOptions = BuildOptions & { metafile: true; write: false };

export type IncrementalBuildResult = BuildResult<RequiredBuildOptions>;

function validateResult(result: BuildResult): asserts result is IncrementalBuildResult {
  if (!result.metafile) throw new Error('incrementalBuild: "metafile" option must be "true"');
  if (!result.outputFiles) throw new Error('incrementalBuild: "write" option must be "false"');
}

export type WatchEvent = [event: string, path: string];

interface IncrementalBuildOptions extends RequiredBuildOptions {
  absWorkingDir: string;
  cleanOutdir?: boolean;
  copy?: [from: string, to?: string][];
  logger: Logger;
  onBuildResult: (
    result: IncrementalBuildResult,
    options: RequiredBuildOptions,
  ) => Promise<void> | void;
  onWatchEvent: (events: WatchEvent[]) => Promise<void> | void;
  watch?: boolean;
}

interface IncrementalBuildContext extends BuildContext<RequiredBuildOptions> {
  wait(): Promise<void>;
}

const NULL_RESULT: IncrementalBuildResult = {
  errors: [],
  warnings: [],
  mangleCache: undefined,
  metafile: { inputs: {}, outputs: {} },
  outputFiles: [],
};

const MODULE_WATCH_IGNORE = [/[/\\]\.git[/\\]/, /\.tsbuildinfo$/, /\.d.ts$/, /\.map$/];
const INPUT_WATCH_IGNORE = MODULE_WATCH_IGNORE.concat(/[/\\]node_modules[/\\]/);

const NODE_MODULES_LEN = 'node_modules'.length;

function createThrottled<T>(fn: (args: T[]) => any, delay: number) {
  let timeout: NodeJS.Timeout | null = null;
  let queuedArgs: T[] = [];

  return (arg: T) => {
    if (!timeout) {
      timeout = setTimeout(() => {
        const argsToCall = queuedArgs.slice();
        timeout = null;
        queuedArgs = [];
        fn(argsToCall);
      }, delay);
    }
    queuedArgs.push(arg);
  };
}

export async function incrementalBuild({
  cleanOutdir,
  copy,
  logger,
  onBuildResult,
  onWatchEvent,
  watch: watchForChanges,
  ...options
}: IncrementalBuildOptions): Promise<IncrementalBuildContext> {
  let running = false;

  const basedir = options.absWorkingDir;
  const evt = new EventEmitter();
  const watchedInputs = new Set<string>();
  const watchedModules = new Set<string>();
  const outdir = options.outdir;
  const absOutDir = outdir ? path.resolve(basedir, outdir) : undefined;

  const normalizedCopy: [string, string][] = [];
  if (copy) {
    if (!absOutDir) {
      logger.warn('"outdir" is required when "copy" is provided');
    } else {
      for (const [from, to] of copy) {
        normalizedCopy.push([
          path.resolve(basedir, from),
          path.resolve(absOutDir, to ?? (path.isAbsolute(from) ? path.basename(from) : from)),
        ]);
      }
    }
  }

  const inputWatcher = watch([], {
    cwd: basedir,
    disableGlobbing: true,
    ignored: INPUT_WATCH_IGNORE,
    ignoreInitial: true,
  });

  const moduleWatcher = watch([], {
    cwd: basedir,
    depth: 2,
    disableGlobbing: true,
    ignored: MODULE_WATCH_IGNORE,
    ignoreInitial: true,
    interval: 2000,
    usePolling: true,
  });

  const assetWatcher = watch([], {
    disableGlobbing: true,
    ignoreInitial: true,
  });

  const context = await createContext(options);

  function copyAssets(fromPath?: string) {
    return Promise.all(
      normalizedCopy
        .filter(([from]) => !fromPath || fromPath === from)
        .map(([from, to]) => {
          logger.info(pc.gray(`Copying ${from} to ${to}`));
          return copyFile(from, to);
        }),
    );
  }

  async function triggerBuild(): Promise<IncrementalBuildResult> {
    let result: IncrementalBuildResult;
    try {
      logger.debug('Starting build');
      result = await context.rebuild();
      validateResult(result);
      if (absOutDir) await mkdirp(absOutDir);
      await copyAssets();
      await onBuildResult(result, options);

      logger.debug('Build successful');
      if (watchForChanges) {
        updateWatchedFiles(result.metafile);
      }

      return result;
    } catch (e) {
      logger.debug('Build failed', e);
      result = {
        ...NULL_RESULT,
        errors: (e as any).errors ?? [],
        warnings: (e as any).warnings ?? [],
      };
      validateResult(result);
      await onBuildResult(result, options);

      if (!watchForChanges) {
        throw e;
      }
      return result;
    } finally {
      evt.emit('end');
    }
  }

  async function dispose() {
    await context.dispose();
    await inputWatcher.close();
    await moduleWatcher.close();
    await assetWatcher.close();
  }

  function updateWatchedFiles(metafile: Metafile): void {
    const nextInputs = new Set<string>();
    const nextModules = new Set<string>();
    const inputs = Object.keys(metafile.inputs);
    for (const inputKey of inputs) {
      const input = inputKey.includes(':') ? inputKey.split(':')[1] : inputKey;

      const index = input.indexOf('node_modules');
      if (index >= 0) {
        // For paths in node_modules, we don't want to watch each file individually,
        // so try to find the first level of depth after the first "node_modules/".
        // E.g., "../node_modules/some-library/"

        let modIndex = input.indexOf('/', index + NODE_MODULES_LEN + 1);

        if (modIndex > 0) {
          if (input[index + NODE_MODULES_LEN + 1] === '@') {
            // Descend into scoped modules to avoid watching the entire scope
            modIndex = input.indexOf('/', modIndex + 1);
          }

          const mod = input.slice(0, modIndex);
          nextModules.add(mod);
        }
      } else {
        // For source files, watch each file individually
        nextInputs.add(input);
      }
    }

    for (const addedInput of nextInputs) {
      if (!watchedInputs.has(addedInput)) {
        logger.debug(`Watching ${addedInput}`);
        inputWatcher.add(addedInput);
        watchedInputs.add(addedInput);
      }
    }
    for (const deletedInput of watchedInputs) {
      if (!nextInputs.has(deletedInput)) {
        logger.debug(`Un-watching ${deletedInput}`);
        inputWatcher.unwatch(deletedInput);
        watchedInputs.delete(deletedInput);
      }
    }
    for (const addedModule of nextModules) {
      if (!watchedModules.has(addedModule)) {
        logger.debug(`Watching ${addedModule}`);
        moduleWatcher.add(addedModule);
        watchedModules.add(addedModule);
      }
    }
    for (const deletedModule of watchedModules) {
      if (!nextModules.has(deletedModule)) {
        logger.debug(`Un-watching ${deletedModule}`);
        moduleWatcher.unwatch(deletedModule);
        watchedModules.delete(deletedModule);
      }
    }
    logger.debug('Updated watched files');
  }

  function wait(): Promise<void> {
    if (!running) return Promise.resolve();
    return new Promise(resolve => {
      evt.once('end', resolve);
    });
  }

  const throttledBuild = createThrottled((watchEvents: WatchEvent[]) => {
    running = true;
    Promise.resolve(onWatchEvent(watchEvents))
      .then(triggerBuild)
      .catch(logger.error)
      .finally(() => {
        running = false;
      });
  }, 25);

  function triggerBuildOrQueue(watchEvent: WatchEvent) {
    wait()
      .then(() => throttledBuild(watchEvent))
      .catch(logger.error);
  }

  function onInputEvent(event: string, path: string) {
    if (INPUT_WATCH_IGNORE.some(re => re.test(path))) return;
    triggerBuildOrQueue([event, path]);
  }

  function onModuleEvent(path: string) {
    if (MODULE_WATCH_IGNORE.some(re => re.test(path))) return;
    triggerBuildOrQueue(['change', path]);
  }

  function onAssetEvent(event: string, path: string) {
    if (event === 'unlink') {
      assetWatcher.unwatch(path);
      return;
    }
    if (event === 'add') {
      assetWatcher.add(path);
    }
    copyAssets(path).catch(logger.error);
  }

  if (cleanOutdir && absOutDir) {
    await rm(absOutDir, { recursive: true, force: true });
  }

  if (watchForChanges) {
    assetWatcher.add(normalizedCopy.map(([from]) => from));

    inputWatcher.on('all', onInputEvent);
    moduleWatcher.on('change', onModuleEvent);
    assetWatcher.on('all', onAssetEvent);

    const inputCount = Object.keys(inputWatcher.getWatched()).length;
    const modCount = Object.keys(moduleWatcher.getWatched()).length;
    logger.debug(`Started watching for changes (${inputCount} inputs, ${modCount} modules)`);
  }

  return { ...context, rebuild: triggerBuild, dispose, wait };
}
