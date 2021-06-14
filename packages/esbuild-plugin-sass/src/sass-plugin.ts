import { Loader, OnLoadArgs, OnLoadResult, OnResolveArgs, Plugin } from 'esbuild';
import { promises as fsp } from 'fs';
import { dirname, resolve } from 'path';
import { Importer, types } from 'sass';

import { createSassImporter } from './create-sass-importer';
import { loadSass } from './load-sass';

export interface SassPluginOptions {
  /**
   * "sass" for dart-sass (compiled to javascript, slow) or "node-sass" (libsass, fast yet deprecated)
   * You can pass the module name of any other implementation as long as it is API compatible
   *
   * @default "sass"
   */
  implementation?: 'sass' | 'node-sass' | string;

  /**
   * Directory that paths will be relative to.
   *
   * @default process.cwd()
   */
  basedir?: string;

  /**
   * Handles when the @import directive is encountered.
   *
   * A custom importer allows extension of the sass engine in both a synchronous and asynchronous manner.
   *
   * @default undefined
   */
  importer?: Importer | Importer[];

  /**
   * Holds a collection of custom functions that may be invoked by the sass files being compiled.
   *
   * @default undefined
   */
  functions?: {
    [key: string]: (...args: types.SassType[]) => types.SassType | void;
  };

  /**
   * An array of paths that should be looked in to attempt to resolve your @import declarations.
   * When using `data`, it is recommended that you use this.
   *
   * @default []
   */
  includePaths?: string[];

  /**
   * Enable Sass Indented Syntax for parsing the data string or file.
   *
   * @default false
   */
  indentedSyntax?: boolean;

  /**
   * Used to determine whether to use space or tab character for indentation.
   *
   * @default 'space'
   */
  indentType?: 'space' | 'tab';

  /**
   * Used to determine the number of spaces or tabs to be used for indentation.
   *
   * @default 2
   */
  indentWidth?: number;

  /**
   * Used to determine which sequence to use for line breaks.
   *
   * @default 'lf'
   */
  linefeed?: 'cr' | 'crlf' | 'lf' | 'lfcr';

  /**
   * Determines the output format of the final CSS style.
   *
   * @default 'expanded'
   */
  outputStyle?: 'compressed' | 'expanded';

  /**
   * Enables the outputting of a source map.
   *
   * @default undefined
   */
  sourceMap?: boolean | string;

  /**
   * Includes the contents in the source map information.
   *
   * @default false
   */
  sourceMapContents?: boolean;

  /**
   * Embeds the source map as a data URI.
   *
   * @default false
   */
  sourceMapEmbed?: boolean;

  /**
   * The value will be emitted as `sourceRoot` in the source map information.
   *
   * @default undefined
   */
  sourceMapRoot?: string;

  /**
   * A function which will post process the css file before wrapping it in a module
   *
   * @default undefined
   */
  transform?: (css: string, resolveDir: string) => string | Promise<string>;
}

export function sassPlugin(options: SassPluginOptions = {}): Plugin {
  if (!options.basedir) {
    options.basedir = process.cwd();
  }

  const sass = loadSass(options);
  const importer = createSassImporter();

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
    const {
      css,
      stats: { includedFiles },
    } = sass.renderSync({ importer, ...options, file });
    return Promise.resolve({
      css: css.toString('utf-8'),
      watchFiles: includedFiles,
    });
  }

  return {
    name: 'sass-plugin',
    setup: function (build) {
      build.onResolve({ filter: /\.(s[ac]ss|css)$/ }, args => {
        return { path: args.path, namespace: 'sass', pluginData: args };
      });

      async function transform(path: string): Promise<OnLoadResult> {
        let { css, watchFiles } = await (path.endsWith('.css')
          ? readCssFile(path)
          : renderSass(path));
        if (options.transform) {
          css = await options.transform(css, dirname(path));
        }
        return {
          contents: css,
          loader: 'css' as Loader,
          resolveDir: dirname(path),
          watchFiles,
        };
      }

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
