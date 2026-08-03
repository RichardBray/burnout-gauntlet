// Serves the repo root on :8777 so progress.html can fetch STATE.md.
//   node tools/serve.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.md': 'text/plain', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(root, p === '/' ? '/progress.html' : p);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(8777, () => console.log('http://127.0.0.1:8777/'));
