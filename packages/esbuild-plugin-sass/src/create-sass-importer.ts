import { CachedInputFileSystem, ResolverFactory } from 'enhanced-resolve';
import fs from 'fs';
import path from 'path';
import type sass from 'sass';
import { fileURLToPath } from 'url';

import type { SaasImplementation } from './sass-plugin';

const MODULE_REQUEST_REGEX = /^[^?]*~/; // Examples:
// - ~package
// - ~package/
// - ~@org
// - ~@org/
// - ~@org/package
// - ~@org/package/

const IS_MODULE_IMPORT = /^~([^/]+|[^/]+\/|@[^/]+[/][^/]+|@[^/]+\/?|@[^/]+[/][^/]+\/)$/;

/**
 * When `sass`/`node-sass` tries to resolve an import, it uses a special algorithm.
 * Since the `sass-loader` uses webpack to resolve the modules, we need to simulate that algorithm.
 * This function returns an array of import paths to try.
 * The last entry in the array is always the original url to enable straight-forward webpack.config aliases.
 *
 * We don't need emulate `dart-sass` "It's not clear which file to import." errors (when "file.ext" and "_file.ext" files are present simultaneously in the same directory).
 * This reduces performance and `dart-sass` always do it on own side.
 *
 * @param {string} url
 * @param {boolean} resolverMode
 * @returns {Array<string>}
 */

function getPossibleRequests(url: string, resolverMode: 'sass' | 'webpack') {
  let request = url; // In case there is module request, send this to webpack resolver

  if (resolverMode === 'webpack') {
    if (MODULE_REQUEST_REGEX.test(url)) {
      request = request.replace(MODULE_REQUEST_REGEX, '');
    }

    if (IS_MODULE_IMPORT.test(url)) {
      const requestDir = request.endsWith('/') ? request : `${request}/`;
      return [...new Set([request, requestDir, url])];
    }
  } // Keep in mind: ext can also be something like '.datepicker' when the true extension is omitted and the filename contains a dot.
  // @see https://github.com/webpack-contrib/sass-loader/issues/167

  const extension = path.extname(request).toLowerCase(); // Because @import is also defined in CSS, Sass needs a way of compiling plain CSS @imports without trying to import the files at compile time.
  // To accomplish this, and to ensure SCSS is as much of a superset of CSS as possible, Sass will compile any @imports with the following characteristics to plain CSS imports:
  //  - imports where the URL ends with .css.
  //  - imports where the URL begins http:// or https://.
  //  - imports where the URL is written as a url().
  //  - imports that have media queries.
  //
  // The `node-sass` package sends `@import` ending on `.css` to importer, it is bug, so we skip resolve

  if (extension === '.css') {
    return [];
  }

  const dirname = path.dirname(request);
  const normalizedDirname = dirname === '.' ? '' : `${dirname}/`;
  const basename = path.basename(request);

  return [
    ...new Set([
      `${normalizedDirname}_${basename}`,
      `${normalizedDirname}${basename}`,
      ...(resolverMode === 'webpack' ? [url] : []),
    ]),
  ];
}

const IS_SPECIAL_MODULE_IMPORT = /^~[^/]+$/; // `[drive_letter]:\` + `\\[server]\[sharename]\`
const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i;

export function createSassImporter(
  implementation: SaasImplementation,
  includePaths: string[] = [],
  alias: Record<string, string | string[]> = {},
): sass.Importer {
  // Logic adapted from from sass-loader

  const isDartSass = implementation === 'sass'; // We only have one difference with the built-in sass resolution logic and out resolution logic:
  // First, we look at the files starting with `_`, then without `_` (i.e. `_name.sass`, `_name.scss`, `_name.css`, `name.sass`, `name.scss`, `name.css`),
  // although `sass` look together by extensions (i.e. `_name.sass`/`name.sass`/`_name.scss`/`name.scss`/`_name.css`/`name.css`).
  // It shouldn't be a problem because `sass` throw errors:
  // - on having `_name.sass` and `name.sass` (extension can be `sass`, `scss` or `css`) in the same directory
  // - on having `_name.sass` and `_name.scss` in the same directory
  //
  // Also `sass` prefer `sass`/`scss` over `css`.

  const fileSystem = new CachedInputFileSystem(fs, 4000);

  const webpackModuleResolve = ResolverFactory.createResolver({
    alias,
    conditionNames: ['sass', 'style'],
    mainFields: ['sass', 'style', 'main'],
    mainFiles: ['_index', 'index'],
    extensions: ['.sass', '.scss', '.css'],
    fileSystem,
    restrictions: [/\.((sa|sc|c)ss)$/i],
    preferRelative: true,
    useSyncFileSystemCalls: true,
  });

  const sassModuleResolve = ResolverFactory.createResolver({
    alias: {},
    aliasFields: [],
    conditionNames: [],
    descriptionFiles: [],
    extensions: ['.sass', '.scss', '.css'],
    exportsFields: [],
    fileSystem,
    mainFields: [],
    mainFiles: ['_index', 'index'],
    modules: [],
    restrictions: [/\.((sa|sc|c)ss)$/i],
    preferRelative: true,
    useSyncFileSystemCalls: true,
  });

  return (url, prev) => {
    // See https://github.com/webpack/webpack/issues/12340
    // Because `node-sass` calls our importer before `1. Filesystem imports relative to the base file.`
    // custom importer may not return `{ file: '/path/to/name.ext' }` and therefore our `context` will be relative
    if (!isDartSass && !path.isAbsolute(prev)) {
      return { file: url };
    }

    const originalRequest = url;
    const isFileScheme = originalRequest.slice(0, 5).toLowerCase() === 'file:';

    if (isFileScheme) {
      try {
        url = fileURLToPath(originalRequest);
      } catch (ignoreError) {
        url = url.slice(7);
      }
    }

    const resolvers = [];

    const needEmulateSassResolver = // `sass` doesn't support module import
      !IS_SPECIAL_MODULE_IMPORT.test(url) && // We need improve absolute paths handling.
      // Absolute paths should be resolved:
      // - Server-relative URLs - `<context>/path/to/file.ext` (where `<context>` is root context)
      // - Absolute path - `/full/path/to/file.ext` or `C:\\full\path\to\file.ext`
      !isFileScheme &&
      !originalRequest.startsWith('/') &&
      !IS_NATIVE_WIN32_PATH.test(originalRequest);

    if (includePaths.length > 0 && needEmulateSassResolver) {
      // The order of import precedence is as follows:
      //
      // 1. Filesystem imports relative to the base file.
      // 2. Custom importer imports.
      // 3. Filesystem imports relative to the working directory.
      // 4. Filesystem imports relative to an `includePaths` path.
      // 5. Filesystem imports relative to a `SASS_PATH` path.
      //
      // `sass` run custom importers before `3`, `4` and `5` points, we need to emulate this behavior to avoid wrong resolution.
      const sassPossibleRequests = getPossibleRequests(url, 'sass'); // `node-sass` calls our importer before `1. Filesystem imports relative to the base file.`, so we need emulate this too

      if (!isDartSass) {
        resolvers.push({
          resolve: sassModuleResolve,
          context: path.dirname(prev),
          possibleRequests: sassPossibleRequests,
        });
      }

      resolvers.push(
        ...includePaths.map(context => {
          return {
            resolve: sassModuleResolve,
            context,
            possibleRequests: sassPossibleRequests,
          };
        }),
      );
    }

    const webpackPossibleRequests = getPossibleRequests(url, 'webpack');
    resolvers.push({
      resolve: webpackModuleResolve,
      context: path.dirname(prev),
      possibleRequests: webpackPossibleRequests,
    });

    for (const resolver of resolvers) {
      for (const request of resolver.possibleRequests) {
        try {
          const resolvedPath = resolver.resolve.resolveSync({}, resolver.context, request);
          if (resolvedPath) return { file: resolvedPath.replace(/\.css$/i, '') };
        } catch {}
      }
    }
    return { file: url }; // unable to resolve
  };
}
