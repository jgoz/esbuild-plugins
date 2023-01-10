import type { TypecheckRunner as TypecheckRunnerCls } from '@jgoz/esbuild-plugin-typecheck';
import type { ChildProcess } from 'child_process';
import type { ExecaChildPromise } from 'execa';
import { node as execaNode } from 'execa';
import fs from 'fs';
import Graceful from 'node-graceful';
import path from 'path';
import pc from 'picocolors';

import type { BuildMode, ResolvedEsbdConfig, TsBuildMode } from './config';
import { getBuildOptions } from './get-build-options';
import { incrementalBuild } from './incremental-build';
import type { Logger } from './log';
import { splitArgsString } from './split-args-string';
import { timingPlugin } from './timing-plugin';

interface EsbdNodeDevConfig {
  args: string[];
  logger: Logger;
  mode: BuildMode;
  respawn?: boolean;
  check?: boolean;
  tsBuildMode?: TsBuildMode;
}

const MAX_RETRIES = 3;
const KEEPALIVE_RESET_TIMEOUT_MS = 5000;

export default async function esbdNodeDev(
  config: ResolvedEsbdConfig,
  { args, logger, mode, respawn, check, tsBuildMode }: EsbdNodeDevConfig,
) {
  let child: ChildProcess & ExecaChildPromise<string>;
  let keepAliveCount = 0;
  let keepAliveResetTimeout: NodeJS.Timeout;
  let running = false;

  const entries = Array.isArray(config.entryPoints)
    ? config.entryPoints.map(entry => [entry, entry] as const)
    : Object.entries(config.entryPoints);

  const buildOptions = getBuildOptions(entries, mode, config);
  const basedir = buildOptions.absWorkingDir;
  const defaultTarget = `node${process.versions.node}`;

  async function handleExit(exitCode = 0) {
    running = false;
    clearTimeout(keepAliveResetTimeout);

    if (!respawn) {
      shutdown(exitCode);
      return;
    }

    if (++keepAliveCount === MAX_RETRIES) {
      logger.error('Maximum keep-alive count reached, dying');
      shutdown(1);
      return;
    }

    logger.info('Keep-alive requested, rebuilding and restarting');
    await build.rebuild();

    keepAliveResetTimeout = setTimeout(() => {
      keepAliveCount = 0;
    }, KEEPALIVE_RESET_TIMEOUT_MS);
  }

  function runProgram(scriptPath: string, argv: string[]) {
    const NODE_OPTIONS = splitArgsString(process.env.NODE_OPTIONS ?? '');

    child = execaNode(scriptPath, argv, {
      nodeOptions: ['--enable-source-maps', ...NODE_OPTIONS],
      stdio: 'inherit',
    });

    child.once('exit', exitCode => {
      child.removeAllListeners();
      if (exitCode) logger.error(`Program exited with code ${exitCode}`);
      void handleExit(exitCode ?? 0);
    });

    child.once('error', err => {
      child.removeAllListeners();
      logger.error('Uncaught program error', err.toString(), err.stack);
      void handleExit(1);
    });

    child.once('spawn', () => {
      running = true;
    });
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

  const build = await incrementalBuild({
    ...buildOptions,
    cleanOutdir: config.cleanOutdir,
    incremental: true,
    logger,
    minify: mode === 'production',
    plugins: [...config.plugins, timingPlugin(logger, config.name && `"${config.name}"`)],
    platform: 'node',
    target: config.target ?? defaultTarget,
    watch: true,
    onBuildResult: async result => {
      if (result.errors?.length) {
        logger.info(`Not starting program due to ${result.errors.length} error(s)`);
        return;
      }

      const entryOutputPath = Object.keys(result.metafile.outputs).find(
        out => result.metafile.outputs[out].entryPoint,
      );
      const absOutputPath = entryOutputPath && path.resolve(basedir, entryOutputPath);
      const entryOutputFile =
        absOutputPath && result.outputFiles.find(outputFile => outputFile.path === absOutputPath);

      if (!entryOutputFile) throw new Error('Unable to find entry point script');

      await Promise.all(
        result.outputFiles.map(async file => {
          await fs.promises.mkdir(path.dirname(file.path), { recursive: true });
          await fs.promises.writeFile(file.path, file.contents);
        }),
      );

      logger.info(`Starting ${pc.cyan(entryOutputFile.path)} ${pc.gray(args.join(' '))}`);
      runProgram(entryOutputFile.path, args);
    },
    onWatchEvent: async events => {
      if (events.length === 1) {
        const [event, filePath] = events[0];
        logger.info(pc.gray(`${filePath} ${event}, rebuilding`));
      } else {
        logger.info(pc.gray(`${events.length} files changed, rebuilding`));
      }
      child.removeAllListeners();
      if (running) {
        await new Promise<void>((resolve, reject) => {
          child.on('exit', resolve);
          child.on('error', reject);
          child.cancel();
        });
        running = false;
      }
    },
  });

  function shutdown(exitCode = 0) {
    logger.info('Shutting down…');
    if (child) child.cancel();
    if (build) build.stop?.();
    if (build) build.rebuild.dispose();
    process.exitCode = exitCode;
  }

  Graceful.on('exit', () => shutdown());
}
