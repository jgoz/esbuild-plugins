import { typecheckPlugin } from '@jgoz/esbuild-plugin-typecheck/lib';
import { Command, Option } from 'commander';
import path from 'path';

import {
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
import { createLogger, LOG_LEVELS, Logger } from './log';

const { version } = require('../package.json');

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
  respawn?: boolean;
}

function updateConfig(
  program: Command,
  config: EsbdConfig,
  logger: Logger,
  watch?: boolean,
): ResolvedEsbdConfig {
  config.absWorkingDir ??= process.cwd();
  config.logLevel = logger.logLevel;
  config.outdir ??= path.join(config.absWorkingDir, 'dist');
  config.plugins ??= [];

  if (program.opts().check) {
    const buildMode = program.opts().tsBuildMode;
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

function commandWithGlobalOpts(program: Command, command: string) {
  return program
    .command(command)
    .addOption(
      new Option('-l, --log-level <level>', 'logging level [default="warning"]').choices(
        LOG_LEVELS,
      ),
    )
    .addOption(
      new Option('-m, --mode <mode>', 'output build mode').choices(['development', 'production']),
    )
    .option('-t, --check', 'check types asynchronously with the TypeScript compiler')
    .addOption(
      new Option('--ts-build-mode <mode>', 'TypeScript "build" mode behavior')
        .choices(['readonly', 'write-output'])
        .default('write-output'),
    );
}

export default function init(configParam: EsbdConfigResult | ConfigFn) {
  const programName = path.relative(process.cwd(), process.argv[1]);
  const program = new Command(programName).version(version);
  const mode: BuildMode = program.opts().mode ?? 'development';

  commandWithGlobalOpts(program, 'build [name]')
    .description('Entry point bundler powered by esbuild')
    .option('-w, --watch', 'watch for changes and rebuild')
    .action(async (name: string | undefined, options: BuildOptions, command: Command) => {
      const { watch = false } = options;
      const configResult =
        typeof configParam === 'function' ? await configParam(mode, 'build') : configParam;

      const configs = Array.isArray(configResult)
        ? name
          ? configResult.filter(c => c.name === name)
          : configResult
        : [configResult];

      for (const config of configs) {
        const logger = createLogger(command.opts().logLevel ?? config.logLevel ?? 'warning');
        await esbdBuild(updateConfig(command, config, logger, watch), {
          mode,
          logger,
          watch,
        });
      }
    });

  commandWithGlobalOpts(program, 'node-dev [name]')
    .description('Node application development host')
    .option('-r, --respawn', 'restart program on exit/error (but quit after 3 restarts within 5s)')
    .addHelpText(
      'after',
      '\nArguments that appear after a special -- argument will be passed to the node program.' +
        '\n\nExample:' +
        '\n\tnode-dev path/to/entry.ts -- --port 8080 --config my-config.json',
    )
    .action(async (name: string, options: NodeDevOptions, command: Command) => {
      const { respawn = false } = options;
      const configResult =
        typeof configParam === 'function' ? await configParam(mode, 'node-dev') : configParam;

      const config = getSingleConfigResult(
        'node-dev',
        configResult,
        c => c.name === name,
        c => c.platform === 'node',
      );

      const logger = createLogger(command.opts().logLevel ?? config.logLevel ?? 'warning');
      await nodeDev(updateConfig(command, config, logger, true), {
        args: command.args,
        logger,
        mode,
        respawn,
      });
    });

  commandWithGlobalOpts(program, 'serve [name]')
    .description('Single page application development server')
    .option('-d, --servedir <path>', 'directory of additional static assets to serve')
    .option('-l, --livereload', 'reload page on rebuild')
    .option('-h, --host <host>', 'IP/host name to use when serving requests', 'localhost')
    .option('-p, --port <port>', 'port to use', '8000')
    .option('--rewrite', 'rewrite all not-found requests to "index.html" (SPA mode)', true)
    .option('--no-rewrite', 'disable request rewriting')
    .action(async (name: string, options: ServeOptions, command: Command) => {
      const { host, port = '8000', livereload, servedir, rewrite } = options;
      const configResult =
        typeof configParam === 'function' ? await configParam(mode, 'serve') : configParam;

      const config = getSingleConfigResult(
        'serve',
        configResult,
        c => c.name === name,
        c => !c.platform || c.platform === 'browser',
      );

      const logger = createLogger(command.opts().logLevel ?? config.logLevel ?? 'warning');
      await serve(updateConfig(command, config, logger, true), {
        mode,
        host,
        port: Number(port),
        livereload,
        logger,
        servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
        rewrite,
      });
    });

  process.on('unhandledRejection', (reason: Error) => {
    console.error(`An error occurred that caused ${programName} to shut down.`);
    console.error(reason.stack ?? reason);
    process.exit(1);
  });

  return program.parse(process.argv);
}
