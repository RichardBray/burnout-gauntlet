// wave-s/perf-critic-r4 — DOES THE HUD ACTUALLY REACH THE SCREEN, per boot configuration?
//
// The claim under audit ships a runtime route switch (`#hudgl=1`, plus an automatic fallback to the
// DOM layer whenever the HUD's backing store and the drawing buffer differ in size). The builder's
// boot matrix reported every configuration "ok" using `hud.visible` and `hudPath()`. Both are
// internal flags, and an internal flag is exactly what a compositing bug leaves intact.
//
// So this measures the SCREEN: freeze the frame, screenshot it, hide the HUD, screenshot the same
// frozen frame again, and difference the two. If the HUD reached the screen the strips it occupies
// move a lot; if it never reached the screen they read ~0 while every flag still looks healthy.
//
// usage: node tools/_pc4hud.mjs [--root game]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const ROOT = resolve(arg('root', 'game'));
const DIR = resolve('shots/pc4');

const CONFIGS = [
  { name: 'default',              hash: '',                  dsf: 1 },
  { name: 'hudgl=1',              hash: 'hudgl=1',           dsf: 1 },
  { name: 'hudgl=1 dpr2',         hash: 'hudgl=1',           dsf: 2 },
  { name: 'hudgl=1&res=0.7',      hash: 'hudgl=1&res=0.7',   dsf: 1 },
  { name: 'default&res=0.7',      hash: 'res=0.7',           dsf: 1 },
  { name: 'hudgl=1&hudres=2 dpr2', hash: 'hudgl=1&hudres=2', dsf: 2 },
  { name: 'default&hudres=2 dpr2', hash: 'hudres=2',         dsf: 2 },
];

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

// The repo has no PNG decoder in node, so both shots are decoded in a scratch chromium page, the
// same way tools/_perfr3-diff.mjs does it.
const scratch = await browser.newPage();
/** mean and max |difference| over a list of rects of two PNG buffers, in 0..255 */
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
    return rs.map(([x0, y0, x1, y1]) => {
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

for (const cfg of CONFIGS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: cfg.dsf });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  const extra = cfg.hash ? '&' + cfg.hash : '';
  await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1${extra}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  await page.keyboard.down('KeyW');
  await sleep(1500);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.__game.setPaused(true));
  await sleep(250);
  const tag = cfg.name.replace(/[^a-z0-9]/gi, '_');
  const on = await page.screenshot();
  await page.evaluate(() => window.__game.hud.setVisible(false));
  await sleep(250);
  const off = await page.screenshot();
  await page.evaluate(() => window.__game.hud.setVisible(true));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(DIR, `${tag}-on.png`), on);
  await writeFile(join(DIR, `${tag}-off.png`), off);
  const info = await page.evaluate(() => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    return { hudPath: g.hudPath ? g.hudPath() : null, visible: g.hud.visible,
      gen: g.hud.generation, inDoc: !!g.hud.canvas.parentNode,
      hudCanvas: `${g.hud.canvas.width}x${g.hud.canvas.height}`,
      gl: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
      rs: g.renderSize(), resScale: g.getResScale() };
  });
  // page screenshots are in CSS pixels x deviceScaleFactor
  const S = cfg.dsf;
  const [bottom, top, whole] = await diffRects(on, off, [
    [0, 620 * S, 1280 * S, 720 * S],
    [400 * S, 30 * S, 900 * S, 160 * S],
    [0, 0, 1280 * S, 720 * S],
  ]);
  console.log(`${cfg.name.padEnd(24)} dsf ${cfg.dsf} | HUD ON SCREEN? bottomStrip mean ${bottom.mean.toFixed(2)} max ${bottom.max} | topPlate mean ${top.mean.toFixed(2)} max ${top.max} | whole mean ${whole.mean.toFixed(2)}`);
  console.log(`${' '.repeat(24)} hudCanvas ${info.hudCanvas} glBuffer ${info.gl} resScale ${info.resScale} inDocument ${info.inDoc} visible ${info.visible} gen ${info.gen}`);
  console.log(`${' '.repeat(24)} hudPath ${JSON.stringify(info.hudPath)}${errs.length ? '\n  ERRORS ' + errs.slice(0, 3).join(' | ') : ''}`);
  await page.close();
}
await browser.close(); server.close(); process.exit(0);
