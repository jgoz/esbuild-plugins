import process from 'process';
import type sass from 'sass';

import type { SaasImplementation } from './sass-plugin';

export function loadSass(
  module: SaasImplementation = 'sass',
  basedir: string = process.cwd(),
): typeof sass {
  try {
    return require(require.resolve(module, { paths: [basedir] }));
  } catch (e) {
    console.error(
      `Cannot find module '${module}', make sure it's installed. e.g. npm install -D ${module}`,
    );
    process.exit(1);
  }
}
