import type { notify as lrNotify } from '@jgoz/esbuild-plugin-livereload';
import type { Message, Plugin } from 'esbuild';
import K from 'kleur';
import path from 'path';
import type ts from 'typescript';
import { Worker } from 'worker_threads';

import type { TypescriptWorkerOptions, WorkerMessage } from './typescript-worker';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
// const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

const BUILD_MSG: WorkerMessage = { type: 'build' };

let notify: typeof lrNotify = () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  notify = require('@jgoz/esbuild-plugin-livereload').notify;
} catch {}

export interface TypecheckPluginOptions {
  /**
   * Run the compiler in build mode, equivalent to passing the "--build"
   * argument. Normally, this will be inferred if "tsconfig.json" sets
   * "composite: true" but it can be overridden by this option.
   *
   * This option also accepts an object, which implicitly turns build mode
   * on. The object accepts build-mode-specific options that will be passed
   * to the TypeScript compiler API.
   *
   * @default undefined
   */
  build?: boolean | ts.BuildOptions;

  /**
   * Changes the behavior of build mode with respect to program output (JavaScript,
   * type definitions, sourcemaps, and .tsbuildinfo files).
   *
   * - `readonly` (default) &mdash; output files will be written to an in-memory
   *   file system and discared after esbuild exits
   * - `write-output` &mdash; output files will be written to disk as though you
   *   had invoked `tsc --build`
   *
   * There are tradeoffs between the two modes. In `readonly` mode, the initial
   * typecheck may be slower, especially if the output/.tsbuildinfo files do not
   * match the sources. However, subsequent incremental typechecks may be slightly
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
   * @default {}
   */
  compilerOptions?: ts.CompilerOptions;

  /**
   * Path to "tsconfig.json". If not specified, this will use ESBuild's "tsconfig"
   * option, finally falling back to TypeScripts config file resolution algorithm.
   *
   * @default undefined
   */
  configFile?: string;
}

export function typecheckPlugin(options: TypecheckPluginOptions = {}): Plugin {
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
        watch: !!watch,
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
            logStarted({ build: isBuilding, watch: isWatching });
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
                msg.errorCount === 1 ? '1 error' : `${msg.errorCount} errors`,
                msg.duration,
              );
              process.exitCode = 1;
            } else {
              logPassed(msg.duration);
              process.exitCode = 0;
            }

            break;
          }
          case 'build':
            break; // should not be sent
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

function logStarted({ build = false, watch = false } = {}) {
  const opts = [build && 'build', watch && 'watch'].filter(Boolean).join(', ');
  const optStr = opts ? K.cyan(` (${opts})`) : '';

  console.info(K.bold(INFO) + `  Typecheck started…` + optStr);
}

function logPassed(duration: number) {
  console.info(K.bold(SUCCESS) + K.green('  Typecheck passed'));
  console.info(K.bold(INFO) + K.gray(`  Typecheck finished in ${duration.toFixed(0)}ms`));
}

function logFailed(numErrors: string, duration: number) {
  console.error(K.bold().red(ERROR) + '  Typecheck failed with ' + K.bold(numErrors));
  console.error(K.bold(INFO) + K.gray(`  Typecheck finished in ${duration.toFixed(0)}ms`));
}
