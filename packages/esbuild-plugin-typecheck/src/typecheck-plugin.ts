import type { notify as lrNotify } from '@jgoz/esbuild-plugin-livereload';
import type { Message, Plugin } from 'esbuild';
import K from 'kleur';
import path from 'path';
import type ts from 'typescript';
import { Worker } from 'worker_threads';

import type { TypescriptWorkerOptions, WorkerMessage } from './typescript-worker';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

const BUILD_MSG: WorkerMessage = { type: 'build' };

let notify: typeof lrNotify = () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  notify = require('@jgoz/esbuild-plugin-livereload').notify;
} catch {}

interface Logger {
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
   * Force operation in watch mode.
   *
   * By default, watch mode will be inferred from esbuild's "watch" option.
   */
  watch?: boolean;
}

export function typecheckPlugin({
  logger = DEFAULT_LOGGER,
  omitStartLog,
  watch: forceWatch,
  ...options
}: TypecheckPluginOptions = {}): Plugin {
  return {
    name: 'typecheck-plugin',
    setup(build) {
      const { absWorkingDir: basedir = process.cwd(), tsconfig, watch } = build.initialOptions;

      const inputConfigFile = options.configFile ?? tsconfig;
      const configFile = inputConfigFile
        ? path.isAbsolute(inputConfigFile)
          ? inputConfigFile
          : path.resolve(basedir, inputConfigFile)
        : undefined;

      const workerData: TypescriptWorkerOptions = {
        ...options,
        basedir,
        configFile,
        watch: !!forceWatch || !!watch,
      };

      const worker = new Worker(path.resolve(__dirname, './typescript-worker.js'), { workerData });

      let errors: Message[] = [];
      let warnings: Message[] = [];
      let isBuilding: boolean | undefined;
      let isWatching: boolean | undefined;

      build.onStart(() => {
        worker.postMessage(BUILD_MSG);
      });

      worker.on('message', (msg: WorkerMessage) => {
        switch (msg.type) {
          case 'start': {
            errors = [];
            warnings = [];
            isBuilding ??= msg.build;
            isWatching ??= msg.watch;
            if (!omitStartLog) logStarted(logger, { build: isBuilding, watch: isWatching });
            break;
          }
          case 'summary':
          case 'diagnostic': {
            errors.push(...msg.diagnostics.filter(d => d.type === 'error').map(d => d.message));
            warnings.push(...msg.diagnostics.filter(d => d.type === 'warning').map(d => d.message));
            console.error(K.enabled ? msg.output.pretty : msg.output.standard);
            break;
          }
          case 'done': {
            notify('typecheck-plugin', { errors, warnings });

            if (msg.errorCount) {
              logFailed(
                logger,
                msg.errorCount === 1 ? '1 error' : `${msg.errorCount} errors`,
                msg.duration,
              );
              process.exitCode = 1;
            } else {
              logPassed(logger, msg.duration);
              process.exitCode = 0;
            }

            break;
          }
          case 'build':
            throw new Error('Unexpected message from worker: ' + JSON.stringify(msg));
        }
      });

      worker.on('error', e => {
        console.error(e);
        process.exitCode = 1;
      });

      worker.on('exit', code => {
        if (code !== 0) process.exitCode = code;
      });
    },
  };
}

const DEFAULT_LOGGER: Logger = {
  info(message) {
    console.info(K.bold(INFO) + '  ' + message);
  },
  warn(message) {
    console.warn(K.bold().yellow(WARNING) + '  ' + message);
  },
  error(message) {
    console.error(K.bold().red(ERROR) + '  ' + message);
  },
  success(message) {
    console.info(K.bold(SUCCESS) + '  ' + K.green(message));
  },
};

function logStarted(logger: Logger, { build = false, watch = false } = {}) {
  const opts = [build && 'build', watch && 'watch'].filter(Boolean).join(', ');
  const optStr = opts ? K.cyan(` (${opts})`) : '';

  logger.info('Typecheck started…' + optStr);
}

function logPassed(logger: Logger, duration: number) {
  logger.success('Typecheck passed');
  logger.info(K.gray(`Typecheck finished in ${duration.toFixed(0)}ms`));
}

function logFailed(logger: Logger, numErrors: string, duration: number) {
  logger.error(`Typecheck failed with ${K.bold(numErrors)}`);
  logger.info(K.gray(`Typecheck finished in ${duration.toFixed(0)}ms`));
}
