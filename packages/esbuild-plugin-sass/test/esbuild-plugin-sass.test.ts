/* eslint-disable @typescript-eslint/no-var-requires */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

import { sassPlugin } from '../src';

describe('esbuild-plugin-sass', () => {
  test('react application (css loader)', async () => {
    const absWorkingDir = path.resolve(__dirname, 'fixture/react');
    process.chdir(absWorkingDir);

    await build({
      absWorkingDir,
      entryPoints: ['./index.tsx'],
      bundle: true,
      format: 'esm',
      sourcemap: true,
      outdir: './out',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [sassPlugin()],
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

  test('open-iconic (dealing with relative paths & data urls)', async () => {
    const absWorkingDir = path.resolve(__dirname, 'fixture/open-iconic');
    process.chdir(absWorkingDir);

    const styleSCSS = fs.readFileSync('./src/styles.scss', 'utf-8');
    expect(styleSCSS).toEqual(
      expect.stringContaining("$iconic-font-path: 'open-iconic/font/fonts/';"),
    );

    await build({
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

    await build({
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

  test('postcss', async () => {
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

    await build({
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
      .split('\n')
      .filter(l => l.length > 0) // skip empty lines
      .join('\n');

    const actual = fs.readFileSync('./out/app.css', 'utf-8').split('\n').join('\n');

    expect(prettier.format(actual, { parser: 'css' })).toEqual(
      prettier.format(expected, { parser: 'css' }),
    );
  });

  test('watched files', async () => {
    const absWorkingDir = path.resolve(__dirname, 'fixture/watch');
    process.chdir(absWorkingDir);

    function writeInitial() {
      fs.writeFileSync(
        './src/banner-import.scss',
        `
    .banner {
        font-size: 30px;
        color: white;
        background-color: crimson;
        font-family: "Arial", sans-serif;
    }
`,
      );
      fs.writeFileSync(
        './src/alternate-import.css',
        `
    .banner {
        font-size: 20px;
        color: yellow;
        background-color: green;
        font-family: "Roboto", sans-serif;
    }
`,
      );
    }

    function writeUpdated() {
      fs.writeFileSync(
        './src/banner-import.scss',
        `
    .banner {
        font-size: 30px;
        color: white;
        background-color: cornflowerblue;
        font-family: "Times New Roman", serif;
    }
`,
      );

      fs.writeFileSync(
        './src/alternate-import.css',
        `
    .banner {
        font-size: 20px;
        color: yellow;
        background-color: orange;
        font-family: "Courier New", monospace;
    }
`,
      );
    }

    writeInitial();
    let count = 0;

    const result = await build({
      entryPoints: ['./src/index.js'],
      absWorkingDir,
      outdir: `./out`,
      bundle: true,
      plugins: [sassPlugin()],
      watch: {
        onRebuild(_error, _result) {
          count++;
        },
      },
    });

    try {
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

        writeUpdated();
      });

      expect(count).toBe(1);

      expect(fs.readFileSync('./out/index.css', 'utf-8')).toMatch(/cornflowerblue/);
    } finally {
      result.stop?.();
    }
  });

  test('partials', async () => {
    const absWorkingDir = path.resolve(__dirname, 'fixture/partials');
    process.chdir(absWorkingDir);

    await build({
      entryPoints: ['./src/import.scss'],
      absWorkingDir: absWorkingDir,
      outdir: './out',
      bundle: true,
      format: 'esm',
      plugins: [sassPlugin()],
    });

    const outCSS = fs.readFileSync('./out/import.css', 'utf-8');
    expect(outCSS).toEqual(`/* sass:./src/import.scss */
.index-a {
  color: red;
}
.a {
  color: white;
}
.b {
  color: yellow;
}
.b {
  color: yellow;
}
`);
  });
});
