import fs from 'fs';
import type { Server, ServerResponse } from 'http';
import { createServer } from 'http';
import path from 'path';
import { URL } from 'url';

const openEditor = import('open-editor');

interface ServerOptions {
  basedir: string;
  port: number;
  host: string;
  onSSE: (res: ServerResponse) => void;
}

export function createLivereloadServer(options: ServerOptions): Server {
  const { port, host, onSSE, basedir } = options;

  return createServer((req, res) => {
    if (!req.url) return;
    const url = new URL(req.url, `http://${host}:${port}`);

    if (url.pathname === '/esbuild') {
      onSSE(
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }),
      );
      return;
    }
    if (url.pathname.endsWith('.js')) {
      const sourcePath = require.resolve(`.${url.pathname}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'text/javascript');
      fs.createReadStream(sourcePath).pipe(res);
      return;
    }
    if (url.pathname === '/esbuild/open-editor') {
      const file = url.searchParams.get('file');
      const line = Number(url.searchParams.get('line') ?? 0);
      const column = Number(url.searchParams.get('column') ?? 0);
      if (file) {
        const absfile = path.resolve(basedir, file);
        openEditor
          .then(({ default: open }) => open([{ file: absfile, column, line }]))
          .catch(e => {
            console.warn(e instanceof Error ? e.message : String(e));
          });
      }
      return;
    }
  }).listen(port, host);
}
