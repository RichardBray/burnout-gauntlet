// _passlag.mjs — how LATE is traffic.js's nearMiss event relative to the actual closest
// approach? A whoosh has to peak when the car is beside you; the existing event queue fires
// at closePass(), which traffic.js:977 gates on clearance re-opening past
// NEAR_MISS_R + NEAR_MISS_OUT (3.4 + 1.4 m). This measures the gap on a real drive so the
// design choice is made off a number instead of an estimate.
//
// Method: stamp the frame at which each vehicle's nmMin last improved (= closest approach)
// and the frame closePass() fires, and report the delta in ms.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const p = join(root, rel === '/' ? 'index.html' : rel);
    let buf = await readFile(p);
    if (rel === '/traffic.js') {
      let s = buf.toString();
      // stamp the moment of closest approach
      const a = `          if (clr <= v.nmMin) {
            v.nmMin = clr;`;
      if (!s.includes(a)) throw new Error('closest-approach anchor missing');
      s = s.replace(a, `          if (clr <= v.nmMin) {
            v.nmMin = clr; v.__minAt = performance.now(); v.__minRel = rel;`);
      // stamp the moment the event actually fires
      const b = `    emit(v.nmOnc ? 'oncoming' : 'nearMiss', 0.6 * close + 0.4 * fast, v.pos.x, v.pos.z,`;
      if (!s.includes(b)) throw new Error('emit anchor missing');
      s = s.replace(b, `    (window.__lags = window.__lags || []).push({
      lag: +(performance.now() - (v.__minAt || performance.now())).toFixed(1),
      clr: +v.nmMin.toFixed(2), rel: +(v.__minRel || 0).toFixed(1) });
    ` + b);
      buf = Buffer.from(s);
    }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) { res.writeHead(404); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({ args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.locator('#bgmenu button.go').click();
await page.waitForTimeout(1500);

await page.keyboard.down('ArrowUp');
await page.waitForTimeout(45000);
await page.keyboard.up('ArrowUp');

const lags = await page.evaluate(() => window.__lags || []);
if (!lags.length) { console.log('no passes recorded'); }
else {
  const v = lags.map((x) => x.lag).sort((a, b) => a - b);
  const pct = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  console.log(`passes: ${lags.length}`);
  console.log(`lag ms  min ${v[0]}  p50 ${pct(0.5)}  p90 ${pct(0.9)}  max ${v[v.length - 1]}`);
  console.log(`clearance m: ${lags.map((x) => x.clr).sort((a, b) => a - b).slice(0, 5).join(', ')} ...`);
  console.log(`rel speed m/s p50: ${lags.map((x) => x.rel).sort((a, b) => a - b)[Math.floor(lags.length / 2)]}`);
}
await browser.close();
server.close();
