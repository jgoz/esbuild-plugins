import type { Options, Output, transformFile as transformFileFunction } from '@swc/core';
import type { Plugin } from 'esbuild';
import { relative } from 'path';

export function swcPlugin(runtime: 'automatic' | 'classic' | undefined): Plugin {
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

      const { absWorkingDir = process.cwd(), sourcemap } = build.initialOptions;

      function sourcemapComment(result: Output) {
        if (!result.map) return '';

        const map = JSON.parse(result.map);
        map.sources = map.sources.map((source: string) => relative(absWorkingDir, source));

        return (
          '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
          Buffer.from(JSON.stringify(map)).toString('base64')
        );
      }

      const tsxOptions: Options = {
        sourceMaps: !!sourcemap,
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          target: 'es2022',
          transform: { react: { runtime } },
        },
      };

      build.onLoad({ filter: /\.tsx$/ }, async args => {
        const result = await transformFile(args.path, tsxOptions);
        return {
          contents: result.code + sourcemapComment(result),
          loader: 'js',
          watchFiles: [args.path],
        };
      });

      const jsxOptions: Options = {
        sourceMaps: !!sourcemap,
        jsc: {
          parser: { syntax: 'ecmascript', jsx: true },
          target: 'es2022',
          transform: { react: { runtime } },
        },
      };

      build.onLoad({ filter: /\.jsx$/ }, async args => {
        const result = await transformFile(args.path, jsxOptions);
        return {
          contents: result.code + sourcemapComment(result),
          loader: 'js',
          watchFiles: [args.path],
        };
      });
    },
  };
}
