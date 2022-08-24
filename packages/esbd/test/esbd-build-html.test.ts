import { node } from 'execa';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { EsbdConfig } from '../lib';

import type { BuildWithHTMLOutput } from './config/serializer';

interface BuildWithHTMLOptions {
  config: Partial<EsbdConfig>;
  files: { [file: string]: string };
}

const TEST_ROOT = path.join(__dirname, '..', 'test-results', 'html');

async function buildWithHTML(options: BuildWithHTMLOptions): Promise<BuildWithHTMLOutput> {
  const absWorkingDir = await fs.promises.mkdtemp(path.join(TEST_ROOT, 'test-'));
  const absOutDir = path.join(absWorkingDir, 'out');

  await fs.promises.mkdir(absOutDir, { recursive: true });

  const index = Object.keys(options.files).find(file => file.endsWith('index.html'));
  if (!index) {
    throw new Error('index.html is required');
  }

  const config: EsbdConfig = {
    format: 'esm',
    metafile: true,
    splitting: true,
    sourcemap: false,
    logLevel: 'warning',
    ...options.config,

    absWorkingDir,
    outdir: './out',
    entryPoints: {
      'index.html': index,
    },
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

describe('build command (html entry)', () => {
  beforeAll(async () => {
    await fs.promises.mkdir(TEST_ROOT, { recursive: true });
    return async () => {
      await fs.promises.rm(TEST_ROOT, { recursive: true });
    };
  });

  it('builds a simple HTML entry point', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
        },
        files: {
          'src/index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <script defer type="module" src="./entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
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

  it('includes referenced CSS from HTML', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
        },
        files: {
          'src/index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="stylesheet" href="../styles/entry.css" />
                <script defer type="module" src="./entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
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
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <script defer type="module" src="./src/entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
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

  it('includes referenced assets from HTML', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="apple-touch-icon" href="./assets/favicon.png"/>
                <script defer type="module" src="./src/entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/favicon.png': 'IMA FAVICON',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            function App() { return <div>Hello world</div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('includes referenced assets from style tags', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
        },
        files: {
          'src/index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body {
                    background: url(../assets/cats.jpg);
                  }
                </style>
                <script defer type="module" src="./entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/cats.jpg': 'MEOW',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            function App() { return <div>Hello world</div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('supports automatic react runtime', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
          jsx: 'automatic',
        },
        files: {
          'src/index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <script defer type="module" src="./entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
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

  it('writes integrity hashes if requested', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
          integrity: 'sha256',
        },
        files: {
          'src/index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body {
                    background: url(../assets/cats.jpg);
                  }
                </style>
                <link rel="apple-touch-icon" href="../assets/favicon.png"/>
                <link rel="stylesheet" href="../styles/entry.css" />
                <script defer type="module" src="./entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/cats.jpg': 'MEOW',
          'assets/favicon.png': 'IMA FAVICON',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            function App() { return <div>Hello world</div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'styles/entry.css': `
            body { background: red; }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('includes referenced CSS from JS with content hashes', () => {
    return expect(
      buildWithHTML({
        config: {
          entryNames: '[name]-[hash]',
          external: ['react', 'react-dom'],
          splitting: true,
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <script defer type="module" src="./src/entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'src/entry.css': `
            @import "./app.css";
            body { background: red; }
          `,
          'src/app.css': `
            .app { background: green; }
          `,
          'src/route.css': `
            .route { background: blue; }
          `,
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import { App } from './app';
            import './entry.css';
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'src/app.tsx': `
            const Route = import('./route').then(({ default: Route }) => Route);
            export function App() {
              return <Suspense><Route>Hello world</Route></Suspense>;
            }
          `,
          'src/route.tsx': `
            import './route.css';
            export default function Route() {
              return <div>Hello world</div>;
            }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('includes CSS entries and referenced CSS from JS with content hashes and path segments', () => {
    return expect(
      buildWithHTML({
        config: {
          entryNames: '[ext]/[name]-[hash]',
          external: ['react', 'react-dom'],
          splitting: true,
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="stylesheet" href="src/style.css" />
                <script defer type="module" src="./src/entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'src/entry.css': `
            @import "./app.css";
            body { background: red; }
          `,
          'src/app.css': `
            .app { background: green; }
          `,
          'src/route.css': `
            .route { background: blue; }
          `,
          'src/style.css': `
            body { background: yellow; }
          `,
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import { App } from './app';
            import './entry.css';
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
          'src/app.tsx': `
            const Route = import('./route').then(({ default: Route }) => Route);
            export function App() {
              return <Suspense><Route>Hello world</Route></Suspense>;
            }
          `,
          'src/route.tsx': `
            import './route.css';
            export default function Route() {
              return <div>Hello world</div>;
            }
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });
});
