import type NodeSass from 'node-sass';
import process from 'process';
import type DartSass from 'sass';

import type { SaasImplementation } from './sass-plugin';

interface NodeSassImplementation {
  type: 'node-sass';
  sass: typeof NodeSass;
}

interface DartSassImplementation {
  type: 'sass';
  sass: typeof DartSass;
}

export function loadSass(
  module: SaasImplementation = 'sass',
  basedir: string = process.cwd(),
): NodeSassImplementation | DartSassImplementation {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sass = require(require.resolve(module, { paths: [basedir] }));
    return { type: module, sass };
  } catch (e) {
    console.error(
      `Cannot find module '${module}', make sure it's installed. e.g. npm install -D ${module}`,
    );
    process.exit(1);
  }
}
