import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
const scene = 'daytime-downtown';
const root = resolve(dirname(new URL(import.meta.url).pathname), '/Users/robray/fc/demos/burnout-gauntlet/game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try { const p = decodeURIComponent(req.url.split('?')[0]);
    const f = join(root, p === '/' ? '/index.html' : p);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', e => console.log('[err]', String(e)));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
const r = await page.evaluate(() => {
  const g = window.__game, sh = g.sky.sun.shadow, rt = sh.map;
  const N = 512, w = rt.width;
  const buf = new Uint8Array(4 * w * w);
  g.renderer.readRenderTargetPixels(rt, 0, 0, w, w, buf);
  const UD = 255/256, uf = [UD/256, UD/65536, UD/16777216, UD];
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const cx = cv.getContext('2d'); const img = cx.createImageData(N, N);
  const hist = new Array(20).fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sx = Math.floor(x * w / N), sy = Math.floor((N-1-y) * w / N);
    const i = (sy * w + sx) * 4;
    const d = (buf[i]/255)*uf[0] + (buf[i+1]/255)*uf[1] + (buf[i+2]/255)*uf[2] + (buf[i+3]/255)*uf[3];
    hist[Math.min(19, Math.floor(d*20))]++;
    const v = Math.round(Math.min(1, Math.max(0, d)) * 255);
    const o = (y*N+x)*4; img.data[o]=v; img.data[o+1]=v; img.data[o+2]=v; img.data[o+3]=255;
  }
  cx.putImageData(img, 0, 0);
  return { png: cv.toDataURL('image/png'), hist };
});
await writeFile('/Users/robray/fc/demos/burnout-gauntlet/shots/_shadowmap.png', Buffer.from(r.png.split(',')[1], 'base64'));
console.log(JSON.stringify(r.hist));
await browser.close(); server.close();
