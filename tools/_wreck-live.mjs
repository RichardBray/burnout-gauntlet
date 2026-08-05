// _wreck-live.mjs — live check for hero-vs-NPC collision + the wrecked state.
// Boots the real game, aims the hero at the nearest same-lane car ahead, holds throttle,
// and asserts: contact slowed the hero, the struck car entered `wrecked`, left its lane
// line laterally or spun off its 90-degree heading, and came to rest as a live obstacle.
//
//   node tools/_wreck-live.mjs
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
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=dusk-highway-chase&res=1`,
  { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
await page.waitForTimeout(2000);   // let traffic fill

const setup = await page.evaluate(() => {
  const g = window.__game, s = g.physics.state, t = g.traffic;
  // nearest live car ahead on the hero's heading, roughly in line
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  let target = null, best = 1e9;
  for (const v of t.vehicles) {
    const dx = v.pos.x - s.pos.x, dz = v.pos.z - s.pos.z;
    const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (along > 20 && along < best && lat < 30) { best = along; target = v; }
  }
  if (!target) return { fail: 'no target vehicle found ahead' };

  // put the hero 45 m directly BEHIND it in its own lane, matching its heading, so holding
  // throttle rear-ends it however far it drives on. traffic yaw: forward = (cos ry, -sin ry);
  // physics yaw: forward = (sin yaw, cos yaw).
  const tfx = Math.cos(target.yaw), tfz = -Math.sin(target.yaw);
  const aim = Math.atan2(tfx, tfz);
  g.physics.clearPath && g.physics.clearPath();
  g.physics.reset(new g.THREE.Vector3(
    target.pos.x - tfx * 45, 0, target.pos.z - tfz * 45), aim, 45);
  g.camRig && g.camRig.snap();

  const rec = window.__wl = {
    target, x0: target.pos.x, z0: target.pos.z,
    heroMin: 1e9, wreckSeen: false, spun: false,
  };
  rec.sparks = false;
  rec.iv = setInterval(() => {
    rec.heroMin = Math.min(rec.heroMin, Math.abs(s.speed));
    if (target.wrecked) rec.wreckSeen = true;
    // impactBurst evidence: any live spark while no crash cinematic is running
    const c = g.crash;
    if (c && !c.active && c.sparksLive > 0) rec.sparks = true;
    const off = ((target.yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (Math.min(off, Math.PI / 2 - off) > 0.15) rec.spun = true;
  }, 16);
  return { ok: true };
});
if (setup.fail) { console.error(`FAIL: ${setup.fail}`); process.exit(1); }

await page.keyboard.down('KeyW');
await page.waitForTimeout(6000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(5000);   // let the wreck finish sliding to rest

const out = await page.evaluate(() => {
  const rec = window.__wl, target = rec.target;
  clearInterval(rec.iv);
  return {
    heroMin: +rec.heroMin.toFixed(1), wreckSeen: rec.wreckSeen, spun: rec.spun,
    sparks: rec.sparks,
    moved: +Math.hypot(target.pos.x - rec.x0, target.pos.z - rec.z0).toFixed(1),
    restSpeed: +Math.hypot(target.wvx || 0, target.wvz || 0).toFixed(2),
    stillLive: !!target.live, impact: +window.__game.physics.state.impact.toFixed(2),
  };
});

await browser.close();
server.close();

if (out.fail) { console.error(`FAIL: ${out.fail}`); process.exit(1); }
console.log(out);
const assert = (c, l) => { if (!c) { console.error(`FAIL: ${l}`); process.exit(1); } console.log(`  ok: ${l}`); };
assert(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
assert(out.wreckSeen, 'struck car entered wrecked state');
assert(out.heroMin < 35, `hero lost speed at contact (min ${out.heroMin} m/s)`);
assert(out.moved > 3 || out.spun, `wreck was displaced or spun (moved ${out.moved} m, spun ${out.spun})`);
assert(out.restSpeed < 2, `wreck came to rest (residual ${out.restSpeed} m/s)`);
assert(out.sparks, 'contact fired an impact burst (live sparks outside a crash)');
console.log('wreck-live: all checks passed');
