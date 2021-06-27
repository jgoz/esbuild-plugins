import fs from 'fs';
import { createServer, ServerResponse } from 'http';

export function createLivereloadServer(port: number, onSSE: (res: ServerResponse) => void): void {
  const overlayPath = require.resolve('@jgoz/error-overlay');

  createServer((req, res) => {
    if (req.url === '/esbuild') {
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
    if (req.url === '/overlay.js') {
      fs.createReadStream(overlayPath).pipe(res);
      return;
    }
  }).listen(port);
}
