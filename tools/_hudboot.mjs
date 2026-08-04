// wave-s perf-r4 — boot every configuration the HUD change can reach, exercise every runtime knob
// in both directions, and report hudPath plus console/page errors. `lint ok` does not mean runnable
// (play brief, process rule 4) and this change adds a knob that interacts with three others:
// `#hudgl`, `#hudres`, `#res` and the deviceScaleFactor all decide whether the HUD's backing store
// equals the drawing buffer, which is the condition the in-frame path is gated on.
//
// Each row: boot, drive, all four times of day, wet 1 and 0, a resolution-scale change and back,
// pause and resume, then print the live route and the expectation it was checked against.
//
// usage: node tools/_hudboot.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(process.argv[2] || 'game');
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
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [label, hash, deviceScaleFactor, expected route: 'in' | 'dom']
const CONFIGS = [
  ['default (DOM layer)', 'nomenu=1', 1, 'dom'],
  ['default at dpr 2', 'nomenu=1', 2, 'dom'],
  ['#hudgl=1', 'nomenu=1&hudgl=1', 1, 'in'],
  ['#hudgl=1 at dpr 2', 'nomenu=1&hudgl=1', 2, 'in'],
  ['#hudgl=1&res=0.7 -> falls back', 'nomenu=1&hudgl=1&res=0.7', 1, 'dom'],
  ['#hudgl=1&hudres=2 at dpr 2 -> falls back', 'nomenu=1&hudgl=1&hudres=2', 2, 'dom'],
  ['#hudgl=1&hudres=2 at dpr 1 (hudres inert)', 'nomenu=1&hudgl=1&hudres=2', 1, 'in'],
  ['#hudgl=1&msaa=4 (no FXAA pass)', 'nomenu=1&hudgl=1&msaa=4', 1, 'in'],
  ['#hudgl=1&shadow=0', 'nomenu=1&hudgl=1&shadow=0', 1, 'in'],
  ['#hudgl=1 through the REAL START menu', 'hudgl=1', 1, 'in'],
  ['#hudgl=0 explicit', 'nomenu=1&hudgl=0', 1, 'dom'],
];

let bad = 0;
for (const [label, hash, dsf, want] of CONFIGS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dsf });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html#${hash}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  // The real start-menu path needs the DRIVE button clicked before there is a game loop.
  if (!/nomenu/.test(hash)) {
    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#bgmenu button'))
        .find((x) => /drive|start/i.test(x.textContent || ''));
      if (b) { b.click(); return b.textContent.trim(); }
      return null;
    });
    await sleep(700);
    if (!clicked) errs.push('no DRIVE button found on the start menu');
  }
  await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
  // The route AS BOOTED, before any knob is touched. This is the row's own expectation: the
  // `res=0.7` configuration must be on the DOM layer from the very first frame.
  const boot = await page.evaluate(() => window.__game.hudPath());
  for (const tod of ['dawn', 'midday', 'dusk', 'night']) {
    await page.evaluate((t) => window.__game.applyTimeOfDay(t), tod);
    await sleep(200);
  }
  await page.evaluate(() => window.__game.applyWet(1)); await sleep(250);
  await page.evaluate(() => window.__game.applyWet(0)); await sleep(250);
  // hudPath() reports state that syncHudPath() refreshes once per frame, so it must be read a
  // frame LATER than the change, not in the same evaluate. Reading it in the same tick was a
  // harness bug that reported the wrong route for every row.
  await page.evaluate(() => window.__game.setResScale(0.6));
  await sleep(300);
  const mid = await page.evaluate(() => window.__game.hudPath());
  await page.evaluate((r) => window.__game.setResScale(r), 1);
  await sleep(300);
  await page.evaluate(() => window.__game.setPaused(true)); await sleep(300);
  await page.evaluate(() => window.__game.setPaused(false)); await sleep(300);
  await page.keyboard.press('KeyC'); await sleep(600);
  const p = await page.evaluate(() => ({ hudPath: window.__game.hudPath(), rs: window.__game.renderSize(),
    vis: window.__game.hud.visible, gen: window.__game.hud.generation }));
  const route = boot.inFrame ? 'in' : 'dom';
  const endRoute = p.hudPath.inFrame ? 'in' : 'dom';
  // Whatever the route, the res-scale detour must have taken the DOM layer, because at 0.6 the
  // drawing buffer is smaller than the HUD's backing store.
  const detourOk = mid.inFrame === false;
  const ok = route === want && detourOk && errs.length === 0 && p.vis && p.gen > 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(42)} dpr ${dsf} booted ${route} (want ${want}) | res-0.6 detour ${mid.inFrame ? 'in' : 'dom'} | after resume ${endRoute} | buffer ${p.rs.w}x${p.rs.h} ratio ${p.rs.pixelRatio} | hudCanvas ${p.hudPath.hudCanvas.join('x')} | visible ${p.vis} gen ${p.gen} | errors ${errs.length}`);
  if (errs.length) console.log('     ' + errs.slice(0, 4).join('\n     '));
  await page.close();
}
console.log(bad ? `\n${bad} configuration(s) FAILED` : '\nall configurations ok');
await browser.close(); server.close(); process.exit(bad ? 1 : 0);
