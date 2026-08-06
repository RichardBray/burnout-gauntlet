// _t11-banner.mjs — T11 acceptance check, plus a rendered still of the banner.
//
// The check is on the FIRING RULE, which is where this feature can actually be wrong: once per
// fill, on the rising edge, never while the bar hovers at full, never for a bar that was already
// full at spawn. It also renders the banner and writes a PNG, because "legible at 720p" is not a
// thing a boolean can answer.
//
// Usage: node tools/_t11-banner.mjs [--out shots/t11.png] [--w 1280 --h 720]
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
const W = +(args.w || 1280), H = +(args.h || 720);
const OUT = resolve(repo, args.out || 'shots/t11-boost-ok.png');
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
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto(`http://localhost:${port}/index.html?scene=hud-overlay`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const res = await page.evaluate(() => {
  const hud = window.__game.hud;
  const dt = 1 / 60;
  // A fresh HUD is not reachable from here (main.js built it at boot with the bar already full),
  // so the sequence starts by draining: that is also the state a player is in after a burn.
  const feed = (boost, n) => {
    let fires = 0;
    let last = hud.eventBannerState;
    for (let i = 0; i < n; i++) {
      hud.update(dt, { boost, speed: 60, boosting: false });
      const now = hud.eventBannerState;
      if (now && (!last || now.t > last.t)) fires++;
      last = now;
    }
    return fires;
  };

  const r = {};
  r.spawnFull = feed(1, 120);          // bar full from the first frame: must NOT fire
  r.drain = feed(0, 240);              // empty it
  r.fill1 = feed(1, 120);              // first real fill: exactly one
  r.hover = feed(1, 600);              // ten seconds sitting at full: none
  r.dip = feed(0.95, 60);              // a small dip that does not clear the re-arm margin
  r.afterDip = feed(1, 120);           // ...so still none
  r.drain2 = feed(0, 240);
  r.fill2 = feed(1, 120);              // second real fill: exactly one
  r.text = hud.eventBannerState && hud.eventBannerState.text;

  // Leave a banner mid-hold and grab the HUD canvas IN THIS SAME EVALUATE. Screenshotting the
  // page instead would race main.js's own rAF loop, which calls hud.update() every frame with the
  // live sim state and would age the banner out from under the capture.
  hud.fireEventBanner('BOOST OK!', 'boost', 0);
  for (let i = 0; i < 17; i++) hud.update(dt, { boost: 1, speed: 60, boosting: false });
  hud.update(0, { boost: 1, speed: 214 / 3.6, boosting: false });
  r.png = hud.canvas.toDataURL('image/png');
  r.canvasSize = [hud.canvas.width, hud.canvas.height];
  return r;
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, Buffer.from(res.png.split(',')[1], 'base64'));

console.log('--- firing rule');
console.log(`  full at spawn, 2 s          ${res.spawnFull} fires (want 0)`);
console.log(`  first fill                  ${res.fill1} fires (want 1)`);
console.log(`  10 s hovering at full       ${res.hover} fires (want 0)`);
console.log(`  dip to 0.95 and back        ${res.dip + res.afterDip} fires (want 0)`);
console.log(`  second fill                 ${res.fill2} fires (want 1)`);
console.log(`  text                        ${res.text}`);
console.log(`--- still: ${OUT}, HUD canvas ${res.canvasSize.join('x')}`);

const ok = res.spawnFull === 0 && res.fill1 === 1 && res.hover === 0
  && res.dip + res.afterDip === 0 && res.fill2 === 1;
console.log(ok ? '\nT11 OK' : '\nT11 FAIL');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
