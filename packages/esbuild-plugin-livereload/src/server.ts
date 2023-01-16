import fs from 'fs';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import path from 'path';
import { URL } from 'url';

const openEditor = import('open-editor');

export interface LivereloadServerOptions {
  basedir: string;
  port: number;
  host: string;
  onSSE: (res: ServerResponse) => void;
}

export type LivereloadRequestHandler = (req: IncomingMessage, res: ServerResponse) => boolean;

export async function createLivereloadRequestHandler(
  options: LivereloadServerOptions,
): Promise<LivereloadRequestHandler> {
  const { port, host, onSSE, basedir } = options;

  const distFiles = await fs.promises.readdir(__dirname);

  return function handleLivereloadRequest(req, res): boolean {
    if (!req.url) return false;
    const url = new URL(req.url, `http://${host}:${port}/`);

    if (url.pathname === '/esbuild') {
      onSSE(
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }),
      );
      return true;
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
      return true;
    }

    const sliceIndex = url.pathname.lastIndexOf('/');
    if (distFiles.includes(url.pathname.slice(sliceIndex + 1))) {
      try {
        const sourcePath = require.resolve(`.${url.pathname}`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/javascript');
        fs.createReadStream(sourcePath).pipe(res);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  };
}

export async function createLivereloadServer(options: LivereloadServerOptions): Promise<Server> {
  const handler = await createLivereloadRequestHandler(options);
  return createServer(handler).listen(options.port, options.host);
}
