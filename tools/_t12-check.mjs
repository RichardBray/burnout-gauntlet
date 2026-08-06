// _t12-check.mjs - T12 acceptance check against the real playable page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((done) => server.listen(0, done));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__game?.physics, null, { timeout: 120000 });
await page.waitForTimeout(600);

const failures = [];
const check = (pass, message) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${message}`);
  if (!pass) failures.push(message);
};
check(errors.length === 0, `zero console errors at boot${errors.length ? `: ${errors.join(' | ')}` : ''}`);

await page.evaluate(() => {
  const rig = {
    recording: false, t0: 0, samples: [], queue: [],
    loop() {
      const now = performance.now();
      while (rig.queue.length && rig.queue[0].at <= now - rig.t0) {
        const event = rig.queue.shift();
        for (const code of event.down || []) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        for (const code of event.up || []) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      }
      if (rig.recording) {
        const s = window.__game.physics.state;
        rig.samples.push({
          t: (now - rig.t0) / 1000, ground: s.ground, slipAngle: s.slipAngle,
          boost: s.boost, hudMetres: window.__game.hud.driftMetres ?? null,
          hudRows: window.__game.hud.driftPopupCount ?? 0,
        });
      }
      requestAnimationFrame(rig.loop);
    },
    run(queue) { rig.t0 = performance.now(); rig.samples = []; rig.queue = queue.slice(); rig.recording = true; },
    stop() {
      rig.recording = false;
      for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      }
      return rig.samples;
    },
  };
  window.__t12 = rig;
  requestAnimationFrame(rig.loop);
});

async function reset() {
  await page.evaluate(() => {
    const g = window.__game;
    if (g.traffic?.setPool) g.traffic.setPool(0);
    g.physics.clearPath();
    g.physics.placeOnPath(g.world.paths.highway, 0.12, 145 / 3.6);
    g.physics.state.boost = 0;
    g.physics.state.impact = 0;
    g.physics.drainWreck();
    if (g.crash?.reset) g.crash.reset();
    if (g.traffic?.reset) g.traffic.reset(g.physics.state.pos);
  });
  await page.waitForTimeout(250);
}

async function drive(script, duration) {
  await page.evaluate((events) => window.__t12.run(events), script);
  await page.waitForTimeout(duration + 80);
  return page.evaluate(() => window.__t12.stop());
}

const SLIP_REF = await page.evaluate(async () => (await import('./physics.js')).TUNE.slipRef);
await reset();
const longSlide = await drive([
  { at: 0, down: ['KeyW', 'KeyA', 'Space'] },
  { at: 1800, up: ['KeyA', 'Space'] },
  { at: 3000, up: ['KeyW'] },
], 3000);

let integrated = 0;
let longestIntegrated = 0;
let activeSamples = 0;
for (let i = 1; i < longSlide.length; i++) {
  const a = longSlide[i - 1], b = longSlide[i];
  if (Math.abs(a.slipAngle) >= SLIP_REF) {
    integrated += a.ground * (b.t - a.t);
    longestIntegrated = Math.max(longestIntegrated, integrated);
    activeSamples++;
  } else integrated = 0;
}
const shown = longSlide.reduce((peak, s) => Math.max(peak, s.hudMetres ?? 0), 0);
const boostEarned = longSlide.at(-1).boost - longSlide[0].boost;
console.log(`MEASURE longest continuous slide: integrated=${longestIntegrated.toFixed(2)}m HUD=${shown}m activeSamples=${activeSamples} boost=${boostEarned.toFixed(6)}`);
check(activeSamples >= 10, 'fixed handbrake manoeuvre produces a sustained threshold drift');
check(shown > 0 && Math.abs(shown - longestIntegrated) <= 1.5,
  `HUD metres match the longest independent ground-speed stint within 1.5m (${shown} vs ${longestIntegrated.toFixed(2)})`);
check(longSlide.every((s) => s.hudRows <= 1), 'long drift never renders more than one drift row');

await reset();
const shortSlides = await drive([
  { at: 0, down: ['KeyW', 'KeyA', 'Space'] }, { at: 420, up: ['KeyA', 'Space'] },
  { at: 720, down: ['KeyA', 'Space'] }, { at: 1140, up: ['KeyA', 'Space'] },
  { at: 1440, down: ['KeyA', 'Space'] }, { at: 1860, up: ['KeyA', 'Space'] },
  { at: 2800, up: ['KeyW'] },
], 2800);
const peakRows = shortSlides.reduce((n, s) => Math.max(n, s.hudRows), 0);
const visibleFrames = shortSlides.filter((s) => s.hudRows === 1).length;
const transitions = shortSlides.slice(1).reduce((n, s, i) => n + (s.hudRows !== shortSlides[i].hudRows ? 1 : 0), 0);
console.log(`MEASURE short chain: peakRows=${peakRows} visibleFrames=${visibleFrames} visibilityTransitions=${transitions}`);
check(peakRows === 1, 'three short drifts produce exactly one drift row at most');
check(transitions <= 2, `three short drifts do not flicker (${transitions} visibility transitions)`);

await page.waitForTimeout(1100);
const faded = await page.evaluate(() => window.__game.hud.driftPopupCount ?? 0);
check(faded === 0, 'final drift value fades and resets after its hold');
check(errors.length === 0, `zero console/page errors across driving${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(`BOOST_EARNED=${boostEarned.toFixed(6)}`);

await browser.close();
server.close();
console.log(failures.length ? `${failures.length} FAILED` : 'all checks passed');
process.exit(failures.length ? 1 : 0);
