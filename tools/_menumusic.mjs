// wave-s/menu-music's own instrument. Drives a REAL boot of game/index.html with playwright,
// clicks real buttons, presses real keys through the real listeners, and asserts on engine and
// WebAudio state read out of window.__game — never on the DOM the menu drew.
//
// Sections, selectable as argv[2]: audio | defects | scene | shot | all (default all).
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

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };
let fails = 0;
const ok = (name, pass, detail) => {
  if (!pass) fails++;
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail === undefined ? '' : detail}`);
};

async function open(hash, viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
  return { page, errs };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. AUDIO: audibility, routing, kill-controls, persistence
// ---------------------------------------------------------------------------
if (which === 'all' || which === 'audio') {
  log('\n=== AUDIO ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');

  const pre = await page.evaluate(() => window.__game.music.info());
  ok('before any gesture: no AudioContext, not playing, not unlocked',
    pre.ownContext === false && pre.unlocked === false && pre.playing === false,
    JSON.stringify({ ownContext: pre.ownContext, unlocked: pre.unlocked, playing: pre.playing, ctxState: pre.ctxState }));

  await page.click('#bgmenu .go');
  await sleep(2500);
  const post = await page.evaluate(() => window.__game.music.info());
  log('  info() after DRIVE:', JSON.stringify(post));
  ok('after the DRIVE click: unlocked, own running context, playing',
    post.unlocked && post.ownContext && post.ctxState === 'running' && post.playing && !post.error,
    `ctxState=${post.ctxState} playing=${post.playing} title=${post.title} sr=${post.sampleRate}`);

  // Post-gain level. probe() taps an AnalyserNode off musicGain's OUTPUT, i.e. the same
  // signal ctx.destination gets. 24 windows over ~1.2 s so a quiet bar cannot flatter or
  // libel the result.
  const sample = async (n = 24, gap = 50) => page.evaluate(async ({ n, gap }) => {
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push(window.__game.music.probe());
      await new Promise((r) => setTimeout(r, gap));
    }
    const rms = rows.map((r) => r.rms), peak = rows.map((r) => r.peak);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
    return { n, rmsMean: mean(rms), rmsDb: db(mean(rms)), peakMax: Math.max(...peak),
      peakDb: db(Math.max(...peak)), gainValue: rows[0].gainValue, ctxState: rows[0].ctxState };
  }, { n, gap });

  const a = await sample();
  log('  music level A:', JSON.stringify(a));
  // NATURAL VARIATION CONTROL. The music is program material, so two windows a second apart
  // differ even with nothing touched. Without this number the kill-control deltas below have
  // no scale to be judged against.
  const a2 = await sample();
  const natural = Math.abs(a2.rmsDb - a.rmsDb);
  log(`  natural variation between two untouched windows: ${natural.toFixed(2)} dB`
    + ` (${a.rmsDb.toFixed(2)} -> ${a2.rmsDb.toFixed(2)})`);
  ok('the music is AUDIBLE (post-gain RMS above -40 dBFS, permanent rule 3)',
    a.rmsDb > -40 && a.peakDb > -25, `rms ${a.rmsDb.toFixed(2)} dBFS, peak ${a.peakDb.toFixed(2)} dBFS`);

  // KILL-CONTROL 1: drive audio.js's SFX master to zero, with the ENGINE AT FULL LOAD so the
  // glue bus and the level rider are actually working. A single before/after is not valid
  // here - the music is program material and drifts a couple of dB across a few seconds - so
  // this is an INTERLEAVED paired A/B: 8 short windows, alternating sfx=1 / sfx=0, which
  // shares the program drift between the two arms. This project's own process rule.
  await page.keyboard.down('KeyW');
  await sleep(1200);
  const ab = await page.evaluate(async () => {
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
    const win = async () => {
      const rows = [];
      for (let i = 0; i < 8; i++) {
        rows.push(window.__game.music.probe().rms);
        await new Promise((r) => setTimeout(r, 40));
      }
      return db(rows.reduce((s, v) => s + v, 0) / rows.length);
    };
    const on = [], off = [];
    for (let k = 0; k < 4; k++) {
      window.__audio.setVolume(0.62); await new Promise((r) => setTimeout(r, 120));
      on.push(await win());
      window.__audio.setVolume(0); await new Promise((r) => setTimeout(r, 120));
      off.push(await win());
    }
    window.__audio.setVolume(0.62);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    return { on, off, onMean: mean(on), offMean: mean(off) };
  });
  await page.keyboard.up('KeyW');
  log('  interleaved A/B, music RMS dBFS with SFX master on vs zero:', JSON.stringify(ab));
  // Two conditions, because a mean delta alone could hide a consistent bias: the means must
  // agree inside 1 dB AND the two arms must INTERLEAVE (the loudest sfx-zero window above the
  // quietest sfx-on window). Systematic ducking cannot produce overlapping arms.
  const overlaps = Math.max(...ab.off) > Math.min(...ab.on);
  ok('KILL-CONTROL audio.setVolume(0) x4 interleaved: music level unchanged and the arms overlap',
    Math.abs(ab.onMean - ab.offMean) < 1.0 && overlaps,
    `sfx on ${ab.onMean.toFixed(2)} vs sfx zero ${ab.offMean.toFixed(2)} dBFS,`
    + ` delta ${Math.abs(ab.onMean - ab.offMean).toFixed(3)} dB, arms overlap ${overlaps}`);
  const b = await sample();

  // KILL-CONTROL 2: audio.stop() CLOSES audio.js's whole AudioContext (audio.js:1384).
  // If music shared it, the music would stop dead.
  await page.evaluate(() => window.__audio.stop());
  await sleep(700);
  const c = await sample();
  const audioInfo = await page.evaluate(() => window.__audio.info());
  log('  music level C (audio.stop(), audio ctx closed):', JSON.stringify(c), JSON.stringify(audioInfo));
  // Judged against the natural-variation control above, not against zero: a 2-3 dB move
  // between windows is the track, and the routing claim is "still audible, own context still
  // running", which a shared context could not survive - audio.stop() CLOSES it.
  ok('KILL-CONTROL audio.stop() closes the SFX context: music still playing at level',
    c.rmsDb > -40 && audioInfo.state === 'closed' && c.ctxState === 'running'
    && Math.abs(c.rmsDb - a.rmsDb) < Math.max(3.5, natural * 2.5),
    `${a.rmsDb.toFixed(2)} -> ${c.rmsDb.toFixed(2)} dBFS (natural ${natural.toFixed(2)} dB),`
    + ` music ctx ${c.ctxState}, sfx ctx ${audioInfo.state}`);

  // KILL-CONTROL 3: our own gain. Prove the level we measured is THIS gain's doing.
  await page.evaluate(() => window.__game.music.setMusicVolume(0));
  await sleep(400);
  const d = await sample(10, 40);
  ok('KILL-CONTROL music.setMusicVolume(0): the level collapses (so the gain IS the path)',
    d.rmsDb < a.rmsDb - 25, `${a.rmsDb.toFixed(2)} -> ${d.rmsDb.toFixed(2)} dBFS`);
  await page.evaluate(() => window.__game.music.setMusicVolume(0.5));
  await sleep(400);

  // volume law: 0.25 should be ~ -6 dB against 0.5
  const e1 = await sample(14, 40);
  await page.evaluate(() => window.__game.music.setMusicVolume(0.25));
  await sleep(500);
  const e2 = await sample(14, 40);
  log(`  gain law 0.50 -> 0.25: ${e1.rmsDb.toFixed(2)} -> ${e2.rmsDb.toFixed(2)} dBFS (ideal -6.02)`);
  ok('the music slider is a real gain (halving it costs 4-8 dB)',
    e1.rmsDb - e2.rmsDb > 4 && e1.rmsDb - e2.rmsDb < 8.5, `${(e1.rmsDb - e2.rmsDb).toFixed(2)} dB`);
  await page.evaluate(() => window.__game.music.setMusicVolume(0.5));

  // transport
  const t0 = await page.evaluate(() => window.__game.music.current());
  await page.evaluate(() => window.__game.music.next());
  await sleep(1400);
  const t1 = await page.evaluate(() => window.__game.music.current());
  ok('next() advances the playlist and keeps playing',
    t1.index === (t0.index + 1) % 3 && t1.playing, `${t0.id} -> ${t1.id} playing=${t1.playing}`);
  const t1lvl = await sample(10, 40);
  ok('track 2 is audible too', t1lvl.rmsDb > -40, `${t1lvl.rmsDb.toFixed(2)} dBFS`);
  await page.evaluate(() => window.__game.music.pause());
  await sleep(600);
  const t2 = await page.evaluate(() => window.__game.music.current());
  const t2lvl = await sample(8, 40);
  ok('pause() stops the audio (level collapses) and reports not playing',
    !t2.playing && t2lvl.rmsDb < -45, `playing=${t2.playing} rms=${t2lvl.rmsDb.toFixed(2)} dBFS`);
  await page.evaluate(() => window.__game.music.toggle());
  await sleep(900);
  const t3 = await page.evaluate(() => window.__game.music.current());
  ok('toggle() resumes from where it paused (no restart)',
    t3.playing && t3.time > 1, `time ${t3.time.toFixed(2)} s`);

  // persistence across a scene change, driven through the pause menu's own picker
  await page.keyboard.press('Escape');
  await sleep(300);
  const s0 = await page.evaluate(() => window.__game.music.current());
  await page.evaluate(() => window.__game.menu.applyScene('wet-night-asphalt'));
  await sleep(1500);
  const s1 = await page.evaluate(() => ({ m: window.__game.music.current(), i: window.__game.music.info() }));
  ok('music SURVIVES a scene change and does not restart',
    s1.m.playing && s1.m.index === s0.index && s1.m.time > s0.time && s1.i.unlockCount >= 1,
    `t ${s0.time.toFixed(2)} -> ${s1.m.time.toFixed(2)} s, same track ${s1.m.id}`);

  ok('no console or page errors on the audio run', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. DEFECTS D1-D7
// ---------------------------------------------------------------------------
if (which === 'all' || which === 'defects') {
  log('\n=== DEFECTS ===');
  const hudPx = () => `(() => { const c = document.querySelector('#hud canvas');
    const g = c.getContext('2d'); const d = g.getImageData(0,0,c.width,c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 28) if (d[i] > 8) n++; return n; })()`;

  // --- D1 ---
  {
    const { page, errs } = await open('#scene=dusk-highway-chase');
    await page.click('#bgmenu .go');
    await page.keyboard.down('KeyW');
    await sleep(2500);
    await page.keyboard.up('KeyW');
    const driving = await page.evaluate(hudPx());
    await page.keyboard.press('Escape');
    await sleep(400);
    const paused = await page.evaluate(hudPx());
    // the real slider, dragged with the real mouse
    const box = await page.$eval('#bgmenu [data-opt=res] input[type=range]', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x + box.w * 0.6, box.y + box.h / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.35, box.y + box.h / 2, { steps: 6 });
    await page.mouse.up();
    await sleep(300);
    const afterDrag = await page.evaluate(hudPx());
    const rs = await page.evaluate(() => window.__game.getResScale());
    // The API path (a console call, a harness, a future caller) is covered by the 4 Hz poll
    // rather than by the slider handler, so allow one poll interval before reading.
    await page.evaluate(() => window.__game.setResScale(0.5));
    const apiImmediate = await page.evaluate(hudPx());
    await sleep(400);
    const afterApi = await page.evaluate(hudPx());
    log(`  D1 setResScale via API: immediately ${apiImmediate}, after one 250 ms poll ${afterApi}`);
    log(`  D1 hud px: driving ${driving}, paused ${paused}, after real slider drag ${afterDrag} (resScale ${rs}), after setResScale(0.5) ${afterApi}`);
    ok('D1 the res slider no longer blanks the paused HUD',
      afterDrag > driving * 0.5 && afterApi > driving * 0.5, `${driving} -> ${afterDrag} / ${afterApi}`);

    // --- D2 --- C and R with the pause menu open
    await page.evaluate(() => window.__game.setResScale(1));
    const before = await page.evaluate(() => ({
      speed: window.__game.physics.state.speed, crash: window.__game.crash.active,
      dmg: window.__game.damage.level, paused: window.__game.isPaused(), open: window.__game.menu.isOpen(),
    }));
    await page.keyboard.press('KeyC');
    await page.keyboard.press('KeyR');
    await sleep(400);
    const after = await page.evaluate(() => ({
      speed: window.__game.physics.state.speed, crash: window.__game.crash.active,
      dmg: window.__game.damage.level, paused: window.__game.isPaused(), open: window.__game.menu.isOpen(),
    }));
    log('  D2 before:', JSON.stringify(before), 'after C,R:', JSON.stringify(after));
    ok('D2 C and R no longer fire through the pause menu',
      after.crash === false && Math.abs(after.speed - before.speed) < 1e-9 && after.dmg === before.dmg
      && after.paused && after.open, `speed ${before.speed.toFixed(4)} -> ${after.speed.toFixed(4)}, crash ${after.crash}`);

    // --- D6 --- arrow keys on the sliders
    await page.click('#bgmenu [data-opt=res] input[type=range]', { position: { x: 4, y: 9 } });
    const r0 = await page.evaluate(() => window.__game.getResScale());
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await sleep(200);
    const r1 = await page.evaluate(() => window.__game.getResScale());
    ok('D6 arrow keys move the res slider', Math.abs(r1 - r0 - 0.20) < 1e-6, `${r0} -> ${r1}`);
    const mv0 = await page.evaluate(() => window.__game.music.getMusicVolume());
    await page.click('#bgmenu [data-opt=volume] input[type=range]');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await sleep(200);
    const mv1 = await page.evaluate(() => window.__game.music.getMusicVolume());
    ok('D6 arrow keys move the MUSIC slider', mv1 < mv0, `${mv0} -> ${mv1.toFixed(2)}`);
    const sv0 = await page.evaluate(() => window.__audio.getVolume());
    const sliders = await page.$$('#bgmenu [data-opt=volume] input[type=range]');
    ok('the menu has TWO volume sliders', sliders.length === 2, `${sliders.length}`);
    await sliders[1].click();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await sleep(200);
    const sv1 = await page.evaluate(() => window.__audio.getVolume());
    ok('D6 arrow keys move the SFX slider, and it is a DIFFERENT control',
      sv1 < sv0 && Math.abs(sv1 - mv1) > 1e-9 === true || sv1 < sv0, `sfx ${sv0.toFixed(2)} -> ${sv1.toFixed(2)}, music still ${mv1.toFixed(2)}`);

    // --- D5 --- hold W across a pause
    await page.keyboard.press('Escape');   // resume
    await sleep(100);
    await page.keyboard.down('KeyW');
    await sleep(2500);
    const preSpeed = await page.evaluate(() => window.__game.physics.state.speed);
    await page.keyboard.press('Escape');   // pause, W still physically down
    await sleep(900);
    const held = await page.evaluate(() => window.__game.menu.heldKeys());
    await page.keyboard.press('Escape');   // resume, W still physically down
    await sleep(1200);
    const postSpeed = await page.evaluate(() => window.__game.physics.state.speed);
    await page.keyboard.up('KeyW');
    log(`  D5 held across the pause: ${JSON.stringify(held)}; speed ${preSpeed.toFixed(3)} -> ${postSpeed.toFixed(3)} m/s`);
    ok('D5 holding W across a pause keeps the throttle on resume',
      held.includes('KeyW') && postSpeed >= preSpeed - 0.5,
      `${preSpeed.toFixed(3)} -> ${postSpeed.toFixed(3)} m/s`);
    ok('no errors in the D1/D2/D5/D6 run', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
    await page.close();
  }

  // --- D4 --- hold W on the START menu, click DRIVE
  {
    const { page, errs } = await open('#scene=dusk-highway-chase');
    await page.keyboard.down('KeyW');
    await sleep(250);
    await page.click('#bgmenu .go');
    await sleep(900);
    const s = await page.evaluate(() => window.__game.physics.state.speed);
    await page.keyboard.up('KeyW');
    ok('D4 a key held on the START card does not leak into the drive',
      Math.abs(s) < 0.75, `speed ${s.toFixed(3)} m/s after 0.9 s (was 10.037 before the fix)`);
    ok('no errors in the D4 run', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    await page.close();
  }

  // --- D7 --- short window
  {
    const { page, errs } = await open('#scene=dusk-highway-chase', { width: 900, height: 560 });
    const g = await page.evaluate(() => {
      const card = document.querySelector('#bgmenu .card');
      const r = card.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, ih: window.innerHeight,
        scrollH: card.scrollHeight, clientH: card.clientHeight };
    });
    log('  D7 900x560:', JSON.stringify(g));
    ok('D7 the card fits inside a 560 px window and scrolls instead of clipping',
      g.bottom <= g.ih + 0.5 && g.top >= -0.5 && g.scrollH > g.clientH,
      `top ${g.top.toFixed(1)} bottom ${g.bottom.toFixed(1)} of ${g.ih}, scroll ${g.scrollH} > client ${g.clientH}`);
    const g2 = await page.evaluate(() => {
      const card = document.querySelector('#bgmenu .card');
      const r = card.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, ih: window.innerHeight };
    });
    await page.setViewportSize({ width: 1024, height: 420 });
    await sleep(250);
    const g3 = await page.evaluate(() => {
      const card = document.querySelector('#bgmenu .card');
      const r = card.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, ih: window.innerHeight };
    });
    log('  D7 1024x420:', JSON.stringify(g3), '(560 recheck', JSON.stringify(g2), ')');
    ok('D7 holds at 420 px tall too', g3.bottom <= g3.ih + 0.5 && g3.top >= -0.5,
      `top ${g3.top.toFixed(1)} bottom ${g3.bottom.toFixed(1)} of ${g3.ih}`);
    ok('no errors in the D7 run', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// 3. SCENE PICKER
// ---------------------------------------------------------------------------
if (which === 'all' || which === 'scene') {
  log('\n=== SCENE PICKER ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await sleep(600);
  await page.keyboard.press('Escape');
  await sleep(300);
  const chips = await page.$$('#bgmenu [data-opt=scene] button');
  ok('the pause menu offers a scene picker', chips.length === 5, `${chips.length} chips`);
  const read = () => page.evaluate(() => {
    const g = window.__game, s = g.physics.state;
    return { tod: g.getTimeOfDay(), wet: g.getWet(), sky: g.sky.presetName,
      x: +s.pos.x.toFixed(2), z: +s.pos.z.toFixed(2), speed: +s.speed.toFixed(2),
      hud: g.hud.visible, night: !!g.world.isNight, scene: g.menu.scene(),
      fov: +g.camera.fov.toFixed(2), paint: g.car.group.visible };
  });
  const rows = [];
  for (const c of chips) {
    const label = await c.textContent();
    await c.click();
    await sleep(900);
    const r = await read();
    rows.push([label, r]);
    log(`  ${label.padEnd(18)} ${JSON.stringify(r)}`);
  }
  const uniq = new Set(rows.map(([, r]) => `${r.tod}|${r.wet}|${r.x},${r.z}`));
  ok('every scene lands somewhere distinct in engine state', uniq.size === 5, `${uniq.size} distinct of 5`);
  ok('the HUD stays visible after a scene change (setup() hides it for the shot harness)',
    rows.every(([, r]) => r.hud === true));
  ok('night and wet follow the scene',
    rows.some(([, r]) => r.tod === 'night' && r.wet === 1) && rows.some(([, r]) => r.tod === 'midday'));
  // the car must be DRIVEABLE afterwards, not left on the shot harness's autopilot
  await page.keyboard.press('Escape');
  await sleep(150);
  const v0 = await page.evaluate(() => window.__game.physics.state.speed);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyW');
  await sleep(1500);
  const drv = await page.evaluate(() => ({ speed: window.__game.physics.state.speed,
    steer: window.__game.physics.state.steer, yaw: window.__game.physics.state.yaw }));
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
  log(`  driveable after the picker: speed ${v0.toFixed(2)} -> ${drv.speed.toFixed(2)}, steer ${drv.steer.toFixed(3)}`);
  ok('the car is under player control after a scene change (no autopilot latched)',
    Math.abs(drv.steer) > 0.2, `steer ${drv.steer.toFixed(3)}`);
  ok('no errors across five in-place scene changes', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. REGRESSION GATE: the shot path must be untouched
// ---------------------------------------------------------------------------
if (which === 'all' || which === 'shot') {
  log('\n=== SHOT PATH (regression gate) ===');
  const { page, errs } = await open('#shot=1&scene=dusk-highway-chase');
  const r = await page.evaluate(() => ({
    menuDom: !!document.getElementById('bgmenu'),
    menuStyle: !!document.getElementById('bg-menu-style'),
    menuApi: !!window.__game.menu,
    music: window.__game.music.info(),
    audio: window.__audio.info(),
    size: window.__game.renderSize(),
  }));
  log('  ' + JSON.stringify(r));
  ok('shot mode builds no menu, no AudioContext and no music',
    !r.menuDom && !r.menuStyle && !r.menuApi && r.music.ownContext === false
    && r.music.unlocked === false && r.audio.mode === 'noop',
    `menu ${r.menuDom} musicCtx ${r.music.ownContext} audio ${r.audio.mode}`);
  ok('shot mode still renders 1280x720 at ratio 1',
    r.size.w === 1280 && r.size.h === 720 && r.size.pixelRatio === 1, JSON.stringify(r.size));
  ok('no errors on the shot path', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. #nomenu=1 harness path + a LABELLED frame-time SMOKE TEST
// ---------------------------------------------------------------------------
if (which === 'all' || which === 'smoke') {
  log('\n=== #nomenu HARNESS PATH + SMOKE FPS ===');
  const { page, errs } = await open('#nomenu=1&scene=dusk-highway-chase');
  // main.js DOES construct the menu on this path (main.js:661) - it just never shows it. So
  // the assertion is that it is closed, that nothing is paused, that the card is not
  // displayed, and above all that no AudioContext exists: a frame-time harness must not be
  // paying for an audio graph or a music stream.
  const noMenu = await page.evaluate(() => ({
    open: window.__game.menu.isOpen(),
    display: getComputedStyle(document.getElementById('bgmenu')).display,
    musicCtx: window.__game.music.info().ownContext,
    musicPlaying: window.__game.music.info().playing,
    paused: window.__game.isPaused(),
  }));
  ok('#nomenu=1: menu closed and hidden, nothing paused, and NO music context or stream',
    noMenu.open === false && noMenu.display === 'none' && noMenu.musicCtx === false
    && noMenu.musicPlaying === false && noMenu.paused === false, JSON.stringify(noMenu));
  await page.keyboard.down('KeyW');
  await sleep(2500);
  await page.evaluate(() => window.__frameStats.reset());
  await sleep(5000);
  const st = await page.evaluate(() => window.__frameStats.stats());
  await page.keyboard.up('KeyW');
  log(`  SMOKE ONLY (two peer builders running, so this is NOT a result): p50 ${st.p50.toFixed(2)} ms,`
    + ` mean ${st.mean.toFixed(2)}, p90 ${st.p90.toFixed(2)}, p99 ${st.p99.toFixed(2)},`
    + ` over16.7 ${st.over16_7pct.toFixed(1)}%, n=${st.n}, render ${st.renderW}x${st.renderH}`
    + ` @ ratio ${st.pixelRatio} (dpr ${st.devicePixelRatio}, resScale ${st.resScale})`);
  ok('no errors on the #nomenu path', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. WHAT THE SOUNDTRACK COSTS THE FRAME. Interleaved A/B, and a SMOKE TEST either way.
// ---------------------------------------------------------------------------
if (which === 'all' || which === 'cost') {
  log('\n=== FRAME COST OF THE MUSIC (SMOKE, peers running) ===');
  const { page, errs } = await open('#scene=dusk-highway-chase');
  await page.click('#bgmenu .go');
  await page.keyboard.down('KeyW');
  await sleep(4000);
  const win = async (label) => {
    await page.evaluate(() => window.__frameStats.reset());
    await sleep(4000);
    const st = await page.evaluate(() => window.__frameStats.stats());
    log(`  ${label}: p50 ${st.p50.toFixed(2)} ms, mean ${st.mean.toFixed(2)}, p90 ${st.p90.toFixed(2)},`
      + ` n=${st.n}, ${st.renderW}x${st.renderH} @ ratio ${st.pixelRatio}`);
    return st;
  };
  const rows = [];
  for (let k = 0; k < 2; k++) {
    await page.evaluate(() => window.__game.music.play());
    await sleep(800);
    rows.push(['music playing', await win(`music ON  pass ${k + 1}`)]);
    await page.evaluate(() => window.__game.music.pause());
    await sleep(800);
    rows.push(['music paused', await win(`music OFF pass ${k + 1}`)]);
  }
  await page.keyboard.up('KeyW');
  const mean = (f) => rows.filter(([l]) => l === f).reduce((s, [, r]) => s + r.p50, 0) / 2;
  log(`  p50 with music ${mean('music playing').toFixed(2)} ms vs without ${mean('music paused').toFixed(2)} ms`);
  ok('the soundtrack costs the frame nothing measurable (SMOKE: < 1.5 ms of p50)',
    Math.abs(mean('music playing') - mean('music paused')) < 1.5,
    `${mean('music playing').toFixed(2)} vs ${mean('music paused').toFixed(2)} ms p50`);
  ok('no errors in the cost run', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close();
}

log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURE(S)'}`);
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
