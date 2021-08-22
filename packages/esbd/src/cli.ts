import { typecheckPlugin } from '@jgoz/esbuild-plugin-typecheck';
import { Command, Option } from 'commander';
import path from 'path';

import {
  BuildMode,
  CommandName,
  EsbdConfigResult,
  EsbdConfigWithPlugins,
  findConfigFile,
  readConfig,
} from './config';
import esbdBuild from './esbd-build';
import nodeDev from './esbd-node-dev';
import serve from './esbd-serve';
import { createLogger, Logger } from './log';

// eslint-disable-next-line @typescript-eslint/no-var-requires
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

function getEntryNameAndPath(entry: string): [entryPath: string, entryName: string | undefined] {
  const [entryName, entryPath] = entry.split(':');
  return entryPath ? [entryPath, entryName] : [entryName, undefined];
}

async function getConfigAndMode(
  commandName: CommandName,
  program: Command,
  entryPath: string,
  logger: Logger,
  watch?: boolean,
): Promise<[EsbdConfigWithPlugins, BuildMode]> {
  const absEntryPath = path.resolve(process.cwd(), entryPath);
  const maybeConfigPath = program.opts().config;
  const mode: BuildMode = program.opts().mode ?? 'development';

  const configPath = maybeConfigPath
    ? path.resolve(process.cwd(), maybeConfigPath)
    : await findConfigFile(path.dirname(absEntryPath));

  let config: (EsbdConfigResult & { entryPoint?: string }) | undefined;
  try {
    config = configPath
      ? await readConfig(path.resolve(process.cwd(), configPath), mode, commandName)
      : {};

    if (Array.isArray(config)) {
      config = config.find(c => {
        const { absWorkingDir = process.cwd(), entryPoint } = c;
        return absEntryPath === path.resolve(absWorkingDir, entryPoint);
      });

      if (!config) {
        throw new Error(
          'When configuration is defined as an array, each config must define an "entryPoint" that matches the CLI entry point argument.',
        );
      }

      delete config.entryPoint;
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  config.outdir ??= program.opts().outdir;
  config.plugins ??= [];

  if (program.opts().node) config.platform = 'node';

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

  return [config as EsbdConfigWithPlugins, mode];
}

function commandWithGlobalOpts(program: Command, command: string) {
  return program
    .command(command)
    .option('-c, --config <path>', 'path to configuration file')
    .addOption(
      new Option('-m, --mode <mode>', 'output build mode').choices(['development', 'production']),
    )
    .option('--node', 'generate code for Node instead of the browser')
    .option('-o, --outdir <path>', 'path to output directory')
    .option('-t, --check', 'check types asynchronously with the TypeScript compiler')
    .addOption(
      new Option('--ts-build-mode <mode>', 'TypeScript "build" mode behavior')
        .choices(['readonly', 'write-output'])
        .default('write-output'),
    );
}

export default function init() {
  const program = new Command('esbd').version(version);

  commandWithGlobalOpts(program, 'build <entry>')
    .description('Entry point bundler powered by esbuild')
    .option('-w, --watch', 'watch for changes and rebuild')
    .action(async (entry: string, options: BuildOptions, command: Command) => {
      const { watch = false } = options;
      const logger = createLogger();
      const [entryPath, entryName] = getEntryNameAndPath(entry);
      const [config, mode] = await getConfigAndMode('build', command, entryPath, logger, watch);

      await esbdBuild([entryPath, entryName], config, { mode, logger, watch });
    });

  commandWithGlobalOpts(program, 'node-dev <entry>')
    .description('Node application development host')
    .option('-r, --respawn', 'restart program on exit/error (but quit after 3 restarts within 5s)')
    .addHelpText(
      'after',
      '\nArguments that appear after a special -- argument will be passed to the node program.' +
        '\n\nExample:' +
        '\n\tnode-dev path/to/entry.ts -- --port 8080 --config my-config.json',
    )
    .action(async (entry: string, options: NodeDevOptions, command: Command) => {
      const { respawn } = options;
      const logger = createLogger();
      const [entryPath, entryName] = getEntryNameAndPath(entry);
      const [config, mode] = await getConfigAndMode('node-dev', command, entryPath, logger, true);

      await nodeDev([entryPath, entryName], config, { args: command.args, logger, mode, respawn });
    });

  commandWithGlobalOpts(program, 'serve <entry>')
    .description('Single page application development server')
    .option('-d, --servedir <path>', 'directory of additional static assets to serve')
    .option('-l, --livereload', 'reload page on rebuild')
    .option('-h, --host <host>', 'IP/host name to use when serving requests', '0.0.0.0')
    .option('-p, --port <port>', 'port to use', '8000')
    .option('--rewrite', 'rewrite all not-found requests to "index.html" (SPA mode)', true)
    .option('--no-rewrite', 'disable request rewriting')
    .action(async (entry: string, options: ServeOptions, command: Command) => {
      const { host = '0.0.0.0', port = '8000', livereload, servedir, rewrite } = options;
      const logger = createLogger();
      const [entryPath, entryName] = getEntryNameAndPath(entry);
      const [config, mode] = await getConfigAndMode('serve', command, entryPath, logger, true);

      await serve([entryPath, entryName], config, {
        mode,
        host,
        port: Number(port),
        livereload,
        logger,
        servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
        rewrite,
      });
    });

  program.parse(process.argv);
}
