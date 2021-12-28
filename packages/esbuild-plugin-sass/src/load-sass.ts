import process from 'process';
import type sass from 'sass';

export function loadSass(basedir: string = process.cwd()): typeof sass {
  try {
    return require(require.resolve('sass', { paths: [basedir] }));
  } catch (e) {
    console.error(
      `Cannot find module '${module}', make sure it's installed. e.g. npm install -D ${module}`,
    );
    process.exit(1);
  }
}
