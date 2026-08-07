// Runner for the critic harness. Serves game/ at / and tools/_critic-mesh/ at /_cm/.
// node tools/_critic-mesh-run.mjs [--out file.json]
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; }));
const here = dirname(new URL(import.meta.url).pathname);
const gameRoot = resolve(here, '../game');
const cmRoot = resolve(here, '_critic-mesh');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
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
const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.error('[console]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
await page.goto(`http://127.0.0.1:${port}/_cm/harness.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__done === true', null, { timeout: 300000 });
const out = await page.evaluate('window.__result');
const errs = await page.evaluate('window.__err');
const txt = JSON.stringify({ result: out, pageErrors: errs }, null, 1);
if (args.out) await writeFile(args.out, txt); else console.log(txt);
console.error('done');
await browser.close();
server.close();
