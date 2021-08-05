import { Command, Option } from 'commander';
import path from 'path';

import { BuildMode, EsbdConfig, findConfigFile, readConfig } from './config';
import serve from './esbd-serve';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json');

interface ServeOptions {
  host?: string;
  port?: string;
  servedir?: string;
  rewrite: boolean;
}

export default function init() {
  const program = new Command();
  program
    .version(version)
    .option('-c --config <path>', 'Path to configuration file')
    .option('-n --name <name>', 'Name of the current build', 'build')
    .addOption(new Option('-m --mode <mode>', 'Build mode').choices(['development', 'production']));

  program
    .command('serve <entry>')
    .description('Single page application development server')
    .option('-d --servedir <path>', 'Directory of static assets to serve')
    .option('-h --host <host>', 'IP/host name to use when serving requests', '0.0.0.0')
    .option('-p --port <port>', 'Port to use', '8000')
    .option('--rewrite', 'Rewrite all not-found requests to "index.html" (SPA mode)', true)
    .option('--no-rewrite', 'Disable request rewriting')
    .action(async (entry: string, options: ServeOptions) => {
      const { host = '0.0.0.0', port = '8000', servedir, rewrite } = options;

      const absEntryPath = path.resolve(process.cwd(), entry);
      const maybeConfigPath = program.opts().config;
      const mode: BuildMode = program.opts().mode ?? 'development';

      const configPath = maybeConfigPath
        ? path.resolve(process.cwd(), maybeConfigPath)
        : await findConfigFile(path.dirname(absEntryPath));

      const config: EsbdConfig = configPath
        ? await readConfig(path.resolve(process.cwd(), configPath), mode)
        : {};

      await serve(
        entry,
        {
          mode,
          host,
          port: Number(port),
          servedir: servedir ? path.resolve(process.cwd(), servedir) : undefined,
          rewrite,
        },
        config,
      );
    });

  program.parse(process.argv);
}
