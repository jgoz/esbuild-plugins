import type { Plugin } from 'esbuild';
import K from 'kleur';

import { logger, TimedSpinner } from './log';

export function timingPlugin(progressMessage = 'Building…'): Plugin {
  let spinner: TimedSpinner;
  return {
    name: 'esbd-timing',
    setup(build) {
      build.onStart(() => {
        spinner = logger.spin(progressMessage);
      });
      build.onEnd(result => {
        const [time] = spinner.stop();
        const numErrors = result.errors.length;
        const numWarnings = result.warnings.length;
        const log = numErrors ? logger.error : numWarnings ? logger.warn : logger.success;
        log(
          `Finished with ${K.white(numErrors)} error(s) and ${K.white(
            numWarnings,
          )} warning(s) in ${K.gray(time)}`,
        );
      });
    },
  };
}
