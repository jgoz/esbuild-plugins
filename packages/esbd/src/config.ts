import type { BuildOptions } from 'esbuild';

export type BuildMode = 'development' | 'production';
export type CommandName = 'build' | 'node-dev' | 'serve';
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

export const BUILD_MODES = ['development', 'production'] as const;
export const TS_BUILD_MODES = ['readonly', 'write-output'] as const;

export type TsBuildMode = typeof TS_BUILD_MODES[number];

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
   * Predicate function that determines whether a CSS output file should be added to the written HTML entry point.
   *
   * Esbd makes a best effort to determine which output files should be referenced
   * as `<script>` and `<link rel="stylesheet">` tags in the HTML entry point. By default,
   * CSS output files will be cross-referenced with CSS and JS entry points defined in HTML.
   * Both CSS files that are referenced directly in HTML and those that are referenced indirectly
   * from JS entry points will be included.
   *
   * In some cases, more CSS files will need to be included than the default algorithm can detect,
   * so this function can be used to be more specific since it will receive every CSS output file produced
   * by esbuild.
   *
   * This function receives an output file path and should return a value indicating
   * whether that file should be referenced in the HTML output. If the function returns `null`
   * or `undefined`, the default algorithm will be used.
   */
  cssChunkFilter?: (absFilePath: string) => boolean | null | undefined;

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
   * Name of this configuration.
   *
   * This is required for configurations that appear in an array.
   */
  name?: string;
}

export interface EsbdConfig extends EsbdSpecificOptions, BuildOptionsWithEntryPoints {}

export interface NamedEsbdConfig extends EsbdConfig {
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
