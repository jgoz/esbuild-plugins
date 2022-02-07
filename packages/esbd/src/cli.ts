import type { typecheckPlugin as typecheckPluginFn } from '@jgoz/esbuild-plugin-typecheck';
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
} from './config';
import esbdBuild from './esbd-build';
import nodeDev from './esbd-node-dev';
import serve from './esbd-serve';
import type { Logger } from './log';
import { createLogger, LOG_LEVELS, LogLevelType } from './log';

const version = require('../package.json').version;

interface GlobalOptions {
  check?: boolean;
  logLevel?: LogLevel;
  mode: BuildMode;
  tsBuildMode?: TsBuildModes;
}

function updateConfig(
  options: GlobalOptions,
  config: EsbdConfig,
  logger: Logger,
  watch?: boolean,
): ResolvedEsbdConfig {
  config.absWorkingDir ??= process.cwd();
  config.logLevel = logger.logLevel;
  config.outdir ??= path.join(config.absWorkingDir, 'dist');
  config.plugins ??= [];

  if (options.check) {
    const typecheckPlugin: typeof typecheckPluginFn =
      require('@jgoz/esbuild-plugin-typecheck').typecheckPlugin;

    const buildMode = options.tsBuildMode;
    config.plugins.push(
      typecheckPlugin({
        configFile: config.tsconfig,
        build: buildMode ? true : undefined,
        buildMode,
        logger,
        omitStartLog: true,
        watch,
      }),
    );
  }

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

const MODES = ['development', 'production'] as const;
type Modes = typeof MODES[number];

function ModeType(mode: Modes) {
  if (!MODES.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }
  return mode;
}

const TS_BUILD_MODES = ['readonly', 'write-output'] as const;
type TsBuildModes = typeof TS_BUILD_MODES[number];

function BuildModeType(mode: TsBuildModes) {
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

  const argv = cli({
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
          host: {
            type: String,
            alias: 's',
            default: 'localhost',
            description: 'Development server IP/host name',
          },
          port: {
            type: Number,
            alias: 'p',
            default: 8000,
            description: 'Development server port',
          },
          rewrite: {
            type: Boolean,
            default: true,
            description: 'Rewrite all not-found requests to "index.html" (SPA mode)',
          },
        },
      }),
    ],
  });

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

        for (const config of configs) {
          const logger = createLogger(logLevel ?? config.logLevel ?? 'info');
          await esbdBuild(updateConfig(argv.flags, config, logger, watch), {
            mode,
            logger,
            watch,
          });
        }
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
        await nodeDev(updateConfig(argv.flags, config, logger, true), {
          args: argv._['--'] ?? [],
          logger,
          mode,
          respawn,
        });
        break;
      }

      case 'serve': {
        const { host, mode, logLevel, port, livereload, servedir, rewrite } = argv.flags;
        const configResult =
          typeof configParam === 'function' ? await configParam(mode, 'serve') : configParam;

        const config = getSingleConfigResult(
          'serve',
          configResult,
          c => c.name === argv._.name,
          c => !c.platform || c.platform === 'browser',
        );

        const logger = createLogger(logLevel ?? config.logLevel ?? 'warning');
        await serve(updateConfig(argv.flags, config, logger, true), {
          mode,
          host,
          port,
          livereload,
          logger,
          servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
          rewrite,
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
