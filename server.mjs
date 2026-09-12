import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Muhammad Zubair portfolio is ready at http://localhost:${port}`));
