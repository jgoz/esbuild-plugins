import type { Plugin } from 'esbuild';

import { TypecheckRunner } from './typecheck-runner';
import type { TypecheckPluginOptions } from './types';

export function typecheckPlugin({
  configFile,
  watch: forceWatch,
  ...options
}: TypecheckPluginOptions = {}): Plugin {
  return {
    name: 'typecheck-plugin',
    setup(build) {
      const { absWorkingDir = process.cwd(), tsconfig, watch } = build.initialOptions;

      const runner = new TypecheckRunner({
        ...options,
        absWorkingDir,
        configFile: configFile ?? tsconfig,
        watch: !!forceWatch || !!watch,
      });

      build.onStart(() => {
        runner.start();
      });
    },
  };
}
