// _s3c-spawn.mjs — S3c acceptance: every gate scene must spawn the hero ON TARMAC, and the whole
// city driving line must be on tarmac too.
//
//   node tools/_s3c-spawn.mjs [--hash map=graph]
//
// Decision 7 exists because all seven scenes spawn through `world.paths`. A path that leaves the
// road network is not a cosmetic defect: T4's off-road penalty fires on the first frame of the
// scene's own screenshot, and the hero can spawn inside a building.
//
// Three things are asserted, and the third is the one a spawn check alone would miss:
//   1. `world.surfaceAt` at each scene's TRUE SPAWN, `paths[name].at(u)` for the (path, u) each
//      scene passes to `cruise()`. It is NOT `physics.state.pos`: the harness can only be read
//      after `window.__ready`, by which time shot mode has already simulated up to 9.5 s of
//      driving, so that position is where the car ENDED. The first version of this check read it
//      and reported `hud-overlay` spawning on dirt when it spawns on tarmac and drives off later.
//      The table below is transcribed from `scenes.js`; `crash-cam` and `car-paint-closeup` do
//      not cruise a path at all and are placed directly, so they have no spawn row.
//   2. where the car actually ENDED, and its distance from the path, reported separately;
//   3. EVERY ONE of `paths.city`'s and `paths.highway`'s 900 samples is on tarmac. `makePath`
//      runs a Catmull-Rom THROUGH its control points, so control points on the road do not imply
//      a curve on the road - the spline overshoots at a sharp corner between two long segments.
//      Checking the control points would pass on a curve that bulges through a building.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve as rp } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; }));
const hash = args.hash === undefined ? 'map=graph' : (args.hash === true ? '' : args.hash);
// scene -> the (path, u) it hands `cruise()` at scenes.js:91, :110, :169, :186, :231. null = the
// scene places the car directly and never touches a path.
const SCENES = {
  'dusk-highway-chase': ['highway', 0.30],
  'boost-blur': ['highway', 0.22],
  'crash-cam': null,
  'wet-night-asphalt': ['city', 0.565],
  'daytime-downtown': ['city', 0.815],
  'car-paint-closeup': null,
  'hud-overlay': ['city', 0.34],
};
const IDS = Object.keys(SCENES);
const root = rp(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal'] });

let fails = 0;
for (const scene of IDS) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const h = ['shot=1', `scene=${scene}`, hash].filter(Boolean).join('&');
  await page.goto(`http://127.0.0.1:${port}/#${h}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
  const r = await page.evaluate((spec) => {
    const g = window.__game;
    const w = g.world, sa = w.surfaceAt;
    const p = g.physics.state.pos;
    const scan = (path) => {
      let off = 0, first = null;
      for (const s of path.samples) {
        if (sa(s.x, s.z) !== 'tarmac') { off++; if (!first) first = [+s.x.toFixed(1), +s.z.toFixed(1)]; }
      }
      return { n: path.samples.length, off, first, len: Math.round(path.length) };
    };
    const out = {
      end: [+p.x.toFixed(1), +p.z.toFixed(1)],
      endSurf: sa(p.x, p.z),
      city: scan(w.paths.city), highway: scan(w.paths.highway),
      stats: w.paths.stats,
    };
    if (spec) {
      const path = w.paths[spec[0]];
      const s = path.at(spec[1]);
      out.spawn = [+s.x.toFixed(1), +s.z.toFixed(1)];
      out.spawnSurf = sa(s.x, s.z);
      out.endOff = +path.nearest(p).dist.toFixed(1);
    }
    return out;
  }, SCENES[scene]);
  // The PASS criterion is the spawn and the two paths. Where the car ends after up to 9.5 s of
  // its own driving is reported, not asserted: leaving the racing line at 214 km/h is a handling
  // result, not a map one, and gating on it would make this check fail for the wrong reason.
  const ok = (r.spawnSurf === undefined || r.spawnSurf === 'tarmac')
    && r.city.off === 0 && r.highway.off === 0;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${scene.padEnd(20)}`
    + ` spawn ${r.spawn ? JSON.stringify(r.spawn).padEnd(18) + ' ' + r.spawnSurf : '(placed directly)'}`
    + ` | end ${JSON.stringify(r.end)} ${r.endSurf}${r.endOff !== undefined ? ` ${r.endOff} m off path` : ''}`
    + ` | city ${r.city.n - r.city.off}/${r.city.n} tarmac (${r.city.len} m)`
    + ` highway ${r.highway.n - r.highway.off}/${r.highway.n} (${r.highway.len} m)`
    + (r.city.first ? ` firstOffCity ${JSON.stringify(r.city.first)}` : '')
    + (r.highway.first ? ` firstOffHw ${JSON.stringify(r.highway.first)}` : ''));
  if (scene === IDS[0]) console.log('  paths.stats', JSON.stringify(r.stats));
  await page.close();
}
console.log(fails ? `FAIL ${fails}/${IDS.length}` : `PASS ${IDS.length}/${IDS.length}`);
await browser.close();
server.close();
