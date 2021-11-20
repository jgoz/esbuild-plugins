import fs from 'fs';
import K from 'kleur';
import { basename, relative } from 'path';
import prettyBytes from 'pretty-bytes';

import { BuildMode, ResolvedEsbdConfig } from './config';
import { getBuildOptions, getHtmlBuildOptions } from './get-build-options';
import { writeTemplate } from './html-entry-point';
import { incrementalBuild } from './incremental-build';
import { Logger } from './log';
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

  const hasHtml = entries.some(([, entryPath]) => entryPath.endsWith('.html'));

  if (hasHtml) {
    await esbdBuildHtml(entries, config, options);
  } else {
    await esbdBuildSource(entries, config, options);
  }
}

async function esbdBuildHtml(
  resolvedEntries: (readonly [string, string])[],
  config: ResolvedEsbdConfig,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  const [buildOptions, allWriteOptions] = await getHtmlBuildOptions(
    resolvedEntries.filter(([, entryPath]) => entryPath.endsWith('.html')),
    mode,
    config,
  );

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
    },
    onWatchEvent: (event, filePath) => {
      logger.info(K.gray(`${filePath} ${event}, rebuilding`));
    },
  });

  if (!watch) build.rebuild.dispose();
}

async function esbdBuildSource(
  resolvedEntries: (readonly [string, string])[],
  config: ResolvedEsbdConfig,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  const build = await incrementalBuild({
    ...getBuildOptions(resolvedEntries, mode, config),
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
      for (const file of result.outputFiles) {
        logger.info(
          K.gray(
            `Wrote ${relative(process.cwd(), file.path)} (${K.bold(
              prettyBytes(file.contents.byteLength),
            )})`,
          ),
        );
      }
    },
    onWatchEvent: (event, filePath) => {
      logger.info(K.gray(`${filePath} ${event}, rebuilding`));
    },
  });

  if (!watch) build.rebuild.dispose();
}
