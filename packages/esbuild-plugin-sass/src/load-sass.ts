import process from 'process';
import type DartSass from 'sass';

export function loadSass(basedir: string = process.cwd()): typeof DartSass {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sass = require(require.resolve('sass', { paths: [basedir] }));
    return sass;
  } catch (e) {
    console.error(`Cannot find module "sass", make sure it's installed. e.g. npm install -D sass`);
    process.exit(1);
  }
}
