// wave-s perf-r3 — my own instruments. Two modes, both about things the repo's tools cannot see.
//
//   --mode first    the FIRST PLAYABLE SECOND, per frame: rAF delta, renderer.info deltas
//                   (programs / geometries / textures / calls / tris) AND a per-subsystem
//                   CPU bracket around every collaborator tick() calls, so a 300 ms hitch can be
//                   attributed to an object instead of guessed at. A CPU bracket is not a valid
//                   way to measure a 15 ms frame (GPU work is pipelined; see WAVE-S-PLAY-BRIEF)
//                   but it IS valid for a 300 ms one-off, and every attribution it makes is
//                   confirmed with a kill-control before it is claimed.
//   --mode drive    p50/p90/p99/max/frames-per-second/share-over-16.7 on a scenario, with the
//                   buffer read off the DRIVER (gl.drawingBufferWidth) at the end of the window
//                   and a throw rather than a print if it is not what was asked for.
//                   --kill <name> applies a runtime kill-control inside the same page.
//
// usage: node tools/_perfr3.mjs --mode first --repeat 4
//        node tools/_perfr3.mjs --mode drive --scenario night-wet --repeat 3 [--kill NAME]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const MODE = arg('mode', 'first');
const REPEAT = +arg('repeat', 3);
const SCEN = arg('scenario', 'cruise');
const KILL = arg('kill', '');
const WARM = +arg('warm', 3500);
const MEAS = +arg('meas', 8000);
const ROOT = resolve(arg('root', 'game'));
// deviceScaleFactor. 1 is the wave's measurement contract. 2 EMULATES THE USER'S RETINA MACHINE:
// main.js caps renderer.setPixelRatio to resScale, so the GL buffer stays 1280x720 real pixels
// either way (the tool still asserts that off the driver) — but every DOM layer, the HUD canvas
// included, gets a 2x backing store. That is the only way to measure what the player actually pays
// for the HUD without breaking the 1280x720 contract on the 3D frame.
const DSF = +arg('dsf', 1);

// SCENARIO TABLE, COPIED VERBATIM FROM tools/fps.mjs:85-121 so every number here is directly
// comparable to that harness and to perf-critic-r2's tables. The placement is not cosmetic:
// `place` snaps the car onto a named world path and `follow` auto-steers along it, because the
// playable loop calls physics.clearPath() and a keyboard-only "hold W" leaves the road inside an
// 8 s window and starts scraping buildings, at which point the scenario stops measuring the place
// it claims to measure.
const SCENARIOS = {
  cruise:      { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: 26 } },
  boost:       { hold: ['KeyW', 'ShiftLeft'], place: { path: 'highway', u: 0.22, kmh: 300, follow: 34 } },
  corner:      { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: false },
                 oscillate: { keys: ['KeyA', 'KeyD'], halfPeriodMs: 800 } },
  city:        { hold: ['KeyW'], place: { path: 'city', u: 0.34, kmh: 150, follow: 26 } },
  'night-wet': { hold: ['KeyW'], place: { path: 'city', u: 0.565, kmh: 150, follow: 26 },
                 tod: 'night', wet: 1 },
};

/** Steering oscillator, as fps.mjs:353. Returns a stop function. */
function startOscillator(page, osc) {
  if (!osc) return async () => {};
  let stop = false;
  const loop = (async () => {
    let i = 0;
    while (!stop) {
      const k = osc.keys[i % osc.keys.length];
      const other = osc.keys[(i + 1) % osc.keys.length];
      try { await page.keyboard.up(other); await page.keyboard.down(k); } catch { return; }
      const t0 = Date.now();
      while (!stop && Date.now() - t0 < osc.halfPeriodMs) await new Promise((r) => setTimeout(r, 40));
      i++;
    }
    try { for (const k of osc.keys) await page.keyboard.up(k); } catch { /* page gone */ }
  })();
  return async () => { stop = true; await loop; };
}

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

// ---------------------------------------------------------------- mode: first
async function modeFirst() {
  console.log(`# mode=first root=${ROOT} repeat=${REPEAT}`);
  for (let i = 0; i < REPEAT; i++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    // Installed BEFORE any page script. One rAF ring for the whole life of the document, plus
    // a poll that wraps every tick() collaborator the moment window.__game exists.
    await page.addInitScript(() => {
      window.__f = { rows: [], last: performance.now(), readyAt: null, sub: {}, long: [] };
      // Is the 300 ms hitch main-thread work outside rAF, or is it the compositor/GPU? A
      // longtask entry means the main thread was busy; its ABSENCE across the hitch means the
      // main thread was idle and the wait is below us.
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__f.long.push([+e.startTime.toFixed(1), +e.duration.toFixed(1), e.name]);
        }).observe({ entryTypes: ['longtask'] });
      } catch { /* not all builds expose longtask */ }
      // long-animation-frame carries a per-SCRIPT breakdown (sourceURL, functionName,
      // invoker) which is what actually names the offender.
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (e.duration < 60) continue;
            window.__f.long.push([+e.startTime.toFixed(1), +e.duration.toFixed(1),
              'LoAF blocking=' + e.blockingDuration + ' render=' + e.renderStart + ' scripts=' +
              JSON.stringify((e.scripts || []).map((s) => ({ n: s.name, u: s.sourceURL,
                f: s.sourceFunctionName, i: s.invoker, d: +s.duration.toFixed(1) })))]);
          }
        }).observe({ type: 'long-animation-frame', buffered: true });
      } catch { /* older builds */ }
      const info = () => {
        const g = window.__game;
        if (!g) return null;
        const inf = g.renderer.info;
        return { p: inf.programs ? inf.programs.length : 0, g: inf.memory.geometries,
          t: inf.memory.textures, c: inf.render.calls, tri: inf.render.triangles };
      };
      let prev = null;
      const f = (now) => {
        const c = window.__f;
        const cur = info();
        const d = cur && prev
          ? { dp: cur.p - prev.p, dg: cur.g - prev.g, dt: cur.t - prev.t, calls: cur.c }
          : {};
        prev = cur;
        // drain the per-subsystem CPU brackets accumulated since the last rAF
        const sub = {};
        for (const k in c.sub) { if (c.sub[k] > 0.4) sub[k] = +c.sub[k].toFixed(1); c.sub[k] = 0; }
        c.rows.push({ n: now, d: now - c.last, ...d, sub });
        c.last = now;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
      const wrap = (obj, name, label) => {
        if (!obj || typeof obj[name] !== 'function' || obj['__w_' + name]) return;
        const orig = obj[name].bind(obj);
        obj['__w_' + name] = true;
        obj[name] = function (...a) {
          const t0 = performance.now();
          try { return orig(...a); } finally {
            window.__f.sub[label] = (window.__f.sub[label] || 0) + (performance.now() - t0);
          }
        };
      };
      const iv = setInterval(() => {
        const g = window.__game;
        if (g && !window.__f.wrapped) {
          window.__f.wrapped = true;
          wrap(g.composer, 'render', 'composer.render');
          wrap(g.world, 'update', 'world.update');
          wrap(g.traffic, 'update', 'traffic.update');
          wrap(g.physics, 'step', 'physics.step');
          wrap(g.car, 'update', 'car.update');
          wrap(g.hud, 'update', 'hud.update');
          wrap(g.audio, 'update', 'audio.update');
          wrap(g.sky, 'update', 'sky.update');
          wrap(g.boost, 'update', 'boost.update');
          wrap(g.camRig, 'update', 'camRig.update');
          wrap(g.renderer, 'render', 'renderer.render');
        }
        if (window.__ready === true && window.__f.readyAt === null) {
          window.__f.readyAt = performance.now(); clearInterval(iv);
        }
      }, 4);
    });
    await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=dusk-highway-chase&res=1.0`,
      { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
    // Kill-control, applied AFTER __ready and BEFORE the first key, so the only thing it can
    // remove is what that first key triggers.
    if (KILL === 'audio-start') await page.evaluate(() => { window.__game.audio.start = () => {}; });
    await page.keyboard.down('KeyW');
    await sleep(2500);
    const r = await page.evaluate(() => {
      const c = window.__f;
      const r0 = c.readyAt;
      const after = c.rows.filter((x) => x.n >= r0);
      const inWin = after.filter((x) => x.n < r0 + 700);
      return { readyAt: r0, framesInWin: inWin.length,
        maxIn: Math.max(0, ...inWin.map((x) => x.d)),
        first: after.slice(0, 14),
        progsAtReady: window.__game.renderer.info.programs.length,
        warmStats: window.__warmStats || null,
        audioWarmMs: window.__audioWarmMs === undefined ? null : window.__audioWarmMs,
        longAfterReady: c.long.filter((x) => x[0] > r0 - 50 && x[0] < r0 + 900),
        hitchAt: (() => { const h = after.find((x) => x.d > 100); return h ? +(h.n - r0).toFixed(1) : null; })(),
        wrapped: !!c.wrapped };
    });
    console.log(`\nrun ${i + 1}: __ready ${r.readyAt.toFixed(0)} ms | frames in first 700 ms = ${r.framesInWin} | max delta ${r.maxIn.toFixed(1)} ms |  progs at ready ${r.progsAtReady} | warmStats ${JSON.stringify(r.warmStats)} audioWarm ${r.audioWarmMs} ms | wrapped ${r.wrapped}`);
    console.log('  #   delta   dProgs dGeos dTexs  calls   attribution (ms, CPU bracket, >0.4 only)');
    r.first.forEach((x, k) => {
      const sub = Object.entries(x.sub).sort((a, b) => b[1] - a[1])
        .map(([n, v]) => `${n} ${v}`).join('  ');
      console.log(`  ${String(k + 1).padStart(2)}  ${x.d.toFixed(1).padStart(7)}  ${String(x.dp ?? '').padStart(5)} ${String(x.dg ?? '').padStart(5)} ${String(x.dt ?? '').padStart(5)}  ${String(x.calls ?? '').padStart(5)}   ${sub}`);
    });
    console.log(`  hitch at ready+${r.hitchAt} ms | longtasks near ready: ${JSON.stringify(r.longAfterReady)}`);
    if (errs.length) console.log('  ERRORS: ' + errs.slice(0, 4).join(' | '));
    await page.close();
  }
}

// ---------------------------------------------------------------- mode: drive
// KILL-CONTROLS. Each runs ONCE after the scene is placed and before the warm-up, inside the
// same page, so the only difference between a kill run and a baseline run is the thing killed.
// A kill that needs a shader recompile forces one and the 3.5 s warm-up absorbs it.
const KILLS = {
  'none': () => {},
  // --- the sun's depth pass, four ways -------------------------------------------------------
  'shadow-casters-off': () => { window.__game.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = false; }); },
  'shadows-off': () => {
    const g = window.__game;
    g.renderer.shadowMap.enabled = false;
    g.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  },
  'shadow-2048': () => { const sh = window.__game.sky.sun.shadow; sh.mapSize.set(2048, 2048); if (sh.map) { sh.map.dispose(); sh.map = null; } },
  'shadow-1024': () => { const sh = window.__game.sky.sun.shadow; sh.mapSize.set(1024, 1024); if (sh.map) { sh.map.dispose(); sh.map = null; } },
  // The CEILING of any shadow-caching scheme: render the map once, then never again. Not
  // shippable as-is (the car's own shadow would freeze), but it bounds what caching could buy.
  'shadow-frozen': () => {
    const g = window.__game;
    g.sky.sun.shadow.autoUpdate = false;
    g.sky.sun.shadow.needsUpdate = true;
  },
  // --- the post chain, pass by pass ----------------------------------------------------------
  'ssao-off': () => { window.__game.ssao.enabled = false; },
  'bloom-off': () => { window.__game.bloom.enabled = false; },
  'output-off': () => { window.__game.outputPass.enabled = false; },
  'fxaa-off': () => { for (const p of window.__game.composer.passes) if (p.material && p.material.fragmentShader && /FXAA|fxaa/.test(p.material.fragmentShader)) p.enabled = false; },
  'post-chain-off': () => {
    const g = window.__game;
    g.ssao.enabled = false; g.bloom.enabled = false;
    for (const p of g.composer.passes) if (p !== g.composer.passes[0]) p.enabled = false;
    g.composer.passes[g.composer.passes.length - 1].enabled = true;   // keep something on screen
  },
  // --- everything else -----------------------------------------------------------------------
  'hud-off': () => { const h = window.__game.hud; if (h.setVisible) h.setVisible(false); if (h.group) h.group.visible = false; },
  // Bounds what a redraw rate limit could buy: the HUD still exists and still composites every
  // frame, it just re-DRAWS its canvas every other frame.
  'hud-30hz': () => {
    const h = window.__game.hud;
    const ou = h.update.bind(h);
    let n = 0;
    h.update = function (dt, s) { if ((n++ & 1) === 0) return ou(dt, s); };
  },
  'hud-draw-off': () => {
    const h = window.__game.hud;
    const ou = h.update.bind(h);
    let done = false;
    h.update = function (dt, s) { if (!done) { done = true; return ou(dt, s); } };
  },
  'world-hidden': () => { window.__game.world.group.visible = false; },
  'car-hidden': () => { window.__game.carRoot.visible = false; },
  'traffic-hidden': () => { const t = window.__game.traffic; if (t.group) t.group.visible = false; },
  'lights-0': () => { window.__game.world.setNight(false); },
  'refl-off': () => { const rk = window.__game.roadKit; if (rk.setMainCamera) rk.setMainCamera({ isCamera: true }); },
  // Reverts the sky to its pre-perf-r3 order/depth state at runtime: the paired A/B for the
  // renderOrder change, in the same page, so nothing else can differ.
  'sky-old': () => {
    const m = window.__game.sky.skyMesh;
    m.renderOrder = -1000;
    m.material.depthTest = false;
    m.material.needsUpdate = true;
  },
  'sky-off': () => { const m = window.__game.sky.skyMesh; if (m) m.visible = false; },
};

async function modeDrive() {
  const sc = SCENARIOS[SCEN];
  if (!sc) throw new Error('unknown scenario ' + SCEN);
  const out = [];
  console.log(`# mode=drive scenario=${SCEN} kill=${KILL || 'none'} warm=${WARM} meas=${MEAS} repeat=${REPEAT}`);
  for (let i = 0; i < REPEAT; i++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    const stopOsc = startOscillator(page, sc.oscillate);
    await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&res=1.0`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
    if (sc.tod) await page.evaluate((t) => window.__game.applyTimeOfDay(t), sc.tod);
    if (sc.wet !== undefined) await page.evaluate((w) => window.__game.applyWet(w), sc.wet);
    await page.evaluate((pl) => {
      const g = window.__game;
      const path = g.world.paths[pl.path];
      g.physics.placeOnPath(path, pl.u, pl.kmh / 3.6);
      if (pl.follow) g.physics.followPath(path, pl.follow); else g.physics.clearPath();
      g.traffic.reset(g.physics.state.pos);
      g.camRig.snap();
    }, sc.place);
    if (KILL) {
      await page.evaluate(`(${KILLS[KILL] ? KILLS[KILL].toString() : '() => { throw new Error("unknown kill " + ' + JSON.stringify(KILL) + ') }'})()`);
    }
    for (const k of sc.hold) await page.keyboard.down(k);
    await sleep(WARM);
    const p0 = await page.evaluate(() => ({ ...window.__game.physics.state.pos }));
    await page.evaluate(() => window.__game.frameStats.reset());
    await sleep(MEAS);
    const counters = await page.evaluate(async () => {
      // info resets at the top of every renderer.render() and the composer calls it once per
      // pass, so reading calls straight after a frame returns the last fullscreen quad only.
      // autoReset off + one reset + N counted rAF frames + divide is the only per-frame reading.
      const info = window.__game.renderer.info;
      const prev = info.autoReset; info.autoReset = false; info.reset();
      let seen = 0;
      await new Promise((done) => {
        const step = () => { if (++seen >= 20) return done(); requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
      const out = { calls: info.render.calls / seen, tris: info.render.triangles / seen };
      info.autoReset = prev; info.reset();
      return out;
    });
    const r = await page.evaluate(() => {
      const g = window.__game;
      const hudCanvases = Array.from(document.querySelectorAll('canvas'))
        .map((c) => `${c.width}x${c.height}`).join(' ');
      const gl = g.renderer.getContext();
      const s = g.frameStats.stats();
      const raw = g.frameStats.samples ? g.frameStats.samples() : null;
      return { s, raw, rs: g.renderSize(),
        glW: gl.drawingBufferWidth, glH: gl.drawingBufferHeight,
        pr: g.renderer.getPixelRatio(), dpr: window.devicePixelRatio,
        paused: g.isPaused(), pos: { ...g.physics.state.pos },
        kmh: Math.abs(g.physics.state.speed) * 3.6, hudCanvases,
        progs: g.renderer.info.programs.length };
    });
    if (r.glW !== 1280 || r.glH !== 720 || r.pr !== 1 || r.dpr !== DSF) {
      throw new Error(`BUFFER IS NOT 1280x720 ratio 1 dpr 1: ${JSON.stringify({ glW: r.glW, glH: r.glH, pr: r.pr, dpr: r.dpr })}`);
    }
    // Honest reconstruction of the catch-up tick artefact perfcritic-r2 1d found: a sub-3.5 ms
    // rAF delta after --disable-frame-rate-limit is a catch-up BeginFrame, not a presented
    // frame. Merge it into its predecessor before deriving delivered fps and share-over-16.7.
    let merged = null;
    if (r.raw && r.raw.length) {
      const m = [];
      for (const d of r.raw) {
        if (d < 3.5 && m.length) m[m.length - 1] += d; else m.push(d);
      }
      const sorted = [...m].sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      const total = m.reduce((a, b) => a + b, 0);
      merged = { n: m.length, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: sorted[sorted.length - 1],
        fps: (m.length / total) * 1000, over: (m.filter((d) => d > 16.7).length / m.length) * 100 };
    }
    const dist = Math.hypot(r.pos.x - p0.x, r.pos.z - p0.z);
    out.push({ ...r.s, merged, dist });
    const M = merged || {};
    console.log(`run ${i + 1}: p50 ${r.s.p50.toFixed(2)} | merged p50 ${(M.p50 || 0).toFixed(2)} p90 ${(M.p90 || 0).toFixed(1)} p99 ${(M.p99 || 0).toFixed(1)} max ${(M.max || 0).toFixed(1)} | ${(M.fps || 0).toFixed(1)} fps delivered | ${(M.over || 0).toFixed(1)}% over 16.7 | ${dist.toFixed(0)} m at ${r.kmh.toFixed(0)} km/h | calls ${counters.calls.toFixed(0)} tris ${(counters.tris / 1e6).toFixed(2)}M progs ${r.progs} | renderSize ${JSON.stringify(r.rs)} glDrawingBuffer ${r.glW}x${r.glH} | canvases ${r.hudCanvases}`);
    if (errs.length) console.log('  ERRORS: ' + errs.slice(0, 4).join(' | '));
    await stopOsc();
    await page.close();
  }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const mp50 = out.map((o) => o.merged.p50), fps = out.map((o) => o.merged.fps),
    over = out.map((o) => o.merged.over), p99 = out.map((o) => o.merged.p99);
  console.log(`\nSUMMARY ${SCEN} kill=${KILL || 'none'}: p50 ${mp50.map((v) => v.toFixed(2)).join(' / ')} -> median ${med(mp50).toFixed(2)} ms | fps ${fps.map((v) => v.toFixed(1)).join(' / ')} -> ${med(fps).toFixed(1)} | over16.7 ${over.map((v) => v.toFixed(1)).join(' / ')}% -> ${med(over).toFixed(1)}% | p99 ${p99.map((v) => v.toFixed(1)).join(' / ')} -> ${med(p99).toFixed(1)} ms | 1280x720 ratio 1 dpr ${DSF} resScale 1`);
}

if (MODE === 'first') await modeFirst();
else if (MODE === 'drive') await modeDrive();
else throw new Error('unknown mode ' + MODE);
await browser.close(); server.close(); process.exit(0);
