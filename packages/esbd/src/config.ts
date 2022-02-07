import type { BuildOptions } from 'esbuild';

import type { HashAlgorithm } from './html-entry-point';

export type BuildMode = 'development' | 'production';
export type CommandName = 'build' | 'node-dev' | 'serve';

type BuildOptionsWithEntryPoints = Omit<BuildOptions, 'entryPoints' | 'bundle' | 'write'> &
  Required<Pick<BuildOptions, 'entryPoints'>>;

export interface EsbdSpecificOptions {
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

  /**
   * React 17 introduced a new JSX transform that enables some internal performance
   * optimmizations and obviates having to import 'React' in every module. The details
   * can be read {@link here https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html}.
   *
   * Though esbuild does not support this new transform natively, setting this option to
   * `automatic` will add a load plugin (powered by SWC) for ".jsx" and ".tsx" files so
   * they use the new tranform as expected.
   *
   * If you are using TypeScript, note that you should set the "jsx" tsconfig option to
   * "react-jsx" so that your editor does not require the "React" import. esbd does not
   * currently read this option from tsconfig.json, so "jsxRuntime" must be set to "automatic"
   * explicitly for the new transform to be used.
   *
   * @default "classic"
   */
  jsxRuntime?: 'automatic' | 'classic';
}

export interface EsbdConfig extends EsbdSpecificOptions, BuildOptionsWithEntryPoints {}

export interface NamedEsbdConfig extends EsbdConfig {
  /**
   * Name of this configuration.
   *
   * This is only required if multiple configurations are defined
   * in a single file.
   */
  name: string;
}

/**
 * Configuration export or the return value of a configuration function.
 */
export type EsbdConfigResult = EsbdConfig | NamedEsbdConfig[];

/**
 * Function that returns a configuration export or an array of configuration exports.
 */
export type ConfigFn = (
  mode: BuildMode,
  command: CommandName,
) => EsbdConfigResult | Promise<EsbdConfigResult>;

export type ResolvedEsbdConfig = Omit<EsbdConfig, 'plugins' | 'absWorkingDir' | 'outdir'> &
  Required<Pick<EsbdConfig, 'plugins' | 'absWorkingDir' | 'outdir'>> & { name?: string };
