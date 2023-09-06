import { node } from 'execa';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { EsbdConfig } from '../lib';

import type { BuildWithHTMLOutput } from './config/serializer';

interface BuildWithHTMLOptions {
  config: Omit<EsbdConfig, 'absWorkingDir' | 'outdir'>;
  files: Record<string, string>;
}

const TEST_ROOT = path.join(__dirname, '..', 'test-results', 'build');

async function build(options: BuildWithHTMLOptions): Promise<BuildWithHTMLOutput> {
  const absWorkingDir = await fs.promises.mkdtemp(path.join(TEST_ROOT, 'test-'));
  const absOutDir = path.join(absWorkingDir, 'out');

  await fs.promises.mkdir(absOutDir, { recursive: true });

  const config: EsbdConfig = {
    ...options.config,
    sourcemap: false,
    absWorkingDir,
    logLevel: 'warning',
    outdir: './out',
  };

  const bundleFile = path.join(absWorkingDir, 'bundle.js');
  const writeBundle = fs.promises.writeFile(
    bundleFile,
    `require('../../../lib').configure(${JSON.stringify(config)});`,
  );

  const writeFiles = Object.entries(options.files).map(async ([file, content]) => {
    const absFilePath = path.join(absWorkingDir, file);
    await fs.promises.mkdir(path.dirname(absFilePath), { recursive: true });
    await fs.promises.writeFile(absFilePath, content, { encoding: 'utf-8' });
  });

  await Promise.all([...writeFiles, writeBundle]);

  const proc = node(bundleFile, ['build'], {
    encoding: 'utf8',
    reject: false,
    cwd: absWorkingDir,
    env: { ...process.env, NO_COLOR: '1' },
  });

  const { stderr, stdout } = await proc;

  return { cwd: absWorkingDir, outdir: absOutDir, stdout, stderr };
}

describe('build command', () => {
  beforeAll(async () => {
    await fs.promises.mkdir(TEST_ROOT, { recursive: true });
    return async () => {
      await fs.promises.rm(TEST_ROOT, { recursive: true });
    };
  });

  it('builds a simple entry point', () => {
    return expect(
      build({
        config: {
          external: ['react', 'react-dom'],
          entryPoints: { entry: 'src/entry.tsx' },
          format: 'esm',
        },
        files: {
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import { App } from './app';
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'src/app.tsx': `
            export function App() {
              return <div>Hello world</div>;
            }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('includes referenced CSS from entry point', () => {
    return expect(
      build({
        config: {
          external: ['react', 'react-dom'],
          entryPoints: { entry: 'src/entry.tsx', style: 'styles/entry.css' },
          format: 'esm',
        },
        files: {
          'styles/entry.css': `
            @import "./app.css";
            body { background: red; }
          `,
          'styles/app.css': `
            .app { background: green; }
          `,
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import { App } from './app';
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'src/app.tsx': `
            export function App() {
              return <div>Hello world</div>;
            }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('includes referenced CSS from JS', () => {
    return expect(
      build({
        config: {
          external: ['react', 'react-dom'],
          entryPoints: { entry: 'src/entry.tsx' },
          format: 'esm',
        },
        files: {
          'src/entry.css': `
            @import "./app.css";
            body { background: red; }
          `,
          'src/app.css': `
            .app { background: green; }
          `,
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import { App } from './app';
            import './entry.css';
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'src/app.tsx': `
            export function App() {
              return <div>Hello world</div>;
            }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('supports automatic react runtime', () => {
    return expect(
      build({
        config: {
          external: ['react', 'react-dom'],
          jsx: 'automatic',
          entryPoints: { entry: 'src/entry.tsx' },
          format: 'esm',
        },
        files: {
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import { App } from './app';
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'src/app.tsx': `
            export function App() {
              return <div>Hello world</div>;
            }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });
});
