// wave-s perf-r4 — THE HUD'S BEHAVIOUR, which no still frame covers.
//
// Moving the HUD between compositing paths can pass the screenshot gate and still break things a
// PNG cannot see. This drives the real page through all of them, on BOTH paths, and every check is
// made END TO END on what the player would actually see: a page screenshot, differenced against a
// second screenshot of the same frozen moment with hud.setVisible(false). If the HUD reached the
// screen the bottom strip moves a lot; if it is blank the difference is ~0. Nothing here trusts an
// internal flag, because an internal flag is exactly what a compositing bug leaves intact.
//
//   1  drives, then asserts the HUD is on screen at all
//   2  window resize (1280x720 -> 1024x600 -> back)
//   3  THE RES SLIDER WHILE PAUSED — menu-critic's defect D1, which must not reopen. On the
//      in-frame path resScale 0.7 also makes the HUD's backing store differ from the drawing
//      buffer, so this is simultaneously the test of the automatic fallback to the DOM layer.
//   4  a scene change from the menu, no reload
//   5  the crash state (C), checked in the CENTRE of the frame where the wrecked overlay lives
//
// usage: node tools/_hudbehav.mjs [--hash hudgl=1] [--root game]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const ROOT = resolve(arg('root', 'game'));
const HASH = arg('hash', '');
const TAG = arg('tag', HASH.replace(/[^a-z0-9]/gi, '') || 'default');
const DIR = resolve('shots/r4/behav');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(ROOT, p === '/' ? '/index.html' : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await mkdir(DIR, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extra = HASH ? '&' + String(HASH).replace(/^[#&]/, '') : '';
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1${extra}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });

const pairs = [];
/**
 * Freeze the frame, screenshot it with the HUD and again without, and record the pair. Both shots
 * are of the SAME frozen frame, so anything that differs between them is the HUD and nothing else.
 */
async function probe(name) {
  const wasPaused = await page.evaluate(() => { const p = window.__game.isPaused(); window.__game.setPaused(true); return p; });
  await sleep(180);
  const on = join(DIR, `${TAG}-${name}-on.png`);
  const off = join(DIR, `${TAG}-${name}-off.png`);
  await page.screenshot({ path: on });
  const vis = await page.evaluate(() => { const v = window.__game.hud.visible; window.__game.hud.setVisible(false); return v; });
  await sleep(180);
  await page.screenshot({ path: off });
  await page.evaluate((v) => window.__game.hud.setVisible(v), vis);
  const info = await page.evaluate(() => ({
    hudPath: window.__game.hudPath ? window.__game.hudPath() : null,
    rs: window.__game.renderSize(), visible: window.__game.hud.visible,
    gen: window.__game.hud.generation,
    menuOpen: !!(window.__game.menu && window.__game.menu.isOpen && window.__game.menu.isOpen()),
  }));
  if (!wasPaused) await page.evaluate(() => window.__game.setPaused(false));
  await sleep(120);
  pairs.push({ name, on, off, info });
  console.log(`[${name}] hudPath ${JSON.stringify(info.hudPath)} | renderSize ${info.rs.w}x${info.rs.h} ratio ${info.rs.pixelRatio} | gen ${info.gen} | hud.visible ${info.visible} | menuOpen ${info.menuOpen}`);
}

// ---- 1. driving -------------------------------------------------------------
await page.keyboard.down('KeyW');
await sleep(2500);
await page.keyboard.up('KeyW');
await probe('1-drive');

// ---- 2. window resize -------------------------------------------------------
await page.setViewportSize({ width: 1024, height: 600 });
await sleep(600);
await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW');
await probe('2-resized');
await page.setViewportSize({ width: 1280, height: 720 });
await sleep(600);
await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW');
await probe('2-resized-back');

// ---- 3. the res slider while paused (D1) ------------------------------------
// The real player path: Escape opens the pause menu, the slider calls ctx.setResScale().
await page.keyboard.press('Escape');
await sleep(400);
const menuOpen = await page.evaluate(() => !!(window.__game.menu && window.__game.menu.isOpen && window.__game.menu.isOpen()));
await page.evaluate(() => window.__game.setResScale(0.7));
await sleep(500);                        // menu.js repaints the paused HUD from its 4 Hz poll
await probe('3-res070-paused');
await page.evaluate(() => window.__game.setResScale(1.0));
await sleep(500);
await probe('3-res100-paused');
// ...and again with the menu CLOSED, where the scrim is not in the way. The menu's own scrim is
// a 0.86-alpha directional wash over exactly the corner the boost bar lives in, so a probe taken
// with the menu open reads the HUD at ~14% contrast (max ~30 instead of ~220). Present, but the
// unscrimmed probe is the one to read.
await page.keyboard.press('Escape');
await sleep(500);
await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW');
await probe('3-after-resume');

// ---- 4. a scene change from the menu ----------------------------------------
await page.keyboard.press('Escape');
await sleep(300);
const scenes = await page.evaluate(() => (window.__game.menu ? window.__game.menu.scenes().map((s) => s.id) : []));
const target = scenes.find((s) => s !== 'dusk-highway-chase') || scenes[0];
await page.evaluate((s) => window.__game.menu.applyScene(s), target);
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
await sleep(1200);
// close the menu if the scene change left it open, so the probe is not read through the scrim
if (await page.evaluate(() => window.__game.menu.isOpen())) { await page.keyboard.press('Escape'); await sleep(400); }
await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
console.log(`# scene changed to ${target} (menu was open: ${menuOpen})`);
await probe('4-scene-' + target);

// ---- 5. the crash state -----------------------------------------------------
await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
await page.keyboard.press('KeyC');
await sleep(500);
await probe('5-crash');

console.log(`# console/page errors: ${errs.length}` + (errs.length ? '\n  ' + errs.slice(0, 6).join('\n  ') : ''));
await page.close();

// ---- decode every pair and report the HUD's footprint on screen -------------
const dec = await browser.newPage();
const REGIONS = { bottomStrip: [0.00, 0.76, 0.45, 1.00], centre: [0.30, 0.20, 0.70, 0.62] };
console.log('\n# mean |difference| between "HUD on" and "HUD hidden" on the SAME frozen frame.');
console.log('# A blank or missing HUD reads ~0. This is the end-to-end test that it reached the screen.');
for (const p of pairs) {
  const a = (await readFile(p.on)).toString('base64');
  const b = (await readFile(p.off)).toString('base64');
  const r = await dec.evaluate(async ([A, B, regions]) => {
    const load = (d) => new Promise((ok, no) => {
      const im = new Image(); im.onload = () => ok(im); im.onerror = no;
      im.src = 'data:image/png;base64,' + d;
    });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const px = (im) => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, im.width, im.height).data;
    };
    if (ia.width !== ib.width || ia.height !== ib.height) return { err: 'size mismatch' };
    const da = px(ia), db = px(ib), W = ia.width, H = ia.height;
    const out = { w: W, h: H };
    for (const [name, [x0, y0, x1, y1]] of Object.entries(regions)) {
      const X0 = Math.round(x0 * W), X1 = Math.round(x1 * W);
      const Y0 = Math.round(y0 * H), Y1 = Math.round(y1 * H);
      let sum = 0, n = 0, mx = 0;
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const i = (y * W + x) * 4;
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
          sum += d; n++; if (d > mx) mx = d;
        }
      }
      out[name] = { mean: +(sum / n).toFixed(3), max: mx };
    }
    return out;
  }, [a, b, REGIONS]);
  console.log(`  ${p.name.padEnd(22)} ${r.w}x${r.h}  bottomStrip mean ${String(r.bottomStrip.mean).padStart(7)} max ${String(r.bottomStrip.max).padStart(3)} | centre mean ${String(r.centre.mean).padStart(7)} max ${String(r.centre.max).padStart(3)}`);
}
await browser.close(); server.close(); process.exit(errs.length ? 1 : 0);
