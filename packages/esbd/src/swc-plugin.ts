import type { Output, transformFile as transformFileFunction } from '@swc/core';
import type { Plugin } from 'esbuild';
import { basename } from 'path';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';

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

      async function sourcemapComment(sourceFileName: string, result: Output): Promise<string> {
        if (!result.map) return '';

        // SWC (as of 1.2.203) generates an invalid sourcemap where the "react/jsx-runtime" import
        // is incorrectly mapped to the first import of the original file, which causes cascading
        // sourcemap translation errors in esbuild. The workaround implemented below strips the
        // invalid mapping if it is present.

        const comment = await SourceMapConsumer.with(result.map, null, consumer => {
          // Check if the invalid mapping actually exists
          const original = consumer.originalPositionFor({ line: 1, column: 0 });
          const hasReactImport = result.code.includes(
            mode === 'development' ? 'react/jsx-dev-runtime' : 'react/jsx-runtime',
          );
          if (!original || !hasReactImport) {
            // Doesn't exist, return the sourcemap as-is
            return (
              '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
              Buffer.from(result.map!).toString('base64')
            );
          }

          const generator = new SourceMapGenerator({ file: sourceFileName, sourceRoot });

          consumer.eachMapping(mapping => {
            // Skip the invalid mapping
            if (mapping.generatedLine === 1 && mapping.generatedColumn === 0) return;

            generator.addMapping({
              generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
              original: { line: mapping.originalLine, column: mapping.originalColumn },
              source: mapping.source,
              name: mapping.name,
            });
          });

          for (const source of consumer.sources) {
            const sourceContent = consumer.sourceContentFor(source);
            if (sourceContent) generator.setSourceContent(source, sourceContent);
          }

          return (
            '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
            Buffer.from(generator.toString()).toString('base64')
          );
        });

        return comment;
      }

      build.onLoad({ filter: /\.(j|t)sx$/ }, async args => {
        const sourceFileName = basename(args.path);
        const result = await transformFile(args.path, {
          sourceMaps: !!sourcemap,
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
          contents: result.code + (await sourcemapComment(sourceFileName, result)),
          loader: 'js',
          watchFiles: [args.path],
        };
      });
    },
  };
}
