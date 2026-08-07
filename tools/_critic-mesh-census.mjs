// node tools/_critic-mesh-census.mjs <ref> [<ref> ...]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const refs = process.argv.slice(2);
const here = dirname(new URL(import.meta.url).pathname);
const gameRoot = resolve(here, '../game');
const cmRoot = resolve(here, '_critic-mesh');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = p.startsWith('/_cm/') ? join(cmRoot, p.slice(5)) : join(gameRoot, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
for (const ref of refs) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  page.on('pageerror', (e) => console.error('[pageerror]', ref, String(e)));
  await page.goto(`http://127.0.0.1:${port}/_cm/census.html?ref=${ref}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', null, { timeout: 180000 });
  const out = await page.evaluate('window.__result');
  const err = await page.evaluate('window.__err');
  console.log(JSON.stringify({ ref, out, err }));
  await page.close();
}
await browser.close();
server.close();
