import type { notify as lrNotify } from '@jgoz/esbuild-plugin-livereload';
import type { Message } from 'esbuild';
import path from 'path';
import pc from 'picocolors';
import { Worker } from 'worker_threads';

import type { Logger, TypecheckPluginOptions } from './types';
import type { TypescriptWorkerOptions, WorkerMessage } from './typescript-worker';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

const DEFAULT_LOGGER: Logger = {
  info(message) {
    console.info(pc.bold(INFO) + '  ' + message);
  },
  warn(message) {
    console.warn(pc.bold(pc.yellow(WARNING)) + '  ' + message);
  },
  error(message) {
    console.error(pc.bold(pc.red(ERROR)) + '  ' + message);
  },
  success(message) {
    console.info(pc.bold(SUCCESS) + '  ' + pc.green(message));
  },
};

const BUILD_MSG: WorkerMessage = { type: 'build' };

let notify: typeof lrNotify = () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notify = require('@jgoz/esbuild-plugin-livereload').notify;
} catch {}

export interface TypecheckRunnerOptions extends TypecheckPluginOptions {
  absWorkingDir: string;
}

export class TypecheckRunner {
  configPath: string;
  logger: Logger;
  worker: Worker;

  constructor({
    absWorkingDir: basedir,
    logger = DEFAULT_LOGGER,
    omitStartLog,
    watch,
    ...options
  }: TypecheckRunnerOptions) {
    const inputConfigFile = options.configFile;
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

    this.configPath = configFile ?? basedir;
    this.logger = logger;
    this.worker = new Worker(path.resolve(__dirname, './typescript-worker.js'), { workerData });

    let errors: Message[] = [];
    let warnings: Message[] = [];
    let isBuilding: boolean | undefined;
    let isWatching: boolean | undefined;

    this.worker.on('message', (msg: WorkerMessage) => {
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

          const err = pc.isColorSupported ? msg.output.pretty : msg.output.standard;
          if (err) console.error(err);
          break;
        }
        case 'done': {
          notify('typecheck-plugin', { added: [], removed: [], updated: [], errors, warnings });

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

    this.worker.on('error', e => {
      console.error(e);
      process.exitCode = 1;
    });

    this.worker.on('exit', code => {
      if (code !== 0) process.exitCode = code;
    });
  }

  start() {
    this.worker.postMessage(BUILD_MSG);
  }
}

function logStarted(logger: Logger, { build = false, watch = false } = {}) {
  const opts = [build && 'build', watch && 'watch'].filter(Boolean).join(', ');
  const optStr = opts ? pc.cyan(` (${opts})`) : '';

  logger.info('Typecheck started…' + optStr);
}

function logPassed(logger: Logger, duration: number) {
  logger.success('Typecheck passed');
  logger.info(pc.gray(`Typecheck finished in ${duration.toFixed(0)}ms`));
}

function logFailed(logger: Logger, numErrors: string, duration: number) {
  logger.error(`Typecheck failed with ${pc.bold(numErrors)}`);
  logger.info(pc.gray(`Typecheck finished in ${duration.toFixed(0)}ms`));
}
