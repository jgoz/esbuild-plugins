import type { BuildContext, BuildOptions, BuildResult, Plugin } from 'esbuild';
import { context as createContext } from 'esbuild';
import { EventEmitter } from 'events';
import { watch as fsWatch } from 'fs';
import { copyFile, rm } from 'fs/promises';
import mkdirp from 'mkdirp';
import path from 'path';
import pc from 'picocolors';

import type { Logger } from './log';

type RequiredBuildOptions = BuildOptions & { metafile: true; write: false };

export type IncrementalBuildResult = BuildResult<RequiredBuildOptions>;

export type WatchEvent = [event: string, path: string];

interface IncrementalBuildOptions extends RequiredBuildOptions {
  absWorkingDir: string;
  cleanOutdir?: boolean;
  copy?: [from: string, to?: string][];
  logger: Logger;
  onBuildStart?: (options: RequiredBuildOptions & { buildCount: number }) => Promise<void> | void;
  onBuildEnd: (
    result: IncrementalBuildResult,
    options: RequiredBuildOptions,
  ) => Promise<void> | void;
}

interface IncrementalBuildContext extends BuildContext<RequiredBuildOptions> {
  watch(): Promise<void>;
  wait(): Promise<void>;
}

async function syncOutputs(
  result: IncrementalBuildResult,
  previousOutputs: Set<string>,
  logger: Logger,
): Promise<Set<string>> {
  const outputFiles = new Set(result.outputFiles.map(file => file.path));
  const staleOutputs = Array.from(previousOutputs.values()).filter(file => !outputFiles.has(file));
  await Promise.allSettled(
    staleOutputs.map(async file => {
      logger.debug(pc.gray(`Removing stale output ${file}`));
      try {
        await rm(file);
      } catch {
        logger.debug(pc.gray(`Failed to remove stale output ${file}; ignoring`));
      }
    }),
  );
  return outputFiles;
}

export async function incrementalBuild({
  cleanOutdir,
  copy,
  logger,
  onBuildEnd,
  onBuildStart,
  ...options
}: IncrementalBuildOptions): Promise<IncrementalBuildContext> {
  let running = false;

  const basedir = options.absWorkingDir;
  const evt = new EventEmitter();
  const outdir = options.outdir;
  const absOutDir = outdir ? path.resolve(basedir, outdir) : undefined;
  let previousOutputs = new Set<string>();

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

  const resultPlugin: Plugin = {
    name: 'incremental-build',
    setup(build) {
      let buildCount = 0;
      build.onStart(async () => {
        logger.debug('Starting build');
        if (onBuildStart) await onBuildStart({ ...options, buildCount: buildCount++ });
        running = true;
      });

      build.onEnd(async result => {
        if (!result.errors.length) {
          logger.debug('Build successful');
          if (absOutDir) await mkdirp(absOutDir);
          if (cleanOutdir) {
            previousOutputs = await syncOutputs(result, previousOutputs, logger);
          }
          await copyAssets();
        } else {
          logger.debug('Build failed');
        }

        await onBuildEnd(result, options);

        running = false;
        evt.emit('end');
      });
    },
  };

  const context = await createContext({
    ...options,
    logLevel: logger.logLevel === 'info' ? 'warning' : options.logLevel,
    plugins: [resultPlugin, ...(options.plugins ?? [])],
  });

  const watchAbort = new AbortController();

  async function dispose(): Promise<void> {
    await context.dispose();
    watchAbort.abort();
  }

  async function watch(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- esbuild types are wrong; watch() returns a Promise<void>
    await context.watch();

    for (const [from] of normalizedCopy) {
      fsWatch(from, { persistent: false, signal: watchAbort.signal }, event => {
        if (event === 'change') {
          copyAssets(from).catch(logger.error);
        }
      });
    }
  }

  function wait(): Promise<void> {
    if (!running) return Promise.resolve();
    return new Promise(resolve => {
      evt.once('end', resolve);
    });
  }

  if (cleanOutdir && absOutDir) {
    await rm(absOutDir, { recursive: true, force: true });
  }

  return { ...context, dispose, wait, watch };
}
