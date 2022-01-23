import test from './config/node-dev-test';

test('serves content from entry point', async ({ port, startServer, request }) => {
  await startServer({
    config: {
      entryPoints: { server: 'src/server.ts' },
    },
    files: [
      {
        'src/server.ts': `
          const server = require('http').createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Hello World');
          });
          server.listen(${port}, '127.0.0.1');
        `,
      },
    ],
  });

  const res = await request.get(`http://127.0.0.1:${port}`);
  test.expect(res.status()).toBe(200);
  test.expect(await res.text()).toBe('Hello World');
});

test('passes extra args to program', async ({ port, startServer, request }) => {
  await startServer({
    args: ['--', 'one', '--respawn', '-v'],
    config: {
      entryPoints: { server: 'src/server.ts' },
    },
    files: [
      {
        'src/server.ts': `
          const server = require('http').createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Hello ' + process.argv.slice(2).join());
          });
          server.listen(${port}, '127.0.0.1');
        `,
      },
    ],
  });

  const res = await request.get(`http://127.0.0.1:${port}`);
  test.expect(res.status()).toBe(200);
  test.expect(await res.text()).toBe('Hello one,--respawn,-v');
});

test('reloads server if requested [skip CI]', async ({ port, startServer, request }) => {
  const { write } = await startServer({
    respawn: true,
    config: {
      platform: 'node',
      entryPoints: { server: 'src/server.ts' },
    },
    files: [
      // 0
      {
        'src/server.ts': `
          const server = require('http').createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Hello World');
          });
          server.listen(${port}, '127.0.0.1');
        `,
      },
      // 1
      {
        'src/server.ts': `
          const server = require('http').createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Goodbye, cruel world');
          });
          server.listen(${port}, '127.0.0.1');
        `,
      },
    ],
  });

  const res1 = await request.get(`http://127.0.0.1:${port}`);
  test.expect(res1.status()).toBe(200);
  test.expect(await res1.text()).toBe('Hello World');

  await write(1);

  const res2 = await request.get(`http://127.0.0.1:${port}`);
  test.expect(res2.status()).toBe(200);
  test.expect(await res2.text()).toBe('Goodbye, cruel world');
});

test('retries 3 times if server crashes', async ({ port, startServer, request }) => {
  const stderr: string[] = [];

  const { write } = await startServer({
    respawn: true,
    config: {
      platform: 'node',
      entryPoints: { server: 'src/server.ts' },
    },
    files: [
      // 0
      {
        'src/server.ts': `
          const server = require('http').createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Hello World');
          });
          server.listen(${port}, '127.0.0.1');
        `,
      },
      // 1
      {
        'src/server.ts': `
        throw new Error('crash');
        `,
      },
    ],
    onStderr: output => {
      stderr.push(output);
    },
  });

  const res1 = await request.get(`http://127.0.0.1:${port}`);
  test.expect(res1.status()).toBe(200);
  test.expect(await res1.text()).toBe('Hello World');

  await write(1);

  test.expect(stderr.filter(v => v.startsWith('Error: crash'))).toHaveLength(3);
  test.expect(stderr.join('\n')).toContain('Maximum keep-alive count reached, dying');
});
