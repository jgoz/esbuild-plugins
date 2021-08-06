import { Command, Option } from 'commander';
import path from 'path';

import { BuildMode, EsbdConfig, findConfigFile, readConfig } from './config';
import nodeDev from './esbd-node-dev';
import serve from './esbd-serve';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json');

interface ServeOptions {
  host?: string;
  port?: string;
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
  program: Command,
  entryPath: string,
): Promise<[EsbdConfig, BuildMode]> {
  const absEntryPath = path.resolve(process.cwd(), entryPath);
  const maybeConfigPath = program.opts().config;
  const mode: BuildMode = program.opts().mode ?? 'development';

  const configPath = maybeConfigPath
    ? path.resolve(process.cwd(), maybeConfigPath)
    : await findConfigFile(path.dirname(absEntryPath));

  const config: EsbdConfig = configPath
    ? await readConfig(path.resolve(process.cwd(), configPath), mode)
    : {};

  return [config, mode];
}

export default function init() {
  const program = new Command();

  program
    .version(version)
    .option('-c, --config <path>', 'Path to configuration file')
    .option('-n, --name <name>', 'Name of the current build', 'build')
    .addOption(new Option('-m --mode <mode>', 'Build mode').choices(['development', 'production']));

  program
    .command('node-dev <entry>')
    .description('Node application development host')
    .option('-r, --respawn', 'Restart program on exit/error (but quit after 3 restarts within 5s)')
    .addHelpText(
      'after',
      '\nArguments that appear after a special -- argument will be passed to the node program.' +
        '\n\nExample:' +
        '\n\tnode-dev path/to/entry.ts -- --port 8080 --config my-config.json',
    )
    .action(async (entry: string, options: NodeDevOptions, command: Command) => {
      const { respawn } = options;
      const [entryPath, entryName] = getEntryNameAndPath(entry);
      const [config, mode] = await getConfigAndMode(program, entryPath);

      await nodeDev([entryPath, entryName], config, { args: command.args, mode, respawn });
    });

  program
    .command('serve <entry>')
    .description('Single page application development server')
    .option('-d, --servedir <path>', 'Directory of static assets to serve')
    .option('-h, --host <host>', 'IP/host name to use when serving requests', '0.0.0.0')
    .option('-p, --port <port>', 'Port to use', '8000')
    .option('--rewrite', 'Rewrite all not-found requests to "index.html" (SPA mode)', true)
    .option('--no-rewrite', 'Disable request rewriting')
    .action(async (entry: string, options: ServeOptions) => {
      const { host = '0.0.0.0', port = '8000', servedir, rewrite } = options;
      const [config, mode] = await getConfigAndMode(program, entry);

      await serve(entry, config, {
        mode,
        host,
        port: Number(port),
        servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
        rewrite,
      });
    });

  program.parse(process.argv);
}
