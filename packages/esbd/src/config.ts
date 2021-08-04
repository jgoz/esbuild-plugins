import { BuildOptions, transform } from 'esbuild';
import fs from 'fs';
import K from 'kleur';
import { createRequire, Module } from 'module';
import path from 'path';
import vm from 'vm';

import type { HashAlgorithm } from './html-entry-point';

export type BuildMode = 'development' | 'production';

export interface EsbdConfig {
  /**
   * Base directory used for resolving entry points specified as relative paths.
   *
   * @default "process.cwd()"
   */
  basedir?: string;

  /**
   * Build options that will be merged with the generated esbuild config. Note that changing
   * some options will have no effect, such as "metafile" which always needs to be set
   * for esbd.
   */
  esbuild?: BuildOptions;

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

async function fileExists(configPath: string): Promise<boolean> {
  try {
    await fs.promises.access(configPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findConfigFile(basedir: string): Promise<string | undefined> {
  const jsConfigPath = path.resolve(basedir, 'esbd.config.js');
  const tsConfigPath = path.resolve(basedir, 'esbd.config.ts');
  return (await fileExists(jsConfigPath))
    ? jsConfigPath
    : (await fileExists(tsConfigPath))
    ? tsConfigPath
    : undefined;
}

export async function readConfig(configPath: string, mode: BuildMode): Promise<EsbdConfig> {
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
    configObj = await output(mode);
  } else if (typeof output === 'object' && !!output) {
    configObj = output;
  }

  if (!configObj || typeof configObj !== 'object') {
    throw new Error(`Config file at "${configPath}" did not produce a valid configuration object.`);
  }

  const result: EsbdConfig = {
    basedir: configObj.basedir,
    esbuild: configObj.esbuild,
    ignoreAssets: configObj.ignoreAssets,
    integrity: configObj.integrity,
  };

  const resultKeys = new Set(Object.keys(result));
  const extraKeys = Object.keys(configObj).filter(key => !resultKeys.has(key));

  if (extraKeys.length) {
    console.warn(
      K.yellow(
        `Configuration has unknown keys "${extraKeys.join('", "')}". These will be ignored.`,
      ),
    );
  }

  return result;
}
