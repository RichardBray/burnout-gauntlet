// _traffic-r2.mjs — the traffic-r2 BUILDER's own instrument. Two things the round-1 critic's
// harness (tools/_trafficplay.mjs) cannot answer, because neither existed when it was written:
//
//   1. THE BOOST EVENT STREAM. `traffic.drainEvents()` is drain-on-read, so it can only be
//      measured from inside the page, every frame, or the events are simply lost between polls.
//      Reported per KILOMETRE of hero travel, because that is the unit the boost economy is
//      spent in, and split by type.
//   2. THE CORRIDOR AHEAD. The number POOL should be set by is not "vehicles that exist" and
//      not even "vehicles on screen" — it is vehicles in the cone the player is driving into,
//      because those are the ones he can near-miss. `--pools 22,30,40,56` sweeps the ceiling
//      inside ONE boot via traffic.setPool(), so the A/B/C/D is not four separate processes
//      with four different RNG histories and four different machine loads.
//
//   node tools/_traffic-r2.mjs --pools 22,30,40,56 --drive highway --secs 24
//   node tools/_traffic-r2.mjs --pools 30 --drive city --secs 24
//   node tools/_traffic-r2.mjs --pools 0  --drive highway --secs 20    # the empty-road control
//
// Edits no game code. Every hook is a live object off window.__game.
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
const DRIVE = str(args.drive, 'highway');
const SCENE = str(args.scene, DRIVE === 'highway' ? 'dusk-highway-chase' : 'daytime-downtown');
const SECS = num(args.secs, 24);
const POOLS = str(args.pools, '30').split(',').map(Number);
const OFFNET = !!args.offnet;   // park the hero off the road network: no traffic can spawn

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
await page.waitForFunction('window.__ready === true && !!window.__frameStats', null, { timeout: 240000 });

// The recorder is installed ONCE and reset per pool value, so every window is the same code
// path. It drains the queue every frame (nothing else drains it: the main.js join is pending)
// and integrates hero distance out of the position, not out of the speedometer.
await page.evaluate(() => {
  const g = window.__game, T = g.THREE, t = g.traffic;
  const rec = { on: false };
  window.__r2 = rec;
  window.__r2reset = () => {
    rec.frames = 0; rec.dist = 0; rec.dt = 0;
    rec.ev = { nearMiss: 0, oncoming: 0, check: 0 };
    rec.amt = { nearMiss: 0, oncoming: 0, check: 0 };
    rec.clr = []; rec.evLog = [];
    rec.aheadSum = 0; rec.aheadN = 0; rec.aheadMax = 0;
    rec.stopVF = 0; rec.vf = 0; rec.maxOverlap = 0; rec.laneMax = 0;
    rec.countSum = 0; rec.through = 0;
    rec.spawnVis = []; rec.retireVis = []; rec.spawns = 0; rec.retires = 0;
    rec.prev = new Map();
    rec.last = null; rec.on = true;
  };
  const CONE = Math.cos(50 * Math.PI / 180);
  // POP-IN, measured the critic's way but WITHOUT the reset population in it. The critic's
  // harness starts recording on the frame after traffic.reset(), so its first frame counts all
  // POOL vehicles as spawns — which is why its near-field "visible spawn" list is byte-identical
  // across two runs with different RNG histories: those entries are the initial fill, not pop-in.
  // This recorder is armed after a 2.5 s warm window, so every spawn it sees is a real one.
  const frustum = new T.Frustum(), pm = new T.Matrix4(), pt = new T.Vector3();
  function inView(x, z) {
    pm.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    return frustum.containsPoint(pt.set(x, 1, z));
  }
  const BLK = g.world.blocks;
  function unoccluded(x, z) {          // 2-D slab test against the same boxes physics.collide uses
    const c = g.camera.position;
    const dx = x - c.x, dz = z - c.z;
    for (const b of BLK) {
      let t0 = 0, t1 = 1;
      for (const [o, d, h, cc] of [[c.x, dx, b.w / 2, b.cx], [c.z, dz, b.d / 2, b.cz]]) {
        const lo = cc - h, hi = cc + h;
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
        let a = (lo - o) / d, bb = (hi - o) / d;
        if (a > bb) { const sw = a; a = bb; bb = sw; }
        if (a > t0) t0 = a;
        if (bb < t1) t1 = bb;
        if (t0 > t1) { t0 = 2; break; }
      }
      if (t0 <= t1 && t0 <= 1) return false;
    }
    return true;
  }
  let lastT = performance.now();
  function step() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (rec.on) {
      const hs = g.physics.state;
      rec.frames++; rec.dt += dt;
      if (rec.last) rec.dist += Math.hypot(hs.pos.x - rec.last[0], hs.pos.z - rec.last[1]);
      rec.last = [hs.pos.x, hs.pos.z];
      // the corridor ahead: live vehicles inside a 50 deg half-cone of the hero's HEADING
      // (physics.js:381 forward = (sin yaw, 0, cos yaw)) within 200 m
      const fx = Math.sin(hs.yaw), fz = Math.cos(hs.yaw);
      let ahead = 0;
      const live = t.vehicles;
      rec.countSum += live.length;
      for (const v of live) {
        const dx = v.pos.x - hs.pos.x, dz = v.pos.z - hs.pos.z;
        const d = Math.hypot(dx, dz);
        rec.vf++;
        if (v.speed < 0.5) rec.stopVF++;
        const L = v.line;
        const off = L.axis === 0 ? (v.pos.z - L.c) * v.dir : -(v.pos.x - L.c) * v.dir;
        const le = Math.abs(off - v.lane);
        if (le > rec.laneMax) rec.laneMax = le;
        if (d < 200 && d > 1e-3 && (dx * fx + dz * fz) / d > CONE) ahead++;
      }
      // spawn / retire visibility. Slot reuse is same-frame, so a respawn shows up only as a
      // position discontinuity larger than any legal one-frame move (dt is clamped to 0.05 s).
      // frame 1 has an empty `prev` map, so EVERY live slot would read as a fresh spawn at
      // whatever distance it happens to be — that is where the critic's harness gets its
      // near-field entries from, and where mine got an 8.7 m "spawn" from before this guard.
      const arm = rec.frames > 1;
      const seen = new Set();
      for (const v of live) {
        seen.add(v.k);
        if (!arm) continue;
        const pv = rec.prev.get(v.k);
        const jump = pv ? Math.hypot(v.pos.x - pv[0], v.pos.z - pv[1]) : Infinity;
        if (jump > 4.0) {
          rec.spawns++;
          const dh = Math.hypot(v.pos.x - hs.pos.x, v.pos.z - hs.pos.z);
          if (dh < 320 && inView(v.pos.x, v.pos.z) && unoccluded(v.pos.x, v.pos.z)) {
            rec.spawnVis.push([+dh.toFixed(1), +jump.toFixed(1), v.k]);
          }
          if (pv && jump !== Infinity) {
            const dr = Math.hypot(pv[0] - hs.pos.x, pv[1] - hs.pos.z);
            if (dr < 320 && inView(pv[0], pv[1]) && unoccluded(pv[0], pv[1])) rec.retireVis.push(+dr.toFixed(1));
          }
        }
      }
      for (const [k, pv] of rec.prev) {
        if (seen.has(k) || !arm) continue;
        rec.retires++;
        const dr = Math.hypot(pv[0] - hs.pos.x, pv[1] - hs.pos.z);
        if (dr < 320 && inView(pv[0], pv[1]) && unoccluded(pv[0], pv[1])) rec.retireVis.push(+dr.toFixed(1));
      }
      rec.prev.clear();
      for (const v of live) rec.prev.set(v.k, [v.pos.x, v.pos.z]);
      rec.aheadSum += ahead; rec.aheadN++;
      if (ahead > rec.aheadMax) rec.aheadMax = ahead;
      // all-pairs body overlap, exact (every traffic yaw is a multiple of 90 deg)
      for (let i = 0; i < live.length; i++) {
        const A = live[i], aax = Math.abs(Math.cos(A.yaw)) > 0.5;
        const aex = aax ? A.halfLen : A.halfWid, aez = aax ? A.halfWid : A.halfLen;
        for (let j = i + 1; j < live.length; j++) {
          const B = live[j], bax = Math.abs(Math.cos(B.yaw)) > 0.5;
          const bex = bax ? B.halfLen : B.halfWid, bez = bax ? B.halfWid : B.halfLen;
          const ox = (aex + bex) - Math.abs(A.pos.x - B.pos.x);
          if (ox <= 0) continue;
          const oz = (aez + bez) - Math.abs(A.pos.z - B.pos.z);
          if (oz <= 0) continue;
          const d = Math.min(ox, oz);
          if (d > rec.maxOverlap) rec.maxOverlap = d;
        }
      }
      const evs = t.drainEvents();
      for (const e of evs) {
        if (rec.ev[e.type] === undefined) { rec.ev[e.type] = 0; rec.amt[e.type] = 0; }
        rec.ev[e.type]++; rec.amt[e.type] += e.amount;
        if (e.meta && e.meta.clearance !== undefined) rec.clr.push(e.meta.clearance);
        if (rec.evLog.length < 14) {
          rec.evLog.push([+rec.dt.toFixed(1), e.type, +e.amount.toFixed(2),
            e.meta ? (e.meta.clearance ?? e.meta.relSpeed) : null]);
        }
      }
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

const PLACE = DRIVE === 'highway'
  // u = 0.03 on purpose: at 220 km/h the hero covers ~1.4 km in 20 s and `paths.highway` runs
  // x = -1000..1000, so starting near the beginning is what keeps the WHOLE window on the
  // highway. My first sweep started at u = 0.28, ran off the end of the path and spent the tail
  // of each window off-network with nothing to spawn on, which made the four pool values
  // incomparable — they had each driven a different road.
  ? { path: 'highway', u: 0.03, kmh: 108, follow: 26 }
  : { path: 'city', u: 0.34, kmh: 72, follow: 26 };

const f = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : String(v));
console.log(`=== traffic-r2 events/corridor sweep: drive=${DRIVE} scene=${SCENE} ${SECS}s per pool `
  + `${OFFNET ? '(OFF-NETWORK)' : ''} ===`);
console.log('pool  live  ahead(<200m,cone50) events/km  nearMiss  oncoming  check  meanAmt  '
  + 'medClr  stop%  overlap  laneMax');

// ---- --sit: the junction-deadlock diagnostic --------------------------------------------
// Park the hero dead centre of a junction box and, after `secs`, dump the per-vehicle state of
// every stopped car near it. The critic's harness reports the SYMPTOM (owner, stopped counts);
// this reports the fields that decide whether a stopped car will go round the blockage, which
// is the only way to tell "the overtake never armed" from "the overtake armed and failed".
if (args.sit) {
  await page.evaluate(() => {
    const g = window.__game;
    const G = g.world.LAYOUT.grid;
    const gx = G[Math.floor(G.length / 2)], gz = G[Math.floor(G.length / 2)];
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(gx, 0, gz), 0, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
    window.__sit = [gx, gz];
  });
  await sleep(SECS * 1000);
  const d = await page.evaluate(() => {
    const g = window.__game, t = g.traffic, [sx, sz] = window.__sit;
    const out = [];
    for (const v of t.vehicles) {
      if (Math.hypot(v.pos.x - sx, v.pos.z - sz) > 62 || v.speed > 0.5) continue;
      out.push({ k: v.k, axis: v.line.axis, dir: v.dir, s: +v.s.toFixed(1),
        lat: +v.lat.toFixed(2), swerve: +v.swerve.toFixed(2), stallT: +v.stallT.toFixed(2),
        jDist: +v.jDist.toFixed(1), jOk: v.jOk, speed: +v.speed.toFixed(2),
        pos: [+v.pos.x.toFixed(1), +v.pos.z.toFixed(1)] });
    }
    return { stopped: out, phase: t.signalPhase(sx, sz), live: t.count,
      heroSpeed: +g.physics.state.speed.toFixed(2) };
  });
  console.log(`SIT diag after ${SECS} s: live ${d.live}, phase ${d.phase}, heroSpeed ${d.heroSpeed}`);
  console.log(`stopped within 62 m: ${d.stopped.length}`);
  for (const r of d.stopped) console.log(`  ${JSON.stringify(r)}`);
  console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  await browser.close(); server.close(); process.exit(0);
}

// ---- --wrongway: the head-on test ---------------------------------------------------------
// The critic's repro puts the hero at z = highwayZ + 6.5, which is 3.5 m off the 9 m lane centre
// and 3.5 m off the 3 m one — outside the reaction band on BOTH sides, so most of the population
// is correctly not reacting and the aggregate lane error is diluted to nothing. This puts him
// DEAD ON the 9 m lane centre pointing at -x, so every dir = +1 vehicle in that lane is on a
// literal collision course, and reports what those vehicles did rather than what all of them did.
if (args.wrongway) {
  await page.evaluate((P) => {
    const g = window.__game;
    if (g.traffic.setPool) g.traffic.setPool(P);
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(900, 0, g.world.LAYOUT.highwayZ + 9), -Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
    const t = g.traffic, T = g.THREE;
    const rec = { evaded: 0, engaged: 0, maxLat: 0, minClr: 1e9, ev: {}, frames: 0, dist: 0, last: null };
    window.__ww = rec;
    const seen = new Set();
    const raw = t.update.bind(t);
    t.update = (dt, pos, yaw, spd) => {
      raw(dt, pos, yaw, spd);
      rec.frames++;
      if (rec.last) rec.dist += Math.hypot(pos.x - rec.last[0], pos.z - rec.last[1]);
      rec.last = [pos.x, pos.z];
      for (const v of t.vehicles) {
        const L = v.line;
        if (L.axis !== 0 || v.dir !== 1) continue;              // only the population coming at him
        const lane = L.c + v.dir * v.lane;
        if (Math.abs(lane - pos.z) > 1.0) continue;             // only the hero's own lane
        const key = v.k + ':' + Math.round(v.s / 50);
        if (!seen.has(key)) { seen.add(key); rec.engaged++; }
        if (Math.abs(v.lat) > rec.maxLat) rec.maxLat = Math.abs(v.lat);
        if (Math.abs(v.lat) > 1.5 && !seen.has('e' + key)) { seen.add('e' + key); rec.evaded++; }
        const dx = Math.max(0, Math.abs(pos.x - v.pos.x) - v.halfLen);
        const dz = Math.max(0, Math.abs(pos.z - v.pos.z) - v.halfWid);
        const clr = Math.hypot(dx, dz) - 0.95;
        if (Math.abs(pos.x - v.pos.x) < 40 && clr < rec.minClr) rec.minClr = clr;
      }
      // guarded so this mode can also be pointed at a build with no event stream, for the A/B
      if (t.drainEvents) for (const e of t.drainEvents()) rec.ev[e.type] = (rec.ev[e.type] || 0) + 1;
    };
  }, POOLS[0]);
  await page.keyboard.down('KeyW');
  await sleep(SECS * 1000);
  await page.keyboard.up('KeyW').catch(() => {});
  const d = await page.evaluate(() => {
    const r = window.__ww;
    return { ...r, km: r.dist / 1000, pos: window.__game.physics.state.pos.x.toFixed(0),
      kmh: (window.__game.physics.state.speed * 3.6).toFixed(1) };
  });
  console.log(`WRONGWAY head-on, hero dead on the 9 m lane centre pointing -x, ${SECS} s:`);
  console.log(`  ${d.frames} frames / ${f(d.dist)} m driven, hero ends x=${d.pos} at ${d.kmh} km/h`);
  console.log(`  vehicles ENGAGED in the hero's own lane: ${d.engaged}; of those EVADED (|lat| > 1.5 m): ${d.evaded}`);
  console.log(`  peak |lat| among them: ${f(d.maxLat)} m; min body-to-body clearance inside 40 m: ${f(d.minClr)} m`);
  console.log(`  events: ${JSON.stringify(d.ev)} over ${f(d.km)} km`);
  console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  await browser.close(); server.close(); process.exit(0);
}

const rows = [];
for (const P of POOLS) {
  await page.evaluate(async (p) => {
    const g = window.__game;
    window.__r2.on = false;
    g.traffic.setPool(p.P);
    if (p.OFFNET) {
      // No road line within LINE_LAT_MAX of here, so nothing can spawn: the empty-road control.
      g.physics.clearPath();
      g.physics.reset(new g.THREE.Vector3(-260, 0, -60), Math.PI / 2, 30);
    } else {
      const path = g.world.paths[p.path];
      g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
      g.physics.followPath(path, p.follow);
    }
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  }, { ...PLACE, P, OFFNET });
  await page.keyboard.down('KeyW');
  await sleep(2500);                                  // warm: let the ring settle
  await page.evaluate(() => window.__r2reset());
  await sleep(SECS * 1000);
  await page.keyboard.up('KeyW').catch(() => {});
  const o = await page.evaluate(() => {
    const r = window.__r2;
    r.on = false;
    const s = r.clr.slice().sort((a, b) => a - b);
    const tot = r.ev.nearMiss + r.ev.oncoming + r.ev.check;
    const amtTot = r.amt.nearMiss + r.amt.oncoming + r.amt.check;
    return { frames: r.frames, secs: r.dt, dist: r.dist, km: r.dist / 1000,
      live: r.countSum / Math.max(1, r.frames),
      ahead: r.aheadSum / Math.max(1, r.aheadN), aheadMax: r.aheadMax,
      ev: r.ev, tot, meanAmt: tot ? amtTot / tot : 0,
      medClr: s.length ? s[Math.floor(s.length / 2)] : NaN,
      stopPct: r.vf ? 100 * r.stopVF / r.vf : 0,
      overlap: r.maxOverlap, laneMax: r.laneMax,
      evLog: r.evLog, pool: window.__game.traffic.POOL,
      spawns: r.spawns, retires: r.retires,
      spawnVis: r.spawnVis.slice().sort((a, b) => a[0] - b[0]),
      retireVis: r.retireVis.slice().sort((a, b) => a - b),
      heroKmh: window.__game.physics.state.speed * 3.6,
      pos: [+window.__game.physics.state.pos.x.toFixed(0), +window.__game.physics.state.pos.z.toFixed(0)],
    };
  });
  rows.push(o);
  const perKm = o.km > 0.01 ? o.tot / o.km : 0;
  console.log(`${String(o.pool).padStart(4)}  ${f(o.live, 1).padStart(4)}  `
    + `${f(o.ahead, 2).padStart(5)} (max ${String(o.aheadMax).padStart(2)})     `
    + `${f(perKm, 1).padStart(5)}     ${String(o.ev.nearMiss).padStart(4)}      `
    + `${String(o.ev.oncoming).padStart(4)}   ${String(o.ev.check).padStart(4)}   `
    + `${f(o.meanAmt)}    ${f(o.medClr)}   ${f(o.stopPct)}   ${f(o.overlap, 3)}   ${f(o.laneMax, 3)}`);
  console.log(`      window ${o.frames} frames / ${f(o.secs)} s / ${f(o.dist)} m driven, hero ends `
    + `${JSON.stringify(o.pos)} at ${f(o.heroKmh)} km/h`);
  console.log(`      first events [t s, type, amount, clearance-or-relSpeed]: ${JSON.stringify(o.evLog)}`);
  console.log(`      spawns ${o.spawns} (VISIBLE ${o.spawnVis.length}: ${JSON.stringify(o.spawnVis)});`
    + ` retires ${o.retires} (VISIBLE ${o.retireVis.length}: ${JSON.stringify(o.retireVis)})`);
}
console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
await browser.close();
server.close();
