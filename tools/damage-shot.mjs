// Damage-inspection harness (owned by the damage.js work).
// Boots a scene, runs an arbitrary damage expression against window.__game, re-renders
// and screenshots. Lets the panel deformation be judged close up instead of from the
// crash-cam's 10 m orbit.
//
//   node tools/damage-shot.mjs --scene car-paint-closeup --out shots/x.png \
//     --do "d.setLevel(0.75)" [--cam "4.3,1.1,2.3|0,0.85,0.2|36"]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const scene = args.scene || 'car-paint-closeup';
const out = resolve(args.out || 'shots/_damage-inspect.png');
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
// Viewport was HARDCODED 1600x1000 here through wave N and silently ignored --w/--h,
// which voided every absolute-pixel claim ever made through this tool. Default is kept at
// 1600x1000 so that older FRACTIONAL-region numbers remain comparable.
const vpW = Number(args.w) || 1600;
const vpH = Number(args.h) || 1000;
const page = await browser.newPage({ viewport: { width: vpW, height: vpH }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[error]', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const info = await page.evaluate(({ code, cam }) => {
  const g = window.__game;
  const d = g.damage;
  const THREE = g.camera.constructor === Object ? null : null;
  void THREE;
  d.reset();
  // eslint-disable-next-line no-new-func
  new Function('g', 'd', 'car', code)(g, d, g.car);
  if (cam) {
    const [o, t, f] = cam.split('|');
    const [ox, oy, oz] = o.split(',').map(Number);
    const [tx, ty, tz] = t.split(',').map(Number);
    // offsets are in the CAR's frame, so a three-quarter view stays a three-quarter
    // view whatever heading the scene dropped the car on
    const car = g.car.group;
    car.updateMatrixWorld(true);
    const eye = g.camera.position.clone().set(ox, oy, oz);
    const aim = g.camera.position.clone().set(tx, ty, tz);
    car.localToWorld(eye);
    car.localToWorld(aim);
    g.camera.position.copy(eye);
    g.camera.lookAt(aim);
    g.camera.fov = Number(f) || 36;
    g.camera.updateProjectionMatrix();
  }
  g.scene.updateMatrixWorld(true);
  for (let i = 0; i < 3; i++) g.composer.render();
  return { level: d.level };
}, { code: args.do || 'd.setLevel(0.75)', cam: args.cam || null });

await new Promise((r) => setTimeout(r, 120));
await page.evaluate(() => window.__game.composer.render());
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`ok ${out} ${JSON.stringify(info)}`);
await browser.close();
server.close();
