import type { TypecheckRunner as TypecheckRunnerCls } from '@jgoz/esbuild-plugin-typecheck';
import fs from 'fs';
import { basename, dirname, relative } from 'path';
import pc from 'picocolors';
import prettyBytes from 'pretty-bytes';

import type { BuildMode, ResolvedEsbdConfig, TsBuildMode } from './config';
import { getBuildOptions, getHtmlBuildOptions } from './get-build-options';
import { writeTemplate } from './html-entry-point';
import type { IncrementalBuildResult } from './incremental-build';
import { incrementalBuild } from './incremental-build';
import type { Logger } from './log';
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
    ? entryPoints.map(p =>
        typeof p === 'object' ? ([basename(p.out), p.in] as const) : ([basename(p), p] as const),
      )
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
  const context = await incrementalBuild({
    ...buildOptions,
    cleanOutdir: config.cleanOutdir,
    copy: config.copy,
    logger,
    plugins: [...config.plugins, timingPlugin(logger, name)],
    write: false,

    onBuildStart: options => onBuildStart(logger, options.buildCount),
    onBuildEnd: async result => {
      if (!result.errors?.length) {
        await Promise.all([
          ...allWriteOptions.map(writeOptions =>
            writeTemplate(result, buildOptions, writeOptions, {
              copyFile: fs.promises.copyFile,
              writeFile: fs.promises.writeFile,
            }),
          ),
          ...result.outputFiles.map(async file => {
            await fs.promises.mkdir(dirname(file.path), { recursive: true });
            await fs.promises.writeFile(file.path, file.contents);
          }),
        ]);
      }
      logOutput(result, logger);
    },
  });

  if (watch) {
    await context.watch();
  } else {
    await context.rebuild();
    await context.dispose();
  }
}

async function esbdBuildSource(
  sourceEntries: (readonly [string, string])[],
  config: ResolvedEsbdConfig,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  if (sourceEntries.length === 0) return;

  const entryNames = sourceEntries.map(([name]) => name).join(', ');
  const name = config.name ? `"${config.name}" (${entryNames})` : entryNames;

  const context = await incrementalBuild({
    ...getBuildOptions(sourceEntries, mode, config),
    cleanOutdir: config.cleanOutdir,
    copy: config.copy,
    logger,
    plugins: [...config.plugins, timingPlugin(logger, name)],
    write: false,

    onBuildStart: options => onBuildStart(logger, options.buildCount),
    onBuildEnd: async result => {
      await Promise.all(
        result.outputFiles.map(async file => {
          await fs.promises.mkdir(dirname(file.path), { recursive: true });
          await fs.promises.writeFile(file.path, file.contents);
        }),
      );
      logOutput(result, logger);
    },
  });

  if (watch) {
    await context.watch();
  } else {
    await context.rebuild();
    await context.dispose();
  }
}

function logOutput(result: IncrementalBuildResult, logger: Logger) {
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

function onBuildStart(logger: Logger, buildCount: number): void {
  if (buildCount >= 1) {
    logger.info(pc.gray('Source files changed, rebuilding'));
  }
}
