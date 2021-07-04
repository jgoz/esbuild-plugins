import type { Plugin } from 'esbuild';
import { enabled as colorEnabled } from 'kleur';
import path from 'path';
import ts from 'typescript';
import { Worker } from 'worker_threads';

import { BuilderOptions, DoneMessage, PostedDiagnosticMessage } from './builder';

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
      const builderOptions: BuilderOptions = {
        basedir,
        commandLine,
        configFile,
        watch: !!watch,
      };

      const buildMode = options.build ?? commandLine.options.composite;
      const workerScript = path.resolve(
        __dirname,
        buildMode ? './solution-builder.js' : './compile-builder.js',
      );
      const worker = new Worker(workerScript, {
        env: {
          ...process.env,
          FORCE_COLOR: colorEnabled ? '1' : undefined,
        },
        workerData: builderOptions,
      });

      worker.on('message', (msg: PostedDiagnosticMessage | DoneMessage) => {
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
