import type { OnLoadArgs, OnLoadResult, OnResolveArgs, Plugin } from 'esbuild';
import { promises as fsp } from 'fs';
import { dirname, resolve } from 'path';
import type { LegacyFunction, LegacyImporter } from 'sass';

import { createSassImporter } from './create-sass-importer';
import { loadSass } from './load-sass';

export interface SassPluginOptions {
  /**
   * Import aliases to use when resolving imports from within sass files.
   *
   * These will not be used when esbuild resolves imports from other module types.
   */
  alias?: Record<string, string | string[]>;

  /**
   * Base directory to use when resolving the sass implementation.
   *
   * @default process.cwd()
   */
  basedir?: string;

  /**
   * Handles when the @import directive is encountered *inside a Sass file*.
   * @see {@link https://github.com/sass/node-sass#importer--v200---experimental}
   *
   * If left undefined, a default importer will be used that closely mimics webpack's
   * sass-loader resolution algorithm, which itself closely mimic's the default resolution
   * algorithm of either dart-sass or node-sass.
   *
   * If you want to extend the import algorithm while keeping the default, you can import it
   * like so:
   *
   * @example
   * import { createSassImporter } from '@jgoz/esbuild-plugin-sass';
   *
   * const defaultImporter = createSassImporter(
   *   'sass', // or 'node-sass' -- should match 'implementation' option
   *   [], // includePaths
   *   {}, // aliases
   * );
   *
   * sassPlugin({
   *   importer: [myImporter, defaultImporter]
   * })
   *
   * @default undefined
   */
  importer?: LegacyImporter<'sync'> | LegacyImporter<'sync'>[];

  /**
   * Holds a collection of custom functions that may be invoked by the sass files being compiled.
   * @see {@link https://github.com/sass/node-sass#functions--v300---experimental}
   *
   * @default undefined
   */
  functions?: Record<string, LegacyFunction<'sync'>>;

  /**
   * An array of paths that should be looked in to attempt to resolve your @import declarations.
   * When using `data`, it is recommended that you use this.
   * @see {@link https://github.com/sass/node-sass#includepaths}
   *
   * @default []
   */
  includePaths?: string[];

  /**
   * Enable Sass Indented Syntax for parsing the data string or file.
   * @see {@link https://github.com/sass/node-sass#indentedsyntax}
   *
   * @default false
   */
  indentedSyntax?: boolean;

  /**
   * Used to determine whether to use space or tab character for indentation.
   * @see {@link https://github.com/sass/node-sass#indenttype--v300}
   *
   * @default 'space'
   */
  indentType?: 'space' | 'tab';

  /**
   * Used to determine the number of spaces or tabs to be used for indentation.
   * @see {@link https://github.com/sass/node-sass#indentwidth--v300}
   *
   * @default 2
   */
  indentWidth?: number;

  /**
   * Used to determine which sequence to use for line breaks.
   * @see {@link https://github.com/sass/node-sass#linefeed--v300}
   *
   * @default 'lf'
   */
  linefeed?: 'cr' | 'crlf' | 'lf' | 'lfcr';

  /**
   * Determines the output format of the final CSS style.
   * @see {@link https://github.com/sass/node-sass#outputstyle}
   *
   * @default 'expanded'
   */
  outputStyle?: 'compressed' | 'expanded';

  /**
   * Enables the outputting of a source map.
   * @see {@link https://github.com/sass/node-sass#sourcemap}
   *
   * @default undefined
   */
  sourceMap?: boolean;

  /**
   * Includes the contents in the source map information.
   * @see {@link https://github.com/sass/node-sass#sourcemapcontents}
   *
   * @default false
   */
  sourceMapContents?: boolean;

  /**
   * Embeds the source map as a data URI.
   * @see {@link https://github.com/sass/node-sass#sourcemapembed}
   *
   * @default false
   */
  sourceMapEmbed?: boolean;

  /**
   * The value will be emitted as `sourceRoot` in the source map information.
   * @see {@link https://github.com/sass/node-sass#sourcemaproot}
   *
   * @default undefined
   */
  sourceMapRoot?: string;

  /**
   * A function which will post-process the css output before wrapping it in a module.
   *
   * @default undefined
   */
  transform?: (css: string, resolveDir: string) => string | Promise<string>;
}

export function sassPlugin(options: SassPluginOptions = {}): Plugin {
  const {
    basedir = process.cwd(),
    importer = createSassImporter(options.includePaths, options.alias),
  } = options;

  const sass = loadSass(basedir);

  function pathResolve({ resolveDir, path, importer }: OnResolveArgs) {
    return resolve(resolveDir || dirname(importer), path);
  }

  function requireResolve({ resolveDir, path, importer }: OnResolveArgs) {
    if (!resolveDir) {
      resolveDir = dirname(importer);
    }
    const paths = options.includePaths ? [resolveDir, ...options.includePaths] : [resolveDir];
    return require.resolve(path, { paths });
  }

  async function readCssFile(path: string) {
    return { css: await fsp.readFile(path, 'utf-8'), watchFiles: [path] };
  }

  async function renderSass(file: string) {
    return new Promise<{ css: string; watchFiles: string[] }>((resolve, reject) => {
      try {
        const result = sass.renderSync({ importer, ...options, file });
        resolve({
          css: result.css.toString('utf-8'),
          watchFiles: result.stats.includedFiles,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function transform(path: string): Promise<OnLoadResult> {
    let { css, watchFiles } = await (path.endsWith('.css') ? readCssFile(path) : renderSass(path));
    if (options.transform) {
      css = await options.transform(css, dirname(path));
    }
    return {
      contents: css,
      loader: 'css',
      resolveDir: dirname(path),
      watchFiles,
    };
  }

  return {
    name: 'sass-plugin',
    setup: build => {
      build.onResolve({ filter: /\.(s[ac]ss|css)$/ }, args => {
        return { path: args.path, namespace: 'sass', pluginData: args };
      });

      build.onLoad(
        { filter: /^\.\.?\//, namespace: 'sass' },
        ({ pluginData: args }: OnLoadArgs) => {
          return transform(pathResolve(args));
        },
      );

      build.onLoad(
        { filter: /^([^.]|\.\.?[^/])/, namespace: 'sass' },
        ({ pluginData: args }: OnLoadArgs) => {
          return transform(requireResolve(args));
        },
      );
    },
  };
}
