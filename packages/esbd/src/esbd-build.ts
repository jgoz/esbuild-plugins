import fs from 'fs';
import { basename, relative } from 'path';
import pc from 'picocolors';
import prettyBytes from 'pretty-bytes';

import type { BuildMode, ResolvedEsbdConfig } from './config';
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
}

export default async function esbdBuild(config: ResolvedEsbdConfig, options: EsbdBuildOptions) {
  const { entryPoints } = config;

  const entries = Array.isArray(entryPoints)
    ? entryPoints.map(p => [basename(p), p] as const)
    : Object.entries(entryPoints);

  const htmlEntries = entries.filter(([, entryPath]) => entryPath.endsWith('.html'));
  const sourceEntries = entries.filter(([, entryPath]) => !entryPath.endsWith('.html'));

  await esbdBuildHtml(htmlEntries, config, options);
  await esbdBuildSource(sourceEntries, config, options);
}

async function esbdBuildHtml(
  htmlEntries: (readonly [string, string])[],
  config: ResolvedEsbdConfig,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  if (htmlEntries.length === 0) return;

  const [buildOptions, allWriteOptions] = await getHtmlBuildOptions(htmlEntries, mode, config);
  const build = await incrementalBuild({
    ...buildOptions,
    incremental: true,
    logger,
    plugins: [...config.plugins, swcPlugin(config.jsxRuntime), timingPlugin(logger)],
    watch,
    write: false,

    onBuildResult: async result => {
      await Promise.all([
        ...allWriteOptions.map(writeOptions =>
          writeTemplate(result, buildOptions, writeOptions, {
            copyFile: fs.promises.copyFile,
            writeFile: fs.promises.writeFile,
          }),
        ),
        ...result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
      ]);
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

  const build = await incrementalBuild({
    ...getBuildOptions(sourceEntries, mode, config),
    copy: config.copy,
    incremental: true,
    logger,
    plugins: [...config.plugins, swcPlugin(config.jsxRuntime), timingPlugin(logger)],
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
