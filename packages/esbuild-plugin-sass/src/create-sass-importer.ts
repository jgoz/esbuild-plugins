import { CachedInputFileSystem, Resolver, ResolverFactory } from 'enhanced-resolve';
import fs from 'fs';
import { basename, dirname, posix } from 'path';
import { Importer } from 'sass';

class PrependPlugin {
  readonly source: string;
  readonly target: string;
  readonly prepending: string;

  constructor(source: string, prepending: string, target: string) {
    this.source = source;
    this.prepending = prepending;
    this.target = target;
  }

  apply(resolver: Resolver) {
    const target = resolver.ensureHook(this.target);
    resolver.getHook(this.source).tapAsync('PrependPlugin', (request, resolveContext, callback) => {
      const obj = {
        ...request,
        path:
          request.path &&
          posix.join(dirname(request.path), this.prepending + basename(request.path)),
        relativePath:
          request.relativePath &&
          posix.join(
            dirname(request.relativePath),
            this.prepending + basename(request.relativePath),
          ),
      };
      resolver.doResolve(target, obj, this.prepending, resolveContext, callback);
    });
  }
}

export function createSassImporter() {
  const resolver = ResolverFactory.createResolver({
    conditionNames: ['browser'],
    extensions: ['.scss', '.sass', '.css'],
    fileSystem: new CachedInputFileSystem(fs, 4000),
    mainFields: ['style'],
    mainFiles: ['index', '_index'],
    plugins: [new PrependPlugin('raw-file', '_', 'file')],
    preferRelative: true,
    useSyncFileSystemCalls: true,
  });

  const importer: Importer = (url, prev) => {
    if (url.startsWith('~')) {
      url = url.slice(1);
    }
    try {
      const pathname = resolver.resolveSync({}, dirname(prev), url);
      if (!pathname) {
        return new Error(`Unable to resolve sass import "${url}" from "${prev}"`);
      }
      return { file: pathname };
    } catch (err) {
      return err;
    }
  };

  return importer;
}
