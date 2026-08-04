// Verifies the three joins the session driver landed in the frozen main.js, in the LIVE page,
// through the real key listeners:
//   1. physics.setEventSource(() => traffic.drainEvents())  — boost is earned from traffic events
//   2. physics.drainWreck() -> crash.trigger()              — a severe contact reaches crash.js
//   3. carRoot.rotation.y = s.yaw                           — the drawn nose is the heading
//
//   node tools/_joins.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

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
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--disable-frame-rate-limit',
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/#nomenu=1&res=1.0`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
await page.waitForTimeout(2500);

// ---- 1. the boost join: hold throttle through traffic and watch where boost comes from -----
const boost = await page.evaluate(async () => {
  const g = window.__game, ph = g.physics;
  ph.reset(ph.state.pos, ph.state.yaw, 0);
  g.traffic.reset(ph.state.pos);
  // Count what physics is fed, WITHOUT consuming it: wrap the source main.js installed.
  let seen = 0, kinds = {};
  const inner = g.traffic.drainEvents.bind(g.traffic);
  g.traffic.drainEvents = () => {
    const evs = inner();
    for (const e of evs) { seen++; kinds[e.type] = (kinds[e.type] || 0) + 1; }
    return evs;
  };
  ph.state.boost = 0;          // reset() hands out a full bar; an earn test needs an empty one
  ph.drainWreck();             // clear anything queued by the reset itself
  const b0 = ph.state.boost;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  const p0 = { x: ph.state.pos.x, z: ph.state.pos.z };
  await new Promise((r) => setTimeout(r, 16000));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  const s = ph.state;
  const km = Math.hypot(s.pos.x - p0.x, s.pos.z - p0.z) / 1000;
  g.traffic.drainEvents = inner;
  return { events: seen, kinds, km: +km.toFixed(3), eventsPerKm: +(seen / Math.max(km, 1e-6)).toFixed(2),
    boost0: +b0.toFixed(4), boost1: +s.boost.toFixed(4), eventEarn: +(s.eventEarn || 0).toFixed(4),
    kmh: +(s.ground * 3.6).toFixed(1) };
});

// ---- 2. the wreck join: drive into a building and see whether crash.js actually starts ------
const wreck = await page.evaluate(async () => {
  const g = window.__game, ph = g.physics;
  const before = { crashActive: g.crash.active, crashed: ph.state.crashed };
  // Find a block and aim straight at its face at speed.
  const b = (g.world.blocks || [])[0];
  if (!b) return { skipped: 'no blocks' };
  const cx = b.x !== undefined ? b.x : b.cx, cz = b.z !== undefined ? b.z : b.cz;
  const yaw = Math.atan2(cx - (cx - 0), 1); // placeholder, overwritten below
  // Place the car 70 m from the block centre, pointing at it, at 60 m/s.
  const d = 70;
  const ang = Math.PI * 0.5;
  ph.reset({ x: cx - Math.sin(ang) * d, y: 0, z: cz - Math.cos(ang) * d }, ang, 60);
  g.crash.reset();
  ph.drainWreck();             // a queued wreck from an earlier contact would fire on frame 1
  await new Promise((r) => requestAnimationFrame(r));
  if (g.crash.active) return { falseFireOnFrame0: true };
  const startPos = { x: ph.state.pos.x, z: ph.state.pos.z };
  let fired = false, tHit = -1;
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (g.crash.active) { fired = true; tHit = i; break; }
  }
  return { before, crashActive: g.crash.active, fired, frames: tHit,
    metresBeforeCrash: +Math.hypot(ph.state.pos.x - startPos.x, ph.state.pos.z - startPos.z).toFixed(1),
    speedNow: +(ph.state.ground * 3.6).toFixed(1) };
});

// ---- 3. the drawn nose ----------------------------------------------------------------------
const nose = await page.evaluate(() => {
  const g = window.__game, s = g.physics.state;
  return { yaw: +s.yaw.toFixed(5), drawn: +g.carRoot.rotation.y.toFixed(5),
    slip: +s.slip.toFixed(4), delta: +(g.carRoot.rotation.y - s.yaw).toFixed(6) };
});

const size = await page.evaluate(() => window.__game.renderSize());
console.log(JSON.stringify({ boost, wreck, nose, size, errors: errs }, null, 1));
await browser.close();
server.close();
