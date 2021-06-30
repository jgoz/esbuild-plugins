import fs from 'fs';
import { createServer, ServerResponse } from 'http';
import openEditor from 'open-editor';
import path from 'path';
import { URL } from 'url';

interface ServerOptions {
  basedir: string;
  port: number;
  onSSE: (res: ServerResponse) => void;
}

export function createLivereloadServer(options: ServerOptions): void {
  const { port, onSSE, basedir } = options;

  createServer((req, res) => {
    if (!req.url) return;
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

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
    if (url.pathname === '/open-editor') {
      const file = url.searchParams.get('file');
      const line = Number(url.searchParams.get('line') ?? 0);
      const column = Number(url.searchParams.get('column') ?? 0);
      if (file) {
        const absfile = path.resolve(basedir, file);
        try {
          openEditor([{ file: absfile, column, line }]);
        } catch (e) {
          console.warn(e.message);
        }
      }
      return;
    }
  }).listen(port);
}
