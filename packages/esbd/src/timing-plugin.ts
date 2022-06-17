import type { Plugin } from 'esbuild';
import pc from 'picocolors';

import type { Logger, TimedSpinner } from './log';

export function timingPlugin(
  logger: Logger,
  name: string | undefined,
  progressMessage = 'Building…',
): Plugin {
  const buildName = name ? `${name} ` : '';

  let spinner: TimedSpinner;
  return {
    name: 'esbd-timing',
    setup(build) {
      build.onStart(() => {
        spinner = logger.spin(progressMessage);
      });
      build.onEnd(result => {
        if (!spinner) return;

        const [time] = spinner.stop();
        const numErrors = result.errors?.length ?? 0;
        const numWarnings = result.warnings?.length ?? 0;
        const log = numErrors ? logger.error : numWarnings ? logger.warn : logger.success;
        log(
          `Finished ${buildName}with ${pc.white(numErrors)} error(s) and ${pc.white(
            numWarnings,
          )} warning(s) in ${pc.gray(time)}`,
        );
      });
    },
  };
}
