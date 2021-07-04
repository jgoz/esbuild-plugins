import type { Plugin } from 'esbuild';
import { enabled as colorEnabled } from 'kleur';
import path from 'path';
import ts from 'typescript';
import { Worker } from 'worker_threads';

import type { WorkerMessage } from './reporter';
import type { TypescriptWorkerOptions } from './typescript-worker';

export interface TypecheckPluginOptions {
  build?: boolean | ts.BuildOptions;
  compilerOptions?: ts.CompilerOptions;
  configFile?: string;
}

export function typecheckPlugin(options: TypecheckPluginOptions = {}): Plugin {
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

      worker.on('message', (msg: WorkerMessage) => {
        // TODO: emit message to livereload

        if (msg.type === 'done' && msg.errorCount > 0) {
          process.exitCode = 1;
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
