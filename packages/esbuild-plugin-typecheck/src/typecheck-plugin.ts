import type { notify as lrNotify } from '@jgoz/esbuild-plugin-livereload';
import type { Message, Plugin } from 'esbuild';
import { EventEmitter } from 'events';
import { enabled as colorEnabled } from 'kleur';
import path from 'path';
import ts from 'typescript';
import { Worker } from 'worker_threads';

import type { TypescriptWorkerOptions, WorkerMessage } from './typescript-worker';

const START_MSG: WorkerMessage = { type: 'start' };

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
        env: {
          ...process.env,
          FORCE_COLOR: colorEnabled ? '1' : undefined,
        },
        workerData: workerOptions,
      });

      let errors: Message[] = [];
      let warnings: Message[] = [];

      worker.on('message', (msg: WorkerMessage) => {
        if (msg.type === 'start') {
          errors = [];
          warnings = [];
        }
        if (msg.type === 'diagnostic') {
          errors.push(...msg.diagnostics.filter(d => d.type === 'error').map(d => d.message));
          warnings.push(...msg.diagnostics.filter(d => d.type === 'warning').map(d => d.message));
        }
        if (msg.type === 'done') {
          if (msg.errorCount > 0) process.exitCode = 1;
          notify('typecheck-plugin', { errors, warnings });
          sync.emit('done');
        }
      });

      worker.on('error', () => {
        process.exitCode = 1;
      });

      worker.on('exit', code => {
        if (code !== 0) process.exitCode = code;
      });

      build.onStart(() => {
        worker.postMessage(START_MSG);
      });

      if (options.syncWithEsbuild) {
        build.onEnd(async () => {
          await new Promise(resolve => {
            sync.once('done', resolve);
          });
        });
      }
    },
  };
}
