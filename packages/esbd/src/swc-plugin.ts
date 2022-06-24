import type { transformFile as transformFileFunction } from '@swc/core';
import type { Plugin } from 'esbuild';
import { basename } from 'path';

import type { BuildMode } from './config';

export function swcPlugin(runtime: 'automatic' | 'classic' | undefined, mode: BuildMode): Plugin {
  return {
    name: 'esbd-swc-holy-matrimony',
    async setup(build) {
      if (runtime !== 'automatic') return;

      let transformFile: typeof transformFileFunction;
      try {
        transformFile = (await import('@swc/core')).transformFile;
      } catch {
        throw new Error(
          '"@swc/core" must be installed as a dependency if "jsxRuntime": "automatic" is set',
        );
      }

      const { sourcemap, sourceRoot } = build.initialOptions;

      build.onLoad({ filter: /\.(j|t)sx$/ }, async args => {
        const sourceFileName = basename(args.path);
        const result = await transformFile(args.path, {
          sourceMaps: sourcemap ? 'inline' : false,
          sourceRoot,
          jsc: {
            parser: args.path.endsWith('.tsx')
              ? { syntax: 'typescript', tsx: true }
              : { syntax: 'ecmascript', jsx: true },
            target: 'es2022',
            transform: { react: { runtime, development: mode === 'development' } },
          },
          sourceFileName,
        });

        return {
          contents: result.code,
          loader: 'js',
          watchFiles: [args.path],
        };
      });
    },
  };
}
