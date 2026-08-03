// wave-s/menu-music-critic's OWN instrument. Deliberately does not import or reuse
// tools/_menumusic.mjs (the builder's harness): every number below is re-derived from
// scratch, and the audibility number is derived WITHOUT music.probe() as well as with it.
//
// Sections, selectable as argv[2]: audible | routing | sliders | transport | persist |
//                                 defects | breakit | controls | all
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.png': 'image/png', '.md': 'text/plain' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'accept-ranges': 'bytes' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const which = process.argv[2] || 'all';
const want = (s) => which === 'all' || which === s;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
let fails = 0;
const log = (...a) => console.log(a.join(' '));
const ok = (name, pass, detail) => {
  if (!pass) fails++;
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail === undefined ? '' : detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(hash, viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  return { page, errs };
}

// My own sampler. Takes n windows off music.probe() and returns the mean of the LINEAR rms,
// converted to dB once at the end (averaging dB is not the same thing and flatters quiet bars).
const sampleMusic = (page, n = 24, gap = 50) => page.evaluate(async ({ n, gap }) => {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = window.__game.music.probe();
    if (p) rows.push(p);
    await new Promise((r) => setTimeout(r, gap));
  }
  if (!rows.length) return null;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
  const rms = mean(rows.map((r) => r.rms));
  return { n: rows.length, rms, rmsDb: db(rms), peak: Math.max(...rows.map((r) => r.peak)),
    peakDb: db(Math.max(...rows.map((r) => r.peak))), gainValue: rows[rows.length - 1].gainValue };
}, { n, gap });

// ---------------------------------------------------------------------------
// 1. AUDIBLE — derived independently of music.probe()
// ---------------------------------------------------------------------------
if (want('audible')) {
  log('\n=== 1. AUDIBILITY, RE-DERIVED ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');

  // (a) The file's OWN loudness, decoded by me, with no reference to the game's graph at all.
  const files = await page.evaluate(async () => {
    const AC = window.AudioContext;
    const out = [];
    for (const f of ['music/santa-in-a-hurry.mp3', 'music/stormy-weather.mp3', 'music/bring-me-up-higher.mp3']) {
      const buf = await (await fetch(f)).arrayBuffer();
      const octx = new AC({ sampleRate: 44100 });
      const ab = await octx.decodeAudioData(buf);
      const ch = ab.getChannelData(0);
      // Whole-file RMS and peak, plus the first 6 s (which is what a 1.2 s probe window
      // near the start of playback is actually looking at).
      let s = 0, pk = 0;
      for (let i = 0; i < ch.length; i++) { const v = ch[i]; s += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
      const nHead = Math.min(ch.length, 44100 * 8);
      let sh = 0;
      for (let i = 0; i < nHead; i++) sh += ch[i] * ch[i];
      const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
      out.push({ f, seconds: +ab.duration.toFixed(1), rms: Math.sqrt(s / ch.length),
        rmsDb: +db(Math.sqrt(s / ch.length)).toFixed(2), peakDb: +db(pk).toFixed(2),
        head8sRmsDb: +db(Math.sqrt(sh / nHead)).toFixed(2) });
      await octx.close();
    }
    return out;
  });
  for (const f of files) log('  FILE ' + JSON.stringify(f));
  const spread = Math.max(...files.map((f) => f.rmsDb)) - Math.min(...files.map((f) => f.rmsDb));
  log(`  inter-track RMS spread: ${spread.toFixed(2)} dB`);

  // (b) The game's own post-gain level, after a real DRIVE click.
  await page.click('#bgmenu .go');
  await sleep(3000);
  const info = await page.evaluate(() => window.__game.music.info());
  log('  info(): ' + JSON.stringify(info));
  const live = await sampleMusic(page, 30, 45);
  log('  probe(): ' + JSON.stringify(live));
  ok('post-gain music RMS is not the -50 dBFS inaudible failure',
    live && live.rmsDb > -30, `${live && live.rmsDb.toFixed(2)} dBFS RMS, peak ${live && live.peakDb.toFixed(2)}`);

  // (c) THE CROSS-CHECK. Predicted post-gain dB = file head dB + 20log10(gain).
  const trk = files.find((f) => f.f.includes(info.id));
  const predicted = trk.head8sRmsDb + 20 * Math.log10(info.gainValue || 1e-9);
  log(`  predicted from the decoded file: ${trk.head8sRmsDb} dBFS + ${(20 * Math.log10(info.gainValue)).toFixed(2)} dB gain = ${predicted.toFixed(2)} dBFS`);
  ok('probe() agrees with an independently decoded MP3 within 6 dB',
    Math.abs(live.rmsDb - predicted) < 6,
    `probe ${live.rmsDb.toFixed(2)} vs predicted ${predicted.toFixed(2)} (delta ${(live.rmsDb - predicted).toFixed(2)} dB)`);

  // (d) Is the ELEMENT actually advancing? A gain reading is worthless if playback is stalled.
  const t0 = await page.evaluate(() => window.__game.music.current().time);
  await sleep(1500);
  const t1 = await page.evaluate(() => window.__game.music.current().time);
  ok('playback position is advancing (not a stalled element)', t1 - t0 > 1.0, `${t0.toFixed(2)} -> ${t1.toFixed(2)} s`);

  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. ROUTING — kill-controls in BOTH directions, with my own analyser on audio.js
// ---------------------------------------------------------------------------
if (want('routing')) {
  log('\n=== 2. ROUTING, KILL-CONTROLS BOTH WAYS ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(2500);
  // Drive so the engine is loud: SFX has to be a real signal for the reverse kill-control.
  await page.keyboard.down('KeyW');
  await sleep(3000);

  // My own analyser on audio.js's OWN context. I do not have its master node, so I tap the
  // destination-adjacent path the only way a page can: create an analyser on audio.ctx and
  // connect audio.js's master into it. master is private, so instead I use the fact that
  // audio.js's context has exactly one destination and read the context's own state plus a
  // MediaStreamDestination capture of the whole context.
  const sfxReady = await page.evaluate(async () => {
    const a = window.__audio;
    if (!a || !a.ctx) return { ok: false, why: 'no audio ctx' };
    // Tap the WHOLE context by re-routing nothing: create a MediaStreamDestination and an
    // analyser, then walk from destination is impossible. Instead: capture the page's audio
    // via an analyser fed by a MediaElementSource is not applicable either. So we use the
    // documented seam: audio.js's api exposes `ctx`; every voice lands on `master` which
    // lands on `ctx.destination`. We cannot insert. We therefore measure SFX by its own
    // reported masterVol AND by the observable effect of setVolume on the context, and use
    // the MUSIC probe (a real signal measurement) for the coupling test.
    return { ok: true, state: a.ctx.state, sr: a.ctx.sampleRate, vol: a.getVolume ? a.getVolume() : null };
  });
  log('  audio.js ctx: ' + JSON.stringify(sfxReady));

  // KILL-CONTROL A: interleave audio.js's master 0 / 0.62 four times, measuring music each time.
  const arms = { hi: [], lo: [] };
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__audio.setVolume(0.62));
    await sleep(350);
    arms.hi.push((await sampleMusic(page, 10, 40)).rmsDb);
    await page.evaluate(() => window.__audio.setVolume(0));
    await sleep(350);
    arms.lo.push((await sampleMusic(page, 10, 40)).rmsDb);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
  log(`  SFX 0.62 arm: [${arms.hi.map((v) => v.toFixed(2))}] mean ${mean(arms.hi).toFixed(2)} sd ${sd(arms.hi).toFixed(2)}`);
  log(`  SFX 0.00 arm: [${arms.lo.map((v) => v.toFixed(2))}] mean ${mean(arms.lo).toFixed(2)} sd ${sd(arms.lo).toFixed(2)}`);
  const delta = Math.abs(mean(arms.hi) - mean(arms.lo));
  const overlap = Math.max(...arms.lo) > Math.min(...arms.hi) && Math.max(...arms.hi) > Math.min(...arms.lo);
  ok('muting audio.js master does not move the music (delta < 1.5 dB and arms overlap)',
    delta < 1.5 && overlap, `delta ${delta.toFixed(3)} dB, arms overlap ${overlap}`);

  // KILL-CONTROL B: audio.stop() CLOSES audio.js's context. Music must survive.
  await page.evaluate(() => window.__audio.setVolume(0.62));
  await sleep(300);
  const before = await sampleMusic(page, 10, 40);
  await page.evaluate(() => window.__audio.stop && window.__audio.stop());
  await sleep(1200);
  const after = await sampleMusic(page, 10, 40);
  const states = await page.evaluate(() => ({
    sfx: window.__audio.ctx ? window.__audio.ctx.state : 'null',
    music: window.__game.music.info().ctxState,
    playing: window.__game.music.info().playing,
  }));
  log('  states after audio.stop(): ' + JSON.stringify(states));
  ok('music survives audio.stop() (which closes audio.js\'s context)',
    states.music === 'running' && states.playing && after.rmsDb > -30,
    `sfx ctx ${states.sfx}, music ${before.rmsDb.toFixed(2)} -> ${after.rmsDb.toFixed(2)} dBFS`);

  // POSITIVE CONTROL: the probe reads the REAL signal, so killing music collapses it.
  await page.evaluate(() => window.__game.music.setMusicVolume(0));
  await sleep(600);
  const muted = await sampleMusic(page, 10, 40);
  ok('positive control: setMusicVolume(0) collapses the same measurement',
    muted.rmsDb < after.rmsDb - 30, `${after.rmsDb.toFixed(2)} -> ${muted.rmsDb.toFixed(2)} dBFS`);

  // LINEARITY: a halving must cost ~6.02 dB. A gain that is not in the path cannot do this.
  await page.evaluate(() => window.__game.music.setMusicVolume(0.5));
  await sleep(700);
  const g50 = await sampleMusic(page, 14, 40);
  await page.evaluate(() => window.__game.music.setMusicVolume(0.25));
  await sleep(700);
  const g25 = await sampleMusic(page, 14, 40);
  ok('halving the music gain costs 6.02 +/- 1.5 dB',
    Math.abs((g50.rmsDb - g25.rmsDb) - 6.02) < 1.5,
    `${g50.rmsDb.toFixed(2)} -> ${g25.rmsDb.toFixed(2)} = ${(g50.rmsDb - g25.rmsDb).toFixed(2)} dB`);

  // REVERSE DIRECTION: does muting MUSIC touch the SFX side? The only observable I have
  // without inserting a node is audio.js's own master gain param value, read off the graph.
  const rev = await page.evaluate(async () => {
    const a = window.__audio;
    const v0 = a.getVolume();
    window.__game.music.setMusicVolume(0);
    await new Promise((r) => setTimeout(r, 400));
    const v1 = a.getVolume();
    window.__game.music.setMusicVolume(0.5);
    await new Promise((r) => setTimeout(r, 400));
    return { v0, v1, v2: a.getVolume(), ctxState: a.ctx ? a.ctx.state : 'null' };
  });
  log('  reverse: ' + JSON.stringify(rev));
  ok('moving the music gain does not move audio.js\'s master volume',
    rev.v0 === rev.v1 && rev.v1 === rev.v2, JSON.stringify(rev));

  await page.keyboard.up('KeyW');
  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2b. THE DESTINATION TAP — my own instrument, independent of music.probe()
//
// I cannot reach audio.js's private `master` node, so instead I patch
// AudioNode.prototype.connect BEFORE the page builds any graph and record every node that
// connects to an AudioDestinationNode, on every context. Then I hang my OWN AnalyserNode off
// each of them. That gives me a real signal measurement of BOTH sides — the SFX master sum
// and the music gain — with no cooperation from either module, so the kill-control can be run
// in both directions on measured audio rather than on a reported variable.
// ---------------------------------------------------------------------------
if (want('tap')) {
  log('\n=== 2b. INDEPENDENT DESTINATION TAP, BOTH DIRECTIONS ===');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => {
    window.__taps = [];
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = orig.call(this, dest, ...rest);
      try {
        if (dest && typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
          window.__taps.push({ node: this, ctx: dest.context, an: null, buf: null });
        }
      } catch (e) { /* noop */ }
      return r;
    };
    window.__tapRead = () => window.__taps.map((t, i) => {
      if (t.ctx.state === 'closed') return { i, closed: true };
      if (!t.an) {
        t.an = t.ctx.createAnalyser();
        t.an.fftSize = 2048;
        orig.call(t.node, t.an);
        t.buf = new Float32Array(t.an.fftSize);
      }
      t.an.getFloatTimeDomainData(t.buf);
      let s = 0, pk = 0;
      for (let k = 0; k < t.buf.length; k++) { const v = t.buf[k]; s += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
      return { i, rms: Math.sqrt(s / t.buf.length), peak: pk, sr: t.ctx.sampleRate, state: t.ctx.state };
    });
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#scene=dusk-highway-chase`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });

  const tapsPre = await page.evaluate(() => window.__taps.length);
  log('  destination-connecting nodes before any gesture: ' + tapsPre);
  await page.click('#bgmenu .go');
  await sleep(2500);
  await page.keyboard.down('KeyW');
  await sleep(3500);
  const shape = await page.evaluate(() => window.__taps.map((t, i) => ({ i, sr: t.ctx.sampleRate, same: t.ctx === (window.__audio.ctx || null) })));
  log('  destination-connecting nodes after the gesture: ' + JSON.stringify(shape));
  ok('exactly two nodes reach a destination, on two DIFFERENT contexts',
    shape.length === 2 && shape.filter((s) => s.same).length === 1, JSON.stringify(shape));

  // mean of many windows, per tap
  const readTaps = (n = 16, gap = 45) => page.evaluate(async ({ n, gap }) => {
    const acc = [];
    for (let i = 0; i < n; i++) {
      const rows = window.__tapRead();
      rows.forEach((r, k) => { acc[k] = acc[k] || { rms: [], peak: [] }; if (!r.closed) { acc[k].rms.push(r.rms); acc[k].peak.push(r.peak); } });
      await new Promise((r) => setTimeout(r, gap));
    }
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    return acc.map((a, i) => ({ i, rmsDb: +db(mean(a.rms)).toFixed(2), peakDb: +db(Math.max(0, ...a.peak)).toFixed(2) }));
  }, { n, gap });

  const which_ = await page.evaluate(() => window.__taps.map((t) => (t.ctx === window.__audio.ctx ? 'SFX' : 'MUSIC')));
  log('  tap identity: ' + JSON.stringify(which_));
  const iSfx = which_.indexOf('SFX'), iMus = which_.indexOf('MUSIC');

  const base = await readTaps();
  log('  both up:            ' + JSON.stringify(base));
  ok('the SFX master sum is a real, audible signal', base[iSfx].rmsDb > -45, `${base[iSfx].rmsDb} dBFS RMS`);
  ok('the music gain is a real, audible signal', base[iMus].rmsDb > -30, `${base[iMus].rmsDb} dBFS RMS`);

  // DIRECTION A: kill SFX, music must not move.
  await page.evaluate(() => window.__audio.setVolume(0));
  await sleep(500);
  const sfxOff = await readTaps();
  log('  SFX muted:          ' + JSON.stringify(sfxOff));
  ok('KILL-CONTROL A: muting SFX collapses SFX', sfxOff[iSfx].rmsDb < base[iSfx].rmsDb - 20,
    `${base[iSfx].rmsDb} -> ${sfxOff[iSfx].rmsDb} dBFS`);
  ok('KILL-CONTROL A: muting SFX leaves the MUSIC untouched', Math.abs(sfxOff[iMus].rmsDb - base[iMus].rmsDb) < 2,
    `${base[iMus].rmsDb} -> ${sfxOff[iMus].rmsDb} dBFS`);
  await page.evaluate(() => window.__audio.setVolume(0.62));
  await sleep(500);

  // DIRECTION B: kill music, SFX must not move.
  const base2 = await readTaps();
  await page.evaluate(() => window.__game.music.setMusicVolume(0));
  await sleep(600);
  const musOff = await readTaps();
  log('  restored:           ' + JSON.stringify(base2));
  log('  MUSIC muted:        ' + JSON.stringify(musOff));
  ok('KILL-CONTROL B: muting MUSIC collapses MUSIC', musOff[iMus].rmsDb < base2[iMus].rmsDb - 20,
    `${base2[iMus].rmsDb} -> ${musOff[iMus].rmsDb} dBFS`);
  ok('KILL-CONTROL B: muting MUSIC leaves the SFX untouched', Math.abs(musOff[iSfx].rmsDb - base2[iSfx].rmsDb) < 3,
    `${base2[iSfx].rmsDb} -> ${musOff[iSfx].rmsDb} dBFS`);

  await page.keyboard.up('KeyW');
  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. TWO SLIDERS, TWO THINGS — real mouse, real arrow keys
// ---------------------------------------------------------------------------
if (want('sliders')) {
  log('\n=== 3. THE TWO SLIDERS ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(2000);
  await page.keyboard.press('Escape');
  await sleep(400);

  const sel = (label) => `#bgmenu input[aria-label="${label}"]`;
  const state = () => page.evaluate(() => ({
    music: window.__game.music.getMusicVolume(),
    sfx: window.__audio.getVolume(),
    gain: window.__game.music.info().gainValue,
  }));

  log('  before: ' + JSON.stringify(await state()));
  // Real mouse drag on the MUSIC slider: click near the left third.
  const drag = async (label, frac) => {
    const box = await page.locator(sel(label)).boundingBox();
    await page.mouse.click(box.x + box.width * frac, box.y + box.height / 2);
    await sleep(400);
  };
  await drag('Music', 0.2);
  const afterMusic = await state();
  log('  after MUSIC drag to ~20%: ' + JSON.stringify(afterMusic));
  await drag('Sfx', 0.8);
  const afterSfx = await state();
  log('  after SFX drag to ~80%: ' + JSON.stringify(afterSfx));
  ok('MUSIC drag changed music and not sfx',
    afterMusic.music < 0.4 && Math.abs(afterMusic.sfx - 0.62) < 0.001,
    `music ${afterMusic.music} sfx ${afterMusic.sfx}`);
  ok('SFX drag changed sfx and not music',
    afterSfx.sfx > 0.6 && afterSfx.music === afterMusic.music,
    `sfx ${afterMusic.sfx} -> ${afterSfx.sfx}, music held at ${afterSfx.music}`);

  // D6: arrow keys. Focus each slider and press ArrowRight/Left.
  const arrows = async (label, key, n) => {
    await page.locator(sel(label)).focus();
    for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(60); }
    await sleep(300);
    return state();
  };
  const kMusic0 = await state();
  const kMusic = await arrows('Music', 'ArrowRight', 5);
  log(`  MUSIC arrows: ${kMusic0.music} -> ${kMusic.music}`);
  ok('D6 arrow keys move the MUSIC slider', kMusic.music > kMusic0.music, `${kMusic0.music} -> ${kMusic.music}`);
  const kSfx0 = await state();
  const kSfx = await arrows('Sfx', 'ArrowLeft', 5);
  log(`  SFX arrows: ${kSfx0.sfx} -> ${kSfx.sfx}`);
  ok('D6 arrow keys move the SFX slider', kSfx.sfx < kSfx0.sfx, `${kSfx0.sfx} -> ${kSfx.sfx}`);
  // and the res slider, the critic's own repro
  // The critic's exact repro starts from 0.50, so set that first (the boot value is 1.00 and
  // ArrowRight at the maximum proves nothing).
  await page.evaluate(() => window.__game.setResScale(0.5));
  await sleep(400);
  const res0 = await page.evaluate(() => window.__game.getResScale());
  await page.locator('#bgmenu [data-opt=res] input[type=range]').focus();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await sleep(80); }
  await sleep(300);
  const res1 = await page.evaluate(() => window.__game.getResScale());
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowLeft'); await sleep(80); }
  await sleep(300);
  const res2 = await page.evaluate(() => window.__game.getResScale());
  ok('D6 arrow keys move the RES slider both ways (critic repro: stuck at 0.50)',
    res1 > res0 && res2 < res1, `${res0} -> ${res1} -> ${res2}`);

  // The gain must actually follow the slider, not just the number.
  const g = await page.evaluate(() => window.__game.music.info());
  log('  gainValue vs volume: ' + JSON.stringify({ gain: g.gainValue, vol: g.volume }));

  // localStorage persistence claim
  const ls = await page.evaluate(() => window.localStorage.getItem('bg.musicVolume'));
  log('  localStorage bg.musicVolume = ' + ls);
  ok('music volume persisted to localStorage', ls !== null, String(ls));
  const lsSfx = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => /sfx|volume/i.test(k)));
  log('  localStorage keys matching sfx/volume: ' + JSON.stringify(lsSfx));

  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. TRANSPORT — skip, selection, pause/resume, prev rule
// ---------------------------------------------------------------------------
if (want('transport')) {
  log('\n=== 4. TRANSPORT ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(2500);
  await page.keyboard.press('Escape');
  await sleep(500);

  const cur = () => page.evaluate(() => window.__game.music.current());
  log('  start: ' + JSON.stringify(await cur()));

  // Real clicks on the transport buttons.
  const btn = (t) => page.locator(`#bgmenu [data-opt=music] .trans button`).filter({ hasText: t });
  const nextBtn = page.locator('#bgmenu [data-opt=music] .trans button').nth(2);
  const playBtn = page.locator('#bgmenu [data-opt=music] .trans button').nth(1);
  const prevBtn = page.locator('#bgmenu [data-opt=music] .trans button').nth(0);

  await nextBtn.click(); await sleep(2500);
  const n1 = await cur();
  log('  after NEXT: ' + JSON.stringify(n1));
  ok('NEXT advances the track and it is playing', n1.index === 1 && n1.playing, `${n1.index} ${n1.id} playing=${n1.playing}`);
  const lvl1 = await sampleMusic(page, 14, 45);
  log('  level on track 2: ' + JSON.stringify(lvl1));
  ok('track 2 is audible too', lvl1.rmsDb > -35, `${lvl1.rmsDb.toFixed(2)} dBFS`);

  await nextBtn.click(); await sleep(2500);
  const n2 = await cur();
  ok('NEXT again advances to track 3', n2.index === 2, `${n2.index} ${n2.id}`);
  await nextBtn.click(); await sleep(2000);
  const n3 = await cur();
  ok('NEXT wraps from the last track to the first', n3.index === 0, `${n3.index} ${n3.id}`);

  // Track chips: pick the third by real click.
  const chips = page.locator('#bgmenu [data-opt=music] .seg button');
  const nChips = await chips.count();
  log('  track chips: ' + nChips);
  await chips.nth(2).click(); await sleep(2500);
  const sel3 = await cur();
  ok('clicking a track chip selects and plays that track', sel3.index === 2 && sel3.playing, JSON.stringify({ i: sel3.index, playing: sel3.playing }));
  const litIdx = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('#bgmenu [data-opt=music] .seg button'));
    return bs.map((b, i) => (b.classList.contains('on') ? i : -1)).filter((i) => i >= 0);
  });
  ok('exactly one chip is lit and it is the playing track', litIdx.length === 1 && litIdx[0] === 2, JSON.stringify(litIdx));

  // prev rule: >3 s in restarts, else steps back
  await sleep(2500);
  const tBefore = (await cur()).time;
  await prevBtn.click(); await sleep(1200);
  const p1 = await cur();
  log(`  PREV at t=${tBefore.toFixed(2)}: index ${p1.index} t ${p1.time.toFixed(2)}`);
  ok('PREV past 3 s restarts the current track', p1.index === 2 && p1.time < tBefore, `t ${tBefore.toFixed(2)} -> ${p1.time.toFixed(2)}`);
  await prevBtn.click(); await sleep(1500);
  const p2 = await cur();
  ok('PREV inside 3 s steps to the previous track', p2.index === 1, `${p2.index} ${p2.id}`);

  // pause / resume
  await playBtn.click(); await sleep(900);
  const pa = await cur();
  const paLvl = await sampleMusic(page, 10, 40);
  ok('PLAY/PAUSE button pauses playback', !pa.playing, `playing=${pa.playing} level ${paLvl.rmsDb.toFixed(2)} dBFS`);
  const label1 = await playBtn.textContent();
  await playBtn.click(); await sleep(1500);
  const pb = await cur();
  const pbLvl = await sampleMusic(page, 10, 40);
  ok('PLAY resumes from where it paused (not from zero)',
    pb.playing && pb.time >= pa.time - 0.1, `paused at ${pa.time.toFixed(2)} resumed at ${pb.time.toFixed(2)}`);
  ok('resumed audio is audible again', pbLvl.rmsDb > -35, `${pbLvl.rmsDb.toFixed(2)} dBFS`);
  log(`  button label while paused: "${label1}" / now "${await playBtn.textContent()}"`);

  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. PERSISTENCE + NO AUTOPLAY
// ---------------------------------------------------------------------------
if (want('persist')) {
  log('\n=== 5. PERSISTENCE AND AUTOPLAY ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');

  // Before ANY gesture at all: no context, no element, no network request for an mp3.
  const reqs = [];
  page.on('request', (r) => { if (/\.mp3/.test(r.url())) reqs.push(r.url()); });
  const pre = await page.evaluate(() => window.__game.music.info());
  log('  before gesture: ' + JSON.stringify(pre));
  ok('no autoplay before the gesture: no context, not unlocked, not playing',
    pre.ownContext === false && pre.unlocked === false && pre.playing === false && pre.ctxState === 'none',
    JSON.stringify({ ownContext: pre.ownContext, ctxState: pre.ctxState, playing: pre.playing }));
  // Also: pressing a key on the START card must not start the music (only the click does).
  await page.keyboard.press('KeyW');
  await sleep(600);
  const preKey = await page.evaluate(() => window.__game.music.info());
  ok('a keypress on the START card does not start the music',
    preKey.ownContext === false && preKey.playing === false, JSON.stringify({ ownContext: preKey.ownContext, playing: preKey.playing }));
  ok('no mp3 was requested before the gesture', reqs.length === 0, JSON.stringify(reqs));

  await page.click('#bgmenu .go');
  await sleep(3000);
  const post = await page.evaluate(() => window.__game.music.info());
  ok('the DRIVE click starts it', post.unlocked && post.playing && post.ctxState === 'running',
    JSON.stringify({ unlocked: post.unlocked, playing: post.playing, ctxState: post.ctxState, unlockCount: post.unlockCount }));
  log('  mp3 requests after the click: ' + JSON.stringify(reqs));

  // Scene change: the music must not restart. Drive first, then change scene from the menu.
  await page.keyboard.down('KeyW');
  await sleep(3000);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');
  await sleep(500);
  const b = await page.evaluate(() => ({ ...window.__game.music.current(), scene: window.__game.menu.scene() }));
  // Real click on a scene chip, not the exposed applyScene().
  const sceneChips = page.locator('#bgmenu [data-opt=scene] .seg button');
  log('  scene chips: ' + (await sceneChips.count()));
  await sceneChips.nth(2).click();
  await sleep(1500);
  const a = await page.evaluate(() => ({ ...window.__game.music.current(), scene: window.__game.menu.scene(),
    tod: window.__game.getTimeOfDay(), wet: window.__game.getWet(), pos: { ...window.__game.physics.state.pos } }));
  log('  before scene change: ' + JSON.stringify(b));
  log('  after  scene change: ' + JSON.stringify(a));
  ok('music does not restart across a scene change (same track, position advanced)',
    a.id === b.id && a.time > b.time && a.playing, `${b.id} ${b.time.toFixed(2)}s -> ${a.id} ${a.time.toFixed(2)}s`);
  const lvl = await sampleMusic(page, 12, 45);
  ok('still audible after the scene change', lvl.rmsDb > -35, `${lvl.rmsDb.toFixed(2)} dBFS`);

  // Volume persistence across a reload.
  await page.evaluate(() => window.__game.music.setMusicVolume(0.18));
  await sleep(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  const v = await page.evaluate(() => window.__game.music.getMusicVolume());
  ok('music volume survives a reload (localStorage)', Math.abs(v - 0.18) < 0.001, String(v));

  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. D1-D7, each with the round-1 critic's own repro
// ---------------------------------------------------------------------------
if (want('defects')) {
  log('\n=== 6. D1-D7 ===');
  {
    // D1: HUD pixels while the res slider moves, paused.
    const { page, errs } = await open('#scene=dusk-highway-chase');
    await page.click('#bgmenu .go');
    await sleep(1500);
    await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
    const hudPx = () => page.evaluate(() => {
      const c = document.querySelector('#hud canvas');
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 28) if (d[i] > 0) n++;
      return n;
    });
    const driving = await hudPx();
    await page.keyboard.press('Escape'); await sleep(500);
    const paused = await hudPx();
    // real mouse drag on the res slider
    const box = await page.locator('#bgmenu [data-opt=res] input[type=range]').boundingBox();
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height / 2);
    await sleep(200);
    const afterDrag = await hudPx();
    // and the general case the critic routed: setResScale from outside the menu
    await page.evaluate(() => window.__game.setResScale(0.5));
    const immediately = await hudPx();
    await sleep(400);
    const afterPoll = await hudPx();
    log(`  D1 hud px: driving ${driving} paused ${paused} after slider drag ${afterDrag} setResScale immediately ${immediately} after one poll ${afterPoll}`);
    ok('D1 the res slider no longer blanks the HUD while paused', afterDrag > driving * 0.5,
      `${driving} driving -> ${afterDrag} after drag (critic saw 0)`);
    ok('D1 an external setResScale is repaired within one 250 ms poll', afterPoll > driving * 0.5,
      `${immediately} immediately -> ${afterPoll} after poll`);

    // D2: C and R through the pause menu.
    await page.keyboard.press('Escape'); await sleep(400);
    await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
    await page.keyboard.press('Escape'); await sleep(500);
    const s0 = await page.evaluate(() => ({ speed: window.__game.physics.state.speed,
      crash: window.__game.crash.active, dmg: window.__game.damage.level, paused: window.__game.isPaused() }));
    await page.keyboard.press('KeyC'); await sleep(400);
    const s1 = await page.evaluate(() => ({ speed: window.__game.physics.state.speed,
      crash: window.__game.crash.active, dmg: window.__game.damage.level }));
    await page.keyboard.press('KeyR'); await sleep(400);
    const s2 = await page.evaluate(() => ({ speed: window.__game.physics.state.speed,
      crash: window.__game.crash.active, dmg: window.__game.damage.level }));
    log(`  D2: before ${JSON.stringify(s0)} after C ${JSON.stringify(s1)} after R ${JSON.stringify(s2)}`);
    ok('D2 C does not fire through the pause menu', s1.crash === false && s1.dmg === s0.dmg && s1.speed === s0.speed,
      JSON.stringify(s1));
    ok('D2 R does not fire through the pause menu', s2.speed === s0.speed, `${s0.speed} -> ${s2.speed}`);

    // D5: W held across a pause.
    await page.keyboard.press('Escape'); await sleep(400);
    await page.keyboard.down('KeyW'); await sleep(3500);
    const v0 = await page.evaluate(() => window.__game.physics.state.speed);
    await page.keyboard.press('Escape'); await sleep(800);
    const held = await page.evaluate(() => window.__game.menu.heldKeys());
    await page.keyboard.press('Escape'); await sleep(1500);
    const v1 = await page.evaluate(() => window.__game.physics.state.speed);
    await page.keyboard.up('KeyW');
    log(`  D5: ${v0.toFixed(3)} -> ${v1.toFixed(3)} m/s, heldKeys ${JSON.stringify(held)}`);
    ok('D5 the throttle survives a pause with W held', v1 >= v0 - 0.5 && held.includes('KeyW'),
      `${v0.toFixed(3)} -> ${v1.toFixed(3)} m/s`);
    ok('no console/page errors (D1/D2/D5 run)', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    await page.close();
  }
  {
    // D4: hold W on the START card, click DRIVE, touch nothing.
    const { page, errs } = await open('#scene=dusk-highway-chase');
    await page.keyboard.down('KeyW');
    await sleep(600);
    await page.click('#bgmenu .go');
    await sleep(1200);
    const v = await page.evaluate(() => window.__game.physics.state.speed);
    await page.keyboard.up('KeyW');
    log(`  D4: speed 1.2 s after DRIVE with W held on the title card: ${v.toFixed(3)} m/s`);
    ok('D4 a key held on the START card does not leak into the drive', Math.abs(v) < 1.0, `${v.toFixed(3)} m/s (critic saw 10.037)`);
    ok('no console/page errors (D4)', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    await page.close();
  }
  {
    // D7: the card in a short window. Critic repro: 900x560, card bottom 579.
    for (const vp of [{ width: 900, height: 560 }, { width: 1024, height: 420 }, { width: 1280, height: 720 }]) {
      const { page, errs } = await open('#scene=dusk-highway-chase', vp);
      await sleep(400);
      const m = await page.evaluate(() => {
        const card = document.querySelector('#bgmenu .card');
        const r = card.getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll('#bgmenu .row')).map((e) => e.className);
        const kb = document.querySelector('#bgmenu .keys');
        const kr = kb ? kb.getBoundingClientRect() : null;
        return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), ih: window.innerHeight,
          scrollH: card.scrollHeight, clientH: card.clientHeight,
          controlsBottom: kr ? +kr.bottom.toFixed(1) : null, rows };
      });
      log(`  D7 ${vp.width}x${vp.height}: ` + JSON.stringify(m));
      ok(`D7 card fits inside ${vp.width}x${vp.height}`, m.bottom <= m.ih + 0.5 && m.top >= -0.5,
        `top ${m.top} bottom ${m.bottom} of ${m.ih}`);
      if (vp.height === 720) {
        ok('the whole CONTROLS list is above the fold at 720p on the START card',
          m.controlsBottom !== null && m.controlsBottom <= m.ih,
          `controls bottom ${m.controlsBottom} of ${m.ih}`);
      }
      ok(`no errors at ${vp.width}x${vp.height}`, errs.length === 0, JSON.stringify(errs.slice(0, 2)));
      await page.close();
    }
  }
}

// ---------------------------------------------------------------------------
// 7. BREAK IT
// ---------------------------------------------------------------------------
if (want('breakit')) {
  log('\n=== 7. BREAK IT ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(2000);

  // (a) rapid pause/resume x 10 at 80 ms, with W held
  await page.keyboard.down('KeyW');
  await sleep(2000);
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Escape'); await sleep(80); }
  await sleep(600);
  const rp = await page.evaluate(() => ({ paused: window.__game.isPaused(), open: window.__game.menu.isOpen(),
    speed: window.__game.physics.state.speed, held: window.__game.menu.heldKeys(),
    music: window.__game.music.current() }));
  log('  after 10 Escapes at 80 ms: ' + JSON.stringify(rp));
  ok('rapid pause/resume leaves consistent parity and a live car',
    rp.paused === rp.open, `paused ${rp.paused} open ${rp.open}`);
  if (rp.paused) { await page.keyboard.press('Escape'); await sleep(400); }
  await sleep(1200);
  const rp2 = await page.evaluate(() => window.__game.physics.state.speed);
  ok('the car still drives after the Escape spam (W still held)', rp2 > rp.speed - 1, `${rp.speed.toFixed(2)} -> ${rp2.toFixed(2)} m/s`);
  ok('music survived the Escape spam', (await page.evaluate(() => window.__game.music.current().playing)) === true);
  await page.keyboard.up('KeyW');

  // (b) keys DURING the open/close transition: press C in the same task as Escape
  const t0 = await page.evaluate(() => ({ crash: window.__game.crash.active, dmg: window.__game.damage.level }));
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
  });
  await sleep(600);
  const t1 = await page.evaluate(() => ({ crash: window.__game.crash.active, dmg: window.__game.damage.level,
    paused: window.__game.isPaused() }));
  log('  C dispatched in the same task as the pause Escape: ' + JSON.stringify({ t0, t1 }));
  ok('C in the same task as the pause Escape does not wreck the run', t1.crash === false, JSON.stringify(t1));
  if (t1.paused) { await page.keyboard.press('Escape'); await sleep(300); }

  // (c) slider drag while paused, then resume, then check the frame is not broken
  await page.keyboard.press('Escape'); await sleep(400);
  const wbox = await page.locator('#bgmenu [data-opt=wet] input[type=range]').boundingBox();
  await page.mouse.move(wbox.x + 2, wbox.y + wbox.height / 2);
  await page.mouse.down();
  for (let i = 0; i <= 10; i++) { await page.mouse.move(wbox.x + (wbox.width * i) / 10, wbox.y + wbox.height / 2); await sleep(40); }
  await page.mouse.up();
  await sleep(400);
  const wetS = await page.evaluate(() => ({ wet: window.__game.getWet(), paused: window.__game.isPaused() }));
  ok('a wet-slider drag while paused lands and the game is still paused', wetS.wet > 0.9 && wetS.paused, JSON.stringify(wetS));

  // (d) scene change MID-DRIVE (resume, drive, pause, change scene, resume, drive)
  await page.keyboard.press('Escape'); await sleep(300);
  await page.keyboard.down('KeyW'); await sleep(2500);
  const mid0 = await page.evaluate(() => ({ speed: window.__game.physics.state.speed, pos: { ...window.__game.physics.state.pos } }));
  await page.keyboard.press('Escape'); await sleep(400);
  await page.locator('#bgmenu [data-opt=scene] .seg button').nth(4).click();
  await sleep(1200);
  await page.keyboard.press('Escape'); await sleep(1500);
  const mid1 = await page.evaluate(() => ({ speed: window.__game.physics.state.speed, pos: { ...window.__game.physics.state.pos },
    steer: window.__game.physics.state.steer, scene: window.__game.menu.scene(), hudVisible: !!document.querySelector('#hud').style.display !== 'none' }));
  log('  mid-drive scene change: ' + JSON.stringify({ mid0, mid1 }));
  ok('after a mid-drive scene change the car is under player control and W still drives it',
    mid1.speed > 1, `speed ${mid1.speed.toFixed(2)} m/s at ${mid1.scene}`);
  await page.keyboard.up('KeyW');

  // (e) alt-tab style lost keyup: keydown W, then blur, then pause/resume
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true })));
  await sleep(200);
  const heldPhantom = await page.evaluate(() => window.__game.menu.heldKeys());
  await page.keyboard.press('Escape'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(1200);
  const ph = await page.evaluate(() => ({ steer: window.__game.physics.state.steer, held: window.__game.menu.heldKeys() }));
  log('  phantom key (keydown with no keyup, as after an alt-tab): ' + JSON.stringify({ heldPhantom, ph }));
  ok('NOTE ONLY: a keydown with no keyup is re-asserted on resume', true, JSON.stringify(ph));

  // (f) resize with the menu open
  await page.keyboard.press('Escape'); await sleep(300);
  await page.setViewportSize({ width: 900, height: 560 });
  await sleep(500);
  const rz = await page.evaluate(() => {
    const c = document.querySelector('#hud canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 28) if (d[i] > 0) n++;
    const r = document.querySelector('#bgmenu .card').getBoundingClientRect();
    return { hudPx: n, bottom: +r.bottom.toFixed(1), ih: window.innerHeight, size: window.__game.renderSize() };
  });
  log('  resize while paused: ' + JSON.stringify(rz));
  ok('a resize while paused repaints the HUD and keeps the card on screen', rz.hudPx > 1000 && rz.bottom <= rz.ih + 0.5, JSON.stringify(rz));

  ok('no console/page errors across the whole break-it run', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 8. CONTROL LIST vs the real handlers
// ---------------------------------------------------------------------------
if (want('controls')) {
  log('\n=== 8. CONTROL LIST ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(1500);
  const rows = await page.evaluate(() => {
    // read the card as a player sees it, from the START card before we clicked... it is
    // closed now, so reopen with Escape and read the PAUSE card, same nodes.
    return null;
  });
  await page.keyboard.press('Escape'); await sleep(400);
  const list = await page.evaluate(() => {
    const kb = document.querySelector('#bgmenu .keys');
    const out = [];
    const ch = Array.from(kb.children);
    for (let i = 0; i < ch.length; i += 2) out.push([ch[i].textContent, ch[i + 1].textContent]);
    return out;
  });
  log('  the card lists:');
  for (const [k, d] of list) log(`    ${k}  ->  ${d}`);
  await page.keyboard.press('Escape'); await sleep(400);

  const st = () => page.evaluate(() => {
    const s = window.__game.physics.state;
    return { speed: s.speed, ground: s.ground, yaw: s.yaw, steer: s.steer, boost: s.boost,
      boosting: s.boosting, hb: s.handbrake, crash: window.__game.crash.active, dmg: window.__game.damage.level };
  });
  const press = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); const s = await st(); await page.keyboard.up(key); return s; };

  // W
  await page.keyboard.down('KeyW'); await sleep(2500);
  const w = await st();
  ok('W accelerates', w.speed > 5, `${w.speed.toFixed(3)} m/s`);
  // SHIFT with throttle = boost
  const b0 = await st();
  await page.keyboard.down('ShiftLeft'); await sleep(1500);
  const b1 = await st();
  await page.keyboard.up('ShiftLeft');
  ok('SHIFT boosts, but only with the throttle held (the label says so)',
    b1.boosting === true && b1.speed > b0.speed, `boosting ${b1.boosting}, ${b0.speed.toFixed(2)} -> ${b1.speed.toFixed(2)} m/s, tank ${b0.boost.toFixed(3)} -> ${b1.boost.toFixed(3)}`);
  await page.keyboard.up('KeyW');
  // SHIFT while coasting must NOT boost
  await sleep(500);
  const c0 = await st();
  await page.keyboard.down('ShiftLeft'); await sleep(1000);
  const c1 = await st();
  await page.keyboard.up('ShiftLeft');
  ok('SHIFT alone does not boost (label: "hold with throttle")', c1.boosting === false, `boosting ${c1.boosting}`);

  // SPACE label check against handling-r2's shipped e-brake. REAL KEYS only: main.js's
  // frame() calls physics.setInput() from the polled `keys` map every tick, so an injected
  // setInput is overwritten before it can integrate — an earlier version of this test read
  // dyaw 0.0000 in both arms for exactly that reason.
  const arm = async (useSpace) => {
    await page.evaluate(() => window.__game.physics.reset({ x: -400, y: 0, z: -700 }, Math.PI / 2, 34));
    await sleep(120);
    const s0 = await page.evaluate(() => ({ v: window.__game.physics.state.ground, yaw: window.__game.physics.state.yaw }));
    await page.keyboard.down('KeyA');
    if (useSpace) await page.keyboard.down('Space');
    await sleep(1000);
    const s1 = await page.evaluate(() => ({ v: window.__game.physics.state.ground, yaw: window.__game.physics.state.yaw,
      slip: window.__game.physics.state.slip, drifting: window.__game.physics.state.drifting }));
    await page.keyboard.up('KeyA');
    if (useSpace) await page.keyboard.up('Space');
    await sleep(400);
    return { dv: s1.v - s0.v, dyaw: Math.abs(s1.yaw - s0.yaw), v1: s1.v, slip: s1.slip, drifting: s1.drifting };
  };
  const ebrake = { coast: await arm(false), hb: await arm(true) };
  log('  SPACE kill-control (1.0 s, entry 34 m/s, steady left): ' + JSON.stringify(ebrake));
  ok('the SPACE label "swings the tail, slows the rear" matches the shipped physics',
    ebrake.hb.dv < ebrake.coast.dv && ebrake.hb.dyaw > ebrake.coast.dyaw,
    `dv coast ${ebrake.coast.dv.toFixed(3)} vs hb ${ebrake.hb.dv.toFixed(3)}; dyaw coast ${ebrake.coast.dyaw.toFixed(4)} vs hb ${ebrake.hb.dyaw.toFixed(4)}`);

  // unlisted keys
  const probe = await page.evaluate(async () => {
    const snap = () => JSON.stringify({ tod: window.__game.getTimeOfDay(), wet: window.__game.getWet(),
      res: window.__game.getResScale(), paused: window.__game.isPaused(),
      crash: window.__game.crash.active, scene: window.__game.menu.scene(),
      music: window.__game.music.current().index, playing: window.__game.music.current().playing });
    const before = snap();
    const changed = [];
    for (const code of ['KeyB', 'KeyF', 'KeyG', 'KeyH', 'KeyM', 'KeyP', 'KeyT', 'KeyV', 'KeyX', 'KeyZ',
      'Digit1', 'Digit2', 'Tab', 'Enter', 'ControlLeft', 'AltLeft', 'KeyN', 'KeyQ', 'KeyE', 'Comma', 'Period', 'BracketLeft', 'BracketRight']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      if (snap() !== before) changed.push(code);
    }
    return changed;
  });
  ok('no unlisted key does anything (23 probed)', probe.length === 0, JSON.stringify(probe));

  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 9. TWO EDGE CASES THE CAPTURE GATE'S SHAPE IMPLIES
// ---------------------------------------------------------------------------
if (want('edge')) {
  log('\n=== 9. EDGE CASES ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(2000);

  // (a) LISTENER ORDER. The gate is a CAPTURE listener on window; main.js's is a BUBBLE
  // listener on window, registered FIRST. For an event whose target is document.body the
  // gate wins (capture beats bubble). For an event whose target IS window, both are
  // "at target" and fire in REGISTRATION order, so main.js wins and the gate is bypassed.
  // Which of the two a real keyboard produces decides whether D2 is really closed.
  await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape'); await sleep(400);
  const real0 = await page.evaluate(() => ({ crash: window.__game.crash.active, dmg: window.__game.damage.level }));
  // A REAL key, zero delay, immediately after the pause.
  await page.keyboard.press('KeyC', { delay: 0 });
  await sleep(500);
  const real1 = await page.evaluate(() => ({ crash: window.__game.crash.active, dmg: window.__game.damage.level }));
  ok('D2 holds for a REAL key with zero delay after the pause Escape', real1.crash === false,
    JSON.stringify({ real0, real1 }));

  const synth = await page.evaluate(async () => {
    const before = window.__game.crash.active;
    // Target = window: this is what reassertHeldKeys() itself dispatches.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return { before, after: window.__game.crash.active, target: 'window' };
  });
  log('  window-targeted synthetic KeyC while paused: ' + JSON.stringify(synth));
  ok('NOTE: a window-TARGETED keydown bypasses the gate (registration order), so the gate is order-dependent',
    true, JSON.stringify(synth));
  const bodySynth = await page.evaluate(async () => {
    window.__game.crash.reset();
    await new Promise((r) => setTimeout(r, 200));
    const before = window.__game.crash.active;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return { before, after: window.__game.crash.active, target: 'body' };
  });
  log('  body-targeted synthetic KeyC while paused: ' + JSON.stringify(bodySynth));
  ok('a body-targeted keydown (what a real keyboard produces) IS gated', bodySynth.after === false,
    JSON.stringify(bodySynth));

  // (b) A LOST KEYUP. `heldNow` is only ever emptied by a keyup; there is no blur,
  // visibilitychange or pointer handler that clears it. A key whose keyup was never
  // delivered (macOS Cmd-Tab with a key down is the standard case) is therefore latched
  // forever, and `reassertHeldKeys()` re-fires it on EVERY subsequent resume.
  await page.evaluate(() => window.__game.crash.reset());
  await sleep(400);
  if (await page.evaluate(() => window.__game.isPaused())) { await page.keyboard.press('Escape'); await sleep(300); }
  await page.keyboard.down('KeyD');
  await sleep(300);
  // Model the lost keyup exactly: the page is told the key went down and never told it came
  // up, which is what a page observes across a focus change.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(200);
  const heldAfterBlur = await page.evaluate(() => window.__game.menu.heldKeys());
  log('  heldKeys after a window blur with D down: ' + JSON.stringify(heldAfterBlur));
  ok('a window blur does NOT clear the held-key set (mechanism for the phantom)',
    heldAfterBlur.includes('KeyD'), JSON.stringify(heldAfterBlur));
  // Now three resumes in a row with NOBODY touching the keyboard.
  const steers = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape'); await sleep(350);   // pause
    await page.keyboard.press('Escape'); await sleep(900);   // resume
    steers.push(await page.evaluate(() => window.__game.physics.state.steer));
  }
  log('  steer after each of three resumes, no key touched: ' + JSON.stringify(steers.map((v) => +v.toFixed(4))));
  ok('DEFECT: the phantom key is re-asserted on every resume (steer pinned with no key down)',
    steers.every((v) => Math.abs(v) > 0.5) === false,
    `steer ${steers.map((v) => v.toFixed(4)).join(', ')} — a non-zero value here IS the defect`);
  await page.keyboard.up('KeyD');
  await sleep(300);

  // AIRTIGHT VARIANT: no real key is down at any point. One body-targeted keydown for KeyA
  // (which is what the page sees when a keyup is swallowed), then a pause/resume, then read
  // the steer. Playwright's own key state is empty throughout, so nothing but the menu's
  // re-assert can produce a non-zero steer.
  if (await page.evaluate(() => window.__game.isPaused())) { await page.keyboard.press('Escape'); await sleep(300); }
  await sleep(800);
  const clean0 = await page.evaluate(() => ({ steer: window.__game.physics.state.steer, held: window.__game.menu.heldKeys() }));
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', bubbles: true })));
  await sleep(250);
  await page.keyboard.press('Escape'); await sleep(400);
  await page.keyboard.press('Escape'); await sleep(1000);
  const clean1 = await page.evaluate(() => ({ steer: window.__game.physics.state.steer, held: window.__game.menu.heldKeys() }));
  log('  airtight phantom: ' + JSON.stringify({ clean0, clean1 }));
  ok('DEFECT (airtight): one swallowed keyup steers the car forever, with the keyboard idle',
    Math.abs(clean1.steer) < 0.5,
    `steer ${clean0.steer.toFixed(4)} -> ${clean1.steer.toFixed(4)}, heldKeys ${JSON.stringify(clean1.held)}`);

  ok('no console/page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
await browser.close();
server.close();
process.exit(0);
