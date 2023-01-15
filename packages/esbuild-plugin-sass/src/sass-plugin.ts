import type { OnLoadArgs, OnLoadResult, OnResolveArgs, Plugin } from 'esbuild';
import { promises as fsp } from 'fs';
import { dirname, resolve } from 'path';
import type { LegacyException, LegacyFunction, LegacyImporter } from 'sass';

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
   * Resolves `@import` directives *between sass files*.
   *
   * This is not used when esbuild resolves imports from other module types, e.g.,
   * when importing from JS/TS files or when defining a Sass file as an entry point.
   *
   * If left undefined, a default importer will be used that closely mimics webpack's
   * sass-loader resolution algorithm, which itself closely mimic's the default resolution
   * algorithm of dart-sass.
   *
   * If you want to extend the import algorithm while keeping the default, you can import it
   * like so:
   *
   * @example
   * import { createSassImporter } from '@jgoz/esbuild-plugin-sass';
   *
   * const defaultImporter = createSassImporter(
   *   [], // includePaths
   *   {}, // aliases
   * );
   *
   * sassPlugin({
   *   importer: [myImporter, defaultImporter]
   * })
   *
   * @default undefined
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#importer}
   */
  importer?: LegacyImporter<'sync'> | LegacyImporter<'sync'>[];

  /**
   * Holds a collection of custom functions that may be invoked by the sass files being compiled.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#functions}
   *
   * @default undefined
   */
  functions?: Record<string, LegacyFunction<'sync'>>;

  /**
   * An array of paths that should be looked in to attempt to resolve your @import declarations.
   * When using `data`, it is recommended that you use this.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#includePaths}
   *
   * @default []
   */
  includePaths?: string[];

  /**
   * Enable Sass Indented Syntax for parsing the data string or file.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyStringOptions#indentedSyntax}
   *
   * @default false
   */
  indentedSyntax?: boolean;

  /**
   * Used to determine whether to use space or tab character for indentation.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#indentType}
   *
   * @default 'space'
   */
  indentType?: 'space' | 'tab';

  /**
   * Used to determine the number of spaces or tabs to be used for indentation.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#indentWidth}
   *
   * @default 2
   */
  indentWidth?: number;

  /**
   * Used to determine which sequence to use for line breaks.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#linefeed}
   *
   * @default 'lf'
   */
  linefeed?: 'cr' | 'crlf' | 'lf' | 'lfcr';

  /**
   * Determines the output format of the final CSS style.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#outputStyle}
   *
   * @default 'expanded'
   */
  outputStyle?: 'compressed' | 'expanded';

  /**
   * Enables the outputting of a source map.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMap}
   *
   * @default undefined
   */
  sourceMap?: boolean | string;

  /**
   * Includes the contents in the source map information.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMapContents}
   *
   * @default false
   */
  sourceMapContents?: boolean;

  /**
   * Embeds the source map as a data URI.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMapEmbed}
   *
   * @default false
   */
  sourceMapEmbed?: boolean;

  /**
   * The value will be emitted as `sourceRoot` in the source map information.
   * @see {@link https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMapRoot}
   *
   * @default undefined
   */
  sourceMapRoot?: string;

  /**
   * A function that will post-process the css output before wrapping it in a module.
   *
   * This might be useful for, e.g., processing CSS output with PostCSS/autoprefixer.
   *
   * @example
   * const postCSS = require("postcss")([
   *  require("autoprefixer"),
   *  require("postcss-preset-env")({ stage:0 })
   * ]);
   *
   * sassPlugin({
   *  async transform(source, resolveDir) {
   *    const { css } = await postCSS.process(
   *      source,
   *      { from: resolveDir }
   *    );
   *    return css;
   *  }
   * })
   *
   * @default undefined
   */
  transform?: (css: string, resolveDir: string) => string | Promise<string>;
}

/**
 * ESBuild plugin that transpiles Sass files to CSS.
 *
 * @param options - Plugin options.
 * @returns Sass plugin instance.
 */
export function sassPlugin({
  alias,
  basedir = process.cwd(),
  functions,
  includePaths,
  importer = createSassImporter(includePaths, alias),
  ...options
}: SassPluginOptions = {}): Plugin {
  const sass = loadSass(basedir);

  function pathResolve({ resolveDir, path, importer }: OnResolveArgs) {
    return resolve(resolveDir || dirname(importer), path);
  }

  function requireResolve({ resolveDir, path, importer }: OnResolveArgs) {
    if (!resolveDir) {
      resolveDir = dirname(importer);
    }
    const paths = includePaths ? [resolveDir, ...includePaths] : [resolveDir];
    return require.resolve(path, { paths });
  }

  async function readCssFile(path: string) {
    return { css: await fsp.readFile(path, 'utf-8'), watchFiles: [path] };
  }

  async function renderSass(path: string) {
    return new Promise<{ css: string; watchFiles: string[] }>((resolve, reject) => {
      try {
        const result = sass.renderSync({ importer, functions, ...options, file: path });
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
    let css: string;
    let watchFiles: string[];

    try {
      const result = await (path.endsWith('.css') ? readCssFile(path) : renderSass(path));
      css = result.css;
      watchFiles = result.watchFiles;
    } catch (error) {
      const exception = error as LegacyException;
      const lineText = exception.formatted?.split('│')[1];
      return {
        errors: [
          {
            pluginName: 'sass-plugin',
            text: exception.formatted ?? exception.message,
            detail: exception,
            id: exception.name,
            location: {
              file: exception.file,
              column: exception.column,
              line: exception.line,
              lineText,
            },
          },
        ],
        watchFiles: [path],
      };
    }

    if (options.transform) {
      try {
        css = await options.transform(css, dirname(path));
      } catch (error) {
        return {
          errors: [
            {
              pluginName: 'sass-plugin',
              text: error instanceof Error ? error.message : 'Sass transform error',
              detail: error,
              location: {
                file: path,
              },
            },
          ],
          watchFiles,
        };
      }
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
        return { path: resolve(args.resolveDir, args.path), namespace: 'sass', pluginData: args };
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
