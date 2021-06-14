import { CachedInputFileSystem, ResolverFactory } from 'enhanced-resolve';
import fs from 'fs';
import type sass from 'sass';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { getWebpackResolver } from 'sass-loader/dist/utils';

export function createSassImporter(
  implementation: typeof sass,
  includePaths: string[] | undefined,
): sass.Importer {
  const resolve = getWebpackResolver(
    (opts: any) => {
      const resolver = ResolverFactory.createResolver({
        ...opts,
        fileSystem: new CachedInputFileSystem(fs, 4000),
      });
      return (path: string, request: string, callback: any) => {
        resolver.resolve({}, path, request, {}, callback);
      };
    },
    implementation,
    includePaths,
  );

  return (url, prev, done) => {
    resolve(prev, url, false)
      .then((result: string) => {
        done({ file: result.replace(/\.css$/i, '') });
      })
      .catch(() => {
        // Catch all resolving errors, return the original file and pass responsibility back to other custom importers
        done({ file: url });
      });
  };
}
