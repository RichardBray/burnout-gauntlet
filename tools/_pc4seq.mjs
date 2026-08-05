// wave-s/perf-critic-r4 — the HUD's BEHAVIOUR through the runtime sequence, judged ON SCREEN.
//
// Same idea as tools/_pc4hud.mjs but for the transitions rather than the boot: at each checkpoint
// the frame is frozen, screenshotted, the HUD hidden, and the SAME frozen frame screenshotted
// again. The difference is the HUD and nothing else. Every checkpoint also prints hudPath() AND
// `canvas.parentNode`, because the claim under audit has a route in which the canvas is in neither
// the document nor the frame, and every internal flag still looks healthy there.
//
//   1  driving
//   2  window resize 1280x720 -> 1024x600 -> back  (the texture-reallocation defect's home)
//   3  Escape, res slider to 0.7 while PAUSED (menu defect D1), back to 1.0, resume
//   4  a scene change from the real pause menu (no reload)
//   5  the crash state (C), read in the centre of the frame
//
// usage: node tools/_pc4seq.mjs [--hash hudgl=1] [--root game]
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const ROOT = resolve(arg('root', 'game'));
const HASH = arg('hash', '');
const TAG = arg('tag', HASH.replace(/[^a-z0-9]/gi, '') || 'default');
const DIR = resolve('shots/pc4/seq');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratch = await browser.newPage();
async function diffRects(a, b, rects) {
  return scratch.evaluate(async ([da, db, rs]) => {
    const load = (d) => new Promise((ok, no) => {
      const im = new Image(); im.onload = () => ok(im); im.onerror = no;
      im.src = 'data:image/png;base64,' + d;
    });
    const [A, B] = await Promise.all([load(da), load(db)]);
    const px = (im) => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, im.width, im.height).data;
    };
    const pa = px(A), pb = px(B), W = A.width, H = A.height;
    return rs.map(([fx0, fy0, fx1, fy1]) => {
      const x0 = Math.round(fx0 * W), x1 = Math.round(fx1 * W);
      const y0 = Math.round(fy0 * H), y1 = Math.round(fy1 * H);
      let sum = 0, n = 0, max = 0;
      for (let y = y0; y < Math.min(y1, H); y++) {
        for (let x = x0; x < Math.min(x1, W); x++) {
          const i = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) {
            const d = Math.abs(pa[i + c] - pb[i + c]);
            sum += d; n++; if (d > max) max = d;
          }
        }
      }
      return { mean: sum / n, max };
    });
  }, [a.toString('base64'), b.toString('base64'), rects]);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const extra = HASH ? '&' + String(HASH).replace(/^[#&]/, '') : '';
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1${extra}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });

async function probe(name) {
  const wasPaused = await page.evaluate(() => { const p = window.__game.isPaused(); window.__game.setPaused(true); return p; });
  await sleep(220);
  const on = await page.screenshot();
  const vis = await page.evaluate(() => { const v = window.__game.hud.visible; window.__game.hud.setVisible(false); return v; });
  await sleep(220);
  const off = await page.screenshot();
  await page.evaluate((v) => window.__game.hud.setVisible(v), vis);
  if (!wasPaused) await page.evaluate(() => window.__game.setPaused(false));
  await writeFile(join(DIR, `${TAG}-${name}-on.png`), on);
  // fractions of the frame, so a resized window is measured in the same place
  const [bottom, centre, whole] = await diffRects(on, off, [
    [0, 0.86, 1, 1], [0.3, 0.3, 0.7, 0.7], [0, 0, 1, 1],
  ]);
  const info = await page.evaluate(() => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    return { hudPath: g.hudPath ? g.hudPath() : null, inDoc: !!g.hud.canvas.parentNode,
      hudCanvas: `${g.hud.canvas.width}x${g.hud.canvas.height}`,
      gl: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`, gen: g.hud.generation,
      paused: g.isPaused(), resScale: g.getResScale() };
  });
  const route = info.hudPath && info.hudPath.inFrame ? 'IN-FRAME' : (info.inDoc ? 'DOM' : '*** NEITHER ***');
  console.log(`${name.padEnd(26)} bottom mean ${bottom.mean.toFixed(2)} max ${bottom.max} | centre mean ${centre.mean.toFixed(2)} | whole ${whole.mean.toFixed(2)} | route ${route} inDoc ${info.inDoc} | hudCanvas ${info.hudCanvas} gl ${info.gl} resScale ${info.resScale} gen ${info.gen}`);
}

await page.keyboard.down('KeyW');
await sleep(1800);
await probe('1-driving');
await page.setViewportSize({ width: 1024, height: 600 });
await sleep(900);
await probe('2-resized-1024x600');
await page.setViewportSize({ width: 1280, height: 720 });
await sleep(900);
await probe('3-resized-back');
await page.keyboard.up('KeyW');
await page.keyboard.press('Escape');
await sleep(400);
await page.evaluate(() => window.__game.setResScale(0.7));
await sleep(400);
await probe('4-res0.7-while-paused');
await page.evaluate(() => window.__game.setResScale(1.0));
await sleep(400);
await probe('5-res1.0-while-paused');
// resume through the menu's own button, the way a player does
await page.evaluate(() => { const b = document.querySelector('#menu button, .menu button'); if (b) b.click(); });
await page.keyboard.press('Escape');
await sleep(500);
await page.keyboard.down('KeyW');
await sleep(1200);
await probe('6-after-resume');
await page.keyboard.up('KeyW');
await page.keyboard.press('Escape');
await sleep(400);
const picked = await page.evaluate(() => {
  const b = document.querySelector('[data-opt="place"] button[data-value="boost-blur"]')
    || Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim() === 'Boost');
  if (b) { b.click(); return true; }
  return false;
});
await sleep(1200);
await page.keyboard.press('Escape');
await sleep(400);
await page.keyboard.down('KeyW');
await sleep(1500);
await probe(`7-scene-change(picked=${picked})`);
await page.keyboard.press('KeyC');
await sleep(700);
await probe('8-crash');
await page.keyboard.up('KeyW');
console.log(`console/page errors: ${errs.length}${errs.length ? ' -> ' + errs.slice(0, 4).join(' | ') : ''}`);
await browser.close(); server.close(); process.exit(0);
