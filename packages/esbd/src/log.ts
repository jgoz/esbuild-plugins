import spin, { Spinner } from 'io-spin';
import K from 'kleur';
import prettyTime from 'pretty-time';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

export interface TimedSpinner extends Omit<Spinner, 'stop'> {
  stop(): [string, [number, number]];
}

export const logger = {
  info(message: any, ...args: any[]) {
    console.info(K.bold(INFO) + '  ' + String(message), ...args);
  },
  warn(message: any, ...args: any[]) {
    console.warn(K.bold().yellow(WARNING) + '  ' + K.yellow(message), ...args);
  },
  error(message: any, ...args: any[]) {
    console.warn(K.bold().red(ERROR) + '  ' + K.red(message), ...args);
  },
  success(message: any, ...args: any[]) {
    console.info(K.bold().green(SUCCESS) + '  ' + K.green(message), ...args);
  },

  spin(message: string): TimedSpinner {
    const spinner = spin(K.cyan(message), 'Box7').start();
    const startTime = process.hrtime();
    return {
      start: spinner.start,
      stop() {
        spinner.stop();
        const endTime = process.hrtime(startTime);
        return [prettyTime(endTime, 'ms'), endTime];
      },
      update(updatedMessage) {
        return spinner.update(K.cyan(updatedMessage));
      },
    };
  },
};
