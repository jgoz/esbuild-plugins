import fsp from 'fs/promises';

import test from './config/serve-test';

test('serves content from entry point', async ({ page, port, startServer }) => {
  await startServer({
    config: { jsx: 'automatic' },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import { App } from './app';
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/app.tsx': `
          export function App() {
            return <div>Hello world</div>;
          }
        `,
      },
    ],
  });

  await page.goto(`http://127.0.0.1:${port}/will-rewrite-to-index`);
  await test.expect(page).toHaveURL(`http://127.0.0.1:${port}/will-rewrite-to-index`);

  await test.expect(page.locator('body')).toContainText('Hello world');
});

test('can disable index rewriting', async ({ page, port, startServer }) => {
  await startServer({
    disableRewrite: true,
    config: { jsx: 'automatic' },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import { App } from './app';
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/app.tsx': `
          export function App() {
            return <div>Hello world</div>;
          }
        `,
      },
    ],
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await test.expect(page).toHaveURL(`http://127.0.0.1:${port}/`);

  const response = await page.goto(`http://127.0.0.1:${port}/wont-rewrite-to-index`);
  test.expect(response!.status()).toBe(404);
});

test('reloads page on file update if livereload enabled', async ({ page, port, startServer }) => {
  const { write } = await startServer({
    livereload: true,
    config: { jsx: 'automatic' },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import { App } from './app';
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/app.tsx': `
          export function App() {
            return <div>Hello world</div>;
          }
        `,
      },
      // 1
      {
        'src/app.tsx': `
          export function App() {
            return <div>Goodbye, cruel world</div>;
          }
        `,
      },
    ],
  });

  await page.goto(`http://127.0.0.1:${port}/`);

  await test.expect(page.locator('body')).toContainText('Hello world');

  await write(1);

  const msg = await page.waitForEvent('console');
  test.expect(msg.text()).toBe('esbuild-plugin-livereload: reloading...');

  await test.expect(page.locator('body')).toContainText('Goodbye, cruel world');
});

test('can serve from publicPath', async ({ page, port, startServer }) => {
  await startServer({
    config: {
      loader: { '.png': 'file' },
      jsx: 'automatic',
      publicPath: '/public',
    },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import { App } from './app';
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/app.tsx': `
          import cat from '../img/cat.png';
          export function App() {
            return <div>Hello world <img src={cat} /></div>;
          }
        `,
        'img/cat.png': await fsp.readFile(require.resolve('./fixture/cat.png')),
      },
    ],
  });

  await page.goto(`http://127.0.0.1:${port}/public/will-rewrite-to-index`);
  await test.expect(page).toHaveURL(`http://127.0.0.1:${port}/public/will-rewrite-to-index`);

  await page.waitForSelector('text=Hello world');
  test.expect(await page.screenshot()).toMatchSnapshot('publicPath-cat.png');

  await test.expect(page.locator('body')).toContainText('Hello world');
});

test('can disable index rewriting with publicPath', async ({ page, port, startServer }) => {
  await startServer({
    disableRewrite: true,
    config: {
      loader: { '.png': 'file' },
      jsx: 'automatic',
      publicPath: '/public',
    },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import { App } from './app';
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/app.tsx': `
          import cat from '../img/cat.png';
          export function App() {
            return <div>Hello world <img src={cat} /></div>;
          }
        `,
        'img/cat.png': await fsp.readFile(require.resolve('./fixture/cat.png')),
      },
    ],
  });

  await page.goto(`http://127.0.0.1:${port}/public`);
  await test.expect(page).toHaveURL(`http://127.0.0.1:${port}/public`);

  await page.waitForSelector('text=Hello world');
  test.expect(await page.screenshot()).toMatchSnapshot('publicPath-noRewrite-cat.png');

  const response = await page.goto(`http://127.0.0.1:${port}/public/wont-rewrite-to-index`);
  test.expect(response!.status()).toBe(404);
});

test('can serve static files from a given directory', async ({ page, port, startServer }) => {
  await startServer({
    serveDir: __dirname + '/fixture',
    config: {
      loader: { '.png': 'file' },
      jsx: 'automatic',
      publicPath: '/public',
    },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import { App } from './app';
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/app.tsx': `
          export function App() {
            return <div>Hello world <img src='/public/cat.png' /></div>;
          }
        `,
      },
    ],
  });

  await page.goto(`http://127.0.0.1:${port}/public/will-rewrite-to-index`);
  await test.expect(page).toHaveURL(`http://127.0.0.1:${port}/public/will-rewrite-to-index`);

  await page.waitForSelector('text=Hello world');
  test.expect(await page.screenshot()).toMatchSnapshot('publicPath-serveDir-cat.png');

  await test.expect(page.locator('body')).toContainText('Hello world');
});

test('page replaces stylesheets without reloading', async ({ page, port, startServer }) => {
  const { write } = await startServer({
    livereload: true,
    config: { jsx: 'automatic' },
    files: [
      // 0
      {
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
          import ReactDOM from 'react-dom/client';
          import './style.css';
          function App() { return <div>Hello world</div>; }
          const root = ReactDOM.createRoot(document.getElementById('root'))
          root.render(<App />);
        `,
        'src/style.css': `
          body { background: white; }
        `,
      },
      // 1
      {
        'src/style.css': `
          body { background: lightskyblue; }
        `,
      },
      // 2
      {
        'src/style.css': `
          body { background: white; }
        `,
      },
    ],
  });

  let loadCount = 0;
  page.addListener('load', () => {
    loadCount++;
  });

  await page.goto(`http://127.0.0.1:${port}/`);

  const body = await page.$('body');
  if (!body) throw new Error('Umm.. no body?');

  let bg = await body.evaluate(b => window.getComputedStyle(b).backgroundColor);
  test.expect(bg).toBe('rgb(255, 255, 255)');

  await write(1);
  await page.waitForFunction(
    bg => window.getComputedStyle(document.body).backgroundColor !== bg,
    bg,
  );

  bg = await body.evaluate(b => window.getComputedStyle(b).backgroundColor);
  test.expect(bg).toBe('rgb(135, 206, 250)');

  await write(2);
  await page.waitForFunction(
    bg => window.getComputedStyle(document.body).backgroundColor !== bg,
    bg,
  );

  bg = await body.evaluate(b => window.getComputedStyle(b).backgroundColor);
  test.expect(bg).toBe('rgb(255, 255, 255)');

  test.expect(loadCount).toBe(1);
});
