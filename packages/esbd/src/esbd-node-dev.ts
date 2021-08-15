import type { ChildProcess } from 'child_process';
import { ExecaChildPromise, node } from 'execa';
import fs from 'fs';
import K from 'kleur';
import Graceful from 'node-graceful';
import path from 'path';

import { BuildMode, EsbdConfigWithPlugins } from './config';
import { getBuildOptions } from './get-build-options';
import { incrementalBuild } from './incremental-build';
import { Logger } from './log';
import { timingPlugin } from './timing-plugin';

interface EsbdNodeDevConfig {
  args: string[];
  logger: Logger;
  mode: BuildMode;
  respawn?: boolean;
}

const MAX_RETRIES = 3;

export default async function esbdNodeDev(
  [entryPath, entryName]: [entryPath: string, entryName: string | undefined],
  config: EsbdConfigWithPlugins,
  { args, logger, mode, respawn }: EsbdNodeDevConfig,
) {
  let child: ChildProcess & ExecaChildPromise<string>;
  let keepAliveCount = 0;
  let keepAliveTimeout: NodeJS.Timeout;

  const buildOptions = getBuildOptions([entryPath, entryName], mode, config);
  const basedir = buildOptions.absWorkingDir;
  const defaultTarget = `node${process.versions.node}`;

  async function handleExit(exitCode = 0) {
    clearTimeout(keepAliveTimeout);

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

    keepAliveTimeout = setTimeout(() => {
      keepAliveCount = 0;
    }, 5000);
  }

  function runProgram(scriptPath: string, argv: string[]) {
    child = node(scriptPath, argv, {
      nodeOptions: ['--enable-source-maps'],
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
      void handleExit();
    });
  }

  const build = await incrementalBuild({
    ...buildOptions,
    incremental: true,
    minify: mode === 'production',
    plugins: [...config.plugins, timingPlugin(logger)],
    platform: 'node',
    target: config.target ?? defaultTarget,
    watch: false,
    onBuildResult: async result => {
      const entryOutputPath = Object.keys(result.metafile.outputs).find(
        out => result.metafile.outputs[out].entryPoint,
      );
      const absOutputPath = entryOutputPath && path.resolve(basedir, entryOutputPath);
      const entryOutputFile =
        absOutputPath && result.outputFiles.find(outputFile => outputFile.path === absOutputPath);

      if (!entryOutputFile) throw new Error('Unable to find entry point script');

      await Promise.all(
        result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
      );

      logger.info(`Starting ${K.cyan(entryOutputFile.path)} ${K.gray(args.slice(1).join(' '))}`);
      runProgram(entryOutputFile.path, args);
    },
    onWatchEvent: (event: string, filePath: string) => {
      logger.info(K.gray(`${filePath} ${event}, rebuilding and restarting`));
      child.removeAllListeners();
      child.cancel();
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
