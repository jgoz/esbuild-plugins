import { BuildOptions, Plugin, transform } from 'esbuild';
import findUp from 'find-up';
import fs from 'fs';
import K from 'kleur';
import { createRequire, Module } from 'module';
import path from 'path';
import vm from 'vm';

import type { HashAlgorithm } from './html-entry-point';

export type BuildMode = 'development' | 'production';
export type CommandName = 'build' | 'node-dev' | 'serve';

export interface EsbdConfig extends Omit<BuildOptions, 'entryPoints'> {
  /**
   * Base directory used for resolving entry points specified as relative paths.
   *
   * @default "process.cwd()"
   */
  absWorkingDir?: string;

  /**
   * Files to copy to the output directory during the build.
   *
   * Each entry is a tuple representing the source file path to copy
   * and, optionally, the destination file path.
   *
   * Source paths may be absolute or relative to `absWorkingDir`. Destination
   * paths may be absolute or relative to `outdir`. If no destination path is
   * provided, the source file will be copied to `outdir` with the same name.
   *
   * If `esbd` is started in a watch mode (serve, node-dev, or build --watch),
   * source files will be watched and copied whenever they change.
   *
   * Note that `copy` does not support glob patterns.
   */
  copy?: [from: string, to?: string][];

  /**
   * By default, assets (images, manifests, scripts, etc.) referenced by `<link>`, `<style>` and
   * `<script>` tags in the HTML template will be collected as esbuild assets if their `src` attributes
   * are specified as relative paths. The asset paths will be resolved relative to the *template file*
   * and will be copied to the output directory, taking `publicPath` into consideration if it has
   * been set.
   *
   * Absolute paths or URIs will be ignored.
   *
   * To ignore all `src` attributes and avoid collecting discovered assets, set this option to `true`.
   *
   * @default undefined
   */
  ignoreAssets?: boolean;

  /**
   * If specified, a cryptographic digest for each file referenced by a `<link>` or
   * `<script>` tag will be calculated using the specified algorithm and added as an
   * `integrity` attribute on the associated tag.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity}
   *
   * @default undefined
   */
  integrity?: HashAlgorithm;
}

export interface EsbdConfigWithEntryPoint extends EsbdConfig {
  /**
   * Entry point associated with this configuration.
   *
   * This is only required if multiple configurations are defined
   * in a single file.
   */
  entryPoint: string;
}

/**
 * Configuration export or the return value of a configuration function.
 */
export type EsbdConfigResult = EsbdConfig | EsbdConfigWithEntryPoint[];

/**
 * Function that returns a configuration export or an array of configuration exports.
 */
export type ConfigFn = (
  mode: BuildMode,
  command: CommandName,
) => EsbdConfigResult | Promise<EsbdConfigResult>;

export type EsbdConfigWithPlugins = EsbdConfig & { plugins: Plugin[] };

export async function findConfigFile(basedir: string): Promise<string | undefined> {
  return await findUp(['esbd.config.js', 'esbd.config.ts'], { cwd: basedir });
}

export async function readConfig(
  configPath: string,
  mode: BuildMode,
  commandName: CommandName,
): Promise<EsbdConfigResult> {
  const loader = path.extname(configPath) === '.ts' ? 'ts' : undefined;
  const configSource = await fs.promises.readFile(configPath, 'utf-8');
  const configJs = await transform(configSource, { format: 'cjs', loader, target: 'node14' });

  if (configJs.warnings.length) {
    for (const warning of configJs.warnings) {
      console.warn(K.yellow(warning.text));
    }
  }

  const mainModule = require.main!;
  const contextModule = new Module(configPath, mainModule);
  contextModule.filename = configPath;
  contextModule.path = path.dirname(configPath);
  contextModule.paths = mainModule.paths;
  contextModule.require = createRequire(configPath);

  vm.runInNewContext(configJs.code, {
    __dirname: contextModule.path,
    __filename: contextModule.filename,
    exports: contextModule.exports,
    module: contextModule,
    require: contextModule.require,
    console: console,
  });

  contextModule.loaded = true;
  const exports = contextModule.exports;
  const output = exports.default ?? exports;

  let configObj: Record<string, any> | undefined;
  if (typeof output === 'function') {
    configObj = await output(mode, commandName);
  } else if (output) {
    configObj = output;
  }

  if (!configObj || (typeof configObj !== 'object' && !Array.isArray(configObj))) {
    throw new Error(`Config file at "${configPath}" did not export a valid esbd configuration.`);
  }

  return configObj;
}
