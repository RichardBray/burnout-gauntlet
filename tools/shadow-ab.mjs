// shadow-ab.mjs — numeric A/B: does the shadow map contribute ANY pixels?
//
//   node tools/shadow-ab.mjs --scene daytime-downtown
//   node tools/shadow-ab.mjs --scene daytime-downtown --pre "<js run before the A render>"
//
// Boots the scene exactly like tools/shot.mjs, renders once with
// renderer.shadowMap.enabled = true and once with it false (forcing a full
// material recompile between the two so the shader really drops the shadow
// term), reads both framebuffers back through a 2D canvas and reports the mean
// absolute per-channel difference over three regions:
//
//   road   — the lower band of the frame, minus the box the car occupies
//   full   — the whole frame
//   facade — the upper-left third, i.e. the near street wall
//
// If road MAD is ~0 the shadow map is contributing nothing to the road and the
// bug is upstream of grading/post. Anything above ~1.0 (0-255 scale) means the
// shadow term is alive and the problem is contrast, not existence.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const scene = args.scene || 'daytime-downtown';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
if (args.nopcss) await page.addInitScript(() => { globalThis.__noPcss = true; });
page.on('pageerror', (e) => console.log('[error]', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });

await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

// everything below runs in the page: grab frame A, flip the shadow map off,
// recompile, grab frame B, diff.
const evaled = await page.evaluate(async ([pre, dump]) => {
  const g = window.__game;
  const gl = g.renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = gl.width; cv.height = gl.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  function recompile() {
    g.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
  }
  function grab() {
    g.renderer.shadowMap.needsUpdate = true;
    for (let i = 0; i < 3; i++) g.composer.render();
    ctx.drawImage(gl, 0, 0);
    return ctx.getImageData(0, 0, cv.width, cv.height).data;
  }

  if (pre) new Function('game', 'THREE', pre)(g, g.THREE);
  recompile();
  const A = grab();

  g.renderer.shadowMap.enabled = false;
  recompile();
  const B = grab();

  const W = cv.width, H = cv.height;
  const regions = {
    // lower band of the frame = open road, with the car's box punched out
    road: { x0: 0.02, x1: 0.98, y0: 0.60, y1: 0.99, hole: [0.40, 0.60, 0.55, 0.99] },
    full: { x0: 0, x1: 1, y0: 0, y1: 1 },
    facade: { x0: 0.0, x1: 0.33, y0: 0.02, y1: 0.55 },
  };
  const res = {};
  for (const [name, r] of Object.entries(regions)) {
    const x0 = Math.floor(r.x0 * W), x1 = Math.floor(r.x1 * W);
    const y0 = Math.floor(r.y0 * H), y1 = Math.floor(r.y1 * H);
    let sum = 0, n = 0, max = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (r.hole) {
          const [hx0, hx1, hy0, hy1] = r.hole;
          if (x >= hx0 * W && x <= hx1 * W && y >= hy0 * H && y <= hy1 * H) continue;
        }
        const i = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(A[i + c] - B[i + c]);
          sum += d; if (d > max) max = d; n++;
        }
      }
    }
    let la = 0, lb = 0, m = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        la += A[i] + A[i + 1] + A[i + 2]; lb += B[i] + B[i + 1] + B[i + 2]; m += 3;
      }
    }
    res[name] = { mad: +(sum / n).toFixed(4), max, px: n / 3,
      meanOn: +(la / m).toFixed(2), meanOff: +(lb / m).toFixed(2) };
  }
  // optional visual: A, B and a 4x-amplified difference
  let dumps = null;
  if (dump) {
    const mk = (data) => {
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
      const c2x = c2.getContext('2d');
      c2x.putImageData(new ImageData(new Uint8ClampedArray(data), W, H), 0, 0);
      return c2.toDataURL('image/png');
    };
    const D = new Uint8ClampedArray(A.length);
    for (let i = 0; i < A.length; i += 4) {
      for (let c = 0; c < 3; c++) D[i + c] = Math.min(255, Math.abs(A[i + c] - B[i + c]) * 4);
      D[i + 3] = 255;
    }
    dumps = { on: mk(A), off: mk(B), diff: mk(D) };
  }
  return { res, dumps };
}, [args.pre || '', !!args.dump]);
const { res: out, dumps } = evaled;

if (dumps) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir('shots', { recursive: true });
  for (const [k, v] of Object.entries(dumps)) {
    await writeFile(`shots/_shadow-ab${args.nopcss ? '-nopcss' : ''}-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  }
  console.log('wrote shots/_shadow-ab-{on,off,diff}.png');
}
console.log(`scene ${scene}  shadowMap on vs off, mean |dR|+|dG|+|dB| / 3`);
for (const [k, v] of Object.entries(out)) {
  console.log(`  ${k.padEnd(7)} MAD ${String(v.mad).padEnd(9)} max ${String(v.max).padEnd(4)} meanOn ${String(v.meanOn).padEnd(7)} meanOff ${String(v.meanOff).padEnd(7)} over ${v.px} px`);
}

await browser.close();
server.close();
