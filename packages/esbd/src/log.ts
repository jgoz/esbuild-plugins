import type { LogLevel } from 'esbuild';
import type { Spinner } from 'io-spin';
import spin from 'io-spin';
import pc from 'picocolors';
import prettyTime from 'pretty-time';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

export interface TimedSpinner extends Omit<Spinner, 'stop'> {
  stop(): [string, [number, number]];
}

export interface Logger {
  logLevel: LogLevel;
  verbose(message: any, ...args: any[]): void;
  info(message: any, ...args: any[]): void;
  warn(message: any, ...args: any[]): void;
  error(message: any, ...args: any[]): void;
  success(message: any, ...args: any[]): void;
  spin(message: string): TimedSpinner;
}

export const LOG_LEVELS: LogLevel[] = ['verbose', 'debug', 'info', 'warning', 'error', 'silent'];

const LEVEL_VERBOSE = LOG_LEVELS.indexOf('verbose');
const LEVEL_INFO = LOG_LEVELS.indexOf('info');
const LEVEL_WARNING = LOG_LEVELS.indexOf('warning');
const LEVEL_ERROR = LOG_LEVELS.indexOf('error');

export function createLogger(logLevel: LogLevel): Logger {
  let busy = false;
  const queue: (() => void)[] = [];

  function enqueueOrFlush(fn: () => void) {
    if (busy) {
      queue.push(fn);
    } else {
      fn();
    }
  }

  const levelIndex = LOG_LEVELS.indexOf(logLevel);

  return {
    logLevel,
    verbose(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_VERBOSE) return;
      enqueueOrFlush(() => console.log(message, ...args));
    },
    info(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_INFO) return;
      enqueueOrFlush(() => {
        console.info(pc.bold(INFO) + '  ' + String(message), ...args);
      });
    },
    warn(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_WARNING) return;
      enqueueOrFlush(() => {
        console.warn(pc.bold(pc.yellow(WARNING)) + '  ' + pc.yellow(message), ...args);
      });
    },
    error(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_ERROR) return;
      enqueueOrFlush(() => {
        console.warn(pc.bold(pc.red(ERROR)) + '  ' + pc.red(message), ...args);
      });
    },
    success(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_WARNING) return;
      enqueueOrFlush(() => {
        console.info(pc.bold(pc.green(SUCCESS)) + '  ' + pc.green(message), ...args);
      });
    },

    spin(message: string): TimedSpinner {
      busy = true;
      const startTime = process.hrtime();

      function doStop() {
        busy = false;
        while (queue.length) {
          const fn = queue.shift();
          fn?.();
        }
        const endTime = process.hrtime(startTime);
        return [prettyTime(endTime, 'ms'), endTime] as [string, [number, number]];
      }

      if (!process.stdout.isTTY) {
        return {
          start() {
            return this as any;
          },
          stop() {
            return doStop();
          },
          update() {
            return this as any;
          },
        };
      }

      const spinner = spin(pc.cyan(message), 'Box7').start();
      return {
        start: spinner.start,
        stop() {
          spinner.stop();
          return doStop();
        },
        update(updatedMessage) {
          return spinner.update(pc.cyan(updatedMessage));
        },
      };
    },
  };
}
