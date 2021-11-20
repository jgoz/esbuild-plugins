import type { LogLevel } from 'esbuild';
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

export interface Logger {
  logLevel: LogLevel;
  info(message: any, ...args: any[]): void;
  warn(message: any, ...args: any[]): void;
  error(message: any, ...args: any[]): void;
  success(message: any, ...args: any[]): void;
  spin(message: string): TimedSpinner;
}

export const LOG_LEVELS: LogLevel[] = ['verbose', 'debug', 'info', 'warning', 'error', 'silent'];

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
    info(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_INFO) return;
      enqueueOrFlush(() => {
        console.info(K.bold(INFO) + '  ' + String(message), ...args);
      });
    },
    warn(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_WARNING) return;
      enqueueOrFlush(() => {
        console.warn(K.bold().yellow(WARNING) + '  ' + K.yellow(message), ...args);
      });
    },
    error(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_ERROR) return;
      enqueueOrFlush(() => {
        console.warn(K.bold().red(ERROR) + '  ' + K.red(message), ...args);
      });
    },
    success(message: any, ...args: any[]) {
      if (levelIndex > LEVEL_WARNING) return;
      enqueueOrFlush(() => {
        console.info(K.bold().green(SUCCESS) + '  ' + K.green(message), ...args);
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

      const spinner = spin(K.cyan(message), 'Box7').start();
      return {
        start: spinner.start,
        stop() {
          spinner.stop();
          return doStop();
        },
        update(updatedMessage) {
          return spinner.update(K.cyan(updatedMessage));
        },
      };
    },
  };
}
