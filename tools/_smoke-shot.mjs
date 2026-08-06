// _smoke-shot.mjs — boot the live page, drive up to speed, throw an e-brake drift and
// screenshot the tyre smoke mid-slide. Server + browser scaffolding follows _hcr2-drive.mjs;
// keys go through real KeyboardEvents so main.js's own input path runs.
//   node tools/_smoke-shot.mjs [--out shots/smoke.png]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
}
const out = resolve(args.out || 'shots/smoke.png');
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.physics, null, { timeout: 120000 });
await page.waitForTimeout(2500);

const key = (code, down) => page.evaluate((a) => {
  window.dispatchEvent(new KeyboardEvent(a.down ? 'keydown' : 'keyup', { code: a.code, bubbles: true }));
}, { code, down });

await key('KeyW', true);
await page.waitForTimeout(3500);                    // build speed
await key('KeyA', true);
await page.waitForTimeout(250);
await key('Space', true);                           // e-brake drift, smoke should pour
await page.waitForTimeout(700);
const s = await page.evaluate(() => ({
  slip: (window.__game.physics.state.slipAngle * 180 / Math.PI).toFixed(1),
  kmh: (window.__game.physics.state.ground * 3.6).toFixed(0),
}));
console.log(`mid-drift: slip ${s.slip} deg at ${s.kmh} km/h`);
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
await page.waitForTimeout(500);                     // second shot: car driving out of the cloud
await key('Space', false); await key('KeyA', false);
await page.screenshot({ path: out.replace(/\.png$/, '-after.png') });
console.log('wrote', out, 'and', out.replace(/\.png$/, '-after.png'));
await browser.close();
server.close();
