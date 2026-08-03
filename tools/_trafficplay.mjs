// _trafficplay.mjs - the traffic CRITIC's harness. It PLAYS the build and records what the
// traffic actually does, frame by frame, from inside the page.
//
//   node tools/_trafficplay.mjs --census
//   node tools/_trafficplay.mjs --drive city --secs 40
//   node tools/_trafficplay.mjs --drive highway --secs 40 --kill freeze
//   node tools/_trafficplay.mjs --drive city --secs 25 --adversary wrongway
//
// WHY IT SAMPLES FROM INSIDE THE PAGE. A node-side polling loop over CDP reads the traffic state a
// few times a second and cannot see a one-frame body-on-body overlap or a one-frame teleport. The
// recorder installed here is a rAF callback registered after the game's own, so it reads the state
// the player was just shown, every frame, and only the AGGREGATES cross the bridge.
//
// This tool edits no game code. Every hook is a live object off window.__game.
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
const SCENE = str(args.scene, 'daytime-downtown');
const SECS = num(args.secs, 30);
const KILL = str(args.kill, '');
const ADV = str(args.adversary, '');
const DRIVE = args.drive === undefined ? null : str(args.drive, 'city');
const CENSUS = !!args.census;
const PNG = args.png && args.png !== true ? String(args.png) : null;   // end-of-window screenshot

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

// ---------------------------------------------------------------------------
// CENSUS: how many vehicles exist, split by who owns them, straight off the live scene.
// Counted from the InstancedMeshes themselves, not from any published tally.
// ---------------------------------------------------------------------------
const census = await page.evaluate(() => {
  const g = window.__game, T = g.THREE;
  const kit = g.world.carKit;
  const out = { baked: [], trafficMeshes: [], published: g.world.parkedCounts, sceneMeshes: 0 };
  const mat4 = new T.Matrix4(), sc = new T.Vector3();
  g.scene.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) out.sceneMeshes++;
    if (!o.isInstancedMesh) return;
    const mine = g.traffic.group.getObjectById(o.id) === o
      || (o.parent && o.parent === g.traffic.group);
    // count instances with a non-zero scale, i.e. actually drawn
    let nz = 0;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, mat4); mat4.decompose(new T.Vector3(), new T.Quaternion(), sc);
      if (sc.x * sc.y * sc.z > 1e-9) nz++;
    }
    const rec = { name: o.name || '(anon)', count: o.count, nonZero: nz,
      isCarPaint: o.material === kit.carPaint, cast: o.castShadow };
    (mine ? out.trafficMeshes : out.baked).push(rec);
  });
  out.trafficCount = g.traffic.count;
  out.POOL = g.traffic.POOL;
  return out;
});
const bakedPaint = census.baked.filter((m) => m.isCarPaint);
console.log('=== CENSUS (live scene) ===================================================');
console.log(`scene meshes: ${census.sceneMeshes}`);
console.log(`world.parkedCounts (published): ${JSON.stringify(census.published)}`);
for (const m of bakedPaint) {
  console.log(`  baked carPaint mesh: count=${m.count} nonZeroScale=${m.nonZero} -> ${m.nonZero / 2} cars (2 body instances/car)`);
}
console.log(`traffic meshes (${census.trafficMeshes.length}):`);
for (const m of census.trafficMeshes) {
  console.log(`  ${m.name.padEnd(14)} count=${String(m.count).padStart(4)} nonZeroScale=${String(m.nonZero).padStart(4)} cast=${m.cast}`);
}
console.log(`traffic.count=${census.trafficCount} POOL=${census.POOL}`);

if (CENSUS) {
  // draw calls, averaged over real frames (info resets per pass, so count over N frames)
  const dc = await page.evaluate(async () => {
    const info = window.__game.renderer.info;
    info.autoReset = false; info.reset();
    let seen = 0;
    await new Promise((d) => { const s = () => { if (++seen >= 40) return d(); requestAnimationFrame(s); }; requestAnimationFrame(s); });
    const o = { calls: info.render.calls / seen, tris: info.render.triangles / seen, frames: seen };
    info.autoReset = true; info.reset();
    return o;
  });
  console.log(`draw calls/frame ${dc.calls.toFixed(1)}  triangles/frame ${Math.round(dc.tris)}`);
  // KILL-CONTROL for the builder's "5 draw calls in daylight, 7 at night" claim: hide the group
  // and re-count. A claim about draw calls that is not the difference between two counts is an
  // assertion about a constructor, not about the frame.
  //
  // PAUSED AND INTERLEAVED. ctx.setPaused(true) stops the tick but keeps rendering, so the camera
  // and every other object's frustum state are frozen and the ONLY thing that changes between the
  // two windows is the traffic group. My first attempt at this took the two windows while the car
  // was still driving and the delta came out 10x too large, because everything else's culling had
  // moved too.
  const ab = await page.evaluate(async () => {
    const g = window.__game, info = g.renderer.renderer ? null : g.renderer.info;
    g.setPaused(true);
    const win = async (n) => {
      info.autoReset = false; info.reset();
      let seen = 0;
      await new Promise((d) => { const s = () => { if (++seen >= n) return d(); requestAnimationFrame(s); }; requestAnimationFrame(s); });
      const o = { calls: info.render.calls / seen, tris: info.render.triangles / seen };
      info.autoReset = true; info.reset();
      return o;
    };
    const on = [], off = [];
    for (let i = 0; i < 3; i++) {
      g.traffic.group.visible = true; on.push(await win(30));
      g.traffic.group.visible = false; off.push(await win(30));
    }
    g.traffic.group.visible = true;
    g.setPaused(false);
    const med = (a, k) => a.map((x) => x[k]).sort((p, q) => p - q)[1];
    return { onCalls: med(on, 'calls'), offCalls: med(off, 'calls'),
      onTris: med(on, 'tris'), offTris: med(off, 'tris') };
  });
  console.log(`PAUSED interleaved A/B x3, traffic shown vs hidden: ${ab.onCalls.toFixed(1)} vs ${ab.offCalls.toFixed(1)} calls/frame`
    + ` -> traffic costs ${(ab.onCalls - ab.offCalls).toFixed(1)} draw calls/frame and ${Math.round(ab.onTris - ab.offTris)} triangles/frame`);
  console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  await browser.close(); server.close(); process.exit(0);
}

// ---------------------------------------------------------------------------
// DRIVE: place the car, hold throttle, record every frame.
// ---------------------------------------------------------------------------
const PLACE = DRIVE === 'highway'
  ? { path: 'highway', u: 0.30, kmh: 108, follow: 26 }
  : { path: 'city', u: 0.34, kmh: 72, follow: 26 };

await page.evaluate((p) => {
  const g = window.__game;
  const path = g.world.paths[p.path];
  g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
  if (p.follow) g.physics.followPath(path, p.follow); else g.physics.clearPath();
  g.traffic.reset(g.physics.state.pos);
  g.camRig.snap();
}, PLACE);

// ---- adversarial setups ----------------------------------------------------
if (ADV === 'wrongway') {
  // Head-on, on the highway, because that is the only road here long and straight enough to
  // hold a wrong-way run without the car leaving the network. Placed in the +x carriageway
  // (z = highwayZ + 6.5, between its 3 m and 9 m lane centres) and pointed at -x, so the whole
  // dir=+1 population is coming at the hero. followPath would steer him back round, so the path
  // is cleared and the throttle is the only input.
  await page.evaluate(() => {
    const g = window.__game;
    const HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(600, 0, HZ + 6.5), -Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'ram') {
  // Drive INTO traffic at speed, deliberately: hero placed dead on the highway's 9 m lane centre
  // in the +x carriageway with the throttle and boost held, so he runs down the slower cars in
  // his own lane from behind. Nothing here nudges the traffic; the only question is what happens
  // when 38 m/s of hero meets 25 m/s of traffic in the same 2 m of lane.
  await page.evaluate(() => {
    const g = window.__game;
    const HZ = g.world.LAYOUT.highwayZ;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(-900, 0, HZ + 9), Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'park') {
  // Hero parked at a FIXED pose with the throttle released, so two runs put the camera in
  // byte-identical world space and the only thing that differs between their screenshots is the
  // traffic. A kill-control A/B taken from two different hero positions compares nothing.
  await page.evaluate(() => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(-40, 0, -325.1), Math.PI / 2, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}
if (ADV === 'sit' || ADV === 'sit-leave') {
  // Park the hero DEAD CENTRE of a signalled junction box and leave him there.
  await page.evaluate(() => {
    const g = window.__game;
    const G = g.world.LAYOUT.grid;
    const gx = G[Math.floor(G.length / 2)], gz = G[Math.floor(G.length / 2)];
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(gx, 0, gz), 0, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
    window.__sitAt = [gx, gz];
  });
}
if (ADV === 'sit-offset') {
  // KILL-CONTROL for the junction deadlock. Same immovable hero, same blocked lane, but parked
  // 45 m SHORT of the junction so the car that stops behind him stops OUTSIDE the box. If the
  // phase now keeps flipping and the crossing axis flows, the cause is "a stopped body inside the
  // box latches the owner", not "the hero blocks a lane".
  await page.evaluate(() => {
    const g = window.__game;
    const G = g.world.LAYOUT.grid;
    const gx = G[Math.floor(G.length / 2)], gz = G[Math.floor(G.length / 2)];
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(gx - 45, 0, gz + 2.5), 0, 0);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
    window.__sitAt = [gx, gz];
  });
}
if (ADV === 'edge') {
  await page.evaluate(() => {
    const g = window.__game;
    const EX = g.world.LAYOUT.extent;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(EX - 30, 0, g.world.LAYOUT.grid[0]), Math.PI / 2, 30);
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  });
}

// ---- kill-controls ---------------------------------------------------------
if (KILL === 'hide') await page.evaluate(() => { window.__game.traffic.group.visible = false; });
if (KILL === 'freeze') {
  // Every vehicle's speed forced to 0 every frame AFTER traffic.update has written it, so the
  // population still exists, still spawns, still holds its lane pose - it just stops moving.
  // If the "alive" read survives this, the read was never about motion.
  await page.evaluate(() => {
    const t = window.__game.traffic;
    const raw = t.update.bind(t);
    t.update = (dt, p, y, s) => { raw(dt, p, y, s); for (const v of t.vehicles) v.speed = 0; };
    window.__frozen = true;
  });
}
if (KILL === 'world') await page.evaluate(() => { window.__game.world.group.visible = false; });

// ---- per-frame recorder ----------------------------------------------------
await page.evaluate(() => {
  const g = window.__game, T = g.THREE, t = g.traffic;
  const rec = {
    frames: 0, dtSum: 0,
    vf: 0, vfStop: 0, vfCrawl: 0,          // vehicle-frames total / <0.5 m/s / <2 m/s
    spd: [],                                // every vehicle-frame speed, m/s (sampled)
    maxOverlap: 0, maxOverlapAt: null, overlapFrames: 0,
    maxLaneErr: 0, laneErrSum: 0,
    spawns: 0, spawnInView: 0, spawnVisible: 0, spawnVisDists: [], spawnMinDist: 1e9, spawnInViewSamples: [],
    retires: 0, retireInView: 0, retireVisible: 0, retireVisDists: [], retireInViewSamples: [],
    recycled: 0, teleportMax: 0,
    heroPassThrough: 0,                     // frames the hero body overlaps a traffic body
    perSlotDist: new Array(t.POOL).fill(0),
    perSlotFrames: new Array(t.POOL).fill(0),
    counts: [], stopLongest: 0,
    junc: { deadlockFrames: 0, phases: [] }, sit: [],
  };
  const stopRun = new Array(t.POOL).fill(0);
  const prev = new Map();     // slot -> {x, z, live}
  const frustum = new T.Frustum(), pm = new T.Matrix4(), pt = new T.Vector3();
  let lastT = performance.now();

  function inView(x, z) {
    pm.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    return frustum.containsPoint(pt.set(x, 1, z));
  }
  // IN THE FRUSTUM IS NOT THE SAME AS ON SCREEN. Downtown, most of the frustum is behind a
  // building, so a raw frustum count over-reports pop-in badly. This is a 2-D slab test of the
  // camera->target segment against world.blocks (the same axis-aligned boxes physics.collide()
  // uses), so a "visible" pop-in means the player had an unobstructed line to it.
  const BLK = g.world.blocks;
  function unoccluded(x, z) {
    const c = g.camera.position;
    const dx = x - c.x, dz = z - c.z;
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

  // ---- the "does the street read ABANDONED" instrument ---------------------------------------
  // Pull the BAKED population's world positions once, straight off world.js's sealed carBody
  // InstancedMesh (2 body instances per car, so every other one), then count baked and live
  // vehicles that are actually on screen each frame. "1082 parked + 56 live" is a map statistic;
  // what decides whether a street reads inhabited is how many of either the player can see.
  const bakedPos = [];
  {
    const m4 = new T.Matrix4(), pv = new T.Vector3(), qv = new T.Quaternion(), sv = new T.Vector3();
    g.world.group.traverse((o) => {
      if (!o.isInstancedMesh || o.material !== g.world.carKit.carPaint) return;
      for (let i = 0; i < o.count; i += 2) {
        o.getMatrixAt(i, m4); m4.decompose(pv, qv, sv);
        bakedPos.push(pv.x, pv.z);
      }
    });
  }
  rec.bakedTotal = bakedPos.length / 2;
  rec.visBaked = 0; rec.visLive = 0;

  function step() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    rec.frames++; rec.dtSum += dt;
    const hs = g.physics.state;
    const live = t.vehicles;
    rec.counts.push(live.length);

    const seen = new Set();
    for (const v of live) {
      seen.add(v.k);
      rec.vf++;
      if (v.speed < 0.5) { rec.vfStop++; stopRun[v.k] += dt; if (stopRun[v.k] > rec.stopLongest) rec.stopLongest = stopRun[v.k]; }
      else stopRun[v.k] = 0;
      if (v.speed < 2) rec.vfCrawl++;
      if (rec.spd.length < 400000) rec.spd.push(v.speed);
      rec.perSlotFrames[v.k]++;
      // SLOT REUSE IS SAME-FRAME. traffic.update() retires at the top and fill()s at the bottom
      // of the same call, and fill() takes the FIRST free slot - usually the one just retired. So
      // a slot going away and coming back is invisible to a "was it live last frame" test and
      // shows up only as a discontinuity in position. Every jump larger than any legal one-frame
      // move (the code clamps dt to 0.05 s, so 33 m/s * 0.05 = 1.7 m) is therefore a RESPAWN, and
      // it has to be frustum-tested exactly like a fresh one or the pop-in test misses most of
      // the population turnover.
      const p = prev.get(v.k);
      const jump = p && p.live ? Math.hypot(v.pos.x - p.x, v.pos.z - p.z) : Infinity;
      const isRespawn = !(p && p.live) || jump > 4.0;
      if (!isRespawn) rec.perSlotDist[v.k] += jump;
      if (isRespawn) {
        rec.spawns++;
        if (jump !== Infinity) { rec.recycled++; if (jump > rec.teleportMax) rec.teleportMax = jump; }
        const dh = Math.hypot(v.pos.x - hs.pos.x, v.pos.z - hs.pos.z);
        if (dh < rec.spawnMinDist) rec.spawnMinDist = dh;
        if (inView(v.pos.x, v.pos.z) && dh < 320) {
          rec.spawnInView++;
          if (unoccluded(v.pos.x, v.pos.z)) {
            rec.spawnVisible++;
            rec.spawnVisDists.push(+dh.toFixed(1));
          }
        }
        // and the place it vanished FROM, when the slot was recycled in place
        if (jump !== Infinity && inView(p.x, p.z)
            && Math.hypot(p.x - hs.pos.x, p.z - hs.pos.z) < 320 && unoccluded(p.x, p.z)) {
          rec.retireVisible++;
          rec.retireVisDists.push(+Math.hypot(p.x - hs.pos.x, p.z - hs.pos.z).toFixed(1));
        }
      }
      // lane discipline: signed lateral offset from the lane centre it claims
      const L = v.line;
      const off = L.axis === 0 ? (v.pos.z - L.c) * v.dir : -(v.pos.x - L.c) * v.dir;
      const err = Math.abs(off - v.lane);
      rec.laneErrSum += err;
      if (err > rec.maxLaneErr) rec.maxLaneErr = err;
      // hero body overlap (hero half extents ~2.2 x 0.95, axis-aligned approximation)
      const dx = Math.abs(v.pos.x - hs.pos.x), dz = Math.abs(v.pos.z - hs.pos.z);
      const ax = Math.abs(Math.cos(v.yaw)) > 0.5;
      const ex = (ax ? v.halfLen : v.halfWid) + 2.0, ez = (ax ? v.halfWid : v.halfLen) + 1.0;
      if (dx < ex && dz < ez) rec.heroPassThrough++;
    }
    // retires
    for (const [k, p] of prev) {
      if (p.live && !seen.has(k)) {
        rec.retires++;
        if (inView(p.x, p.z) && Math.hypot(p.x - hs.pos.x, p.z - hs.pos.z) < 320) {
          rec.retireInView++;
          if (rec.retireInViewSamples.length < 12) {
            rec.retireInViewSamples.push({ f: rec.frames,
              dist: +Math.hypot(p.x - hs.pos.x, p.z - hs.pos.z).toFixed(1), k });
          }
        }
      }
    }
    prev.clear();
    for (const v of live) prev.set(v.k, { x: v.pos.x, z: v.pos.z, live: true });

    // all-pairs body overlap. Every traffic yaw is a multiple of 90 deg so the boxes are
    // axis-aligned and this is exact, not a bounding-sphere approximation.
    let worst = 0, worstAt = null;
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      const aax = Math.abs(Math.cos(a.yaw)) > 0.5;
      const aex = aax ? a.halfLen : a.halfWid, aez = aax ? a.halfWid : a.halfLen;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const bax = Math.abs(Math.cos(b.yaw)) > 0.5;
        const bex = bax ? b.halfLen : b.halfWid, bez = bax ? b.halfWid : b.halfLen;
        const ox = (aex + bex) - Math.abs(a.pos.x - b.pos.x);
        if (ox <= 0) continue;
        const oz = (aez + bez) - Math.abs(a.pos.z - b.pos.z);
        if (oz <= 0) continue;
        const d = Math.min(ox, oz);
        if (d > worst) {
          worst = d;
          worstAt = { f: rec.frames, x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1),
            x2: +b.pos.x.toFixed(1), z2: +b.pos.z.toFixed(1),
            sa: +a.speed.toFixed(2), sb: +b.speed.toFixed(2) };
        }
      }
    }
    if (worst > 0.001) rec.overlapFrames++;
    if (worst > rec.maxOverlap) { rec.maxOverlap = worst; rec.maxOverlapAt = worstAt; }

    // SIT PROBE. When the hero is parked in a junction box, the question is whether the phase
    // ever flips again and whether the queue on the blocked axis ever clears. `owner` alone is not
    // enough: it has to be read beside how many cars are sitting still on each axis within the
    // approach, because a phase that never changes while both axes have a queue is a gridlock and
    // a phase that never changes with no cross demand is just an idle junction.
    if (window.__sitAt && rec.frames % 15 === 0) {
      const [sx, sz] = window.__sitAt;
      let s0 = 0, s1 = 0, n0 = 0, n1 = 0;
      for (const v of live) {
        if (Math.hypot(v.pos.x - sx, v.pos.z - sz) > 62) continue;
        if (v.line.axis === 0) { n0++; if (v.speed < 0.5) s0++; }
        else { n1++; if (v.speed < 0.5) s1++; }
      }
      rec.sit.push([+(rec.dtSum).toFixed(1), t.signalPhase(sx, sz), n0, s0, n1, s1]);
    }
    // on-screen vehicle census, every 6th frame (the raycast is O(blocks) per candidate)
    if (rec.frames % 6 === 0) {
      let vb = 0;
      for (let i = 0; i < bakedPos.length; i += 2) {
        const x = bakedPos[i], z = bakedPos[i + 1];
        const d = Math.hypot(x - hs.pos.x, z - hs.pos.z);
        if (d > 260) continue;
        if (inView(x, z) && unoccluded(x, z)) vb++;
      }
      let vl = 0;
      for (const v of live) {
        const d = Math.hypot(v.pos.x - hs.pos.x, v.pos.z - hs.pos.z);
        if (d < 260 && inView(v.pos.x, v.pos.z) && unoccluded(v.pos.x, v.pos.z)) vl++;
      }
      rec.visBaked += vb; rec.visLive += vl; rec.visN = (rec.visN || 0) + 1;
    }
    // junction phase sampling (the junction the hero is nearest to)
    if (rec.frames % 30 === 0) {
      const G = g.world.LAYOUT.grid;
      const near = (c) => G.reduce((b, v) => (Math.abs(v - c) < Math.abs(b - c) ? v : b), G[0]);
      const gx = near(hs.pos.x), gz = near(hs.pos.z);
      rec.junc.phases.push([gx, gz, t.signalPhase(gx, gz)]);
    }
    requestAnimationFrame(step);
  }
  window.__trec = rec;
  requestAnimationFrame(step);
});

if (!['sit', 'park', 'sit-offset', 'sit-leave'].includes(ADV)) await page.keyboard.down('KeyW');
if (ADV === 'sit-leave') {
  // SEVERITY TEST for the junction deadlock: sit in the box for 20 s, then drive away and keep
  // watching the same junction. A gridlock that clears the moment the player leaves is a bad beat;
  // one that persists is a permanent car park in the middle of the map.
  await sleep(20000);
  await page.keyboard.down('KeyW');
  await sleep(1200);
  await page.keyboard.up('KeyW');
}
if (ADV === 'rmash') {
  // R is the real reset key on the playable path and it calls traffic.reset(pos). Mash it while
  // driving: the pool is a fixed 56 slots reused for the whole run, so a reset that leaks a slot,
  // double-lives one, or leaves a stale junction latch shows up here and nowhere else.
  for (let i = 0; i < 40; i++) { await page.keyboard.press('KeyR'); await sleep(SECS * 1000 / 45); }
}
if (ADV === 'ram') await page.keyboard.down('ShiftLeft');
await sleep(SECS * 1000);
await page.keyboard.up('KeyW').catch(() => {});
await page.keyboard.up('ShiftLeft').catch(() => {});

const out = await page.evaluate(() => {
  const r = window.__trec, g = window.__game, t = g.traffic;
  const s = r.spd.slice().sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))] : 0);
  const kmh = (v) => v * 3.6;
  const moved = r.perSlotDist.filter((d, i) => r.perSlotFrames[i] > 30);
  return {
    frames: r.frames, secs: r.dtSum,
    meanCount: r.counts.reduce((a, b) => a + b, 0) / r.counts.length,
    minCount: Math.min(...r.counts), maxCount: Math.max(...r.counts),
    vf: r.vf,
    stopPct: 100 * r.vfStop / r.vf, crawlPct: 100 * r.vfCrawl / r.vf,
    stopLongest: r.stopLongest,
    kmh: { p01: kmh(q(0.01)), p10: kmh(q(0.10)), p50: kmh(q(0.50)), p90: kmh(q(0.90)),
      p99: kmh(q(0.99)), mean: kmh(s.reduce((a, b) => a + b, 0) / (s.length || 1)) },
    maxOverlap: r.maxOverlap, maxOverlapAt: r.maxOverlapAt, overlapFrames: r.overlapFrames,
    maxLaneErr: r.maxLaneErr, meanLaneErr: r.laneErrSum / r.vf,
    spawns: r.spawns, spawnInView: r.spawnInView, spawnMinDist: r.spawnMinDist,
    spawnVisible: r.spawnVisible, spawnVisDists: r.spawnVisDists.slice().sort((a, b) => a - b),
    retireVisible: r.retireVisible, retireVisDists: r.retireVisDists.slice().sort((a, b) => a - b),
    retires: r.retires,
    recycled: r.recycled, teleportMax: r.teleportMax,
    heroPassThrough: r.heroPassThrough,
    slotDistMin: Math.min(...moved), slotDistMax: Math.max(...moved),
    slotsThatNeverMoved: moved.filter((d) => d < 1).length,
    heroSpeedKmh: g.physics.state.speed * 3.6,
    heroPos: [+g.physics.state.pos.x.toFixed(1), +g.physics.state.pos.z.toFixed(1)],
    phases: r.junc.phases.slice(-8), sit: r.sit,
    liveNow: t.count, bakedTotal: r.bakedTotal,
    visBaked: r.visBaked / (r.visN || 1), visLive: r.visLive / (r.visN || 1),
  };
});

const f = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : String(v));
console.log(`\n=== DRIVE ${DRIVE} scene=${SCENE} kill=${KILL || 'none'} adversary=${ADV || 'none'} ===`);
console.log(`window: ${out.frames} frames / ${f(out.secs)} s of sim; hero now ${out.heroPos} at ${f(out.heroSpeedKmh)} km/h`);
console.log(`live count: mean ${f(out.meanCount, 1)} min ${out.minCount} max ${out.maxCount} (now ${out.liveNow})`);
console.log(`vehicle-frames ${out.vf}: stationary(<0.5 m/s) ${f(out.stopPct)}%  crawling(<2 m/s) ${f(out.crawlPct)}%  longest single stop ${f(out.stopLongest)} s`);
console.log(`speed km/h: p01 ${f(out.kmh.p01)}  p10 ${f(out.kmh.p10)}  p50 ${f(out.kmh.p50)}  p90 ${f(out.kmh.p90)}  p99 ${f(out.kmh.p99)}  mean ${f(out.kmh.mean)}`);
console.log(`ON SCREEN per frame (<260 m, in frustum, unoccluded): baked ${f(out.visBaked, 1)} + live ${f(out.visLive, 1)} = ${f(out.visBaked + out.visLive, 1)} vehicles (baked population total ${out.bakedTotal})`);
console.log(`lane error: mean ${f(out.meanLaneErr, 3)} m  max ${f(out.maxLaneErr, 3)} m`);
console.log(`body-on-body overlap: max ${f(out.maxOverlap, 3)} m in ${out.overlapFrames} frames`);
if (out.maxOverlapAt) console.log(`  worst: ${JSON.stringify(out.maxOverlapAt)}`);
console.log(`spawns ${out.spawns}; in frustum ${out.spawnInView}; VISIBLE (frustum + unoccluded by a block) ${out.spawnVisible}; closest spawn of any kind ${f(out.spawnMinDist)} m`);
console.log(`  visible-spawn distances (m, sorted): ${JSON.stringify(out.spawnVisDists)}`);
console.log(`retires: VISIBLE (frustum + unoccluded) ${out.retireVisible}`);
console.log(`  visible-retire distances (m, sorted): ${JSON.stringify(out.retireVisDists)}`);
console.log(`slot recycles counted as respawns: ${out.recycled}, largest position jump ${f(out.teleportMax)} m`);
console.log(`hero-body overlapping a traffic body: ${out.heroPassThrough} frames`);
console.log(`per-slot distance travelled: min ${f(out.slotDistMin)} m  max ${f(out.slotDistMax)} m  slots that never moved ${out.slotsThatNeverMoved}`);
console.log(`signal phases near hero (last 8): ${JSON.stringify(out.phases)}`);
if (out.sit && out.sit.length) {
  console.log('sit probe [t s, owner, nAxis0, stoppedAxis0, nAxis1, stoppedAxis1]:');
  for (const r of out.sit) console.log(`  ${JSON.stringify(r)}`);
}
console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);

if (PNG) { await page.screenshot({ path: PNG }); console.log(`png -> ${PNG}`); }
await browser.close();
server.close();
