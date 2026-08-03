// _traffic-critic-r2.mjs — the ROUND-2 traffic critic's own instrument. Plays the real build
// through the real key listeners and records what the traffic and the BOOST EVENT STREAM do,
// frame by frame, from inside the page. Edits no game code; every hook is a live object off
// window.__game.
//
//   node tools/_traffic-critic-r2.mjs --drive highway --secs 40
//   node tools/_traffic-critic-r2.mjs --drive city --secs 30 --adversary sit
//   node tools/_traffic-critic-r2.mjs --drive highway --secs 25 --adversary wrongway
//   node tools/_traffic-critic-r2.mjs --drive highway --secs 20 --adversary offlane   (control)
//   node tools/_traffic-critic-r2.mjs --drive highway --secs 20 --pool 0              (control)
//
// WHY IT IS NOT round 1's `_trafficplay.mjs`. Two reasons.
//  (a) The event stream did not exist in round 1, and the only honest way to judge it is to
//      re-derive every event's GEOMETRY independently of the code that emitted it: my own
//      point-to-box clearance from the published pose, and my own heading dot product for
//      "oncoming". A type tag is a claim, not evidence.
//  (b) `_trafficplay.mjs` starts recording with an empty `prev` map, so its FIRST frame counts
//      every live vehicle as a fresh spawn at whatever distance it happens to be. I arm after a
//      warm window and skip the first recorded frame, and I ALSO report what the first frame
//      would have contributed, so the size of that instrument error is on the record.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const num = (v, d) => (v === undefined || v === true ? d : +v);
const str = (v, d) => (v === undefined || v === true ? d : String(v));

const W = num(args.w, 1280), H = num(args.h, 720);
const SECS = num(args.secs, 30);
const ADV = str(args.adversary, '');
const DRIVE = str(args.drive, 'city');
const SCENE = str(args.scene, DRIVE === 'highway' ? 'dusk-highway-chase' : 'daytime-downtown');
const POOL = args.pool === undefined ? null : num(args.pool, 30);
const WARM = num(args.warm, 2.5);

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=${SCENE}&res=1`,
  { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true && !!window.__frameStats', null, { timeout: 180000 });

if (args.tod && args.tod !== true) {
  await page.evaluate((t) => { window.__game.applyTimeOfDay(t); window.__game.applyWet(0); }, String(args.tod));
}
// ---- placement --------------------------------------------------------------------------
const PLACE = DRIVE === 'highway'
  ? { path: 'highway', u: 0.06, kmh: 108, follow: 26 }
  : { path: 'city', u: 0.34, kmh: 72, follow: 26 };
await page.evaluate((p) => {
  const g = window.__game;
  const path = g.world.paths[p.path];
  g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
  if (p.follow) g.physics.followPath(path, p.follow); else g.physics.clearPath();
  g.traffic.reset(g.physics.state.pos);
  g.camRig.snap();
}, PLACE);

if (ADV === 'wrongway') {
  await page.evaluate(() => {
    const g = window.__game, HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(600, 0, HZ + 9), -Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'ram') {
  await page.evaluate(() => {
    const g = window.__game, HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(-900, 0, HZ + 9), Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'offlane') {
  // CONTROL for "does the event stream fire on distance travelled". The hero drives fast and far
  // down the highway, PARALLEL to the traffic and 28 m clear of the outermost lane centre, so he
  // passes dozens of cars and is never within a lane-width of one. An honest near-miss stream must
  // score exactly zero here while a timer or an odometer scores the same as a lane-kept run.
  await page.evaluate(() => {
    const g = window.__game, HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(-900, 0, HZ + 28), Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'rshot') {
  // R, one press, from a FROZEN hero pose. main.js:526-530 keeps the hero's position and yaw and
  // does not snap the camera, so the only thing that can change between these two frames is the
  // traffic. Two PNGs, one before and one after, plus the list of bodies that teleported.
  await page.evaluate(() => {
    const g = window.__game, HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(0, 0, HZ + 9), Math.PI / 2, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'endpark') {
  // Same place, hero PARKED and facing the line end, so the deferred retire can be watched
  // rather than driven past: cars pass x = 1196, keep going, and run out of tarmac at 1200.
  await page.evaluate(() => {
    const g = window.__game, HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(1120, 0, HZ + 15), Math.PI / 2, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'end') {
  // THE LINE END, head-on. The deferred line-end retire lets a vehicle keep driving off the end
  // of the tarmac instead of vanishing; this run puts the hero 120 m short of the ribbon end
  // looking straight at the place that happens, so the trade can be looked at as well as counted.
  await page.evaluate(() => {
    const g = window.__game, HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(1080, 0, HZ + 6.5), Math.PI / 2, 20);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'sit') {
  await page.evaluate(() => {
    const g = window.__game, G = g.world.LAYOUT.grid;
    const gx = G[Math.floor(G.length / 2)], gz = G[Math.floor(G.length / 2)];
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(gx, 0, gz), 0, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
    window.__sitAt = [gx, gz];
  });
}
if (str(args.kill, '') === 'overtake') {
  // KILL-CONTROL for the builder's mechanism claim, done from the PAGE and not by editing code.
  // Mechanism 4 ("go round what will not move") is wrapped out: traffic.update still runs in
  // full, then every vehicle's lateral state is forced back to the lane centre and its overtake
  // latch is cleared, so a body can brake for a blockage but can never leave the lane to pass it.
  // If the junction freeze comes back, the overtake is load-bearing; if it does not, the fix was
  // the signal split alone and the builder's mechanism is misattributed.
  await page.evaluate(() => {
    const t = window.__game.traffic, raw = t.update.bind(t);
    t.update = (dt, p, y, sp) => { raw(dt, p, y, sp); for (const v of t.vehicles) { v.otT = 0; v.lat = 0; v.swerve = 0; } };
  });
}
if (POOL !== null) await page.evaluate((n) => window.__game.traffic.setPool(n), POOL);

// ---- per-frame recorder ------------------------------------------------------------------
await page.evaluate((warm) => {
  const g = window.__game, T = g.THREE, t = g.traffic;
  const rec = {
    armed: false, warm, t0: performance.now(), frames: 0, dtSum: 0, first: true,
    firstFrameSpawns: 0, firstFrameNear: [],
    vf: 0, vfStop: 0, spd: [], counts: [],
    maxOverlap: 0, overlapFrames: 0, overlapAt: null,
    maxLaneErr: 0, laneErrSum: 0,
    spawns: 0, spawnVisible: 0, spawnVisDists: [],
    retires: 0, retireVisible: 0, retireVisDists: [],
    heroDist: 0, heroInBody: 0,
    perSlotDist: new Array(t.POOL_CAP).fill(0), perSlotFrames: new Array(t.POOL_CAP).fill(0),
    events: [], evByType: {}, drains: 0,
    minClrEver: 1e9, offRibbon: 0, offRibbonVisible: 0, offRibbonMax: 0,
    corridor: 0, corridorN: 0,
    sit: [], phaseFlips: 0, lastOwner: -2,
  };
  const stopRun = new Array(t.POOL_CAP).fill(0);
  const prev = new Map();
  const myMin = new Array(t.POOL_CAP).fill(1e9);     // my own running min clearance per slot
  const myDot = new Array(t.POOL_CAP).fill(0);       // heading dot at the frame of that min
  const myRel = new Array(t.POOL_CAP).fill(0);
  const frustum = new T.Frustum(), pm = new T.Matrix4(), pt = new T.Vector3();
  let lastT = performance.now(), lastHx = 0, lastHz = 0, haveLast = false;

  function inView(x, z) {
    pm.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    return frustum.containsPoint(pt.set(x, 1, z));
  }
  const BLK = g.world.blocks;
  function unoccluded(x, z) {
    const c = g.camera.position, dx = x - c.x, dz = z - c.z;
    for (const b of BLK) {
      const hx = b.w / 2, hz = b.d / 2;
      let t0 = 0, t1 = 1;
      for (const [o, d, h, cc] of [[c.x, dx, hx, b.cx], [c.z, dz, hz, b.cz]]) {
        const lo = cc - h, hi = cc + h;
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
        let a = (lo - o) / d, bb = (hi - o) / d;
        if (a > bb) { const s = a; a = bb; bb = s; }
        if (a > t0) t0 = a;
        if (bb < t1) t1 = bb;
        if (t0 > t1) { t0 = 2; break; }
      }
      if (t0 <= t1 && t0 <= 1) return false;
    }
    return true;
  }

  function step() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if ((now - rec.t0) / 1000 < rec.warm) { requestAnimationFrame(step); return; }
    const hs = g.physics.state;
    const live = t.vehicles;
    const hx = hs.pos.x, hz = hs.pos.z;
    const hyaw = hs.yaw;
    const hfx = Math.sin(hyaw), hfz = Math.cos(hyaw);
    const hvx = hfx * hs.speed, hvz = hfz * hs.speed;

    // ---- my own geometry, computed from the published pose and NOT from the emitter -----
    for (const v of live) {
      const ax = Math.abs(Math.cos(v.yaw)) > 0.5;
      const ex = ax ? v.halfLen : v.halfWid, ez = ax ? v.halfWid : v.halfLen;
      const cdx = Math.max(0, Math.abs(hx - v.pos.x) - ex);
      const cdz = Math.max(0, Math.abs(hz - v.pos.z) - ez);
      const clr = Math.hypot(cdx, cdz) - 0.95;
      const cfx = Math.cos(v.yaw), cfz = -Math.sin(v.yaw);
      const vvx = cfx * v.speed, vvz = cfz * v.speed;
      if (clr < rec.minClrEver) rec.minClrEver = clr;
      if (clr > 8) { myMin[v.k] = 1e9; continue; }
      if (clr < myMin[v.k]) {
        myMin[v.k] = clr;
        myDot[v.k] = hfx * cfx + hfz * cfz;         // <0 => hero heading opposes the car's
        myRel[v.k] = Math.hypot(hvx - vvx, hvz - vvz);
      }
    }

    // ---- drain the event queue (nothing in the shipped path reads it: join pending) -----
    const evs = t.drainEvents();
    rec.drains++;
    if (!rec.first) {
      for (const e of evs) {
        // match the event to the vehicle it names, by position
        let best = null, bd = 1e9;
        for (const v of live) {
          const d = Math.hypot(v.pos.x - e.at.x, v.pos.z - e.at.z);
          if (d < bd) { bd = d; best = v; }
        }
        const k = best ? best.k : -1;
        rec.evByType[e.type] = (rec.evByType[e.type] || 0) + 1;
        if (rec.events.length < 400) {
          rec.events.push({
            type: e.type, amount: +e.amount.toFixed(3),
            said: e.meta && e.meta.clearance !== undefined ? e.meta.clearance : null,
            saidRel: e.meta && e.meta.relSpeed !== undefined ? e.meta.relSpeed : null,
            myClr: k >= 0 && myMin[k] < 1e8 ? +myMin[k].toFixed(2) : null,
            myDot: k >= 0 ? +myDot[k].toFixed(2) : null,
            myRel: k >= 0 ? +myRel[k].toFixed(1) : null,
            matchDist: +bd.toFixed(1),
            heroKmh: +(hs.speed * 3.6).toFixed(1),
            km: +(rec.heroDist / 1000).toFixed(3),
          });
        }
      }
    }

    rec.frames++; rec.dtSum += dt;
    if (haveLast) rec.heroDist += Math.hypot(hx - lastHx, hz - lastHz);
    lastHx = hx; lastHz = hz; haveLast = true;
    rec.counts.push(live.length);

    const seen = new Set();
    let corr = 0;
    for (const v of live) {
      seen.add(v.k);
      rec.vf++;
      if (v.speed < 0.5) { rec.vfStop++; stopRun[v.k] += dt; } else stopRun[v.k] = 0;
      if (rec.spd.length < 400000) rec.spd.push(v.speed);
      rec.perSlotFrames[v.k]++;
      const p = prev.get(v.k);
      const jump = p && p.live ? Math.hypot(v.pos.x - p.x, v.pos.z - p.z) : Infinity;
      const isRespawn = !(p && p.live) || jump > 4.0;
      if (!isRespawn) rec.perSlotDist[v.k] += jump;
      if (isRespawn) {
        const dh = Math.hypot(v.pos.x - hx, v.pos.z - hz);
        if (rec.first) {
          // what round 1's instrument would have charged to this frame, recorded and NOT counted
          rec.firstFrameSpawns++;
          if (dh < 240 && inView(v.pos.x, v.pos.z) && unoccluded(v.pos.x, v.pos.z)) {
            rec.firstFrameNear.push(+dh.toFixed(1));
          }
        } else {
          rec.spawns++;
          if (dh < 320 && inView(v.pos.x, v.pos.z) && unoccluded(v.pos.x, v.pos.z)) {
            rec.spawnVisible++; rec.spawnVisDists.push(+dh.toFixed(1));
          }
          if (jump !== Infinity && inView(p.x, p.z)
              && Math.hypot(p.x - hx, p.z - hz) < 320 && unoccluded(p.x, p.z)) {
            rec.retireVisible++;
            rec.retireVisDists.push(+Math.hypot(p.x - hx, p.z - hz).toFixed(1));
          }
        }
      }
      // lane discipline
      const L = v.line;
      const off = L.axis === 0 ? (v.pos.z - L.c) * v.dir : -(v.pos.x - L.c) * v.dir;
      const err = Math.abs(off - v.lane);
      rec.laneErrSum += err;
      if (err > rec.maxLaneErr) rec.maxLaneErr = err;
      // OFF THE END OF THE RIBBON: the deferred line-end retire lets a vehicle keep driving past
      // the tarmac. world.js builds the highway ribbon -1200..1200, so a body outside that on the
      // highway line is driving on nothing. Count it, and count it while the player can see it.
      if (!L.junc) {
        const over = Math.abs(v.s) - 1200;
        if (over > 0) {
          rec.offRibbon++;
          if (over > rec.offRibbonMax) rec.offRibbonMax = over;
          const d = Math.hypot(v.pos.x - hx, v.pos.z - hz);
          if (d < 320 && inView(v.pos.x, v.pos.z) && unoccluded(v.pos.x, v.pos.z)) rec.offRibbonVisible++;
        }
      }
      // hero body inside a traffic body (routed to physics; quantified again)
      const ax2 = Math.abs(Math.cos(v.yaw)) > 0.5;
      const ex2 = (ax2 ? v.halfLen : v.halfWid) + 2.0, ez2 = (ax2 ? v.halfWid : v.halfLen) + 0.95;
      if (Math.abs(v.pos.x - hx) < ex2 && Math.abs(v.pos.z - hz) < ez2) rec.heroInBody++;
      // corridor ahead: the quantity POOL was chosen by. 50 deg half-cone, 200 m.
      const dx = v.pos.x - hx, dz = v.pos.z - hz, d = Math.hypot(dx, dz);
      if (d > 1 && d < 200 && (dx * hfx + dz * hfz) / d > Math.cos(50 * Math.PI / 180)) corr++;
    }
    rec.corridor += corr; rec.corridorN++;
    for (const [k, p] of prev) if (p.live && !seen.has(k)) rec.retires++;
    prev.clear();
    for (const v of live) prev.set(v.k, { x: v.pos.x, z: v.pos.z, live: true });

    // all-pairs exact overlap (every traffic yaw is a multiple of 90 deg)
    let worst = 0, wat = null;
    for (let i = 0; i < live.length; i++) {
      const a = live[i], aax = Math.abs(Math.cos(a.yaw)) > 0.5;
      const aex = aax ? a.halfLen : a.halfWid, aez = aax ? a.halfWid : a.halfLen;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j], bax = Math.abs(Math.cos(b.yaw)) > 0.5;
        const bex = bax ? b.halfLen : b.halfWid, bez = bax ? b.halfWid : b.halfLen;
        const ox = (aex + bex) - Math.abs(a.pos.x - b.pos.x); if (ox <= 0) continue;
        const oz = (aez + bez) - Math.abs(a.pos.z - b.pos.z); if (oz <= 0) continue;
        const dd = Math.min(ox, oz);
        if (dd > worst) {
          worst = dd;
          wat = { f: rec.frames, x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1),
            x2: +b.pos.x.toFixed(1), z2: +b.pos.z.toFixed(1),
            sa: +a.speed.toFixed(2), sb: +b.speed.toFixed(2) };
        }
      }
    }
    if (worst > 0.001) rec.overlapFrames++;
    if (worst > rec.maxOverlap) { rec.maxOverlap = worst; rec.overlapAt = wat; }

    if (window.__sitAt) {
      const [sx, sz] = window.__sitAt;
      const own = t.signalPhase(sx, sz);
      if (own !== rec.lastOwner) { if (rec.lastOwner !== -2) rec.phaseFlips++; rec.lastOwner = own; }
      if (rec.frames % 15 === 0) {
        let s0 = 0, s1 = 0, n0 = 0, n1 = 0;
        for (const v of live) {
          if (Math.hypot(v.pos.x - sx, v.pos.z - sz) > 62) continue;
          if (v.line.axis === 0) { n0++; if (v.speed < 0.5) s0++; }
          else { n1++; if (v.speed < 0.5) s1++; }
        }
        rec.sit.push([+rec.dtSum.toFixed(1), own, n0, s0, n1, s1]);
      }
    }
    rec.first = false;
    requestAnimationFrame(step);
  }
  window.__crec = rec;
  rec.armed = true;
  requestAnimationFrame(step);
}, WARM);

if (ADV !== 'sit' && ADV !== 'endpark' && ADV !== 'rshot') await page.keyboard.down('KeyW');
if (ADV === 'ram' || ADV === 'offlane') await page.keyboard.down('ShiftLeft');
if (ADV === 'rmash') {
  // R is the real reset key on the playable path (main.js:526) and it calls traffic.reset(pos)
  // with the hero left EXACTLY where he is. reset() spawns with the view-cone gate DISABLED, so
  // this is the one input a player performs constantly that can still put a car in plain sight.
  await sleep(WARM * 1000 + 2000);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyR'); await sleep((SECS * 1000 - 2000) / 8); }
} else if (ADV === 'rshot') {
  await sleep(WARM * 1000 + 4000);
  const before = await page.evaluate(() => window.__game.traffic.vehicles.map((v) => [v.k, +v.pos.x.toFixed(1), +v.pos.z.toFixed(1)]));
  await page.screenshot({ path: 'shots/s/critic-r2-R-before.png' });
  await page.keyboard.press('KeyR');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const after = await page.evaluate(() => ({ v: window.__game.traffic.vehicles.map((v) => [v.k, +v.pos.x.toFixed(1), +v.pos.z.toFixed(1)]), h: [window.__game.physics.state.pos.x, window.__game.physics.state.pos.z] }));
  await page.screenshot({ path: 'shots/s/critic-r2-R-after.png' });
  const bm = new Map(before.map(([k, x, z]) => [k, [x, z]]));
  const moved = [];
  for (const [k, x, z] of after.v) {
    const b = bm.get(k); if (!b) continue;
    const j = Math.hypot(x - b[0], z - b[1]);
    if (j > 4) moved.push({ k, jump: +j.toFixed(1), newDist: +Math.hypot(x - after.h[0], z - after.h[1]).toFixed(1), oldDist: +Math.hypot(b[0] - after.h[0], b[1] - after.h[1]).toFixed(1) });
  }
  moved.sort((a, b) => a.newDist - b.newDist);
  console.log(`ONE PRESS OF R, hero frozen: ${moved.length} of ${before.length} bodies teleported`);
  console.log(`  arriving at (m from hero): ${JSON.stringify(moved.map((m) => m.newDist))}`);
  console.log(`  leaving from (m from hero): ${JSON.stringify(moved.map((m) => m.oldDist).sort((a, b) => a - b))}`);
  await sleep(500);
} else await sleep(WARM * 1000 + SECS * 1000);
await page.keyboard.up('KeyW').catch(() => {});
await page.keyboard.up('ShiftLeft').catch(() => {});

const out = await page.evaluate(() => {
  const r = window.__crec, g = window.__game, t = g.traffic;
  const s = r.spd.slice().sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))] : 0);
  const moved = r.perSlotDist.filter((d, i) => r.perSlotFrames[i] > 30);
  return {
    frames: r.frames, secs: r.dtSum, km: r.heroDist / 1000,
    meanCount: r.counts.reduce((a, b) => a + b, 0) / r.counts.length,
    minCount: Math.min(...r.counts), maxCount: Math.max(...r.counts), poolNow: t.POOL,
    vf: r.vf, stopPct: 100 * r.vfStop / (r.vf || 1),
    kmh: { p01: q(0.01) * 3.6, p10: q(0.10) * 3.6, p50: q(0.50) * 3.6, p90: q(0.90) * 3.6,
      mean: 3.6 * s.reduce((a, b) => a + b, 0) / (s.length || 1) },
    maxOverlap: r.maxOverlap, overlapFrames: r.overlapFrames, overlapAt: r.overlapAt,
    maxLaneErr: r.maxLaneErr, meanLaneErr: r.laneErrSum / (r.vf || 1),
    spawns: r.spawns, spawnVisible: r.spawnVisible,
    spawnVisDists: r.spawnVisDists.slice().sort((a, b) => a - b),
    retires: r.retires, retireVisible: r.retireVisible,
    retireVisDists: r.retireVisDists.slice().sort((a, b) => a - b),
    firstFrameSpawns: r.firstFrameSpawns, firstFrameNear: r.firstFrameNear.sort((a, b) => a - b),
    heroInBody: r.heroInBody, minClrEver: r.minClrEver,
    offRibbon: r.offRibbon, offRibbonVisible: r.offRibbonVisible, offRibbonMax: r.offRibbonMax,
    corridor: r.corridor / (r.corridorN || 1),
    evByType: r.evByType, events: r.events, drains: r.drains,
    eventsTotal: t.eventsTotal(),
    slotDistMin: moved.length ? Math.min(...moved) : 0,
    slotDistMax: moved.length ? Math.max(...moved) : 0,
    slotsNeverMoved: moved.filter((d) => d < 1).length, slotsSampled: moved.length,
    heroPos: [+g.physics.state.pos.x.toFixed(1), +g.physics.state.pos.z.toFixed(1)],
    heroKmh: g.physics.state.speed * 3.6,
    sit: r.sit, phaseFlips: r.phaseFlips,
  };
});

const f = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : String(v));
console.log(`\n=== ${DRIVE} scene=${SCENE} adversary=${ADV || 'none'} pool=${out.poolNow} ===`);
console.log(`window ${out.frames} frames / ${f(out.secs)} s; hero drove ${f(out.km, 3)} km, now ${out.heroPos} at ${f(out.heroKmh)} km/h`);
console.log(`live count mean ${f(out.meanCount, 1)} min ${out.minCount} max ${out.maxCount}`);
console.log(`vehicle-frames ${out.vf}: stationary(<0.5 m/s) ${f(out.stopPct)}%`);
console.log(`speed km/h p01 ${f(out.kmh.p01)} p10 ${f(out.kmh.p10)} p50 ${f(out.kmh.p50)} p90 ${f(out.kmh.p90)} mean ${f(out.kmh.mean)}`);
console.log(`lane error mean ${f(out.meanLaneErr, 3)} max ${f(out.maxLaneErr, 3)} m`);
console.log(`body-on-body overlap max ${f(out.maxOverlap, 3)} m in ${out.overlapFrames} frames ${out.overlapAt ? JSON.stringify(out.overlapAt) : ''}`);
console.log(`spawns ${out.spawns}; VISIBLE ${out.spawnVisible} at ${JSON.stringify(out.spawnVisDists)}`);
console.log(`retires ${out.retires}; VISIBLE ${out.retireVisible} at ${JSON.stringify(out.retireVisDists)}`);
console.log(`  [instrument note] round-1-style first-frame charge: ${out.firstFrameSpawns} spawns, near+visible at ${JSON.stringify(out.firstFrameNear)}`);
console.log(`off-ribbon vehicle-frames (|s| > 1200 on the highway): ${out.offRibbon}, visible ${out.offRibbonVisible}, max overshoot ${f(out.offRibbonMax)} m`);
console.log(`corridor ahead (50 deg half-cone, 200 m): ${f(out.corridor, 2)} vehicles/frame`);
console.log(`per-slot distance min ${f(out.slotDistMin)} max ${f(out.slotDistMax)} m; slots sampled ${out.slotsSampled}, never moved ${out.slotsNeverMoved}`);
console.log(`hero body inside a traffic body: ${out.heroInBody} frames; closest clearance all run ${f(out.minClrEver)} m`);
console.log(`EVENTS ${JSON.stringify(out.evByType)}  total ${Object.values(out.evByType).reduce((a, b) => a + b, 0)} in ${f(out.km, 3)} km`
  + ` = ${f(Object.values(out.evByType).reduce((a, b) => a + b, 0) / (out.km || 1e9), 2)} per km   (traffic.eventsTotal ${out.eventsTotal}, drains ${out.drains})`);
for (const e of out.events.slice(0, 40)) {
  console.log(`  ${e.type.padEnd(9)} amt ${f(e.amount, 2)} said clr ${e.said} rel ${e.saidRel}`
    + ` | MINE clr ${e.myClr} dot ${e.myDot} rel ${e.myRel} match ${e.matchDist} m`
    + ` | hero ${e.heroKmh} km/h at ${e.km} km`);
}
if (out.events.length > 40) console.log(`  ... ${out.events.length - 40} more`);
const nm = out.events.filter((e) => e.type !== 'check');
if (nm.length) {
  const clrs = nm.map((e) => e.myClr).filter((v) => v !== null).sort((a, b) => a - b);
  console.log(`independent clearance of the ${clrs.length} pass events: min ${f(clrs[0])} p50 ${f(clrs[Math.floor(clrs.length / 2)])} max ${f(clrs[clrs.length - 1])} m`);
  const onc = out.events.filter((e) => e.type === 'oncoming');
  const nmm = out.events.filter((e) => e.type === 'nearMiss');
  const bad = onc.filter((e) => e.myDot > -0.4).length;
  const bad2 = nmm.filter((e) => e.myDot < -0.4).length;
  console.log(`'oncoming' with my heading dot > -0.4 (i.e. NOT oncoming): ${bad} of ${onc.length}`);
  console.log(`'nearMiss' with my heading dot < -0.4 (i.e. actually oncoming): ${bad2} of ${nmm.length}`);
}
if (out.sit.length) {
  console.log(`signal phase flips at the sat-in junction: ${out.phaseFlips}`);
  console.log('sit probe [t, owner, nAxis0, stoppedAxis0, nAxis1, stoppedAxis1]:');
  for (const r of out.sit.filter((_, i) => i % 4 === 0)) console.log(`  ${JSON.stringify(r)}`);
  console.log(`  last: ${JSON.stringify(out.sit[out.sit.length - 1])}`);
}
console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
if (args.png && args.png !== true) {
  // where are the off-ribbon bodies, right now, in screen space?
  const shot = await page.evaluate(() => {
    const g = window.__game, T = g.THREE;
    const out = [];
    for (const v of g.traffic.vehicles) {
      if (v.line.junc) continue;
      const over = Math.abs(v.s) - 1200;
      if (over <= 0) continue;
      const p = new T.Vector3(v.pos.x, 1, v.pos.z).project(g.camera);
      out.push({ over: +over.toFixed(1), d: +Math.hypot(v.pos.x - g.physics.state.pos.x, v.pos.z - g.physics.state.pos.z).toFixed(1),
        sx: +((p.x * 0.5 + 0.5) * 100).toFixed(1), sy: +((-p.y * 0.5 + 0.5) * 100).toFixed(1), onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 });
    }
    return { off: out, hero: [+g.physics.state.pos.x.toFixed(1), +g.physics.state.pos.z.toFixed(1)] };
  });
  console.log(`off-ribbon bodies NOW (hero ${JSON.stringify(shot.hero)}): ${JSON.stringify(shot.off)}`);
  await page.screenshot({ path: String(args.png) });
  console.log(`png -> ${args.png}`);
}
await browser.close();
server.close();
