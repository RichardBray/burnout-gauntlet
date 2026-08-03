// _boostkernel.mjs — read the boost pass's own kernel-length and depth debug buffers
// straight off the GPU, with bloom + output/ACES disabled so the greyscale is linear.
//   uDebug=3 -> lenPix/100      uDebug=4 -> viewDist/300      uDebug=1 -> mask
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const scene = 'boost-blur';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const PROBES = [
  ['sky-topL', 0.16, 0.10], ['sky-topC', 0.50, 0.07], ['sky-topR', 0.84, 0.10],
  ['sky-midL', 0.10, 0.22], ['sky-midR', 0.90, 0.22],
  ['horizon-L', 0.30, 0.47], ['horizon-R', 0.70, 0.47],
  ['midbldg-R', 0.86, 0.45], ['viaduct-mid', 0.20, 0.40], ['viaduct-near', 0.04, 0.34],
  ['tarmac-mid', 0.25, 0.62], ['tarmac-midR', 0.78, 0.62],
  ['tarmac-nearL', 0.12, 0.93], ['tarmac-nearR', 0.90, 0.93],
  ['tarmac-botL', 0.04, 0.98], ['tarmac-botR', 0.97, 0.98],
];

const res = await page.evaluate(async (probes) => {
  const g = window.__game;
  const u = g.boost.pass.uniforms;
  const state = { uAmount: u.uAmount.value, uSpeed01: u.uSpeed01.value, uDepthOn: u.uDepthOn.value,
    uFocus: [u.uFocus.value.x, u.uFocus.value.y], uCarR: u.uCarR.value, uHeroSoft: u.uHeroSoft.value,
    uCamNF: [u.uCamNF.value.x, u.uCamNF.value.y], enabled: g.boost.pass.enabled };
  // linearise the chain: kill everything after the boost pass
  const off = [];
  for (const p of g.composer.passes) {
    const n = p.constructor.name;
    if (p === g.boost.pass) continue;
    if (p.enabled && (n.includes('Output') || n.includes('Bloom') || n.includes('GammaCorrection')
      || p === g.outputPass || p === g.bloom)) { p.enabled = false; off.push(n); }
  }
  const cv = g.renderer.domElement;
  const rd = document.createElement('canvas');
  rd.width = cv.width; rd.height = cv.height;
  const ctx2 = rd.getContext('2d', { willReadFrequently: true });
  const grab = (mode) => {
    u.uDebug.value = mode;
    g.composer.render(); g.composer.render();
    ctx2.clearRect(0, 0, rd.width, rd.height);
    ctx2.drawImage(cv, 0, 0);
    return probes.map(([name, fx, fy]) => {
      const x = Math.round(fx * (rd.width - 1)), y = Math.round(fy * (rd.height - 1));
      // 5x5 median-ish: average of a small box to dodge dither noise
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = Math.min(rd.width - 1, Math.max(0, x + dx)), yy = Math.min(rd.height - 1, Math.max(0, y + dy));
        s += ctx2.getImageData(xx, yy, 1, 1).data[0]; n++;
      }
      return s / n / 255;
    });
  };
  const len = grab(3), dep = grab(4), msk = grab(1);
  u.uDebug.value = 0;
  return { state, off, probes: probes.map(([name, fx, fy], i) => ({
    name, fx, fy, lenPix: len[i] * 100, viewDist: dep[i] * 300, mask: msk[i] })) };
}, PROBES);

console.log('uniforms:', JSON.stringify(res.state));
console.log('disabled after boost pass:', res.off.join(', '));
console.log('name          x     y     viewDist(m)  mask   lenPix');
for (const p of res.probes) {
  console.log(`${p.name.padEnd(13)} ${p.fx.toFixed(2)}  ${p.fy.toFixed(2)}   ${p.viewDist.toFixed(1).padStart(8)}   ${p.mask.toFixed(3)}  ${p.lenPix.toFixed(1).padStart(6)}`);
}
await browser.close(); server.close();
