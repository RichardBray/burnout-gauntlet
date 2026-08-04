// wave-s/perf-critic-r3 — a LIVE (in-play) screenshot, because two of this commit's changes are
// invisible to tools/shot.mjs by construction:
//   - renderer.shadowMap.autoUpdate = false is set AFTER the shotMode early return, so the
//     deterministic screenshot path still rasters the map per render. The one-raster-per-frame
//     gate is therefore completely untested by the repo's regression gate.
//   - the HUD's backing store only differs at deviceScaleFactor 2, which shot.mjs never uses.
// Also runs a boot/console-error sweep over the runtime knobs.
//
// usage: node tools/_pc3live.mjs --root <dir> --out x.png [--kill NAME] [--tod midday] [--wet 0]
//        [--dsf 1] [--hash hudres=2] [--sweep 1]
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const ROOT = resolve(arg('root', 'game'));
const OUT = arg('out', '');
const KILL = arg('kill', '');
const TOD = arg('tod', 'midday');
const WET = arg('wet', '0');
const DSF = +arg('dsf', 1);
const EXTRA = arg('hash', '');
const SWEEP = arg('sweep', '') === '1';
const PATH = arg('path', 'city');
const U = +arg('u', 0.34);

const KILLS = {
  'shadow-multi': () => { window.__game.renderer.shadowMap.autoUpdate = true; },
  'sky-old': () => { const m = window.__game.sky.skyMesh; m.renderOrder = -1000; m.material.depthTest = false; m.material.needsUpdate = true; },
};

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
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(hash, dsf) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dsf });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  return { page, errs };
}

if (!SWEEP) {
  const { page, errs } = await boot(`#nomenu=1&res=1.0${EXTRA ? '&' + EXTRA : ''}`, DSF);
  await page.evaluate((t) => window.__game.applyTimeOfDay(t), TOD);
  await page.evaluate((w) => window.__game.applyWet(+w), WET);
  // A FIXED pose, so two runs are comparable: place, then freeze physics by lifting all keys and
  // waiting for the follow servo to settle, then hold the pose with the sim still running.
  await page.evaluate(([p, u]) => {
    const g = window.__game;
    const path = g.world.paths[p];
    g.physics.placeOnPath(path, +u, 0);
    g.physics.clearPath();
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  }, [PATH, U]);
  if (KILL) await page.evaluate(`(${KILLS[KILL].toString()})()`);
  await sleep(2500);
  const st = await page.evaluate(() => ({
    shadow: `${window.__game.sky.sun.shadow.mapSize.x} auto=${window.__game.renderer.shadowMap.autoUpdate}`,
    sky: `${window.__game.sky.skyMesh.renderOrder}/${window.__game.sky.skyMesh.material.depthTest}`,
    canvases: Array.from(document.querySelectorAll('canvas')).map((c) => `${c.width}x${c.height}`).join(' '),
    pos: window.__game.physics.state.pos,
  }));
  const buf = await page.screenshot({ type: 'png' });
  await writeFile(OUT, buf);
  console.log(`${OUT} kill=${KILL || 'none'} tod=${TOD} wet=${WET} dsf=${DSF} | ${JSON.stringify(st)} | errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  await page.close();
} else {
  const CONFIGS = [
    ['#nomenu=1&res=1.0', 1], ['#nomenu=1&res=1.0', 2], ['', 1],
    ['#nomenu=1&hudres=2', 1], ['#nomenu=1&shadow=2048', 1], ['#nomenu=1&shadow=0', 1],
    ['#nomenu=1&audiowarm=0', 1], ['#nomenu=1&msaa=4', 1], ['#nomenu=1&res=0.7', 1],
  ];
  for (const [hash, dsf] of CONFIGS) {
    const { page, errs } = await boot(hash || '#', dsf);
    if (!hash) {
      // the real player path: click START in the menu
      try { await page.evaluate(() => { const b = document.querySelector('#menu button, .menu button, button'); if (b) b.click(); }); } catch { /* */ }
    }
    for (const tod of ['dawn', 'midday', 'dusk', 'night']) {
      await page.evaluate((t) => window.__game.applyTimeOfDay(t), tod);
      await page.evaluate(() => window.__game.applyWet(1));
      await sleep(250);
      await page.evaluate(() => window.__game.applyWet(0));
      await sleep(150);
    }
    await page.evaluate(() => window.__game.setResScale(0.7));
    await sleep(200);
    await page.evaluate(() => window.__game.setResScale(1.0));
    await page.evaluate(() => window.__game.setPaused(true));
    await sleep(200);
    await page.evaluate(() => window.__game.setPaused(false));
    await page.keyboard.down('KeyW'); await sleep(600); await page.keyboard.up('KeyW');
    const st = await page.evaluate(() => ({
      shadow: window.__game.sky.sun.shadow.mapSize.x,
      canvases: Array.from(document.querySelectorAll('canvas')).map((c) => `${c.width}x${c.height}`).join(' '),
      warm: window.__warmStats, audioWarm: window.__audioWarmMs === undefined ? null : window.__audioWarmMs,
    }));
    console.log(`boot "${hash || '(START menu)'}" dsf=${dsf}: errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''} | ${JSON.stringify(st)}`);
    await page.close();
  }
}
await browser.close(); server.close(); process.exit(0);
