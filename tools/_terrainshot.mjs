// Screenshot the car standing on a named surface, to show what each terrain class
// actually looks like. `world.js` surfaceAt() returns only 'tarmac' or 'dirt' (T4:
// the world's ground is a single flat plane, so there is no grass/sand/soil to shoot).
//
//   node tools/_terrainshot.mjs --scene daytime-downtown --x 0 --z 0 --yaw 0 \
//     --out shots/terrain-tarmac.png
//
// Prints the surface class surfaceAt() reports for the position, so the picture and
// the classification cannot disagree silently.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const scene = args.scene || 'daytime-downtown';
const X = +(args.x ?? 0), Z = +(args.z ?? 0), YAW = +(args.yaw ?? 0), SPD = +(args.speed ?? 0);
const out = resolve(args.out || `shots/terrain-${X}-${Z}.png`);
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

const info = await page.evaluate(async ([x, z, yaw, spd]) => {
  const g = window.__game;
  const { surfaceAt } = await import('./world.js');
  // The scene's setup() left physics on followPath (cruise()), so it self-drives away from
  // wherever it is put. Clear the path or the car is never on the surface being shot.
  g.physics.clearPath();
  g.physics.reset({ x, y: 0, z }, yaw, spd);
  // Throttle stays shut: a rolling car leaves the requested spot within a second and the
  // picture then shows a surface that is not the one asked for. Just enough ticks for the
  // suspension to settle and the surface blend (SURFACE_BLEND 6/s) to reach the new class.
  g.physics.setInput({ throttle: 0, brake: 0, steer: 0, boost: false, handbrake: false });
  for (let i = 0; i < 60; i++) g.physics.step(1 / 60);
  // physics.step() moves the SIMULATION. The drawn car and the chase rig are moved by
  // main.js's tick(), which is not reachable from here, so do the same two things it does -
  // without them both shots come back byte-identical to the scene's original framing and the
  // picture silently shows a surface the car is not on.
  const st = g.physics.state;
  g.carRoot.position.set(st.pos.x, st.pos.y, st.pos.z);
  g.carRoot.rotation.set(0, st.yaw, 0);
  g.camRig.update(1 / 60, st);
  g.camRig.snap();
  g.scene.updateMatrixWorld(true);
  const draw = () => (g.composer ? g.composer.render() : g.renderer.render(g.scene, g.camera));
  for (let i = 0; i < 6; i++) draw();
  const s = g.physics.state;
  return {
    surface: surfaceAt(s.pos.x, s.pos.z),
    pos: [+s.pos.x.toFixed(1), +s.pos.z.toFixed(1)],
    speed: +(s.ground ?? s.speed).toFixed(1),
  };
}, [X, Z, YAW, SPD]);

await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`${out}  surface=${info.surface}  pos=${info.pos}  speed=${info.speed} m/s`);
await browser.close();
server.close();
process.exit(0);
