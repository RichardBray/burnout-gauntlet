// _crashaudio-repro.mjs — does a REAL gameplay wreck make a crash sound?
//
// The question cannot be answered by reading main.js alone, because a wreck reaches the
// screen through physics.drainWreck() -> crash.trigger() and reaches the speakers through
// a separate audio.crash() call. So the test counts BOTH, on the same run, through the
// real keyboard listeners: drive into traffic until a wreck fires, then press C (the demo
// crash, which is known to be audible) as a positive control on the same page.
//
// Counting is done by rewriting the served audio.js and crash.js to bump a window counter
// on entry. Nothing else is stubbed - the real AudioContext runs, the real physics runs.
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
        'crash(intensity = 1, { glass = 1, metal = 1 } = {}) {',
        'crash(intensity = 1, { glass = 1, metal = 1 } = {}) { window.__audioCrash = (window.__audioCrash || 0) + 1;');
      if (s === buf.toString()) throw new Error('audio.js crash() probe did not apply');
      buf = Buffer.from(s);
    }
    if (rel === '/crash.js') {
      const s = buf.toString().replace(
        'trigger({ speed = 60, dir = new THREE.Vector3(0, 0, 1), severity = 1 } = {}) {',
        'trigger({ speed = 60, dir = new THREE.Vector3(0, 0, 1), severity = 1 } = {}) { window.__visualCrash = (window.__visualCrash || 0) + 1;');
      if (s === buf.toString()) throw new Error('crash.js trigger() probe did not apply');
      buf = Buffer.from(s);
    }
    if (rel === '/main.js') {
      const s = buf.toString().replace(
        'const wreck = physics.drainWreck();',
        `const wreck = window.__forceWreck ? (window.__forceWreck = 0, { speed: 40, dir: new THREE.Vector3(0, 0, 1), severity: 1 }) : physics.drainWreck(); if (wreck) window.__wreckDrained = (window.__wreckDrained || 0) + 1;`);
      if (s === buf.toString()) throw new Error('main.js drainWreck probe did not apply');
      buf = Buffer.from(s);
    }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) { res.writeHead(404); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(4000);

// Start the game the way a player does: the menu is up on boot and its Drive button is
// what dismisses it and unlocks the AudioContext. Clicking the canvas behind it does
// neither, which is how an earlier version of this test managed to prove nothing.
await page.locator('#bgmenu button.go').click();
await page.waitForTimeout(1500);

// Zero the counters AFTER boot: crash.js prewarm() calls trigger() once during the boot
// bar to pay first-crash costs, and that is not a gameplay wreck.
await page.evaluate(() => { window.__visualCrash = 0; window.__audioCrash = 0; window.__wreckDrained = 0; window.__keys = 0;
  window.addEventListener('keydown', () => { window.__keys++; }); });

// Prove the real listeners receive keys before trusting any silence as evidence.
await page.keyboard.press('KeyC');
await page.waitForTimeout(800);
const ctl = await page.evaluate(() => ({ keys: window.__keys, v: window.__visualCrash, a: window.__audioCrash }));
console.log(`CONTROL C-key: keydown x${ctl.keys}  crash.trigger x${ctl.v}  audio.crash x${ctl.a}`);
if (ctl.keys === 0) { console.log('ABORT: keys are not reaching the page, silence would prove nothing'); await browser.close(); server.close(); process.exit(1); }
await page.keyboard.press('KeyR');
await page.waitForTimeout(1200);
await page.evaluate(() => { window.__visualCrash = 0; window.__audioCrash = 0; window.__wreckDrained = 0; });

// Drive. Hold throttle and stay in lane so traffic is actually met head-on.
await page.keyboard.down('ArrowUp');
let wreckAt = -1;
for (let t = 0; t < 25; t++) {
  await page.waitForTimeout(1000);
  const v = await page.evaluate(() => window.__visualCrash || 0);
  if (t % 10 === 0) console.log(`  t=${t}s visual=${v} drained=${await page.evaluate(() => window.__wreckDrained || 0)}`);
  if (v > 0) { wreckAt = t; break; }
}
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(300);

const afterDrive = await page.evaluate(() => ({
  visual: window.__visualCrash || 0, audio: window.__audioCrash || 0,
  drained: window.__wreckDrained || 0, speed: (window.__dbgSpeed ?? null) }));

// FORCED WRECK: inject one wreck-grade contact at the exact point physics publishes them,
// so the join main.js:628 takes is exercised for real. This is the decisive measurement -
// driving cannot reach it because physics.js has no traffic collision at all.
await page.evaluate(() => { window.__forceWreck = 1; });
await page.waitForTimeout(1500);
const forced = await page.evaluate(() => ({
  visual: window.__visualCrash || 0, audio: window.__audioCrash || 0,
  drained: window.__wreckDrained || 0 }));
console.log(`FORCED wreck   : drained x${forced.drained}  crash.trigger x${forced.visual}  audio.crash x${forced.audio}`);

// Positive control: the C-key demo crash on the same page, same audio graph.
await page.keyboard.press('KeyR');
await page.waitForTimeout(600);
await page.keyboard.press('KeyC');
await page.waitForTimeout(600);
const afterDemo = await page.evaluate(() => ({
  visual: window.__visualCrash || 0, audio: window.__audioCrash || 0,
  drained: window.__wreckDrained || 0 }));

console.log(`\ngameplay wreck fired at t=${wreckAt}s`);
console.log(`after driving   : crash.trigger x${afterDrive.visual}  audio.crash x${afterDrive.audio}`);
console.log(`after C key     : crash.trigger x${afterDemo.visual}  audio.crash x${afterDemo.audio}`);
console.log(`\nVERDICT: gameplay wreck ${afterDrive.visual > 0 && afterDrive.audio === 0 ? 'IS SILENT (bug reproduced)' : afterDrive.visual === 0 ? 'never happened - test inconclusive' : 'made a sound'}`);

await browser.close();
server.close();
