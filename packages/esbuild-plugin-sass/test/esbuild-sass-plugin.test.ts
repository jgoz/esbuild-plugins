/* eslint-disable @typescript-eslint/no-var-requires */
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

import { sassPlugin } from '../src';

describe('esbuild-plugin-sass', function () {
  it('react application (css loader)', async function () {
    const absWorkingDir = path.resolve(__dirname, 'fixture/react');
    process.chdir(absWorkingDir);

    await esbuild.build({
      absWorkingDir,
      entryPoints: ['./index.tsx'],
      bundle: true,
      format: 'esm',
      sourcemap: true,
      outdir: './out',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [sassPlugin({})],
    });

    const cssBundle = fs.readFileSync('./out/index.css', 'utf-8');
    expect(cssBundle).toEqual(
      expect.stringContaining('@-ms-viewport {\n' + '  width: device-width;\n' + '}'),
    );
    expect(cssBundle).toEqual(
      expect.stringContaining(
        '.App .header {\n' +
          '  color: blue;\n' +
          '  border: 1px solid aliceblue;\n' +
          '  padding: 4px;\n' +
          '}',
      ),
    );
  });

  it('open-iconic (dealing with relative paths & data urls)', async function () {
    const absWorkingDir = path.resolve(__dirname, 'fixture/open-iconic');
    process.chdir(absWorkingDir);

    const styleSCSS = fs.readFileSync('./src/styles.scss', 'utf-8');
    expect(styleSCSS).toEqual(
      expect.stringContaining("$iconic-font-path: 'open-iconic/font/fonts/';"),
    );

    await esbuild.build({
      entryPoints: ['./src/styles.scss'],
      absWorkingDir: absWorkingDir,
      outdir: './out',
      bundle: true,
      format: 'esm',
      loader: {
        '.eot': 'file',
        '.woff': 'file',
        '.ttf': 'file',
        '.svg': 'file',
        '.otf': 'file',
      },
      plugins: [sassPlugin()],
    });

    const outCSS = fs.readFileSync('./out/styles.css', 'utf-8');
    expect(outCSS).toMatch(
      /url\(\.\/open-iconic-[^.]+\.eot\?#iconic-sm\) format\("embedded-opentype"\)/,
    );

    await esbuild.build({
      entryPoints: ['./src/index.ts'],
      absWorkingDir: absWorkingDir,
      outfile: './out/bundle.js',
      bundle: true,
      format: 'esm',
      loader: {
        '.eot': 'dataurl',
        '.woff': 'dataurl',
        '.ttf': 'dataurl',
        '.svg': 'dataurl',
        '.otf': 'dataurl',
      },
      plugins: [sassPlugin()],
    });

    const outFile = fs.readFileSync('./out/bundle.css', 'utf-8');
    expect(outFile).toEqual(
      expect.stringContaining('src: url(data:application/vnd.ms-fontobject;base64,JG4AAHxt'),
    );
  });

  it('postcss', async function () {
    const absWorkingDir = path.resolve(__dirname, 'fixture/postcss');
    process.chdir(absWorkingDir);

    const postcss = require(require.resolve('postcss', {
      paths: [absWorkingDir],
    }));
    const autoprefixer = require(require.resolve('autoprefixer', {
      paths: [absWorkingDir],
    }));
    const postcssPresetEnv = require(require.resolve('postcss-preset-env', {
      paths: [absWorkingDir],
    }));

    const postCSS = postcss([autoprefixer, postcssPresetEnv({ stage: 0 })]);

    await esbuild.build({
      entryPoints: ['./src/app.css'],
      absWorkingDir,
      outdir: './out',
      bundle: true,
      loader: {
        '.jpg': 'dataurl',
      },
      plugins: [
        sassPlugin({
          async transform(source) {
            const { css } = await postCSS.process(source, { from: undefined });
            return css;
          },
        }),
      ],
    });

    const expected = fs
      .readFileSync('./dest/app.css', 'utf-8')
      .replace(/url\("img\/background(-2x)?.jpg"\)/g, 'url()')
      .split('\n')
      .filter(l => l.length > 0) // skip empty lines
      .join('\n');

    const actual = fs
      .readFileSync('./out/app.css', 'utf-8')
      .replace(/url\(data:image\/jpeg;base64,\)/g, 'url()')
      .split('\n')
      .slice(1) // skip sass comment
      .join('\n');

    expect(prettier.format(actual, { parser: 'css' })).toEqual(
      prettier.format(expected, { parser: 'css' }),
    );
  });

  it('watched files', async function () {
    const absWorkingDir = path.resolve(__dirname, 'fixture/watch');
    process.chdir(absWorkingDir);

    require('./fixture/watch/initial');
    let count = 0;

    const result = await esbuild.build({
      entryPoints: ['./src/index.js'],
      absWorkingDir,
      outdir: './out',
      bundle: true,
      plugins: [sassPlugin()],
      watch: {
        onRebuild(error, result) {
          count++;
        },
      },
    });

    expect(fs.readFileSync('./out/index.css', 'utf-8')).toMatch(/crimson/);

    const { mtimeMs } = fs.statSync('./out/index.js');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(reject, 10000);

      setTimeout(function tryAgain() {
        if (mtimeMs < fs.statSync('./out/index.js').mtimeMs) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(tryAgain, 1000);
        }
      }, 1000);

      require('./fixture/watch/update');
    });

    expect(count).toBe(1);

    expect(fs.readFileSync('./out/index.css', 'utf-8')).toMatch(/cornflowerblue/);

    result.stop?.();
  });
});
