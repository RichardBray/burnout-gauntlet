// _wreckwall-live.mjs — ram a kerb parked car SIDE-ON toward the pavement and assert the
// promoted wreck comes to rest outside every building block (the "car just disappears"
// report: wrecks used to slide through facades and finish inside a block).
//   node tools/_wreckwall-live.mjs
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
    if (b.gone) continue;
    const d = Math.hypot(b.x - s.pos.x, b.z - s.pos.z);
    if (d > 30 && d < best) { best = d; target = b; }
  }
  if (!target) return { fail: 'no parked body' };
  // Approach from the ROAD side, perpendicular to the car's axis: lateral = (fz, -fx),
  // and the road is toward the origin-facing side, so pick the lateral sign that points
  // AWAY from the nearest facade — i.e. start on the side with more open ground.
  const lx = target.fz, lz = -target.fx;
  const side = (target.x * lx + target.z * lz) > 0 ? -1 : 1;   // start nearer the map centre
  const sx = target.x + lx * side * 30, sz = target.z + lz * side * 30;
  const aim = Math.atan2(-lx * side, -(-lz * side)); // physics yaw: forward=(sin? see reset use)
  // _parkedhit-live uses Math.atan2(fx, fz) for a heading along (fx, fz); we head along
  // (-lx*side, -lz*side), i.e. from start toward the car.
  const yaw = Math.atan2(-lx * side, -lz * side);
  g.physics.reset(new g.THREE.Vector3(sx, 0, sz), yaw, 30);
  g.camRig && g.camRig.snap();
  window.__target = target;
  return { x: target.x, z: target.z, sx, sz, aimUsed: yaw, aimUnused: aim };
});
if (setup.fail) { console.error(setup.fail); process.exit(1); }

await page.keyboard.down('w');
await page.waitForTimeout(1400);
await page.keyboard.up('w');
await page.keyboard.down('s');     // brake, so the hero does not chase the wreck into the wall
await page.waitForTimeout(900);
await page.keyboard.up('s');
await page.waitForTimeout(4500);   // let the wreck slide out and settle

const out = await page.evaluate(() => {
  const g = window.__game, b = window.__target;
  // The hero sometimes clips a neighbour in the rank instead of the aimed car; any
  // promoted body exercises the same wall containment, so accept the nearest wreck.
  let wreck = null, best = 1e9;
  for (const v of g.traffic.vehicles) {
    if (!v.wrecked) continue;
    const d = Math.hypot(v.pos.x - b.x, v.pos.z - b.z);
    if (d < best) { best = d; wreck = v; }
  }
  const anyGone = g.world.parkedCars.some((c) => c.gone);
  if (!wreck) return { gone: anyGone, wreck: false };
  let inside = null;
  for (const blk of g.world.blocks) {
    const px = blk.w / 2 - Math.abs(wreck.pos.x - blk.cx);
    const pz = blk.d / 2 - Math.abs(wreck.pos.z - blk.cz);
    if (px > 0 && pz > 0) inside = { cx: blk.cx, cz: blk.cz, px: +px.toFixed(2), pz: +pz.toFixed(2) };
  }
  return {
    gone: anyGone, wreck: true,
    moved: +Math.hypot(wreck.pos.x - b.x, wreck.pos.z - b.z).toFixed(2),
    speed: +Math.hypot(wreck.wvx, wreck.wvz).toFixed(2),
    inside,
  };
});
console.log(out);
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok' : 'FAIL'}: ${m}`); if (!c) fail = 1; };
ok(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
ok(out.gone === true, 'parked body was promoted');
ok(out.wreck === true, 'a wreck exists near the spot');
if (out.wreck) {
  ok(out.inside === null, `wreck rests OUTSIDE every building block${out.inside ? ' — inside ' + JSON.stringify(out.inside) : ''}`);
  ok(out.speed < 0.5, `wreck settled (speed ${out.speed})`);
}
console.log(fail ? 'wreckwall-live: FAILED' : 'wreckwall-live: all checks passed');
await browser.close();
server.close();
process.exit(fail);
