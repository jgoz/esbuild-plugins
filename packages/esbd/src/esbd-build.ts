import type { TypecheckRunner as TypecheckRunnerCls } from '@jgoz/esbuild-plugin-typecheck';
import fs from 'fs';
import { basename, relative } from 'path';
import pc from 'picocolors';
import prettyBytes from 'pretty-bytes';

import type { BuildMode, ResolvedEsbdConfig, TsBuildMode } from './config';
import { getBuildOptions, getHtmlBuildOptions } from './get-build-options';
import { writeTemplate } from './html-entry-point';
import type { BuildIncrementalResult } from './incremental-build';
import { incrementalBuild } from './incremental-build';
import type { Logger } from './log';
import { swcPlugin } from './swc-plugin';
import { timingPlugin } from './timing-plugin';

interface EsbdBuildOptions {
  logger: Logger;
  mode: BuildMode;
  watch: boolean;
  check?: boolean;
  tsBuildMode?: TsBuildMode;
}

export default async function esbdBuildMulti(
  configs: ResolvedEsbdConfig[],
  options: EsbdBuildOptions,
) {
  if (options.check) {
    const TypecheckRunner: typeof TypecheckRunnerCls =
      require('@jgoz/esbuild-plugin-typecheck').TypecheckRunner;

    const checks = new Map<string, TypecheckRunnerCls>();
    for (const config of configs) {
      const runner = new TypecheckRunner({
        absWorkingDir: config.absWorkingDir,
        build: options.tsBuildMode ? true : undefined,
        buildMode: options.tsBuildMode,
        configFile: config.tsconfig,
        logger: options.logger,
        omitStartLog: true,
        watch: options.watch,
      });
      checks.set(runner.configPath, runner);
    }

    checks.forEach(runner => {
      runner.start();
      runner.logger.info('Type checking enabled');
    });
  }

  await Promise.all(configs.map(config => esbdBuild(config, options)));
}

async function esbdBuild(config: ResolvedEsbdConfig, options: EsbdBuildOptions) {
  const { entryPoints } = config;

  const entries = Array.isArray(entryPoints)
    ? entryPoints.map(p => [basename(p), p] as const)
    : Object.entries(entryPoints);

  const htmlEntries = entries.filter(([, entryPath]) => entryPath.endsWith('.html'));
  const sourceEntries = entries.filter(([, entryPath]) => !entryPath.endsWith('.html'));

  await Promise.all([
    esbdBuildHtml(htmlEntries, config, options),
    esbdBuildSource(sourceEntries, config, options),
  ]);
}

async function esbdBuildHtml(
  htmlEntries: (readonly [string, string])[],
  config: ResolvedEsbdConfig,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  if (htmlEntries.length === 0) return;

  const entryNames = htmlEntries.map(([name]) => name).join(', ');
  const name = config.name ? `"${config.name}" (${entryNames})` : entryNames;

  const [buildOptions, allWriteOptions] = await getHtmlBuildOptions(htmlEntries, mode, config);
  const build = await incrementalBuild({
    ...buildOptions,
    copy: config.copy,
    incremental: true,
    logger,
    plugins: [...config.plugins, swcPlugin(config.jsxRuntime), timingPlugin(logger, name)],
    watch,
    write: false,

    onBuildResult: async result => {
      if (!result.errors?.length) {
        await Promise.all([
          ...allWriteOptions.map(writeOptions =>
            writeTemplate(result, buildOptions, writeOptions, {
              copyFile: fs.promises.copyFile,
              writeFile: fs.promises.writeFile,
            }),
          ),
          ...result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
        ]);
      }
      logOutput(result, logger);
    },
    onWatchEvent: (event, filePath) => {
      logger.info(pc.gray(`${filePath} ${event}, rebuilding`));
    },
  });

  if (!watch) build.rebuild.dispose();
}

async function esbdBuildSource(
  sourceEntries: (readonly [string, string])[],
  config: ResolvedEsbdConfig,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  if (sourceEntries.length === 0) return;

  const entryNames = sourceEntries.map(([name]) => name).join(', ');
  const name = config.name ? `"${config.name}" (${entryNames})` : entryNames;

  const build = await incrementalBuild({
    ...getBuildOptions(sourceEntries, mode, config),
    copy: config.copy,
    incremental: true,
    logger,
    plugins: [...config.plugins, swcPlugin(config.jsxRuntime), timingPlugin(logger, name)],
    watch,
    write: false,

    onBuildResult: async result => {
      await Promise.all(
        result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
      );
      logOutput(result, logger);
    },
    onWatchEvent: (event, filePath) => {
      logger.info(pc.gray(`${filePath} ${event}, rebuilding`));
    },
  });

  if (!watch) build.rebuild.dispose();
}

function logOutput(result: BuildIncrementalResult, logger: Logger) {
  for (const file of result.outputFiles) {
    logger.info(
      pc.gray(
        `Wrote ${relative(process.cwd(), file.path)} (${pc.bold(
          prettyBytes(file.contents.byteLength),
        )})`,
      ),
    );
  }
}
