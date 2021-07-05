import type { notify as lrNotify } from '@jgoz/esbuild-plugin-livereload';
import type { Message, Plugin } from 'esbuild';
import { EventEmitter } from 'events';
import K from 'kleur';
import path from 'path';
import ts from 'typescript';
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
  build?: boolean | ts.BuildOptions;
  compilerOptions?: ts.CompilerOptions;
  configFile?: string;
  syncWithEsbuild?: boolean;
}

export function typecheckPlugin(options: TypecheckPluginOptions = {}): Plugin {
  const sync = new EventEmitter();

  return {
    name: 'typecheck-plugin',
    setup(build) {
      const { absWorkingDir: basedir = process.cwd(), tsconfig, watch } = build.initialOptions;
      const { compilerOptions } = options;

      const inputConfigFile = options.configFile ?? tsconfig;
      const configFile = inputConfigFile
        ? path.isAbsolute(inputConfigFile)
          ? inputConfigFile
          : path.resolve(basedir, inputConfigFile)
        : ts.findConfigFile(basedir, ts.sys.fileExists, 'tsconfig.json');

      if (!configFile) {
        throw new Error(`Could not find a valid "tsconfig.json" (searching in "${basedir}").`);
      }

      const { config } = ts.readConfigFile(configFile, ts.sys.readFile);
      config.compilerOptions = { ...config.compilerOptions, ...compilerOptions };

      const commandLine = ts.parseJsonConfigFileContent(config, ts.sys, basedir);
      const workerOptions: TypescriptWorkerOptions = {
        basedir,
        build: options.build ?? commandLine.options.composite ?? false,
        commandLine,
        configFile,
        watch: !!watch,
      };

      const worker = new Worker(path.resolve(__dirname, './typescript-worker.js'), {
        workerData: workerOptions,
      });

      let errors: Message[] = [];
      let warnings: Message[] = [];

      build.onStart(() => {
        worker.postMessage(BUILD_MSG);
      });

      if (options.syncWithEsbuild) {
        build.onEnd(async () => {
          await new Promise(resolve => {
            sync.once('done', resolve);
          });
        });
      }

      worker.on('message', (msg: WorkerMessage) => {
        switch (msg.type) {
          case 'start': {
            errors = [];
            warnings = [];
            logStarted({ build: !!workerOptions.build, watch: workerOptions.watch });
            break;
          }
          case 'summary':
          case 'diagnostic': {
            errors.push(...msg.diagnostics.filter(d => d.type === 'error').map(d => d.message));
            warnings.push(...msg.diagnostics.filter(d => d.type === 'warning').map(d => d.message));
            console.error(msg.output.pretty);
            break;
          }
          case 'done': {
            sync.emit('done');
            notify('typecheck-plugin', { errors, warnings });

            if (msg.errorCount) {
              logFailed(
                msg.errorCount === 1 ? '1 error' : `${msg.errorCount} errors`,
                msg.duration,
              );
              process.exitCode = 1;
            } else {
              logPassed(msg.duration);
            }

            break;
          }
          case 'build':
            break; // should not be sent
        }
      });

      worker.on('error', () => {
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
