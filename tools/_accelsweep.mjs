// Longitudinal-acceleration sweep for the chase rig (wave-K chase-camera brief).
//   node tools/_accelsweep.mjs [--scene dusk-highway-chase] [--speed 40] [--w 1920 --h 1080]
//     [--accels "-26,-20,-16,-10,0,10,16,26"] [--boost 0] [--trace 1]
//
// Boots the scene exactly like tools/probe.mjs (same flags/headers/viewport — keep in sync),
// then drives camRig.update() directly with a synthetic car state so accelG can be stepped
// while speed is held. Measurement is tools/_cammeas.js verbatim, so numbers are comparable
// to the live-frame probe. Shake is disabled for the sweep (rig.tweak({shake:0})).
//
// Prints, per accelG: the settled pose 150 frames after the step, plus (with --trace) the
// carH trace so a transient can be told apart from a sustained offset.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const scene = args.scene || 'dusk-highway-chase';
const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../game');
const W = +(args.w || 1920), H = +(args.h || 1080);
const speed = +(args.speed || 40);
const boost = +(args.boost || 0);
const accels = String(args.accels || '-26,-20,-16,-10,0,10,16,26').split(',').map(Number);
const wantTrace = !!args.trace;
// Scales the chassis pitch the sim would apply (physics.js: pitch = -accelG*0.0035, clamped
// +/-0.05 and damped). --pitchk 0 isolates the camera's own accel response from the fact that
// the CAR BODY itself pitches under load, which moves roof/contact on its own.
const pitchK = args.pitchk === undefined ? 1 : +args.pitchk;
const measSrc = await readFile(join(here, '_cammeas.js'), 'utf8');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[error]', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const out = await page.evaluate(({ measSrc, accels, speed, boost, wantTrace, pitchK }) => {
  const g = window.__game, rig = g.camRig;
  const measure = () => JSON.parse(eval(measSrc));
  const V = rig.camera.position.constructor;
  const dt = 1 / 60;
  rig.tweak({ shake: 0 });
  const mk = (aG) => ({
    pos: new V(0, 0, 0), yaw: 0, vy: 0, speed, accelG: aG, slip: 0, steer: 0, lean: 0,
    // physics.js:150 — pitch = damp(clamp(-accelG*0.0035, -0.05, 0.05)); the CLAMP is real, so
    // the chassis attitude saturates at 0.05 rad well before accelG reaches 26.
    pitch: Math.max(-0.05, Math.min(0.05, -aG * 0.0035)) * pitchK, boostBlend: boost, boost: 0, boosting: false, crashed: false,
    airborne: false,
  });
  const drive = (s, n) => {
    for (let i = 0; i < n; i++) {
      // same transform main.js applies each tick (applyCarTransform)
      g.carRoot.position.set(s.pos.x, s.pos.y, s.pos.z);
      g.carRoot.rotation.y = s.yaw;
      g.car.update(dt, { speed: s.speed, steer: 0, lean: 0, pitch: s.pitch });
      rig.update(dt, s);
    }
  };
  const pose = (m) => ({
    carH: +(m.contactPct - m.roofPct).toFixed(2),
    contact: +(m.contactPct / 100).toFixed(4),
    depr: m.invariant, width: m.carWidthPct, fov: m.fov,
    roofPct: m.roofPct, horizonPct: m.horizonPct, gap: m.roofGapPct,
  });
  const rows = [];
  for (const aG of accels) {
    // settle at accelG 0, same speed, from a snapped rig
    rig.snap();
    const s0 = mk(0);
    drive(s0, 400);
    const base = pose(measure());
    // step accelG and hold it
    const s = mk(aG);
    const trace = [];
    const marks = wantTrace ? [1, 3, 6, 12, 18, 24, 30, 36, 48, 60, 78, 96, 120, 150] : [150];
    let f = 0;
    for (const m of marks) {
      drive(s, m - f); f = m;
      trace.push({ f: m, t: +(m / 60).toFixed(2), ...pose(measure()) });
    }
    rows.push({ accelG: aG, base, settled: trace[trace.length - 1], trace: wantTrace ? trace : undefined });
  }
  return rows;
}, { measSrc, accels, speed, boost, wantTrace, pitchK });

const f2 = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : String(v));
console.log(`accelG sweep, speed ${speed}, boost ${boost}, ${W}x${H}`);
console.log('accelG |  carH | contact | depr  | width |  fov  | gap');
for (const r of out) {
  const p = r.settled;
  console.log(`${String(r.accelG).padStart(6)} | ${f2(p.carH)} | ${f2(p.contact, 4)}  | ${f2(p.depr, 3)} | ${f2(p.width)} | ${f2(p.fov)} | ${f2(p.gap)}`);
}
if (wantTrace) {
  console.log('\nTRACES (carH / contact / depr per frame after the step)');
  for (const r of out) {
    console.log(`accelG ${r.accelG}:`);
    for (const t of r.trace) console.log(`  f${String(t.f).padStart(3)} t=${f2(t.t)}s carH ${f2(t.carH)} contact ${f2(t.contact, 4)} depr ${f2(t.depr, 3)} width ${f2(t.width)}`);
  }
}
console.log('\nJSON ' + JSON.stringify(out.map((r) => ({ accelG: r.accelG, ...r.settled }))));
await browser.close();
server.close();
