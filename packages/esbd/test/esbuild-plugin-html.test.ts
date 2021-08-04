import { build, BuildOptions } from 'esbuild';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

import { EntryPoints, EsbuildHtmlOptions, readTemplate } from '../src';

jest.mock('fs');

async function* walk(dirPath: string): AsyncIterable<string> {
  for await (const d of await fs.promises.readdir(dirPath, { withFileTypes: true })) {
    const entry = path.join(dirPath, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile()) yield entry;
  }
}

interface BuildWithHTMLOutput {
  html: string[];
  assets: string[];
}

const SEPARATOR = '---------------------------------';

expect.addSnapshotSerializer({
  test: value => typeof value === 'object' && !!value && 'html' in value && 'assets' in value,
  serialize: (val: unknown) => {
    const value = val as BuildWithHTMLOutput;
    const output: string[] = [];

    for (const html of value.html) {
      output.push(SEPARATOR);
      output.push(path.basename(html));
      output.push(SEPARATOR);

      const content = fs.readFileSync(html, 'utf-8');
      output.push(prettier.format(content, { parser: 'html' }));
    }

    for (const asset of value.assets) {
      output.push(SEPARATOR);
      output.push(path.basename(asset));
      output.push(SEPARATOR);

      const content = fs.readFileSync(asset, 'utf-8');
      output.push(content);
    }

    return output.join('\n');
  },
});

async function buildWithHTML(
  fixture: string | string[],
  options: Partial<EsbuildHtmlOptions> = {},
  buildOptionOverrides: Partial<BuildOptions> = {},
): Promise<BuildWithHTMLOutput> {
  const { absWorkingDir = __dirname, outdir = './out' } = buildOptionOverrides;
  const absOutDir = await fs.promises.mkdtemp(path.join(absWorkingDir, outdir + '-'));

  const fixtures = Array.isArray(fixture) ? fixture : [fixture];
  const html = await Promise.all(
    fixtures.map(f => readTemplate(`./fixture/${f}.html`, { basedir: __dirname, ...options })),
  );

  const entryPoints = html.reduce<EntryPoints>((obj, [entries]) => ({ ...obj, ...entries }), {});
  const buildOptions: BuildOptions = {
    absWorkingDir: __dirname,
    bundle: true,
    entryPoints,
    format: 'esm',
    splitting: true,
    write: false,
    plugins: html.map(([, plugin]) => plugin),
    ...buildOptionOverrides,
    outdir: path.relative(absWorkingDir, absOutDir),
  };

  // First build generates the actual output files, which is necessary because
  // we are using an in-memory FS that esbuild isn't aware of
  const { plugins, ...buildOptionsWithoutPlugins } = buildOptions;
  const result = await build(buildOptionsWithoutPlugins);
  for (const file of result.outputFiles!) {
    await fs.promises.writeFile(file.path, file.contents);
  }

  // Second build actually produces the HTML output
  await build(buildOptions);

  try {
    const html: string[] = [];
    const assets: string[] = [];

    for await (const entry of walk(absOutDir)) {
      if (entry.endsWith('.html')) html.push(entry);
      else assets.push(entry);
    }

    return { html, assets };
  } catch (e) {
    throw new Error(`Error reading output HTML: ${e}`);
  }
}

describe('eslint-plugin-html', () => {
  it('throws if outdir not set', () => {
    void expect(
      buildWithHTML('template-empty', {}, { logLevel: 'silent' }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"html-plugin: Unable to read template at ./fixture/template-empty.html"`,
    );
  });

  it('throws if template not found', () => {
    void expect(buildWithHTML('whoops', {}, { logLevel: 'silent' })).rejects.toThrowError(
      /Unable to read template at/,
    );
  });

  it('uses scripts and styles as entry points for the build', async () => {
    const output = await buildWithHTML('template-basic');
    expect(output).toMatchSnapshot();
  });

  it('adds integrity if requested', async () => {
    const output = await buildWithHTML('template-basic', { integrity: 'sha256' });
    expect(output).toMatchSnapshot();
  });

  it('copies and rebases assets from "href", "src" and "url" (with no public path)', async () => {
    const output = await buildWithHTML('template-assets');
    expect(output).toMatchSnapshot();
  });

  it('copies and rebases assets from "href", "src" and "url" (with FS public path)', async () => {
    const output = await buildWithHTML('template-assets', {}, { publicPath: '/static' });
    expect(output).toMatchSnapshot();
  });

  it('copies and rebases assets from "href", "src" and "url" (with URL public path)', async () => {
    const output = await buildWithHTML(
      'template-assets',
      {},
      { publicPath: 'http://test.com/static' },
    );
    expect(output).toMatchSnapshot();
  });

  it('skips asset rebasing/copying if "ignoreAssets" is set', async () => {
    const output = await buildWithHTML(
      'template-assets',
      { ignoreAssets: true },
      { publicPath: '/static' },
    );
    expect(output).toMatchSnapshot();
  });

  it('substitutes values from "define" in output HTML', async () => {
    const output = await buildWithHTML('template-define', {
      define: {
        'VERSION': '1.2.3',
        'process.env.NODE_ENV': 'development',
      },
    });
    expect(output).toMatchSnapshot();
  });

  it('can handle multiple entry points', async () => {
    const output = await buildWithHTML(
      'template-basic',
      {},
      {
        entryPoints: [
          './fixture/template-basic.js',
          './fixture/template-assets.css',
          './fixture/template-complex.js',
          './fixture/template-define.css',
        ],
      },
    );
    expect(output).toMatchSnapshot();
  });

  it('can be used on multiple templates', async () => {
    const output = await buildWithHTML(['template-basic', 'template-complex']);
    expect(output).toMatchSnapshot();
  });
});
