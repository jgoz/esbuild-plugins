import type { Plugin } from 'esbuild';
import path from 'path';
import ts from 'typescript';

import { BuilderOptions } from './builder';
import { compileBuilder } from './compile-builder';
import { solutionBuilder } from './solution-builder';

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

      if (buildMode) {
        solutionBuilder(builderOptions);
      } else {
        compileBuilder(builderOptions);
      }
    },
  };
}
