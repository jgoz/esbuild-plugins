import fs from 'fs';
import K from 'kleur';

import { BuildMode, EsbdConfigWithPlugins } from './config';
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

export default async function esbdBuild(
  [entryPath, entryName]: [string, string | undefined],
  config: EsbdConfigWithPlugins,
  options: EsbdBuildOptions,
) {
  if (entryPath.endsWith('.html')) {
    await esbdBuildHtml([entryPath, entryName], config, options);
  } else {
    await esbdBuildSource([entryPath, entryName], config, options);
  }
}

async function esbdBuildHtml(
  [entryPath, entryName]: [string, string | undefined],
  config: EsbdConfigWithPlugins,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  const [buildOptions, writeOptions] = await getHtmlBuildOptions(
    [entryPath, entryName],
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
        writeTemplate(result, buildOptions, writeOptions, {
          copyFile: fs.promises.copyFile,
          writeFile: fs.promises.writeFile,
        }),
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
  [entryPath, entryName]: [string, string | undefined],
  config: EsbdConfigWithPlugins,
  { logger, mode, watch }: EsbdBuildOptions,
) {
  const buildOptions = getBuildOptions([entryPath, entryName], mode, config);

  const build = await incrementalBuild({
    ...buildOptions,
    incremental: true,
    logger,
    plugins: [...config.plugins, swcPlugin(config.jsxRuntime), timingPlugin(logger)],
    watch,
    write: false,

    onBuildResult: async result => {
      await Promise.all(
        result.outputFiles.map(file => fs.promises.writeFile(file.path, file.contents)),
      );
    },
    onWatchEvent: (event, filePath) => {
      logger.info(K.gray(`${filePath} ${event}, rebuilding`));
    },
  });

  if (!watch) build.rebuild.dispose();
}
