// _t13-burnout.mjs — T13 acceptance check, against the real page.
//
// Everything here is driven through physics.setInput + physics.step, i.e. the same path the key
// handler uses, so the full-bar gate, the latch and the refill are all the real ones.
//
// Usage: node tools/_t13-burnout.mjs [--out shots/t13-burnout.png]
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const repo = resolve(root, '..');
const OUT = resolve(repo, args.out || 'shots/t13-burnout.png');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]));
  try {
    const body = await readFile(p.endsWith('/') ? join(p, 'index.html') : p);
    res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.end(body);
  } catch { res.statusCode = 404; res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal',
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto(`http://localhost:${port}/index.html?scene=hud-overlay`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const res = await page.evaluate(() => {
  const g = window.__game;
  const p = g.physics;
  const s = p.state;
  const hud = g.hud;
  const dt = 1 / 60;

  // Hold the given input for `secs`, collecting every burnout the sim drains.
  const hold = (secs, inp) => {
    const fired = [];
    p.setInput(Object.assign({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false }, inp));
    for (let i = 0; i < Math.round(secs * 60); i++) {
      p.step(dt);
      const n = p.drainBurnout();
      if (n) fired.push({ n, boost: s.boost });
    }
    return fired;
  };
  const fresh = () => {
    p.reset({ x: 0, y: 0, z: -700 }, Math.PI / 2, 60);
    s.boost = 1;
  };
  // The car is on the interstate line heading +X: clear of every block, so nothing crashes and
  // ends a chain by accident during a 30 s run.
  const wrap = () => { if (s.pos.x > 1000) s.pos.x -= 2000; };
  const holdWrapped = (secs, inp) => {
    const fired = [];
    p.setInput(Object.assign({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false }, inp));
    for (let i = 0; i < Math.round(secs * 60); i++) {
      p.step(dt); wrap();
      const n = p.drainBurnout();
      if (n) fired.push({ n, boost: s.boost });
    }
    return fired;
  };
  void hold;

  // Hold boost until ONE burnout lands, then release in the same frame. Without the release the
  // full-bar gate re-arms off the refilled bar on the very next tick and a second burn starts
  // immediately, which is correct behaviour and made the first version of this probe measure the
  // wrong thing: the follow-on burn was still running when the phase ended, leaving the bar at
  // 0.6 and every later phase unable to reach the gate at all.
  const burnOnce = (maxSecs = 12) => {
    p.setInput({ throttle: 1, brake: 0, steer: 0, boost: true, handbrake: false });
    for (let i = 0; i < Math.round(maxSecs * 60); i++) {
      p.step(dt); wrap();
      const n = p.drainBurnout();
      if (n) {
        p.setInput({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
        return { n, boost: s.boost };
      }
    }
    return null;
  };

  const r = {};

  // 1. A full burn from a full bar: one burnout, refilled to 1.
  fresh();
  let one = burnOnce();
  r.oneBurn = one ? 1 : 0;
  r.refill = one ? one.boost : null;
  let f;

  // 2. Releasing early: no burnout, no refill. boostDuration is 8 s, so 3 s is well short.
  fresh();
  holdWrapped(3, { boost: true });
  const boostAfterPartial = s.boost;
  f = holdWrapped(2, { boost: false });
  r.earlyRelease = f.length;
  r.earlyReleaseBoost = boostAfterPartial;

  // 3. Consecutive burns: the multiplier climbs. Boost is held continuously across the refill.
  fresh();
  f = holdWrapped(26, { boost: true });
  r.chain = f.map((x) => x.n);

  // 4. The window. One burn, then idle past BURNOUT_CHAIN_WINDOW (8 s), then burn again: the
  //    second one is a fresh X1, not an X2.
  fresh();
  burnOnce();
  holdWrapped(11, { boost: false });        // idle well past the window with a full bar
  one = burnOnce();
  r.afterWindow = one ? [one.n] : [];

  // 5. A crash breaks it.
  fresh();
  burnOnce();
  s.crashed = true;
  holdWrapped(0.2, { boost: false });
  s.crashed = false;
  one = burnOnce();
  r.afterCrash = one ? [one.n] : [];

  // 6. Precedence: a burnout banner must not be replaced by the BOOST OK! the same refill implies.
  hud.fireEventBanner('BURNOUT X2!', 'burnout', 1);
  hud.fireEventBanner('BOOST OK!', 'boost', 0);
  r.precedence = hud.eventBannerState && hud.eventBannerState.text;

  // Still, captured in this evaluate for the same reason as T11's.
  for (let i = 0; i < 17; i++) hud.update(dt, { boost: 1, speed: 60, boosting: true });
  hud.update(0, { boost: 1, speed: 232 / 3.6, boosting: true });
  r.png = hud.canvas.toDataURL('image/png');
  return r;
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, Buffer.from(res.png.split(',')[1], 'base64'));

console.log('--- T13');
console.log(`  full burn -> burnouts        ${res.oneBurn} (want 1), bar refilled to ${res.refill} (want 1)`);
console.log(`  released at 3 s              ${res.earlyRelease} burnouts (want 0), bar left at ${res.earlyReleaseBoost.toFixed(3)}`);
console.log(`  26 s held                    X${res.chain.join(', X')} (want climbing 1,2,3)`);
console.log(`  burn, idle 11 s, burn        X${res.afterWindow.join(', X')} (want 1)`);
console.log(`  burn, crash, burn            X${res.afterCrash.join(', X')} (want 1)`);
console.log(`  banner precedence            ${res.precedence} (want BURNOUT X2!)`);
console.log(`--- still: ${OUT}`);

const ok = res.oneBurn === 1 && res.refill === 1
  && res.earlyRelease === 0 && res.earlyReleaseBoost > 0.1
  && res.chain.length >= 3 && res.chain[0] === 1 && res.chain[1] === 2 && res.chain[2] === 3
  && res.afterWindow[0] === 1 && res.afterCrash[0] === 1
  && res.precedence === 'BURNOUT X2!';
console.log(ok ? '\nT13 OK' : '\nT13 FAIL');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
