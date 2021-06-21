import { build, BuildOptions } from 'esbuild';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

import { htmlPlugin, HtmlPluginOptions } from '../src';

jest.mock('fs');

async function* walk(dirPath: string) {
  for await (const d of await fs.promises.readdir(dirPath, { withFileTypes: true })) {
    const entry = path.join(dirPath, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile()) yield entry;
  }
}

interface BuildWithHTMLOutput {
  html: string;
  assets: string[];
}

const SEPARATOR = '---------------------------------';

expect.addSnapshotSerializer({
  test: value => typeof value === 'object' && !!value && 'html' in value && 'assets' in value,
  serialize: (val: unknown) => {
    const value = val as BuildWithHTMLOutput;
    const output: string[] = [];
    output.push(SEPARATOR);
    output.push(path.basename(value.html));
    output.push(SEPARATOR);

    const html = fs.readFileSync(value.html, 'utf-8');
    output.push(prettier.format(html, { parser: 'html' }));

    for (const asset of value.assets) {
      if (asset === value.html) continue;
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
  fixture: string,
  optionOverrides: Partial<HtmlPluginOptions> = {},
  buildOptionOverrides: Partial<BuildOptions> = {},
): Promise<BuildWithHTMLOutput> {
  const { absWorkingDir = __dirname, outdir = './out' } = buildOptionOverrides;
  const absOutDir = await fs.promises.mkdtemp(path.join(absWorkingDir, outdir + '-'));

  const options: HtmlPluginOptions = {
    template: `./fixture/${fixture}.html`,
    ...optionOverrides,
  };
  const buildOptions: BuildOptions = {
    absWorkingDir: __dirname,
    bundle: true,
    entryPoints: [`./fixture/${fixture}.js`],
    format: 'esm',
    splitting: true,
    write: false,
    ...buildOptionOverrides,
    outdir: path.relative(absWorkingDir, absOutDir),
  };

  // First build generates the actual output files, which is necessary because
  // we are using an in-memory FS that esbuild isn't aware of
  const result = await build(buildOptions);
  for (const file of result.outputFiles!) {
    await fs.promises.writeFile(file.path, file.contents);
  }

  // Second build actually produces the HTML output
  await build({ ...buildOptions, plugins: [htmlPlugin(options)] });

  try {
    const htmlFileName = options.filename ?? `${fixture}.html`;
    const html = path.resolve(absOutDir, htmlFileName);

    const assets: string[] = [];
    for await (const entry of walk(absOutDir)) {
      assets.push(entry);
    }

    return { html, assets };
  } catch (e) {
    throw new Error(`Error reading output HTML: ${e}`);
  }
}

describe('eslint-plugin-html', () => {
  it('throws if outdir not set', () => {
    void expect(
      build({
        absWorkingDir: __dirname,
        bundle: true,
        entryPoints: ['./fixture/template-empty.js'],
        logLevel: 'silent',
        plugins: [htmlPlugin({ template: './fixture/template-empty.html' })],
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
                  "Build failed with 1 error:
                  error: html-plugin: \\"outdir\\" esbuild build option is required"
              `);
  });

  it('throws if template not found', () => {
    void expect(
      build({
        absWorkingDir: __dirname,
        bundle: true,
        entryPoints: ['./fixture/template-empty.js'],
        logLevel: 'silent',
        outdir: 'out',
        plugins: [htmlPlugin({ template: 'whoops' })],
      }),
    ).rejects.toThrowError(/Unable to read template at/);
  });

  it('adds missing elements if not defined in the template', async () => {
    const output = await buildWithHTML('template-empty');
    expect(output).toMatchSnapshot();
  });

  it('adds scripts and styles to HEAD by default', async () => {
    const output = await buildWithHTML('template-basic');
    expect(output).toMatchSnapshot();
  });

  it('ignores "defer" with "esm" output', async () => {
    const output = await buildWithHTML('template-basic', { defer: true });
    expect(output).toMatchSnapshot();
  });

  it('uses "defer" with "iife" output if requested', async () => {
    const output = await buildWithHTML(
      'template-basic',
      { defer: true },
      { format: 'iife', splitting: false },
    );
    expect(output).toMatchSnapshot();
  });

  it('can render scripts in body if requested', async () => {
    const output = await buildWithHTML('template-basic', { scriptPlacement: 'body-below' });
    expect(output).toMatchSnapshot();
  });

  it('can render scripts in body with "defer"', async () => {
    const output = await buildWithHTML(
      'template-basic',
      { defer: true, scriptPlacement: 'body-below' },
      { format: 'iife', splitting: false },
    );
    expect(output).toMatchSnapshot();
  });

  it('adds integrity if requested', async () => {
    const output = await buildWithHTML('template-basic', { integrity: 'sha256' });
    expect(output).toMatchSnapshot();
  });

  it('supports "crossorigin": "anonymous"', async () => {
    const output = await buildWithHTML('template-basic', { crossorigin: 'anonymous' });
    expect(output).toMatchSnapshot();
  });

  it('supports "crossorigin": "use-credentials"', async () => {
    const output = await buildWithHTML('template-basic', { crossorigin: 'use-credentials' });
    expect(output).toMatchSnapshot();
  });

  it('places styles and scripts below existing ones by default', async () => {
    const output = await buildWithHTML('template-complex');
    expect(output).toMatchSnapshot();
  });

  it('can place styles above existing styles', async () => {
    const output = await buildWithHTML('template-complex', { linkPosition: 'above' });
    expect(output).toMatchSnapshot();
  });

  it('can place scripts above existing scripts in HEAD', async () => {
    const output = await buildWithHTML('template-complex', { scriptPlacement: 'head-above' });
    expect(output).toMatchSnapshot();
  });

  it('can place scripts above existing scripts in BODY', async () => {
    const output = await buildWithHTML('template-complex', { scriptPlacement: 'body-above' });
    expect(output).toMatchSnapshot();
  });

  it('can place scripts below existing scripts in BODY', async () => {
    const output = await buildWithHTML('template-complex', { scriptPlacement: 'body-below' });
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
});
