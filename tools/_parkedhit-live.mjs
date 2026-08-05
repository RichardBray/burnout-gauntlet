// _parkedhit-live.mjs — live check that hitting a parked car promotes it to a moving wreck.
// Boots the city scene, aims the hero at the nearest parked body, holds throttle, asserts:
// the baked body is hidden (gone), a live wrecked pool car exists near it, and it moved.
//
//   node tools/_parkedhit-live.mjs
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
await page.waitForTimeout(1500);

const setup = await page.evaluate(() => {
  const g = window.__game, s = g.physics.state;
  let target = null, best = 1e9;
  for (const b of g.world.parkedCars) {
    const d = Math.hypot(b.x - s.pos.x, b.z - s.pos.z);
    if (d > 30 && d < best) { best = d; target = b; }
  }
  if (!target) return { fail: 'no parked body found' };
  // 40 m back along the parked car's own axis, aimed at it, fast
  const aim = Math.atan2(target.fx, target.fz);   // physics yaw for the body's forward
  g.physics.clearPath && g.physics.clearPath();
  g.physics.reset(new g.THREE.Vector3(
    target.x - target.fx * 40, 0, target.z - target.fz * 40), aim, 35);
  g.camRig && g.camRig.snap();
  window.__pt = { x0: target.x, z0: target.z, target };
  return { ok: true };
});
if (setup.fail) { console.error(`FAIL: ${setup.fail}`); process.exit(1); }

await page.keyboard.down('KeyW');
await page.waitForTimeout(3500);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');   // stop the hero so it can't keep nudging the wreck
await page.waitForTimeout(2500);
await page.keyboard.up('KeyS');
await page.waitForTimeout(5000);

const out = await page.evaluate(() => {
  const { x0, z0, target } = window.__pt;
  const g = window.__game;
  let wreck = null, dMin = 1e9;
  for (const v of g.traffic.vehicles) {
    if (!v.wrecked) continue;
    const d = Math.hypot(v.pos.x - x0, v.pos.z - z0);
    if (d < dMin) { dMin = d; wreck = v; }
  }
  return {
    gone: !!target.gone,
    wreckNear: !!wreck && dMin < 150,
    moved: wreck ? +Math.hypot(wreck.pos.x - x0, wreck.pos.z - z0).toFixed(1) : 0,
    rest: wreck ? +Math.hypot(wreck.wvx, wreck.wvz).toFixed(2) : -1,
  };
});
await browser.close();
server.close();

console.log(out);
const assert = (c, l) => { if (!c) { console.error(`FAIL: ${l}`); process.exit(1); } console.log(`  ok: ${l}`); };
assert(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
assert(out.gone, 'parked body was promoted (baked instance hidden)');
assert(out.wreckNear, 'a live wrecked car exists near the parking spot');
// rest behaviour is _wreck-live.mjs's assertion; this check owns only the promotion
assert(out.moved > 1, `the wreck was knocked away (moved ${out.moved} m)`);
console.log('parkedhit-live: all checks passed');
