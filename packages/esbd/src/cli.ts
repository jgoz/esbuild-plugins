import { typecheckPlugin } from '@jgoz/esbuild-plugin-typecheck/lib';
import type { LogLevel } from 'esbuild';
import path from 'path';
import sade from 'sade';

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
import { createLogger, LOG_LEVELS } from './log';

const version = require('../package.json').version;

interface GlobalOptions {
  check?: boolean;
  logLevel?: LogLevel;
  mode: BuildMode;
  tsBuildMode?: 'readonly' | 'write-output';
}

interface BuildOptions {
  watch?: boolean;
}

interface ServeOptions {
  host?: string;
  port?: string;
  livereload?: boolean;
  servedir?: string;
  rewrite: boolean;
}

interface NodeDevOptions {
  _?: string[];
  respawn?: boolean;
}

function validateOptions<T extends GlobalOptions>(opts: T): T {
  if (opts.logLevel && !LOG_LEVELS.includes(opts.logLevel)) {
    console.error(`Invalid --log-level option: ${opts.logLevel}`);
    process.exit(1);
  }
  if (opts.mode !== 'development' && opts.mode !== 'production') {
    console.error(`Invalid --mode option: ${opts.mode}`);
    process.exit(1);
  }
  if (opts.tsBuildMode && opts.tsBuildMode !== 'readonly' && opts.tsBuildMode !== 'write-output') {
    console.error(`Invalid --ts-build-mode option: ${opts.tsBuildMode}`);
    process.exit(1);
  }
  return opts;
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

let initialized = false;

export default function bundle(configParam: EsbdConfigResult | ConfigFn) {
  if (initialized) {
    console.error('"bundle()" can only be used once per file');
    process.exit(1);
  }
  initialized = true;

  const programName = path.relative(process.cwd(), process.argv[1]);
  const prog = sade(programName);

  prog
    .version(version)
    .describe('Bundles a web or node application')
    .option('-l, --log-level <level>', `logging level [${LOG_LEVELS}] (default warning)`)
    .option('-m, --mode <mode>', 'build mode [development,production]', 'development')
    .option('-t, --check', 'check types asynchronously with the TypeScript compiler')
    .option(
      '--ts-build-mode',
      'TypeScript "build" mode behavior [readonly,write-output]',
      'write-output',
    )
    // Command: build
    .command('build [name]', 'Entry point bundler powered by esbuild (Default command)', {
      default: true,
    })
    .option('-w, --watch', 'watch for changes and rebuild')
    .action(async (name: string | undefined, options: GlobalOptions & BuildOptions) => {
      const { logLevel, mode, watch = false } = validateOptions(options);
      const configResult =
        typeof configParam === 'function' ? await configParam(mode, 'build') : configParam;

      const configs = Array.isArray(configResult)
        ? name
          ? configResult.filter(c => c.name === name)
          : configResult
        : [configResult];

      for (const config of configs) {
        const logger = createLogger(logLevel ?? config.logLevel ?? 'warning');
        await esbdBuild(updateConfig(options, config, logger, watch), {
          mode,
          logger,
          watch,
        });
      }
    })
    // Command: node-dev
    .command('node-dev [name]', 'Node application development host')
    .example('-r -- --port 8080 --config my-config.json')
    .option('-r, --respawn', 'restart program on exit/error (but quit after 3 restarts within 5s)')
    .action(async (name: string, options: GlobalOptions & NodeDevOptions) => {
      const { logLevel, mode, respawn = false } = validateOptions(options);
      const configResult =
        typeof configParam === 'function'
          ? await configParam(options.mode, 'node-dev')
          : configParam;

      const config = getSingleConfigResult(
        'node-dev',
        configResult,
        c => c.name === name,
        c => c.platform === 'node',
      );

      const logger = createLogger(logLevel ?? config.logLevel ?? 'warning');
      await nodeDev(updateConfig(options, config, logger, true), {
        args: options._ ?? [],
        logger,
        mode,
        respawn,
      });
    })
    // Command: serve
    .command('serve [name]', 'Single page application development server')
    .option('-d, --servedir <path>', 'directory of additional static assets to serve')
    .option('-r, --livereload', 'reload page on rebuild')
    .option('-h, --host <host>', 'IP/host name to use when serving requests', 'localhost')
    .option('-p, --port <port>', 'port to use', '8000')
    .option('--rewrite', 'rewrite all not-found requests to "index.html" (SPA mode)', true)
    .option('--no-rewrite', 'disable request rewriting')
    .action(async (name: string, options: GlobalOptions & ServeOptions) => {
      const {
        host,
        mode,
        logLevel,
        port = '8000',
        livereload,
        servedir,
        rewrite,
      } = validateOptions(options);

      const configResult =
        typeof configParam === 'function' ? await configParam(mode, 'serve') : configParam;

      const config = getSingleConfigResult(
        'serve',
        configResult,
        c => c.name === name,
        c => !c.platform || c.platform === 'browser',
      );

      const logger = createLogger(logLevel ?? config.logLevel ?? 'warning');
      await serve(updateConfig(options, config, logger, true), {
        mode,
        host,
        port: Number(port),
        livereload,
        logger,
        servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
        rewrite,
      });
    });

  prog.parse(process.argv);

  process.on('unhandledRejection', (reason: Error) => {
    console.error(`An error occurred that caused ${programName} to shut down.`);
    console.error(reason.stack ?? reason);
    process.exit(1);
  });
}
