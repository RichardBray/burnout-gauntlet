// _passwhoosh.mjs — the check for the pass-whoosh join. Drives the real game and asserts:
//   1. real passes fire audio.pass() at all
//   2. they fire at the OPENING of the pass, not ~127 ms late like the event queue does
//   3. both sides occur, and side matches the geometry the game itself computed
//   4. the boost economy still gets its events - the whoosh must not consume them
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
    if (rel === '/audio.js') {
      const s = buf.toString().replace(
        'pass(intensity = 1, { side = 0, relSpeed = 30 } = {}) {',
        `pass(intensity = 1, { side = 0, relSpeed = 30 } = {}) { (window.__passes = window.__passes || []).push({ t: performance.now(), intensity, side, relSpeed });`);
      if (s === buf.toString()) throw new Error('audio.js pass() probe did not apply');
      buf = Buffer.from(s);
    }
    if (rel === '/traffic.js') {
      let s = buf.toString();
      // when the pass is at its closest - the moment the whoosh should be peaking
      const a = `          if (clr <= v.nmMin) {
            v.nmMin = clr;`;
      if (!s.includes(a)) throw new Error('closest-approach anchor missing');
      s = s.replace(a, `          if (clr <= v.nmMin) {
            v.nmMin = clr; v.__minAt = performance.now();`);
      // and when it ends, so lead-in can be paired to the same pass
      const b4 = `              onPass({ side, relSpeed: rel, clearance: clr });`;
      if (!s.includes(b4)) throw new Error('moving-onPass anchor missing');
      s = s.replace(b4, `              window.__movingPass = (window.__movingPass || 0) + 1;` + b4);
      const b5 = `              onPass({ side, relSpeed: Math.abs(heroSpeed), clearance: Math.max(clr, 0) });`;
      if (!s.includes(b5)) throw new Error('static-onPass anchor missing');
      s = s.replace(b5, `              window.__staticPass = (window.__staticPass || 0) + 1;` + b5);
      const b2 = `  function emit(type, amount, x, z, meta) {`;
      if (!s.includes(b2)) throw new Error('emit anchor missing');
      s = s.replace(b2, b2 + ` window.__emitted = (window.__emitted || 0) + 1;`);
      const b3 = `    drainEvents() {`;
      if (!s.includes(b3)) throw new Error('drainEvents anchor missing');
      s = s.replace(b3, b3 + ` window.__drained = (window.__drained || 0) + events.length;`);
      const b = `  function closePass(v) {
    if (!v.nmOn) return;`;
      if (!s.includes(b)) throw new Error('closePass anchor missing');
      s = s.replace(b, `  function closePass(v) {
    if (!v.nmOn) return;
    if (v.__minAt) (window.__closest = window.__closest || []).push(v.__minAt);`);
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
// daytime-downtown, NOT the default highway: kerb parking is a city population, and on the
// highway the nearest parked car measured 206 m away - a run there proves nothing about them.
const scene = process.argv[2] || 'daytime-downtown';
await page.goto(`http://127.0.0.1:${server.address().port}/#scene=${scene}`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.locator('#bgmenu button.go').click();
await page.waitForTimeout(1500);

await page.keyboard.down('ArrowUp');
await page.waitForTimeout(45000);
await page.keyboard.up('ArrowUp');

const { passes, closest, boostEvents, moving, parked } = await page.evaluate(() => ({
  passes: window.__passes || [], closest: window.__closest || [],
  // the boost economy's own counter: proof the whoosh did not eat the event stream
  boostEvents: { emitted: window.__emitted || 0, drained: window.__drained || 0 },
  moving: window.__movingPass || 0, parked: window.__staticPass || 0,
}));

let fail = 0;
const ok = (c, msg) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`); if (!c) fail++; };

console.log(`\nwhooshes fired: ${passes.length}   closest-approach marks: ${closest.length}`);
ok(passes.length > 0, 'real driving fires audio.pass()');

// Pair each whoosh with the next closest-approach mark after it: that delta is the lead-in.
const leads = [];
for (const p of passes) {
  const c = closest.find((t) => t >= p.t && t - p.t < 2000);
  if (c !== undefined) leads.push(c - p.t);
}
// The lead-in pairing only means anything for MOVING passes - a parked whoosh has no
// closest-approach mark, so in a mixed scene it pairs to the next moving car's mark and
// produces a nonsense max. Measured on the highway run, which is moving-only.
if (leads.length && closest.length && parked === 0) {
  const v = leads.slice().sort((a, b) => a - b);
  const p50 = v[Math.floor(v.length / 2)];
  console.log(`lead-in ms (whoosh start -> closest approach): min ${v[0].toFixed(0)}  p50 ${p50.toFixed(0)}  max ${v[v.length - 1].toFixed(0)}`);
  ok(p50 >= 0, 'whoosh starts BEFORE closest approach (the old queue fired 127 ms after it)');
  ok(p50 < 400, 'lead-in is inside the whoosh envelope, so the peak lands near the car');
}

if (parked > 0) console.log('lead-in: not measured in a mixed scene (see comment) - run with dusk-highway-chase');
const sides = new Set(passes.map((p) => p.side));
ok(sides.has(-1) && sides.has(1), `passes occur on both sides (saw ${[...sides].join(', ')})`);
ok(passes.every((p) => p.intensity > 0 && p.intensity <= 1), 'intensity stays in 0..1');
ok(passes.every((p) => p.relSpeed >= 8), 'relSpeed is above the event floor');
console.log(`whoosh sources: moving traffic ${moving}, parked cars ${parked}`);
// Kerb parking is a city population. On the highway the correct result is ZERO, so asserting
// it there would be asserting a bug: the check follows the scene.
if (scene === 'dusk-highway-chase') ok(parked === 0, 'highway has no kerb parking, so no parked whooshes (correct)');
else ok(parked > 0, 'parked cars now fire a whoosh');
ok(moving > 0, 'moving traffic still fires a whoosh');
ok(boostEvents.emitted > 0, `traffic still emits boost events (${boostEvents.emitted})`);
ok(boostEvents.drained >= boostEvents.emitted * 0.9,
  `physics still receives them - the whoosh did not eat the queue (emitted ${boostEvents.emitted}, drained ${boostEvents.drained})`);

console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nall checks passed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
