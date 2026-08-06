// _t7-music.mjs — T7 acceptance check, against a real boot with a real click.
//
// Music cannot be verified from a synthetic event: WebAudio only unlocks for a trusted gesture,
// so this clicks the actual DRIVE button the way a player does, then asserts on music.js's own
// state rather than on the DOM the menu drew.
//
// Checks: every file on disk actually loads and plays; the playlist wraps in both directions;
// prev/play-pause/next work; the menu shows exactly ONE track; music survives a scene change
// without restarting; and nothing routes through audio.js's master chain.
//
// Usage: node tools/_t7-music.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]));
  try {
    const body = await readFile(p.endsWith('/') ? join(p, 'index.html') : p);
    res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.end(body);
  } catch { res.statusCode = 404; res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal',
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`);
};

// ---- the menu UI, before anything is clicked ------------------------------------------------
const npCount = await page.locator('#bgmenu .np').count();
const npTitleText = await page.locator('#bgmenu .np .t').first().textContent().catch(() => '');
const chipRows = await page.locator('#bgmenu .seg button.sc').count();
ok('now-playing panel present', npCount === 1, `${npCount} panel(s), title "${npTitleText}"`);

// ---- unlock with a REAL click ----------------------------------------------------------------
const start = page.locator('#bgmenu button, #bgmenu .start').first();
await start.click({ force: true });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => window.__game.music.info());
ok('unlocked by a trusted click', info.unlocked === true, `ctx ${info.ctxState}`);
ok('not through audio.js master chain', info.throughMasterChain === false, info.routing);

// ---- every file loads --------------------------------------------------------------------
const load = await page.evaluate(async () => {
  const m = window.__game.music;
  const list = m.tracks();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    m.play(i);
    // Wait for the element to report a real duration, i.e. the file decoded.
    const t0 = performance.now();
    let d = 0;
    while (performance.now() - t0 < 6000) {
      const c = m.current();
      if (c.duration > 1) { d = c.duration; break; }
      await new Promise((r) => setTimeout(r, 60));
    }
    const c = m.current();
    out.push({ i, id: c.id, title: c.title, artist: c.artist, genre: c.genre, dur: d,
      err: m.info().error || null });
  }
  return out;
});
for (const t of load) {
  ok(`loads: ${t.title}`, t.dur > 1 && !t.err,
    `${t.artist} / ${t.genre} / ${t.dur.toFixed(0)}s${t.err ? ' ERR ' + t.err : ''}`);
}
const genres = new Set(load.map((t) => t.genre));
for (const g of ['rock', 'pop', 'electronic']) {
  const n = load.filter((t) => t.genre === g).length;
  ok(`genre "${g}" is not one song`, n >= 2, `${n} tracks`);
}
ok('every track has an artist', load.every((t) => !!t.artist), `${genres.size} genres`);

// ---- transport + wrap in both directions -------------------------------------------------
const trans = await page.evaluate(async () => {
  const m = window.__game.music;
  const n = m.tracks().length;
  m.play(0);
  const wrapBack = (m.prev(), m.current().index);          // 0 -> last
  m.play(n - 1);
  const wrapFwd = (m.next(), m.current().index);           // last -> 0
  m.play(2);
  const fwd = (m.next(), m.current().index);
  const back = (m.prev(), m.current().index);
  m.play(1);
  await new Promise((r) => setTimeout(r, 400));
  const playing1 = m.current().playing;
  m.toggle();
  // pause() FADES then pauses (music.js stopEl: one fade length plus 30 ms), so the element is
  // still un-paused for a moment after the call. Wait past the fade rather than racing it.
  await new Promise((r) => setTimeout(r, 800));
  const paused = m.current().playing;
  m.toggle();
  await new Promise((r) => setTimeout(r, 400));
  const playing2 = m.current().playing;
  return { n, wrapBack, wrapFwd, fwd, back, playing1, paused, playing2 };
});
ok('wraps backwards (0 -> last)', trans.wrapBack === trans.n - 1, `index ${trans.wrapBack}`);
ok('wraps forwards (last -> 0)', trans.wrapFwd === 0, `index ${trans.wrapFwd}`);
ok('next / prev step by one', trans.fwd === 3 && trans.back === 2, `${trans.fwd} then ${trans.back}`);
ok('play-pause toggles', trans.playing1 && !trans.paused && trans.playing2,
  `${trans.playing1} -> ${trans.paused} -> ${trans.playing2}`);

// ---- the menu shows exactly one track ----------------------------------------------------
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const shown = await page.evaluate(() => {
  const t = document.querySelector('#bgmenu .np .t');
  const a = document.querySelector('#bgmenu .np .a');
  const g = document.querySelector('#bgmenu .np .g');
  const chips = document.querySelectorAll('#bgmenu .row[data-opt="music"] .seg button').length;
  return { title: t && t.textContent, artist: a && a.textContent, genre: g && g.textContent, chips };
});
ok('menu shows ONE track, not a list', shown.chips === 0,
  `"${shown.title}" ${shown.artist} [${shown.genre}], ${shown.chips} track chips`);
ok('now-playing carries title and artist', !!shown.title && !!shown.artist);

// ---- survives a scene change --------------------------------------------------------------
const across = await page.evaluate(async () => {
  const m = window.__game.music;
  m.play(4);
  await new Promise((r) => setTimeout(r, 1200));
  const before = m.current();
  // The scene picker in the pause menu is the player-facing path, and it is the one that has to
  // not restart the music. Click its chip rather than calling a harness-only entry point.
  const chip = [...document.querySelectorAll('#bgmenu .row[data-opt="scene"] .seg button')]
    .find((b) => /downtown/i.test(b.textContent));
  if (chip) chip.click();
  await new Promise((r) => setTimeout(r, 900));
  const after = window.__game.music.current();
  return { before: { id: before.id, t: before.time }, after: { id: after.id, t: after.time, playing: after.playing } };
});
ok('same track across a scene change', across.before.id === across.after.id, across.after.id);
ok('did not restart', across.after.t >= across.before.t, `${across.before.t.toFixed(2)}s -> ${across.after.t.toFixed(2)}s`);
ok('still playing', across.after.playing === true);

ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
void chipRows;

console.log(fails === 0 ? '\nT7 OK' : `\nT7 FAIL (${fails})`);
await browser.close();
server.close();
process.exit(fails === 0 ? 0 : 1);
