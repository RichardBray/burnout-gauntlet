// _skyprobe.mjs — probe the live sky: LUT taps by elevation, and a cloud-off re-render.
// Derived from tools/shot.mjs (same server + boot), then evaluates in-page.
//   node tools/_skyprobe.mjs [--scene dusk-highway-chase] [--noclouds] [--out shots/x.png]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const scene = args.scene || 'dusk-highway-chase';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const info = await page.evaluate(() => {
  const g = window.__game, sky = g.sky;
  const cam = g.camRig?.camera || g.camera || (g.camRig && g.camRig.cam);
  const out = { fov: cam?.fov, pitchDeg: null, lut: [] };
  if (cam) {
    const m = cam.matrixWorld.elements;
    // -Z column of the world matrix is the view direction
    const y = -m[9];
    out.pitchDeg = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
  }
  if (sky?.sampleLut) {
    for (const e of [0, 3, 6, 10, 15, 21, 30, 45, 70, 89]) {
      const rowA = sky.sampleLut(0.02, e * Math.PI / 180);   // toward sun
      const rowB = sky.sampleLut(0.50, e * Math.PI / 180);   // 90deg from sun
      const rowC = sky.sampleLut(1.00, e * Math.PI / 180);   // anti-sun
      out.lut.push({ e, sun: rowA.map(n=>+n.toFixed(3)), side: rowB.map(n=>+n.toFixed(3)), anti: rowC.map(n=>+n.toFixed(3)) });
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));

const args_noclouds = args.noclouds;
if (args.noclouds) {
  await page.evaluate(async (mode) => {
    window.__probeMode = mode;
    const sky = window.__game.sky;
    const p = sky.PRESETS.dusk;
    const mode2 = window.__probeMode || '';
    if (mode2.includes('c')) { p.clouds.alto = 0; p.clouds.cirrus = 0; p.clouds.low = 0; }
    if (mode2.includes('h')) { p.halo.tightGain = 0; p.halo.wideGain = 0; p.halo.horizon = 0; }
    if (mode2.includes('t')) { p.halo.tightGain = 0; }
    sky.apply('dusk');
    await new Promise(r => setTimeout(r, 600));
    // BROKEN UNTIL WAVE P (sky-lighting). `#shot=1` returns from main() WITHOUT starting an
    // animation loop (main.js:326), so mutating the preset here changed uniforms that nothing
    // ever drew: page.screenshot() returned the pre-mutation frame and every `--noclouds`
    // render this tool ever produced was IDENTICAL to the baseline in every sky region.
    // Verified: `_skyprobe --noclouds c` vs `shot.mjs` matched to 0.1/255 on all five sky
    // regions with alto/cirrus/low forced to 0. Re-render explicitly.
    const g = window.__game;
    g.scene.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) g.composer.render();
    await new Promise(r => requestAnimationFrame(r));
    g.composer.render();
  }, String(args_noclouds));
  const out = resolve(args.out || 'shots/_sky-noclouds.png');
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log('ok ' + out);
}
await browser.close(); server.close();
