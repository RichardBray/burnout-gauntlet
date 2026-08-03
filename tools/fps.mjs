// fps.mjs — the frame-time harness. Boots a static server over game/, drives the car for
// real on the playable path, and reports rAF-to-rAF frame times with the render buffer size
// attached to every single line.
//
//   node tools/fps.mjs                                   all scenarios, 3 runs each, 1280x720
//   node tools/fps.mjs --scenarios cruise --repeat 5
//   node tools/fps.mjs --res 1.0,0.75,0.5                resolution sweep
//   node tools/fps.mjs --subsystem                       cost attribution per subsystem
//   node tools/fps.mjs --json out/fps.json
//
// WHY THIS FILE EXISTS, AND WHAT IT REFUSES TO DO.
//
// This is a Retina machine. `devicePixelRatio` is 2, so a 1280x720 canvas naively configured
// renders a 2560x1440 buffer and every frame-rate number taken from it is a lie by 4x. main.js
// caps the renderer's pixel ratio to `resScale` to stop that at the source; this harness is the
// second half of the same contract. It reads `ctx.renderSize()` out of the live page and REFUSES
// TO PRINT A STATISTIC when the buffer is not the size the caller asked for. A harness that
// prints a number beside a warning is a harness whose number gets quoted without the warning.
//
// Frame time is read from `window.__frameStats`, which rings rAF-callback to rAF-callback
// wall-clock deltas. It is not re-derived here and it is deliberately NOT a `performance.now()`
// bracket around `composer.render()`: GPU work is pipelined, so that bracket reads ~4 ms on a
// build that is visibly dropping frames. This project has shipped four separate metrics that could
// be satisfied without the thing they claimed to measure (STATE.md, permanent rule 3) and a
// CPU-side render bracket is that failure again.
//
// Frame time also cannot tolerate concurrency. If other agents or builds are running on this
// machine, the numbers are smoke tests and must be labelled as such; there is no way to detect
// stolen GPU time after the fact.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const num = (v, d) => (v === undefined || v === true ? d : +v);
const list = (v, d) => (v === undefined || v === true ? d : String(v).split(',').map((s) => s.trim()).filter(Boolean));

const W = num(args.w, 1280);
const H = num(args.h, 720);
const SCENE = args.scene && args.scene !== true ? String(args.scene) : 'dusk-highway-chase';
const REPEAT = Math.max(1, num(args.repeat, 3));
const WARMUP_MS = num(args.warmup, 2.5) * 1000;
const MEASURE_MS = num(args.measure, 8) * 1000;
const RES_LIST = list(args.res, ['1.0']).map(Number);
const DSF = num(args.dsf, 1);          // playwright deviceScaleFactor; 1 is the contract
const ALLOW_DPR = !!args['allow-dpr']; // only for proving the guard sees devicePixelRatio 2
const FORCE_RATIO = num(args['force-ratio'], 0); // kill-control: lie to the renderer on purpose
const SUBSYSTEM = !!args.subsystem;
const SUB_SCENARIO = args['sub-scenario'] && args['sub-scenario'] !== true
  ? String(args['sub-scenario']) : 'cruise';
const COUNTER_FRAMES = Math.max(10, num(args['counter-frames'], 40));
const JSON_OUT = args.json && args.json !== true ? resolve(String(args.json)) : null;

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');

// ---------------------------------------------------------------------------
// scenario table
// ---------------------------------------------------------------------------
// Each scenario is a real drive on the real playable path (`#nomenu=1`, so no click is ever
// needed and a measurement never depends on one). `hold` is the set of KeyboardEvent.code values
// held down for the whole run; `place` snaps the car onto one of world.paths so "city" actually
// measures the downtown grid rather than the highway; `oscillate` alternates two steering keys
// so "corner" is genuinely cornering rather than nominally so.
//
// WHY MOST SCENARIOS LANE-KEEP WITH followPath. The playable loop calls physics.clearPath(), so a
// keyboard-only "hold W" drives dead straight; over an 8 s window at ~38 m/s that is 300 m, which is
// enough to leave any curved path and start scraping building blocks. The scenario then stops
// measuring the place it claims to measure, and worse, stops measuring the same place twice.
// followPath auto-steers along the road while STILL reading `boost` off the live keyboard
// (physics.step overrides steer/throttle/brake and nothing else), so throttle and Shift remain real
// input and the drive stays where the scenario says it is. `corner` is the deliberate exception: it
// clears the path so the oscillating keyboard steer is the only thing turning the car.
//
// DO NOT read the ~137 km/h that cruise/city/corner all report as a fault. That is this car's
// terminal speed on throttle alone: physics.js drag balances the throttle term at 38.2 m/s
// (TUNE.coastDrag 0.55, accel 16.5, vMax 78). The 232/300 km/h placements are start states that
// decay to it within the warmup, and `boost` is the only scenario that reads above it.
const SCENARIOS = {
  cruise: {
    desc: 'throttle held, no boost, highway, lane-keeping',
    hold: ['KeyW'],
    place: { path: 'highway', u: 0.30, kmh: 232, follow: 26 },
  },
  boost: {
    desc: 'throttle + Shift held, highway, lane-keeping',
    hold: ['KeyW', 'ShiftLeft'],
    place: { path: 'highway', u: 0.22, kmh: 300, follow: 34 },
  },
  corner: {
    desc: 'throttle + keyboard steering slalom on a 1.6 s period, path cleared, open highway',
    hold: ['KeyW'],
    // ON THE HIGHWAY, NOT DOWNTOWN, and this took a measurement to learn. Steering by keyboard
    // through the city grid with the path cleared put the car into a building within two seconds;
    // physics.collide() multiplies speed by 0.62 on every contact, so the window ended up measuring
    // a car sitting still in an alley at 2.65 km/h. The open highway has room to slalom.
    place: { path: 'highway', u: 0.30, kmh: 232, follow: false },
    // 0.8 s per side. At the ~38 m/s terminal speed the yaw rate is ~1.2 rad/s, so 0.8 s is a ~55
    // deg heading swing each way: unambiguously cornering, with real slip and lean, while still
    // averaging out to roughly down-road so the car does not spiral off the carriageway.
    oscillate: { keys: ['KeyA', 'KeyD'], halfPeriodMs: 800 },
  },
  city: {
    desc: 'throttle held in the dense downtown grid, lane-keeping',
    hold: ['KeyW'],
    place: { path: 'city', u: 0.34, kmh: 150, follow: 26 },
  },
  'night-wet': {
    desc: 'night time-of-day + wet 1.0 downtown, the most expensive shading path',
    hold: ['KeyW'],
    place: { path: 'city', u: 0.565, kmh: 150, follow: 26 },
    tod: 'night',
    wet: 1,
  },
};
const SCENARIO_NAMES = list(args.scenarios, Object.keys(SCENARIOS));
const TOGGLE_NAMES = list(args.toggles, null); // null = all, else a comma list of toggle names
for (const n of SCENARIO_NAMES) {
  if (!SCENARIOS[n]) {
    console.error(`unknown scenario "${n}". known: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// subsystem toggle table
// ---------------------------------------------------------------------------
// Every entry pokes LIVE objects reachable from window.__game. Nothing here edits game/*.js,
// which is the point: an attribution table that requires a source edit per row cannot be re-run
// by the next wave, and cannot be trusted to have measured the build that shipped.
//
// `on` disables the subsystem, `off` restores it. Both run inside the page.
const TOGGLES = [
  {
    name: 'post-chain-off',
    note: 'RenderPass straight to the canvas; SSAO+bloom+smear+grade all bypassed',
    // EffectComposer picks its render-to-screen pass with isLastEnabledPass(), so disabling
    // every pass after RenderPass makes RenderPass itself draw to the default framebuffer.
    // That is a genuine bypass of the whole chain, not a cheaper version of it.
    on: `const g = window.__game;
         window.__sub = g.composer.passes.slice(1).map((p) => [p, p.enabled]);
         for (const [p] of window.__sub) p.enabled = false;`,
    off: `for (const [p, e] of window.__sub) p.enabled = e; window.__sub = null;`,
  },
  {
    name: 'ssao-off',
    note: 'SSAO pass disabled',
    on: `window.__game.ssao.enabled = false;`,
    off: `window.__game.ssao.enabled = true;`,
  },
  {
    name: 'bloom-off',
    note: 'bloom pass disabled',
    on: `window.__game.bloom.enabled = false;`,
    off: `window.__game.bloom.enabled = true;`,
  },
  {
    name: 'smear-pass-off',
    note: 'boost radial-smear pass disabled',
    on: `window.__game.boost.pass.enabled = false;`,
    off: `window.__game.boost.pass.enabled = true;`,
  },
  {
    name: 'output-grade-off',
    note: 'graded tonemap output pass disabled (frame will look wrong; cost only)',
    on: `window.__game.outputPass.enabled = false;`,
    off: `window.__game.outputPass.enabled = true;`,
  },
  {
    name: 'traffic-hidden',
    note: 'traffic.group.visible = false',
    on: `window.__game.traffic.group.visible = false;`,
    off: `window.__game.traffic.group.visible = true;`,
  },
  {
    name: 'world-hidden',
    note: 'world.group.visible = false (city, roads, props, lamps)',
    on: `window.__game.world.group.visible = false;`,
    off: `window.__game.world.group.visible = true;`,
  },
  {
    name: 'sky-hidden',
    note: 'sky.skyMesh.visible = false',
    on: `const m = window.__game.sky.skyMesh; if (m) m.visible = false;`,
    off: `const m = window.__game.sky.skyMesh; if (m) m.visible = true;`,
  },
  {
    name: 'car-hidden',
    note: 'carRoot.visible = false (hero shell, glass, lights)',
    on: `window.__game.carRoot.visible = false;`,
    off: `window.__game.carRoot.visible = true;`,
  },
  {
    name: 'hud-off',
    note: 'hud.setVisible(false) — the HUD is a separate 2-D canvas at full window res',
    on: `window.__game.hud.setVisible(false);`,
    off: `window.__game.hud.setVisible(true);`,
  },
  {
    name: 'shadows-off',
    note: 'renderer.shadowMap.enabled = false (4096 map, PCFSoft)',
    // shadowMap.enabled is a shader DEFINE, so flipping it without invalidating every material
    // measures nothing at all: three keeps handing out the already-compiled shadow-sampling
    // programs. The needsUpdate sweep forces the recompile, and the caller re-warms afterwards so
    // that stall lands outside the measurement window.
    //
    // DELIBERATELY LAST IN THIS LIST. The recompile leaks ~60 extra entries into
    // renderer.info.programs that never go away, so running it early poisons the `progs` column of
    // every row after it. Last means only its own row and the closing baseline carry the inflation.
    on: `const g = window.__game; g.renderer.shadowMap.enabled = false;
         g.scene.traverse((o) => { const m = o.material; if (!m) return;
           if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; });`,
    off: `const g = window.__game; g.renderer.shadowMap.enabled = true;
          g.scene.traverse((o) => { const m = o.material; if (!m) return;
            if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; });`,
  },
];

// `--toggles a,b` narrows the sweep. An 11-row sweep is minutes long, and re-confirming ONE row
// after the tree changes under you should not cost a full pass.
if (TOGGLE_NAMES) {
  const keep = new Set(TOGGLE_NAMES);
  for (const n of keep) {
    if (!TOGGLES.some((t) => t.name === n)) {
      console.error(`unknown toggle "${n}". known: ${TOGGLES.map((t) => t.name).join(', ')}`);
      process.exit(2);
    }
  }
  TOGGLES.splice(0, TOGGLES.length, ...TOGGLES.filter((t) => keep.has(t.name)));
}

// ---------------------------------------------------------------------------
// static server (same shape as tools/shot.mjs)
// ---------------------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

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

const browser = await chromium.launch({
  // Identical flag set to tools/shot.mjs. --disable-frame-rate-limit is the load-bearing one:
  // without it chromium caps rAF at the display refresh and every measurement pins to 16.7 ms
  // regardless of how much work the frame actually does.
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '   -  ' : v.toFixed(2));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

class HarnessError extends Error {}

/**
 * Refuse to report anything when the buffer is not the size the caller asked for.
 * This is the whole reason the harness exists; it is a throw, never a warning.
 */
function assertRenderSize(rs, res, label) {
  const wantW = Math.floor(W * res), wantH = Math.floor(H * res);
  const bad = [];
  if (rs.w !== wantW || rs.h !== wantH) bad.push(`buffer ${rs.w}x${rs.h}, expected ${wantW}x${wantH}`);
  if (Math.abs(rs.pixelRatio - res) > 1e-6) bad.push(`pixelRatio ${rs.pixelRatio}, expected ${res}`);
  if (!ALLOW_DPR && rs.devicePixelRatio !== 1) {
    bad.push(`devicePixelRatio ${rs.devicePixelRatio}, expected 1 (pass --allow-dpr to measure anyway)`);
  }
  if (bad.length) {
    throw new HarnessError(
      `RENDER SIZE CONTRACT VIOLATED (${label})\n` +
      `  observed: renderW ${rs.w} renderH ${rs.h} cssW ${rs.cssW} cssH ${rs.cssH} ` +
      `pixelRatio ${rs.pixelRatio} devicePixelRatio ${rs.devicePixelRatio}\n` +
      bad.map((b) => `  ! ${b}`).join('\n') +
      `\n  refusing to report a frame-time number for a buffer this is not.`);
  }
}

/** One booted, driving page. Caller must close it. */
async function openPage(res) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page._fpsErrors = errors;
  const hash = `#nomenu=1&scene=${SCENE}&res=${res}`;
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true && !!window.__frameStats', null, { timeout: 120000 });
  if (FORCE_RATIO) {
    // KILL-CONTROL for the guard itself. Lies to the renderer about the pixel ratio the exact
    // way the pre-wave-S build did, so we can prove the harness refuses rather than assume it.
    await page.evaluate((r) => {
      const g = window.__game;
      g.renderer.setPixelRatio(r);
      g.renderer.setSize(window.innerWidth, window.innerHeight, false);
      g.composer.setPixelRatio(r);
      g.composer.setSize(window.innerWidth, window.innerHeight);
    }, FORCE_RATIO);
  }
  return page;
}

/**
 * Put the car back on its mark. Called once at setup AND again before every measurement window in
 * --subsystem mode: eleven serial toggles take minutes of wall clock, the car covers kilometres in
 * that time, and two rows taken from different parts of the map are not comparable at all. The
 * first version of this harness did not respot and its attribution table credited 36 ms and 164
 * draw calls to hiding an EMPTY traffic group, which is how the flaw was caught.
 */
async function respot(page, sc) {
  if (!sc.place) return;
  await page.evaluate((p) => {
    const g = window.__game;
    const path = g.world.paths[p.path];
    g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
    if (p.follow) g.physics.followPath(path, p.follow);
    else g.physics.clearPath();
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  }, sc.place);
}

async function applyScenario(page, sc) {
  if (sc.tod) await page.evaluate((t) => window.__game.applyTimeOfDay(t), sc.tod);
  if (sc.wet !== undefined) await page.evaluate((w) => window.__game.applyWet(w), sc.wet);
  await respot(page, sc);
  for (const k of sc.hold) await page.keyboard.down(k);
}

/** Steering oscillator. Returns a stop function; runs unawaited beside the measurement. */
function startOscillator(page, osc) {
  if (!osc) return async () => {};
  let stop = false;
  const loop = (async () => {
    let i = 0;
    while (!stop) {
      const k = osc.keys[i % osc.keys.length];
      const other = osc.keys[(i + 1) % osc.keys.length];
      try {
        await page.keyboard.up(other);
        await page.keyboard.down(k);
      } catch { return; }
      const t0 = Date.now();
      while (!stop && Date.now() - t0 < osc.halfPeriodMs) await sleep(40);
      i++;
    }
    try { for (const k of osc.keys) await page.keyboard.up(k); } catch { /* page gone */ }
  })();
  return async () => { stop = true; await loop; };
}

/**
 * Cheap engine counters, averaged over real frames.
 *
 * WHY THE AVERAGING. WebGLRenderer.info resets at the top of every renderer.render() call and the
 * composer calls render once per enabled pass, so reading info.render.calls straight after a frame
 * returns the cost of THE LAST PASS ONLY — a two-triangle fullscreen quad. autoReset off + one
 * reset + N counted rAF frames + divide is the only reading that means "per frame".
 */
async function readCounters(page, frames) {
  return page.evaluate(async (n) => {
    const info = window.__game.renderer.info;
    const prev = info.autoReset;
    info.autoReset = false;
    info.reset();
    let seen = 0;
    await new Promise((done) => {
      const step = () => { if (++seen >= n) return done(); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    const out = {
      frames: seen,
      calls: info.render.calls / seen,
      triangles: info.render.triangles / seen,
      programs: info.programs ? info.programs.length : null,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
    info.autoReset = prev;
    info.reset();
    return out;
  }, frames);
}

/** reset -> wait -> stats(), with the size guard in front of the result. */
async function measureWindow(page, res, label, ms) {
  await page.evaluate(() => window.__frameStats.reset());
  await sleep(ms);
  const st = await page.evaluate(() => window.__frameStats.stats());
  if (!st) throw new HarnessError(`no frames captured (${label}) — the rAF loop is not running`);
  const rs = await page.evaluate(() => window.__game.renderSize());
  assertRenderSize(rs, res, label);
  return { ...st, ...{ cssW: rs.cssW, cssH: rs.cssH } };
}

// ---------------------------------------------------------------------------
// one run: fresh page, boot, place, hold throttle, warm, measure
// ---------------------------------------------------------------------------
async function runOnce(scenarioName, res, runIdx) {
  const sc = SCENARIOS[scenarioName];
  const page = await openPage(res);
  const stopOsc = startOscillator(page, sc.oscillate);
  try {
    await applyScenario(page, sc);
    // Warm up before resetting the window: boot leaves a shader-compile stall and a first-touch
    // texture upload in the ring, and neither is a frame the player ever sees twice.
    await sleep(WARMUP_MS);
    const st = await measureWindow(page, res, `${scenarioName} res ${res} run ${runIdx + 1}`, MEASURE_MS);
    const counters = await readCounters(page, COUNTER_FRAMES);
    // Proof the drive actually happened: a scenario that stalled against a wall, or a "corner"
    // that never left a straight line, is visible here and nowhere else in the table.
    const drive = await page.evaluate(() => {
      const st = window.__game.physics.state;
      return { kmh: Math.abs(st.speed) * 3.6, slip: Math.abs(st.slip) };
    });
    return { ...st, counters, ...drive, errors: page._fpsErrors.slice(0, 5) };
  } finally {
    await stopOsc();
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------
const HDR = ['scenario', 'res', 'run', 'n', 'mean', 'p50', 'p90', 'p99', 'max',
  'fpsP50', '>16.7%', 'renderW', 'renderH', 'ratio', 'dpr', 'resScale',
  'calls', 'tris', 'progs', 'geos', 'texs', 'km/h', '|slip|'];
const WID = [12, 5, 4, 5, 8, 8, 8, 9, 9, 7, 7, 8, 8, 6, 4, 8, 6, 9, 6, 6, 6, 7, 7];

function headerLine() {
  return HDR.map((h, i) => lpad(h, WID[i])).join(' ');
}
function rowLine(scenario, res, run, r) {
  const c = r.counters || {};
  const vals = [scenario, res.toFixed(2), run, r.n, f2(r.mean), f2(r.p50), f2(r.p90), f2(r.p99),
    f2(r.max), f2(r.fpsP50), f2(r.over16_7pct), r.renderW, r.renderH, r.pixelRatio,
    r.devicePixelRatio, r.resScale, Math.round(c.calls), Math.round(c.triangles),
    c.programs, c.geometries, c.textures, f2(r.kmh), f2(r.slip)];
  return vals.map((v, i) => lpad(v, WID[i])).join(' ');
}

function spread(vals) {
  const a = vals.slice().sort((x, y) => x - y);
  return { min: a[0], med: a[Math.floor((a.length - 1) / 2)], max: a[a.length - 1],
    rangePct: a[0] ? 100 * (a[a.length - 1] - a[0]) / a[0] : 0 };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const report = {
  when: new Date().toISOString(),
  scene: SCENE, viewport: { w: W, h: H, deviceScaleFactor: DSF },
  warmupMs: WARMUP_MS, measureMs: MEASURE_MS, repeat: REPEAT,
  concurrencyWarning: 'frame time is invalid under concurrent load; label these smoke tests unless you own the machine',
  runs: [], spreads: [], subsystem: null,
};
let exitCode = 0;

try {
  console.log(`# tools/fps.mjs  scene=${SCENE}  viewport ${W}x${H} dsf ${DSF}  ` +
    `warmup ${(WARMUP_MS / 1000).toFixed(1)}s  measure ${(MEASURE_MS / 1000).toFixed(1)}s  repeat ${REPEAT}`);
  console.log('# frame time is rAF-to-rAF from window.__frameStats. Invalid under concurrent load.');

  if (!SUBSYSTEM) {
    console.log('');
    console.log(headerLine());
    for (const res of RES_LIST) {
      for (const name of SCENARIO_NAMES) {
        const p50s = [];
        for (let i = 0; i < REPEAT; i++) {
          const r = await runOnce(name, res, i);
          console.log(rowLine(name, res, i + 1, r));
          if (r.errors.length) console.log(`   page errors: ${r.errors.join(' | ')}`);
          report.runs.push({ scenario: name, res, run: i + 1, ...r });
          p50s.push(r.p50);
        }
        if (REPEAT > 1) {
          const s = spread(p50s);
          console.log(`   SPREAD ${pad(name, 12)} res ${res.toFixed(2)}  p50 across ${REPEAT} runs: ` +
            `min ${f2(s.min)}  med ${f2(s.med)}  max ${f2(s.max)}  range ${f2(s.rangePct)}%` +
            `   [${p50s.map((v) => v.toFixed(2)).join(', ')}]`);
          report.spreads.push({ scenario: name, res, p50s, ...s });
        }
      }
    }
    if (RES_LIST.length > 1) {
      console.log('');
      // BEST p50 across the repeats, not the median. Same one-sided argument as the subsystem
      // table: contention only ever slows a frame, so the floor is the estimator that survives it.
      // The median is printed underneath because a large gap between the two is itself the signal
      // that the machine was not quiet and the sweep should be re-run alone.
      console.log('# resolution sweep. Headline is the BEST p50 of the repeats per cell.');
      for (const name of SCENARIO_NAMES) {
        for (const stat of ['min', 'med']) {
          const cells = RES_LIST.map((res) => {
            const rs = report.runs.filter((r) => r.scenario === name && r.res === res).map((r) => r.p50);
            if (!rs.length) return `${res.toFixed(2)}: -`;
            const m = spread(rs)[stat];
            return `${res.toFixed(2)}: ${m.toFixed(1)}${m <= 16.7 ? '*' : ' '}`;
          });
          console.log(`  ${pad(name, 12)} ${stat === 'min' ? 'best' : ' med'} p50 ms   ${cells.join('  ')}`);
        }
      }
      console.log('  (* = p50 <= 16.7 ms, i.e. holds 60 fps at that resolution scale)');
    }
  } else {
    // -----------------------------------------------------------------------
    // subsystem attribution: INTERLEAVED A/B, one page session, car respotted
    // -----------------------------------------------------------------------
    // WHY INTERLEAVED. The first design took one baseline, then eleven toggles, then a closing
    // baseline. Two things broke it. (1) The car kept driving, so by toggle six it was kilometres
    // away scraping a building at a third of the speed; the table happily credited 36 ms and 164
    // draw calls to hiding an EMPTY traffic group. (2) An 11-row serial sweep drifts more than most
    // of the deltas it is trying to resolve, and a single before/after pair cannot separate the two.
    //
    // So: respot the car before EVERY window, and measure its own baseline immediately before every
    // toggle. Each delta is then a paired difference taken seconds apart from the same mark, and
    // --repeat passes give the delta a spread, which is the only thing that can say "not noise".
    const res = RES_LIST[0];
    const sc = SCENARIOS[SUB_SCENARIO];
    if (!sc) throw new HarnessError(`unknown --sub-scenario ${SUB_SCENARIO}`);
    const passes = args.repeat === undefined ? 2 : REPEAT;
    console.log('');
    console.log(`# SUBSYSTEM ATTRIBUTION  scenario=${SUB_SCENARIO} (${sc.desc})  res=${res.toFixed(2)}  ` +
      `passes=${passes}  interleaved A/B, car respotted before every window`);
    console.log('# every toggle pokes live objects via window.__game; no file in game/ is edited.');
    const page = await openPage(res);
    const stopOsc = startOscillator(page, sc.oscillate);
    /** respot -> warm -> measure -> counters, the unit of work every row is built from. */
    const window_ = async (label) => {
      await respot(page, sc);
      await sleep(WARMUP_MS);
      const st = await measureWindow(page, res, label, MEASURE_MS);
      const c = await readCounters(page, COUNTER_FRAMES);
      const d = await page.evaluate(() => {
        const s = window.__game.physics.state;
        return { kmh: Math.abs(s.speed) * 3.6, slip: Math.abs(s.slip) };
      });
      return { ...st, counters: c, ...d };
    };
    const acc = new Map(TOGGLES.map((t) => [t.name, { name: t.name, note: t.note, pairs: [] }]));
    const baseAll = [];
    try {
      await applyScenario(page, sc);
      console.log('');
      console.log(headerLine());
      for (let pass = 0; pass < passes; pass++) {
        for (const t of TOGGLES) {
          const base = await window_(`baseline (pass ${pass + 1}, before ${t.name})`);
          console.log(rowLine('BASELINE', res, pass + 1, base));
          baseAll.push(base.p50);
          await page.evaluate(t.on);
          // Full warmup again after the toggle: a shadowMap recompile is hundreds of milliseconds
          // and belongs outside the window, not inside it inflating the very delta we want.
          const off = await window_(`toggle ${t.name} (pass ${pass + 1})`);
          console.log(rowLine(t.name, res, pass + 1, off));
          await page.evaluate(t.off);
          acc.get(t.name).pairs.push({ basePin: base.p50, offP50: off.p50,
            deltaMs: base.p50 - off.p50, baseStats: base, offStats: off });
        }
      }

      const baseSpread = spread(baseAll);
      console.log('');
      console.log(`# ${baseAll.length} interleaved baseline windows: p50 min ${f2(baseSpread.min)} ` +
        `med ${f2(baseSpread.med)} max ${f2(baseSpread.max)} (range ${f2(baseSpread.rangePct)}%). ` +
        `That range is the noise floor of this machine right now.`);
      const noiseFloor = baseSpread.max - baseSpread.min;
      // The gate for the min-envelope column is the spread of the per-toggle baseline MINIMA, which
      // is what a zero-cost toggle would produce by chance. Much tighter than the full range, and it
      // is the honest floor for the statistic actually being ranked.
      const perToggleBaseMins = [...acc.values()].map((r) => Math.min(...r.pairs.map((p) => p.basePin)));
      const bmSpread = spread(perToggleBaseMins);
      const noiseFloorClean = bmSpread.max - bmSpread.min;
      console.log(`# per-toggle baseline MINIMA: ${f2(bmSpread.min)} .. ${f2(bmSpread.max)} ms ` +
        `-> min-envelope noise floor ${f2(noiseFloorClean)} ms. Full-range floor ${f2(noiseFloor)} ms.`);
      console.log('# REAL = clears the min-envelope floor and has the same sign in every pass.');
      console.log('');
      // WHY THE HEADLINE COLUMN IS A MINIMUM AND NOT A MEDIAN.
      // Contention is one-sided: a peer agent stealing GPU or CPU can only ever make a frame
      // SLOWER, never faster. So the lowest p50 a state produced across all passes is the closest
      // thing to that state's uncontended cost, and min(baseline) - min(toggle) is far more robust
      // than any central statistic when the baseline range is 300%. The median of the paired deltas
      // is kept beside it because when the two disagree the disagreement is itself the finding.
      const ranked = [...acc.values()].map((r) => {
        const deltas = r.pairs.map((p) => p.deltaMs);
        const s = spread(deltas);
        const bases = r.pairs.map((p) => p.basePin);
        const offs = r.pairs.map((p) => p.offP50);
        const minBase = Math.min(...bases), minOff = Math.min(...offs);
        const sameSign = deltas.every((d) => d > 0) || deltas.every((d) => d < 0);
        const cleanDelta = minBase - minOff;
        return { name: r.name, note: r.note, deltas, deltaMed: s.med, deltaMin: s.min,
          deltaMax: s.max, baselineMed: spread(bases).med, offMed: spread(offs).med,
          minBase, minOff, cleanDelta, cleanPct: 100 * cleanDelta / minBase,
          deltaPct: 100 * s.med / spread(bases).med, sameSign,
          callsSaved: spread(r.pairs.map((p) => p.baseStats.counters.calls - p.offStats.counters.calls)).med,
          trisSaved: spread(r.pairs.map((p) => p.baseStats.counters.triangles - p.offStats.counters.triangles)).med,
          nPos: deltas.filter((d) => d > 0).length, nPass: deltas.length,
          // THE VERDICT RULE, stated so it can be argued with rather than trusted.
          //   REAL   sign agrees in every pass AND the min-envelope delta clears the noise floor.
          //   likely sign agrees in every pass and the WEAKEST pass still saw >= 2 ms. Under
          //          contention a genuinely-zero-cost toggle scatters sign; consistent sign across
          //          four independent passes is the one piece of evidence contention cannot fake.
          //   noise  anything else. Do not act on a `noise` row.
          verdict: (sameSign && cleanDelta > noiseFloorClean) ? 'REAL'
            : (sameSign && Math.min(...deltas.map(Math.abs)) >= 2) ? 'likely' : 'noise' };
      }).sort((a, b) => b.cleanDelta - a.cleanDelta);
      console.log('# RANKED SUBSYSTEM ATTRIBUTION, most expensive first.');
      console.log('# minBase/minOff are the LOWEST p50 each state reached across all passes: contention');
      console.log('# is one-sided (it can only slow a frame), so the floor is the robust estimator here.');
      console.log(`${pad('subsystem disabled', 20)} ${lpad('minBase', 8)} ${lpad('minOff', 8)} ` +
        `${lpad('delta', 8)} ${lpad('delta%', 7)} ${lpad('medDelta', 9)} ${lpad('calls-', 7)} ` +
        `${lpad('tris-', 10)} ${lpad('sign', 5)} ${lpad('verdict', 8)}  per-pass deltas`);
      for (const r of ranked) {
        console.log(`${pad(r.name, 20)} ${lpad(f2(r.minBase), 8)} ${lpad(f2(r.minOff), 8)} ` +
          `${lpad(f2(r.cleanDelta), 8)} ${lpad(f2(r.cleanPct), 7)} ${lpad(f2(r.deltaMed), 9)} ` +
          `${lpad(Math.round(r.callsSaved), 7)} ${lpad(Math.round(r.trisSaved), 10)} ` +
          `${lpad(`${r.nPos}/${r.nPass}`, 5)} ${lpad(r.verdict, 8)}  [${r.deltas.map((d) => d.toFixed(1)).join(', ')}]`);
      }
      console.log('');
      for (const r of ranked) console.log(`  ${pad(r.name, 20)} ${r.note}`);
      const anyBase = acc.get(TOGGLES[0].name).pairs[0].baseStats;
      console.log('');
      console.log(`# render buffer for EVERY line above: renderW ${anyBase.renderW} renderH ${anyBase.renderH} ` +
        `pixelRatio ${anyBase.pixelRatio} devicePixelRatio ${anyBase.devicePixelRatio} resScale ${anyBase.resScale}`);
      console.log(`# baseline counters: ${Math.round(anyBase.counters.calls)} draw calls/frame, ` +
        `${Math.round(anyBase.counters.triangles)} triangles/frame, ${anyBase.counters.programs} programs, ` +
        `${anyBase.counters.geometries} geometries, ${anyBase.counters.textures} textures`);
      report.subsystem = { scenario: SUB_SCENARIO, res, passes, baselineP50s: baseAll,
        baselineSpread: baseSpread,
        // Two different floors, and confusing them is easy: `Range` is the spread of ALL baseline
        // windows (the machine's overall noise), `Clean` is the spread of the per-toggle baseline
        // MINIMA and is the gate the ranked verdict column actually uses.
        noiseFloorRangeMs: noiseFloor, noiseFloorCleanMs: noiseFloorClean, ranked };
      if (page._fpsErrors.length) console.log(`# page errors: ${page._fpsErrors.slice(0, 8).join(' | ')}`);
    } finally {
      await stopOsc();
      await page.close();
    }
  }

  if (JSON_OUT) {
    await mkdir(dirname(JSON_OUT), { recursive: true });
    await writeFile(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`\njson ${JSON_OUT}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`\nFAILED: ${e.message}`);
  if (!(e instanceof HarnessError)) console.error(e.stack);
} finally {
  await browser.close();
  server.close();
  process.exit(exitCode);
}
