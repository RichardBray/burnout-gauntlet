// Debug: boot car-paint-closeup, run an arbitrary JS snippet against window.__game,
// re-render, and screenshot. Used for the "pure white mirror" probe diagnosis.
//   node tools/_carpaint-eval-shot.mjs --out shots/x.png --js "..."
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
}
const scene = args.scene || 'car-paint-closeup';
const out = resolve(args.out || 'shots/_eval.png');
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const body = await readFile(join(root, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[error]', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
if (args.js) console.log('[eval]', await page.evaluate(`(()=>{${args.js}\n return 'done';})()`));
await page.evaluate(`(()=>{ for(let i=0;i<4;i++) window.__game.composer.render(); })()`);
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log('ok', out);
await browser.close();
server.close();
