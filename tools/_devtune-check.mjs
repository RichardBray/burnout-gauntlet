// _devtune-check.mjs - T9 acceptance check, run against the REAL page, not a harness.
// Boots game/index.html on the playable path, then checks the four things T9 is scored on:
//   1. no console errors at boot (lint ok does not mean runnable - play brief rule 4)
//   2. the panel opens from the URL flag and toggles on backtick
//   3. moving a slider mutates the LIVE TUNE object, with no reload
//   4. the change reaches the simulation - a minRadius cut raises the achieved yaw rate
// Usage: node tools/_devtune-check.mjs
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
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&dev=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(500);

const fail = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail.push(msg); };

// 1. clean boot
ok(errors.length === 0, `no console errors at boot${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`);

// 2. open from the URL flag, and toggle on backtick
const vis = () => page.evaluate(() => {
  const el = document.getElementById('devtune');
  return el ? getComputedStyle(el).display !== 'none' : null;
});
ok(await vis() === true, 'panel is open from #dev=1');
const tap = async () => {
  await page.evaluate(() => window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Backquote', bubbles: true })));
  await page.waitForTimeout(60);
};
await tap();
ok(await vis() === false, 'backtick hides it');
await tap();
ok(await vis() === true, 'backtick shows it again');

// 3. a slider input mutates TUNE live. Driven through a real `input` event on the real element,
//    so this exercises the listener the user's mouse will, not an internal we could fake.
const slid = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#devtune .row')];
  const row = rows.find((r) => r.querySelector('.k')?.textContent === 'minRadius');
  if (!row) return { err: 'no minRadius row' };
  const input = row.querySelector('input[type=range]');
  const before = window.__game.physics.TUNE?.minRadius;
  input.value = '5.5';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { before, shown: row.querySelector('.v').textContent };
});
ok(!slid.err, `minRadius slider exists${slid.err ? ` — ${slid.err}` : ''}`);
ok(slid.shown === '5.50', `numeric readout tracks the slider (shows ${slid.shown})`);

// 4. and the sim actually reads it. Hold full left lock from 8 m/s for 1 s and compare the peak
//    yaw rate at the shipped 7.57 m radius against the 5.5 m the slider just set.
//    A panel whose sliders do not reach the simulation is the one failure mode worth E2E-ing.
//    MEASURED AT LOW SPEED ON PURPOSE: rTarget is min(rGrip, rGeo) and only rGeo carries
//    minRadius, so above the crossover (~25 m/s) the grip branch binds and moving minRadius
//    correctly does nothing. A first pass at 22 m/s read 51.6 vs 51.5 deg/s for exactly that
//    reason — the knob was fine, the probe was above the crossover.
const yawAt = (r) => page.evaluate(async (radius) => {
  const g = window.__game;
  const T = (await import('./physics.js')).TUNE;
  T.minRadius = radius;
  g.physics.reset(g.physics.state.pos, g.physics.state.yaw, 8);
  let peak = 0;
  const t0 = performance.now();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
  await new Promise((done) => {
    const step = () => {
      peak = Math.max(peak, Math.abs(g.physics.state.yawRate));
      if (performance.now() - t0 > 1000) return done();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
  return peak * 180 / Math.PI;
}, r);

const wide = await yawAt(7.57);
const tight = await yawAt(5.5);
console.log(`      peak yaw: minRadius 7.57 -> ${wide.toFixed(1)} deg/s, 5.50 -> ${tight.toFixed(1)} deg/s`);
ok(tight > wide * 1.05, 'a slider change reaches the simulation with no reload');

await browser.close();
server.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
