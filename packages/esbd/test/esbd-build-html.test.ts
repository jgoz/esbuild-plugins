import { node } from 'execa';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { EsbdConfig } from '../lib';

import type { BuildWithHTMLOutput } from './config/serializer';

interface BuildWithHTMLOptions {
  config: Partial<EsbdConfig>;
  files: { [file: string]: string };
  pluginsStr?: string;
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

  let bundleContents = `
    const config = ${JSON.stringify(config, undefined, 2)};
  `;
  if (options.pluginsStr) {
    bundleContents += `
      config.plugins = ${options.pluginsStr};
    `;
  }

  const bundleFile = path.join(absWorkingDir, 'bundle.js');
  const writeBundle = fs.promises.writeFile(
    bundleFile,
    `${bundleContents}require('../../../lib').configure(config);`,
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

  it('includes referenced compile-to-CSS from JS with content hashes', () => {
    const pluginsStr = `[
      {
        name: 'fake-sass-plugin',
        setup(build) {
          build.onResolve({ filter: /\\.css$/ }, args => {
            return { path: args.path, namespace: 'sass', pluginData: args };
          });
          build.onLoad({ filter: /\\.css$/, namespace: 'sass' }, async (args) => {
            const text = await require('fs').promises.readFile(require('path').resolve('./src', args.path), 'utf8');
            return {
              contents: text,
              loader: 'css',
            };
          });
        },
      },
    ]`;

    return expect(
      buildWithHTML({
        config: {
          entryNames: '[name]-[hash]',
          external: ['react', 'react-dom'],
          splitting: true,
        },
        pluginsStr,
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

  it('substitutes defined values in output HTML', () => {
    return expect(
      buildWithHTML({
        config: {
          define: {
            __APP_VERSION__: JSON.stringify('1.2.3'),
            SERVER_MANIFEST_URL: JSON.stringify('/abs-manifest.json'),
            LOCAL_MANIFEST_URL: JSON.stringify('assets/manifest.json'),
          },
          external: ['react', 'react-dom'],
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="preload" as="fetch" crossorigin="anonymous" type="application/json" href="{{SERVER_MANIFEST_URL}}" />
                <link rel="preload" as="fetch" crossorigin="anonymous" type="application/json" href="{{LOCAL_MANIFEST_URL}}" />
                <link rel="apple-touch-icon" href="./assets/favicon.png?v={{__APP_VERSION__}}"/>
                <script defer type="module" src="./src/entry.tsx"></script>
                <script>
                  window.__app_version__ = '{{__APP_VERSION__}}';
                </script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/favicon.png': 'IMA FAVICON',
          'assets/manifest.json': 'Man, I fest',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            function App() { return <div>Hello world</div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('substitutes defined values in output HTML with publicPath', () => {
    return expect(
      buildWithHTML({
        config: {
          define: {
            __APP_VERSION__: JSON.stringify('1.2.3'),
            SERVER_MANIFEST_URL: JSON.stringify('/abs-manifest.json'),
            LOCAL_MANIFEST_URL: JSON.stringify('assets/manifest.json'),
          },
          external: ['react', 'react-dom'],
          publicPath: '/public/',
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="preload" as="fetch" crossorigin="anonymous" type="application/json" href="{{SERVER_MANIFEST_URL}}" />
                <link rel="preload" as="fetch" crossorigin="anonymous" type="application/json" href="{{LOCAL_MANIFEST_URL}}" />
                <link rel="apple-touch-icon" href="./assets/favicon.png?v={{__APP_VERSION__}}"/>
                <script defer type="module" src="./src/entry.tsx"></script>
                <script>
                  window.__app_version__ = '{{__APP_VERSION__}}';
                </script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/favicon.png': 'IMA FAVICON',
          'assets/manifest.json': 'Man, I fest',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            function App() { return <div>Hello world</div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('allows entry name overrides via data-entry-name attribute', () => {
    return expect(
      buildWithHTML({
        config: {
          define: {
            __APP_VERSION__: JSON.stringify('1.2.3'),
            SERVER_MANIFEST_URL: JSON.stringify('/abs-manifest.json'),
            LOCAL_MANIFEST_URL: JSON.stringify('assets/manifest.json'),
          },
          external: ['react', 'react-dom'],
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="preload" as="fetch" crossorigin="anonymous" type="application/json" href="{{SERVER_MANIFEST_URL}}" />
                <link rel="preload" as="fetch" crossorigin="anonymous" type="application/json" href="{{LOCAL_MANIFEST_URL}}" />
                <link rel="apple-touch-icon" href="./assets/favicon.png?v={{__APP_VERSION__}}"/>
                <script defer type="module" data-entry-name="my-entry-{{__APP_VERSION__}}" src="./src/entry.tsx"></script>
                <script>
                  window.__app_version__ = '{{__APP_VERSION__}}';
                </script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/favicon.png': 'IMA FAVICON',
          'assets/manifest.json': 'Man, I fest',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            function App() { return <div>Hello world</div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });

  it('includes referenced assets from HTML using their esbuild-generated output paths', () => {
    return expect(
      buildWithHTML({
        config: {
          external: ['react', 'react-dom'],
          loader: {
            '.svg': 'file',
          },
        },
        files: {
          'index.html': `
            <!DOCTYPE html>
            <html>
              <head>
                <link rel="apple-touch-icon" href="./assets/icon.svg"/>
                <script defer type="module" src="./src/entry.tsx"></script>
              </head>
              <body><div id='root'></div></body>
            </html>
          `,
          'assets/icon.svg': '<svg></svg>',
          'src/entry.tsx': `
            import ReactDOM from 'react-dom';
            import icon from '../assets/icon.svg';
            function App() { return <div>Hello world <img src={icon} /></div>; }
            ReactDOM.render(<App />, document.getElementById('root'));
          `,
        },
      }),
    ).resolves.toMatchSnapshot();
  });
});
