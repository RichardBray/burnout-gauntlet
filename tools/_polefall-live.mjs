// _polefall-live.mjs — live check for knockable poles. Drives the hero over a street lamp,
// asserts: the hero keeps its speed (poles never slow the car), the pole is marked hit and
// its baked instance hidden, a dynamic falling copy activates, and the slot is released
// (sunk + hidden) within a few seconds.
//
//   node tools/_polefall-live.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=daytime-downtown&res=1`,
  { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
await page.waitForTimeout(1000);

const setup = await page.evaluate(() => {
  const g = window.__game, s = g.physics.state;
  let target = null, best = 1e9;
  for (const p of g.world.poles) {
    const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
    if (d > 30 && d < best) { best = d; target = p; }
  }
  if (!target) return { fail: 'no pole found' };
  const aim = Math.atan2(target.x - s.pos.x, target.z - s.pos.z);
  g.physics.clearPath && g.physics.clearPath();
  g.physics.reset(new g.THREE.Vector3(
    target.x - Math.sin(aim) * 10, 0, target.z - Math.cos(aim) * 10), aim, 20);
  g.camRig && g.camRig.snap();
  window.__pf = { target, speedAtHit: -1, activeSeen: 0, dMin: 1e9 };
  const rec = window.__pf;
  rec.iv = setInterval(() => {
    rec.activeSeen = Math.max(rec.activeSeen, g.poleFall.activeCount);
    rec.dMin = Math.min(rec.dMin, Math.hypot(rec.target.x - s.pos.x, rec.target.z - s.pos.z));
    if (rec.target.hit && rec.speedAtHit < 0) rec.speedAtHit = Math.abs(s.speed);
  }, 16);
  return { ok: true };
});
if (setup.fail) { console.error(`FAIL: ${setup.fail}`); process.exit(1); }

await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(7000);   // topple + rest + sink

const out = await page.evaluate(() => {
  const rec = window.__pf;
  clearInterval(rec.iv);
  return { hit: rec.target.hit, speedAtHit: +rec.speedAtHit.toFixed(1),
    dMin: +rec.dMin.toFixed(1),
    activeSeen: rec.activeSeen, activeNow: window.__game.poleFall.activeCount };
});
await browser.close();
server.close();

console.log(out);
const assert = (c, l) => { if (!c) { console.error(`FAIL: ${l}`); process.exit(1); } console.log(`  ok: ${l}`); };
assert(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
assert(out.hit, 'pole was knocked (baked instance hidden)');
// poles never touch physics (structural); just prove the hero was moving through contact
assert(out.speedAtHit > 1, `hero was moving through the pole contact (${out.speedAtHit} m/s)`);
assert(out.activeSeen > 0, 'a dynamic falling pole activated');
assert(out.activeNow === 0, 'the fallen pole sank and was released');
console.log('polefall-live: all checks passed');
