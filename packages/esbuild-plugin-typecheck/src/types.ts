import type ts from 'typescript';

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

export interface TypecheckPluginOptions {
  /**
   * Run the compiler in build mode, equivalent to running `tsc --build`.
   * Normally, this will be inferred if `tsconfig.json` sets
   * `"composite": true` but it can be overridden by this option.
   *
   * This option also accepts an object, which implicitly turns build mode
   * on. The object accepts build-mode-specific options that will be passed
   * to the TypeScript compiler API.
   *
   * @see {@link https://www.typescriptlang.org/docs/handbook/project-references.html#tsc--b-commandline}
   *
   * @default undefined
   */
  build?: boolean | ts.BuildOptions;

  /**
   * Changes the behavior of build mode with respect to program output (JavaScript,
   * type definitions, sourcemaps, and .tsbuildinfo files).
   * - `readonly` (default) &mdash; output files will be written to an in-memory
   *   file system and discared after esbuild exits
   * - `write-output` &mdash; output files will be written to disk as though you
   *   had invoked `tsc --build`
   *
   * There are tradeoffs between the two modes. In `readonly` mode, the initial
   * typecheck may be slower, especially if the output/.tsbuildinfo files do not
   * match the source files. However, subsequent incremental typechecks may be slightly
   * faster since no I/O is involved. This mode is also the least surprising because
   * typechecking implies a different intent than compilation, but TypeScript's build
   * mode needs to produce output in order to remain fast for incremental compilation.
   *
   * In `write-output` mode, the output files will always be in sync with the input
   * files, so the initial compilation may be slightly faster. However, subsequent
   * incremental typechecks might be slightly slower due to I/O overhead. This mode
   * would be appropriate to enable as an alternative to invoking `tsc --build` manually,
   * e.g., in the case where the TypeScript output itself may be used outside of esbuild.
   *
   * @default "readonly"
   */
  buildMode?: 'readonly' | 'write-output';

  /**
   * TypeScript compiler option overrides that will be merged into the options
   * in "tsconfig.json".
   *
   * @see {@link https://www.typescriptlang.org/tsconfig}
   *
   * @default {}
   */
  compilerOptions?: ts.CompilerOptions;

  /**
   * Path to "tsconfig.json". If not specified, this will use ESBuild's "tsconfig"
   * option, finally falling back to TypeScript's config file resolution algorithm.
   *
   * @default undefined
   */
  configFile?: string;

  /**
   * Logger to use instead of the default.
   */
  logger?: Logger;

  /**
   * Omit "Typecheck started" messages.
   *
   * @default false
   */
  omitStartLog?: boolean;

  /**
   * Enable typescript's watch mode
   */
  watch?: boolean;
}
