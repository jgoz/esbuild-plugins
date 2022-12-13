import * as babel from '@babel/core';
import type {
  AsyncTransformer,
  SyncTransformer,
  TransformedSource,
  Transformer,
  TransformerCreator,
  TransformOptions,
} from '@jest/transform';
import * as esbuild from 'esbuild';
import { globsToMatcher } from 'jest-util';
import { extname } from 'node:path';

export interface TransformerConfig {
  /**
   * Esbuild transform options.
   *
   * @see {@link https://esbuild.github.io/api/#transform-api}
   */
  esbuild?: esbuild.TransformOptions;

  /**
   * Alternate glob patterns for files that should be transformed with Babel for
   * mock hoisting. If specified, only files matching this pattern will be transformed
   * with Babel after being transformed with esbuild.
   *
   * @default testMatch
   */
  hoistMatch?: string[];
}

export type EsbuildTransformOptions = TransformOptions<TransformerConfig>;

const nodeMajorVersion = process.version.match(/^v(\d+)\./)?.[1];

const BABEL_OPTIONS: babel.TransformOptions = {
  plugins: ['jest-hoist'],
  sourceMaps: 'inline',
  configFile: false,
};

const LOADERS: Record<string, esbuild.Loader | undefined> = {
  '.js': 'js',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.tsx': 'tsx',
};

const handleResult = (
  esbuildResult: esbuild.TransformResult,
  babelResult: babel.BabelFileResult | null | undefined,
): TransformedSource => {
  let result: TransformedSource;

  if (babelResult === undefined) {
    result = {
      code: esbuildResult.code,
      map: esbuildResult.map,
    };
  } else if (babelResult === null || babelResult.code === null || babelResult.code === undefined) {
    throw new Error(`babel transform returned empty result`);
  } else {
    result = {
      code: babelResult.code,
      map: babelResult.map,
    };
  }

  return {
    code: result.code.replace(/\/\*!(\s*istanbul ignore .*?)\*\//, '/* $1*/'),
    map: result.map,
  };
};

const matcher = (path: string, options: EsbuildTransformOptions): boolean =>
  globsToMatcher(options?.transformerConfig?.hoistMatch || options.config.testMatch)(path);

const createTransformer: TransformerCreator<
  Transformer<TransformerConfig>,
  TransformerConfig
> = (): SyncTransformer<TransformerConfig> & AsyncTransformer<TransformerConfig> => {
  return {
    process(source: string, path: string, options: EsbuildTransformOptions) {
      const esbuildResult = esbuild.transformSync(source, {
        format: 'cjs',
        loader: LOADERS[extname(path)] ?? 'default',
        target: nodeMajorVersion ? `node${nodeMajorVersion}` : undefined,
        ...options?.transformerConfig?.esbuild,

        platform: 'node',
        sourcemap: 'inline',
        legalComments: 'inline',
        sourcefile: path,
      });

      let babelResult: babel.BabelFileResult | null | undefined;

      if (matcher(path, options)) {
        babelResult = babel.transformSync(esbuildResult.code, BABEL_OPTIONS);
      }

      return handleResult(esbuildResult, babelResult);
    },

    async processAsync(source: string, path: string, options: EsbuildTransformOptions) {
      const esbuildResult = await esbuild.transform(source, {
        format: 'esm',
        loader: LOADERS[extname(path)] ?? 'default',
        target: nodeMajorVersion ? `node${nodeMajorVersion}` : undefined,
        ...options?.transformerConfig?.esbuild,

        platform: 'node',
        sourcemap: 'inline',
        legalComments: 'inline',
        sourcefile: path,
      });

      let babelResult: babel.BabelFileResult | null | undefined;

      if (matcher(path, options)) {
        babelResult = await babel.transformAsync(esbuildResult.code, BABEL_OPTIONS);
      }

      return handleResult(esbuildResult, babelResult);
    },
  };
};

export default { createTransformer };
