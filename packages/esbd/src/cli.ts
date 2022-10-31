import { cli, command } from 'cleye';
import type { LogLevel } from 'esbuild';
import path from 'path';

import type {
  BuildMode,
  ConfigFn,
  EsbdConfig,
  EsbdConfigResult,
  NamedEsbdConfig,
  ResolvedEsbdConfig,
  TsBuildMode,
} from './config';
import { BUILD_MODES, TS_BUILD_MODES } from './config';
import esbdBuildMulti from './esbd-build';
import nodeDev from './esbd-node-dev';
import serve from './esbd-serve';
import { createLogger, LOG_LEVELS, LogLevelType } from './log';

const version = require('../package.json').version;

function updateConfig(config: EsbdConfig, logLevel: LogLevel): ResolvedEsbdConfig {
  config.absWorkingDir ??= process.cwd();
  config.logLevel = logLevel;
  config.outdir ??= path.join(config.absWorkingDir, 'dist');
  config.plugins ??= [];

  return config as ResolvedEsbdConfig;
}

function getSingleConfigResult(
  commandName: string,
  configResult: EsbdConfigResult,
  ...predicates: ((config: NamedEsbdConfig) => boolean)[]
): EsbdConfig {
  const config = Array.isArray(configResult)
    ? configResult.length === 1
      ? configResult[0]
      : predicates.map(predicate => configResult.find(predicate)).filter(Boolean)[0]
    : configResult;

  if (!config) {
    console.error(`You must specify a single configuration name when running ${commandName}`);
    if (Array.isArray(configResult)) {
      console.log(`Config names: ${configResult.map(r => r.name).join(', ')}`);
    }
    process.exit(1);
  }

  return config;
}

function ModeType(mode: BuildMode) {
  if (!BUILD_MODES.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }
  return mode;
}

function BuildModeType(mode: TsBuildMode) {
  if (!TS_BUILD_MODES.includes(mode)) {
    throw new Error(`Invalid TypeScript build mode: ${mode}`);
  }
  return mode;
}

const globalFlags = {
  logLevel: {
    type: LogLevelType,
    alias: 'l',
    description: `Logging level (${LOG_LEVELS.join(', ')}) (default: "info")`,
  },
  mode: {
    type: ModeType,
    alias: 'm',
    default: 'development',
    description: 'Build mode (development, production)',
  },
  check: {
    type: Boolean,
    alias: 't',
    default: false,
    description: 'Check types asynchronously with the TypeScript compiler',
  },
  tsBuildMode: {
    type: BuildModeType,
    default: 'write-output',
    description: 'TypeScript "build" mode behavior (readonly, write-output)',
  },
} as const;

function parseArgv(programName: string) {
  try {
    return cli({
      name: programName,
      version,
      commands: [
        command({
          name: 'build',
          help: {
            description: 'Entry point bundler powered by esbuild',
          },
          parameters: ['[name]'],
          flags: {
            ...globalFlags,
            watch: {
              type: Boolean,
              alias: 'w',
              default: false,
              description: 'Watch for changes and rebuild',
            },
          },
        }),
        command({
          name: 'node-dev',
          help: {
            description: 'Node application development host',
            examples: ['-r -- --port 8080 --config my-config.json'],
          },
          parameters: ['[name]'],
          flags: {
            ...globalFlags,
            respawn: {
              type: Boolean,
              alias: 'r',
              default: false,
              description: 'Restart program on exit/error (but quit after 3 restarts within 5s)',
            },
          },
        }),
        command({
          name: 'serve',
          help: {
            description: 'Single page application development server',
          },
          parameters: ['[name]'],
          flags: {
            ...globalFlags,
            servedir: {
              type: String,
              alias: 'd',
              placeholder: '<path>',
              description: 'Directory of additional static assets to serve',
            },
            livereload: {
              type: Boolean,
              alias: 'r',
              default: false,
              description: 'Reload page on rebuild',
            },
            livereloadHost: {
              type: String,
              default: '127.0.0.1',
              description: 'Host for livereload server',
            },
            host: {
              type: String,
              alias: 's',
              default: '127.0.0.1',
              description: 'Development server IP/host name',
            },
            port: {
              type: Number,
              alias: 'p',
              default: 8000,
              description: 'Development server port',
            },
            noRewrite: {
              type: Boolean,
              default: false,
              description: 'Disable rewriting of all requests to "index.html" (SPA mode)',
            },
          },
        }),
      ],
    });
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
    } else {
      console.error(String(e));
    }
    process.exit(1);
  }
}

let initialized = false;

/**
 * Configures one or more bundles that will be produced by this build script.
 *
 * @param configParam Configuration object, array, or function that defines the bundles.
 */
export default function configure(configParam: EsbdConfigResult | ConfigFn) {
  if (initialized) {
    console.error('"configure()" can only be used once per file');
    process.exit(1);
  }
  initialized = true;

  const programName = path.basename(path.relative(process.cwd(), process.argv[1]));
  const argv = parseArgv(programName);

  async function run() {
    switch (argv.command) {
      case 'build': {
        const { logLevel, mode, watch } = argv.flags;
        const configResult =
          typeof configParam === 'function' ? await configParam(mode, 'build') : configParam;

        const configs = Array.isArray(configResult)
          ? argv._.name
            ? configResult.filter(c => c.name === argv._.name)
            : configResult
          : [configResult];

        const logLevels = configs
          .map(config => LOG_LEVELS.indexOf(config.logLevel ?? 'info'))
          .filter(i => i >= 0);

        const minLogLevel = logLevels.length > 0 ? LOG_LEVELS[Math.min(...logLevels)] : 'info';
        const logger = createLogger(minLogLevel);

        await esbdBuildMulti(
          configs.map(config => updateConfig(config, logLevel ?? config.logLevel ?? 'info')),
          { logger, mode, watch, check: argv.flags.check, tsBuildMode: argv.flags.tsBuildMode },
        );
        break;
      }

      case 'node-dev': {
        const { logLevel, mode, respawn } = argv.flags;
        const configResult =
          typeof configParam === 'function' ? await configParam(mode, 'node-dev') : configParam;

        const config = getSingleConfigResult(
          'node-dev',
          configResult,
          c => c.name === argv._.name,
          c => c.platform === 'node',
        );

        const logger = createLogger(logLevel ?? config.logLevel ?? 'info');
        await nodeDev(updateConfig(config, logger.logLevel), {
          args: argv._['--'] ?? [],
          logger,
          mode,
          respawn,
          check: argv.flags.check,
          tsBuildMode: argv.flags.tsBuildMode,
        });
        break;
      }

      case 'serve': {
        const { host, mode, logLevel, port, livereload, livereloadHost, servedir, noRewrite } =
          argv.flags;
        const configResult =
          typeof configParam === 'function' ? await configParam(mode, 'serve') : configParam;

        const config = getSingleConfigResult(
          'serve',
          configResult,
          c => c.name === argv._.name,
          c => !c.platform || c.platform === 'browser',
        );

        const logger = createLogger(logLevel ?? config.logLevel ?? 'info');
        await serve(updateConfig(config, logger.logLevel), {
          mode,
          host,
          port,
          livereload,
          livereloadHost,
          logger,
          servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
          rewrite: !noRewrite,
          check: argv.flags.check,
          tsBuildMode: argv.flags.tsBuildMode,
        });
        break;
      }

      case undefined:
        argv.showHelp();
        console.error('Expected one of the following commands: build, node-dev, serve');
        process.exitCode = 1;
        break;
    }
  }

  process.on('unhandledRejection', (reason: Error) => {
    console.error(`An error occurred that caused ${programName} to shut down.`);
    console.error(reason.stack ?? reason);
    process.exit(1);
  });

  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
