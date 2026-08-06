// T2: is a suspect region in a screenshot GEOMETRY or a LIGHTING artefact?
// Boots a scene like shot.mjs, screenshots it, applies a toggle expression against
// `window.__game`, re-renders through the same composer and screenshots again.
// If the suspect vanishes in B it was never geometry and must not be "deleted".
//
//   node tools/_abtoggle.mjs --scene wet-night-asphalt --out /tmp/ab \
//     --toggle "g.sky.sun.castShadow = false"
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const scene = args.scene || 'wet-night-asphalt';
const out = resolve(args.out || 'shots/ab');
const toggle = args.toggle || 'g.sky.sun.castShadow = false';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
await mkdir(out, { recursive: true });
const aBuf = await page.screenshot({ path: join(out, `${scene}-A.png`) });

const applied = await page.evaluate(`(() => {
  const g = window.__game;
  ${toggle};
  // Re-render through the same chain the shot path used: composer if there is one,
  // plain render otherwise. Several frames so nothing is mid-upload.
  const draw = () => (g.composer ? g.composer.render() : g.renderer.render(g.scene, g.camera));
  for (let i = 0; i < 4; i++) draw();
  return true;
})()`);
console.log('toggle applied:', applied);
const bBuf = await page.screenshot({ path: join(out, `${scene}-B.png`) });

// A toggle that changes nothing and a re-render that never reached the canvas look
// IDENTICAL from here, and the first three toggles run through this tool were the
// second kind - the conclusion "hypothesis refuted" was drawn from a stale frame.
// So prove the pixels moved before reporting anything, and if they did not, say the
// run is INVALID rather than letting it read as a null result.
// Byte-inequality is NOT enough: this renderer's temporal jitter makes two frames of an
// unchanged scene differ by a fraction of a level everywhere, so "B != A" was passing for
// toggles that did nothing at all. Measure how much moved, and require a real signal.
console.log(`wrote ${out}/${scene}-A.png and -B.png`);
const diff = await page.evaluate(async ([a, b]) => {
  const load = async (d) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = `data:image/png;base64,${d}`; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  };
  const [A, B] = [await load(a), await load(b)];
  let sum = 0, over = 0, n = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
    sum += d / 3; if (d / 3 > 8) over++; n++;
  }
  return { meanAbs: +(sum / n).toFixed(3), pctOver8: +(100 * over / n).toFixed(2) };
}, [aBuf.toString('base64'), bBuf.toString('base64')]);
console.log(`A vs B: mean abs delta ${diff.meanAbs}/255, ${diff.pctOver8}% of pixels moved by >8`);
// Jitter alone lands near 0 mean with a negligible fraction over 8; a toggle that actually
// did something moves a visible patch of the frame well past that.
if (diff.pctOver8 < 0.05) {
  console.error('INVALID RUN: the frame did not meaningfully change. Either the toggle is a '
    + 'no-op, the handle is wrong, or the re-render never reached the visible canvas. '
    + 'Do NOT read this as "hypothesis refuted".');
  await browser.close(); server.close(); process.exit(2);
}
await browser.close();
server.close();
process.exit(0);
