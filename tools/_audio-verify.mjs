// Temporary verification harness for game/audio.js (delete after use).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp',
    });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let fail = false;
try {
  // --- 1. shot mode: audio must be the no-op with the full API surface ---
  await page.goto(`http://127.0.0.1:${port}/index.html#scene=dusk-highway-chase&shot=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  const shotInfo = await page.evaluate(() => {
    const a = window.__audio;
    const keys = ['start', 'stop', 'update', 'crash', 'gearShift', 'boostHit', 'setSpace',
      'setListener', 'setEnabled', 'setVolume', 'addRival', 'updateRival', 'removeRival', 'info'];
    const missing = keys.filter((k) => typeof a[k] !== 'function');
    a.start(); a.update(0.016, { rpm01: 0.5, speed: 40 }); a.crash(1); a.boostHit(1);
    return { missing, info: a.info(), running: a.running, hasCtx: !!a.ctx, ready: !!a.ready.then };
  });
  console.log('shot-mode:', JSON.stringify(shotInfo));
  if (shotInfo.missing.length || shotInfo.info.mode !== 'noop' || shotInfo.running) fail = true;

  // --- 2. playable mode: real WebAudio graph ---
  await page.goto(`http://127.0.0.1:${port}/index.html#scene=dusk-highway-chase`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  await page.mouse.click(400, 300);           // real user gesture -> audio.start()
  const live = await page.evaluate(async () => {
    const a = window.__audio;
    a.start();
    const loaded = await Promise.race([a.ready, new Promise((r) => setTimeout(() => r('timeout'), 15000))]);
    a.setSpace('tunnel');
    a.setVolume(0.5);
    a.setListener({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 30 });
    a.addRival('r1', { cylinders: 8 });
    for (let i = 0; i < 40; i++) {
      a.updateRival('r1', { pos: { x: 3, y: 0, z: 60 - i * 3 }, vel: { x: 0, y: 0, z: -55 }, rpm01: 0.8, load: 0.9 });
      a.update(0.016, {
        rpm01: (i % 20) / 20, speed: 20 + i, boost: i > 20 ? 1 : 0, slip: i > 25 ? 0.8 : 0.05,
        brake: i > 30 ? 1 : 0, gear: 1 + Math.floor(i / 8), throttle: i > 30 ? 0 : 1, wet: 0,
      });
    }
    a.gearShift(3, 4, 1);
    a.crash(1.2);
    await new Promise((r) => setTimeout(r, 600));
    const info = a.info();
    a.setSpace('city');
    a.setEnabled(false); a.setEnabled(true);
    a.removeRival('r1');
    return { loaded, info, running: a.running, state: a.ctx && a.ctx.state, after: a.info() };
  });
  console.log('live-mode:', JSON.stringify(live));
  if (!live.running || live.info.mode !== 'webaudio' || live.info.rivals !== 1) fail = true;
  if (live.info.samples !== 6) console.log('WARN: expected 6 decoded samples, got', live.info.samples);
} catch (e) {
  fail = true;
  console.error('FAILED', e.message);
  try {
    console.error('err-div:', await page.evaluate(() => document.getElementById('err').textContent.slice(0, 800)));
    console.error('flags:', await page.evaluate(() => JSON.stringify({ ready: window.__ready, game: !!window.__game, audio: !!window.__audio })));
  } catch (e2) { console.error('probe failed', e2.message); }
} finally {
  if (errors.length) { console.error('page errors:\n' + errors.slice(0, 20).join('\n')); fail = true; }
  else console.log('no page errors');
  await browser.close();
  server.close();
  console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(fail ? 1 : 0);
}
