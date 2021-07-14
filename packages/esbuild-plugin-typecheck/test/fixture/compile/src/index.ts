import fs from 'fs';
import { createServer } from 'http';
import { URL } from 'url';
const sourcePath = '';

createServer((req, res) => {
  if (!req.url) return;
  const url = new URL(req.url, `http://127.0.0.1:9999`);

  if (url.pathname === '/esbuild') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/javascript');
    fs.createReadStream(sourcePath).pipe(res);
  }
});
