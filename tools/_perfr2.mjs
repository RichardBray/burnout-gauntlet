// _perfr2.mjs — the wave-S round-2 perf instrument.
//
// tools/fps.mjs owns the scenario table and the headline numbers; this file owns the two things it
// cannot do for this round's target:
//
//   1. DECOMPOSE night-wet. `night-wet` is one scenario name hiding four independent states
//      (day/night x dry/wet) at one map position, and the round-1 verdict routed its 49 ms without
//      ever separating them. `--mode decomp` measures all four in ONE page, paired, interleaved.
//   2. KILL-CONTROL things that need a MATERIAL RECOMPILE to be real. The number of visible lights
//      in the scene is a shader define (`NUM_POINT_LIGHTS`), so flipping `light.visible` without
//      invalidating every material measures nothing at all — three keeps handing out the
//      already-compiled program. Every variant here that changes a define does the needsUpdate
//      sweep and then re-warms before its window opens, exactly as fps.mjs's `shadows-off` does.
//
// Every window: rAF-to-rAF from window.__frameStats, viewport 1280x720, deviceScaleFactor 1,
// `ctx.renderSize()` asserted to be 1280x720 @ ratio 1 dpr 1 or the run throws.
//
//   node tools/_perfr2.mjs --mode decomp
//   node tools/_perfr2.mjs --mode kill --scenario night-wet --variants lights-0,ssao-off
//   node tools/_perfr2.mjs --mode kill --scenario night-wet --variants all --repeat 3
//   node tools/_perfr2.mjs --mode sweep --scenario night-wet --pool 14,10,6,4
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const num = (v, d) => (v === undefined || v === true ? d : +v);
const str = (v, d) => (v === undefined || v === true ? d : String(v));
const list = (v, d) => (v === undefined || v === true ? d : String(v).split(',').map((s) => s.trim()).filter(Boolean));

const W = 1280, H = 720;
const MODE = str(args.mode, 'kill');
const SCENARIO = str(args.scenario, 'night-wet');
const REPEAT = Math.max(1, num(args.repeat, 2));
const WARMUP_MS = num(args.warmup, 3) * 1000;
const REWARM_MS = num(args.rewarm, 1.5) * 1000;
const MEASURE_MS = num(args.measure, 5) * 1000;
const JSON_OUT = args.json && args.json !== true ? resolve(String(args.json)) : null;

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');

// Same placements as tools/fps.mjs so numbers are comparable to its table.
const SCENARIOS = {
  cruise: { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: 26 } },
  boost: { hold: ['KeyW', 'ShiftLeft'], place: { path: 'highway', u: 0.22, kmh: 300, follow: 34 } },
  city: { hold: ['KeyW'], place: { path: 'city', u: 0.34, kmh: 150, follow: 26 } },
  'night-wet': {
    hold: ['KeyW'], place: { path: 'city', u: 0.565, kmh: 150, follow: 26 }, tod: 'night', wet: 1,
  },
};

// ---------------------------------------------------------------------------
// variants. `on` applies, `off` restores. `recompile: true` adds the needsUpdate sweep to both.
// ---------------------------------------------------------------------------
const RECOMPILE = `g.scene.traverse((o) => { const m = o.material; if (!m) return;
   if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; });`;

const VARIANTS = [
  // --- the night point-light pool ------------------------------------------
  {
    name: 'lights-0',
    note: 'all 14 dynamic point lights invisible + full material recompile. Shrinks NUM_POINT_LIGHTS to 0.',
    recompile: true,
    on: `window.__v = []; g.scene.traverse((o) => { if (o.isPointLight) { window.__v.push(o); o.visible = false; } });`,
    off: `for (const l of window.__v) l.visible = true; window.__v = null;`,
  },
  // --- everything else, at whatever scenario is asked for -------------------
  { name: 'ssao-off', on: `g.ssao.enabled = false;`, off: `g.ssao.enabled = true;` },
  { name: 'bloom-off', on: `g.bloom.enabled = false;`, off: `g.bloom.enabled = true;` },
  { name: 'grade-off', on: `g.outputPass.enabled = false;`, off: `g.outputPass.enabled = true;` },
  {
    name: 'post-chain-off',
    on: `window.__p = g.composer.passes.slice(1).map((p) => [p, p.enabled]); for (const [p] of window.__p) p.enabled = false;`,
    off: `for (const [p, e] of window.__p) p.enabled = e; window.__p = null;`,
  },
  { name: 'world-hidden', on: `g.world.group.visible = false;`, off: `g.world.group.visible = true;` },
  { name: 'traffic-hidden', on: `g.traffic.group.visible = false;`, off: `g.traffic.group.visible = true;` },
  { name: 'car-hidden', on: `g.carRoot.visible = false;`, off: `g.carRoot.visible = true;` },
  { name: 'hud-off', on: `g.hud.setVisible(false);`, off: `g.hud.setVisible(true);` },
  {
    name: 'shadow-map-2048',
    note: '4096x4096 -> 2048x2048, same +/-130 m cascade span. Raster area only; same submission.',
    on: `const sh = g.sky.sun.shadow; window.__sh = [sh.mapSize.x, sh.mapSize.y];
         if (sh.map) { sh.map.dispose(); sh.map = null; } sh.mapSize.set(2048, 2048);`,
    off: `const sh = g.sky.sun.shadow; if (sh.map) { sh.map.dispose(); sh.map = null; }
          sh.mapSize.set(window.__sh[0], window.__sh[1]);`,
  },
  {
    name: 'shadow-map-1024',
    note: '4096x4096 -> 1024x1024',
    on: `const sh = g.sky.sun.shadow; window.__sh = [sh.mapSize.x, sh.mapSize.y];
         if (sh.map) { sh.map.dispose(); sh.map = null; } sh.mapSize.set(1024, 1024);`,
    off: `const sh = g.sky.sun.shadow; if (sh.map) { sh.map.dispose(); sh.map = null; }
          sh.mapSize.set(window.__sh[0], window.__sh[1]);`,
  },
  {
    name: 'shadow-pcf',
    note: 'PCFSoftShadowMap -> PCFShadowMap: the SAMPLING cost in the main pass, not the raster',
    recompile: true,
    on: `window.__st = g.renderer.shadowMap.type; g.renderer.shadowMap.type = 1;`,
    off: `g.renderer.shadowMap.type = window.__st;`,
  },
  {
    name: 'shadows-off',
    note: 'renderer.shadowMap.enabled = false. LAST: leaks programs.',
    recompile: true,
    on: `g.renderer.shadowMap.enabled = false;`,
    off: `g.renderer.shadowMap.enabled = true;`,
  },
  {
    name: 'shadow-casters-off',
    note: 'map still allocated and cleared, nothing submitted into it',
    on: `window.__sc = []; g.scene.traverse((o) => { if (o.castShadow) { window.__sc.push(o); o.castShadow = false; } });`,
    off: `for (const o of window.__sc) o.castShadow = true; window.__sc = null;`,
  },
];

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
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '  -  ' : v.toFixed(2));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page._errs = errors;
  await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=dusk-highway-chase&res=1.0`,
    { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true && !!window.__frameStats', null, { timeout: 120000 });
  return page;
}

async function respot(page, place) {
  await page.evaluate((p) => {
    const g = window.__game;
    const path = g.world.paths[p.path];
    g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
    if (p.follow) g.physics.followPath(path, p.follow); else g.physics.clearPath();
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  }, place);
}

async function setState(page, tod, wet) {
  await page.evaluate(([t, w]) => {
    window.__game.applyTimeOfDay(t);
    window.__game.applyWet(w);
  }, [tod, wet]);
}

async function measure(page, label) {
  await page.evaluate(() => window.__frameStats.reset());
  await sleep(MEASURE_MS);
  const st = await page.evaluate(() => window.__frameStats.stats());
  const rs = await page.evaluate(() => window.__game.renderSize());
  const gl = await page.evaluate(() => {
    const c = window.__game.renderer.getContext();
    return { w: c.drawingBufferWidth, h: c.drawingBufferHeight };
  });
  if (rs.w !== W || rs.h !== H || rs.pixelRatio !== 1 || rs.devicePixelRatio !== 1
      || gl.w !== W || gl.h !== H) {
    throw new Error(`RENDER SIZE CONTRACT VIOLATED (${label}): renderSize ${JSON.stringify(rs)} gl ${gl.w}x${gl.h}`);
  }
  const c = await page.evaluate(async (n) => {
    const info = window.__game.renderer.info;
    const prev = info.autoReset; info.autoReset = false; info.reset();
    let seen = 0;
    await new Promise((done) => {
      const step = () => { if (++seen >= n) return done(); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    const o = { calls: info.render.calls / seen, tris: info.render.triangles / seen,
      progs: info.programs ? info.programs.length : null, geos: info.memory.geometries,
      lights: 0 };
    window.__game.scene.traverse((x) => { if (x.isPointLight && x.visible) o.lights++; });
    info.autoReset = prev; info.reset();
    return o;
  }, 30);
  const kmh = await page.evaluate(() => Math.abs(window.__game.physics.state.speed) * 3.6);
  return { ...st, ...c, kmh, rs, gl };
}

const rows = [];
function row(cells, widths) { return cells.map((v, i) => lpad(v, widths[i])).join(' '); }

console.log(`# tools/_perfr2.mjs  mode=${MODE}  scenario=${SCENARIO}  1280x720 dsf 1  ` +
  `warmup ${WARMUP_MS / 1000}s  rewarm ${REWARM_MS / 1000}s  measure ${MEASURE_MS / 1000}s  repeat ${REPEAT}`);
console.log('# rAF-to-rAF from window.__frameStats. renderSize AND gl.drawingBuffer asserted on every row.');

try {
  if (MODE === 'decomp') {
    // four states at the night-wet map position, in ONE page, interleaved REPEAT times
    const place = SCENARIOS['night-wet'].place;
    const STATES = [['midday', 0], ['midday', 1], ['night', 0], ['night', 1]];
    const acc = new Map();
    for (let r = 0; r < REPEAT; r++) {
      const page = await openPage();
      try {
        await respot(page, place);
        for (const k of SCENARIOS['night-wet'].hold) await page.keyboard.down(k);
        await sleep(WARMUP_MS);
        for (const [tod, wet] of STATES) {
          await setState(page, tod, wet);
          await respot(page, place);
          await sleep(REWARM_MS);
          const m = await measure(page, `${tod} wet${wet} r${r + 1}`);
          const key = `${tod}/wet${wet}`;
          if (!acc.has(key)) acc.set(key, []);
          acc.get(key).push(m);
          console.log(row([pad(key, 14), r + 1, m.n, f2(m.mean), f2(m.p50), f2(m.p90), f2(m.p99),
            f2(m.max), Math.round(m.calls), Math.round(m.tris), m.progs, m.geos, m.lights,
            f2(m.kmh), `${m.gl.w}x${m.gl.h}@${m.rs.pixelRatio}`],
            [14, 3, 5, 8, 8, 8, 8, 8, 6, 9, 5, 5, 4, 7, 14]));
          rows.push({ state: key, run: r + 1, ...m });
        }
      } finally { await page.close(); }
    }
    console.log('');
    console.log('# best (min) p50 per state, and the deltas that decompose night-wet');
    const best = (k) => Math.min(...acc.get(k).map((m) => m.p50));
    const bmean = (k) => Math.min(...acc.get(k).map((m) => m.mean));
    for (const k of acc.keys()) console.log(`  ${pad(k, 12)} p50 ${f2(best(k))}  mean ${f2(bmean(k))}  [${acc.get(k).map((m) => m.p50.toFixed(2)).join(', ')}]`);
    console.log(`  wet alone (day):    ${f2(best('midday/wet1') - best('midday/wet0'))} ms`);
    console.log(`  night alone (dry):  ${f2(best('night/wet0') - best('midday/wet0'))} ms`);
    console.log(`  wet at night:       ${f2(best('night/wet1') - best('night/wet0'))} ms`);
    console.log(`  night+wet total:    ${f2(best('night/wet1') - best('midday/wet0'))} ms`);
  } else if (MODE === 'hist') {
    // Frame-time HISTOGRAM. A p50 cannot tell 25 ms of work from 25 ms of work that then waited
    // for the next vsync; a histogram can, because cadence pinning piles the samples up at
    // multiples of the refresh interval and leaves the bins between them empty.
    const sc = SCENARIOS[SCENARIO];
    const page = await openPage();
    try {
      if (sc.tod) await setState(page, sc.tod, sc.wet ?? 0);
      await respot(page, sc.place);
      for (const k of sc.hold) await page.keyboard.down(k);
      await sleep(WARMUP_MS);
      const m = await measure(page, `hist ${SCENARIO}`);
      const raw = await page.evaluate(() => window.__frameStats.samples());
      const BIN = num(args.bin, 2);
      const bins = new Map();
      for (const v of raw) {
        const b = Math.floor(v / BIN) * BIN;
        bins.set(b, (bins.get(b) || 0) + 1);
      }
      console.log(`# ${SCENARIO}  n ${raw.length}  mean ${f2(m.mean)}  p50 ${f2(m.p50)}  p90 ${f2(m.p90)}  ` +
        `p99 ${f2(m.p99)}  at ${m.gl.w}x${m.gl.h} ratio ${m.rs.pixelRatio} dpr ${m.rs.devicePixelRatio}`);
      console.log(`# bin width ${BIN} ms. 60 Hz interval is 16.67 ms.`);
      for (const b of [...bins.keys()].sort((a, c) => a - c)) {
        const n = bins.get(b);
        console.log(`  ${lpad(b.toFixed(0), 5)}-${lpad((b + BIN).toFixed(0), 3)} ms ${lpad(n, 5)} ` +
          `${'#'.repeat(Math.max(1, Math.round(60 * n / raw.length)))}`);
      }
      rows.push({ scenario: SCENARIO, stats: m, raw });
    } finally { await page.close(); }
  } else if (MODE === 'lights') {
    // How many light emitters are IN SHOT at once on a real night drive? This is the measurement
    // that sizes world.js's point-light POOL. It is a count, so it is immune to contention.
    // Driven over several minutes of map by respotting along the city path.
    const sc = SCENARIOS['night-wet'];
    const page = await openPage();
    try {
      await setState(page, 'night', num(args.wet, 1));
      for (const k of sc.hold) await page.keyboard.down(k);
      const us = list(args.u, ['0.10', '0.34', '0.565', '0.72', '0.88']).map(Number);
      for (const u of us) {
        await respot(page, { ...sc.place, u });
        await sleep(num(args.dwell, 6) * 1000);
      }
      const st = await page.evaluate(() => window.__game.world.lightStats());
      console.log(JSON.stringify(st, null, 1));
      const tot = st.hist.reduce((a, b) => a + b, 0);
      let cum = 0;
      console.log('# inShot  frames   cum%');
      st.hist.forEach((c, i) => {
        if (!c && i > st.maxInShot) return;
        cum += c;
        console.log(`  ${lpad(i, 6)}  ${lpad(c, 6)}  ${lpad((100 * cum / tot).toFixed(2), 6)}`);
      });
      rows.push(st);
    } finally { await page.close(); }
  } else if (MODE === 'trace') {
    // Per-INVOCATION trace of renderer.render for a handful of consecutive frames, with the
    // render target size, the camera identity and the draw-call/triangle delta of each call.
    // `--mode submits` in tools/perf-probe.mjs aggregates by target size, which cannot tell a
    // road planar-reflection render apart from the SSAO prepass when both land in a 640x360
    // target. This can, because it carries the camera uuid and the call ORDER.
    const sc = SCENARIOS[SCENARIO];
    const page = await openPage();
    try {
      if (sc.tod) await setState(page, sc.tod, sc.wet ?? 0);
      await respot(page, sc.place);
      for (const k of sc.hold) await page.keyboard.down(k);
      await sleep(WARMUP_MS);
      const trace = await page.evaluate(async (nFrames) => {
        const g = window.__game;
        const r = g.renderer, info = r.info;
        const orig = r.render.bind(r);
        const out = []; let frame = -1; let depth = 0;
        info.autoReset = false;
        r.render = function (scene, camera) {
          const t = r.getRenderTarget();
          const c0 = info.render.calls, t0 = info.render.triangles;
          const w = t ? t.width : r.getContext().drawingBufferWidth;
          const h = t ? t.height : r.getContext().drawingBufferHeight;
          const rec = { frame, depth, target: `${w}x${h}`, cam: camera.uuid.slice(0, 8),
            camFov: camera.fov, isScene: scene === g.scene, override: !!scene.overrideMaterial };
          depth++;
          const t1 = performance.now();
          orig(scene, camera);
          rec.ms = +(performance.now() - t1).toFixed(2);
          depth--;
          rec.calls = info.render.calls - c0;
          rec.tris = info.render.triangles - t0;
          if (frame >= 0) out.push(rec);
          return undefined;
        };
        await new Promise((done) => {
          const step = () => {
            frame++;
            info.reset();
            if (frame >= nFrames) { r.render = orig; info.autoReset = true; return done(); }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        return out;
      }, num(args.frames, 4));
      console.log(row(['frame', 'd', 'target', 'cam', 'fov', 'scene?', 'ovr?', 'calls', 'tris', 'ms'],
        [5, 2, 10, 9, 6, 6, 5, 6, 9, 7]));
      const MINMS = num(args.minms, 0);
      for (const t of trace) {
        if (t.ms < MINMS) continue;
        console.log(row([t.frame, t.depth, t.target, t.cam, f2(t.camFov), t.isScene ? 'y' : 'n',
          t.override ? 'y' : 'n', t.calls, t.tris, f2(t.ms)], [5, 2, 10, 9, 6, 6, 5, 6, 9, 7]));
      }
      const byCam = new Map();
      for (const t of trace) {
        const k = `${t.cam} ${t.target} ovr=${t.override ? 'y' : 'n'}`;
        if (!byCam.has(k)) byCam.set(k, { n: 0, calls: 0, tris: 0, ms: 0 });
        const a = byCam.get(k); a.n++; a.calls += t.calls; a.tris += t.tris; a.ms += t.ms;
      }
      const frames = new Set(trace.map((t) => t.frame)).size;
      console.log('');
      console.log(`# per frame (${frames} frames traced), grouped by camera+target`);
      for (const [k, a] of [...byCam.entries()].sort((x, y) => y[1].ms - x[1].ms)) {
        console.log(`  ${pad(k, 30)} ${f2(a.n / frames)} invoc/frame  ${Math.round(a.calls / frames)} calls  ` +
          `${Math.round(a.tris / frames)} tris  ${f2(a.ms / frames)} ms`);
      }
      rows.push(...trace);
    } finally { await page.close(); }
  } else if (MODE === 'kill') {
    const want = list(args.variants, ['all']);
    const vs = want[0] === 'all' ? VARIANTS : VARIANTS.filter((v) => want.includes(v.name));
    for (const n of want) if (n !== 'all' && !VARIANTS.some((v) => v.name === n)) {
      console.error(`unknown variant "${n}". known: ${VARIANTS.map((v) => v.name).join(', ')}`);
      process.exit(2);
    }
    const sc = SCENARIOS[SCENARIO];
    const out = new Map();
    for (let r = 0; r < REPEAT; r++) {
      for (const v of vs) {
        const page = await openPage();
        try {
          if (sc.tod) await setState(page, sc.tod, sc.wet ?? 0);
          await respot(page, sc.place);
          for (const k of sc.hold) await page.keyboard.down(k);
          await sleep(WARMUP_MS);
          await respot(page, sc.place);
          const base = await measure(page, `${v.name} BASE r${r + 1}`);
          await page.evaluate((s) => { const g = window.__game; eval(s); }, v.on + (v.recompile ? RECOMPILE : ''));
          await sleep(REWARM_MS);
          await respot(page, sc.place);
          const off = await measure(page, `${v.name} OFF r${r + 1}`);
          if (!out.has(v.name)) out.set(v.name, []);
          out.get(v.name).push({ base, off });
          console.log(row([pad(v.name, 20), r + 1, f2(base.p50), f2(off.p50), f2(base.p50 - off.p50),
            f2(base.mean - off.mean), Math.round(base.calls - off.calls), Math.round(base.tris - off.tris),
            `${base.lights}->${off.lights}`, `${base.progs}->${off.progs}`,
            `${off.gl.w}x${off.gl.h}@${off.rs.pixelRatio}`],
            [20, 3, 8, 8, 8, 8, 8, 10, 9, 9, 14]));
          rows.push({ variant: v.name, run: r + 1, base, off });
          if (page._errs.length) console.log(`   page errors: ${page._errs.slice(0, 3).join(' | ')}`);
        } finally { await page.close(); }
      }
    }
    console.log('');
    console.log('# min-envelope ranking (contention only ever slows a frame, so the FLOOR survives it)');
    const ranked = [...out.entries()].map(([name, ps]) => ({
      name,
      minBase: Math.min(...ps.map((p) => p.base.p50)),
      minOff: Math.min(...ps.map((p) => p.off.p50)),
      signs: ps.map((p) => Math.sign(p.base.p50 - p.off.p50)),
    })).map((x) => ({ ...x, delta: x.minBase - x.minOff }))
      .sort((a, b) => b.delta - a.delta);
    for (const x of ranked) {
      const agree = x.signs.filter((s) => s > 0).length;
      console.log(`  ${pad(x.name, 20)} base ${f2(x.minBase)}  off ${f2(x.minOff)}  delta ${f2(x.delta)}  sign ${agree}/${x.signs.length}`);
    }
  } else if (MODE === 'sweep') {
    // POOL sweep: leave N of the pool visible, hide the rest, recompile. One page per cell.
    const pools = list(args.pool, ['14', '10', '6', '4', '0']).map(Number);
    const sc = SCENARIOS[SCENARIO];
    for (const n of pools) {
      const ps = [];
      for (let r = 0; r < REPEAT; r++) {
        const page = await openPage();
        try {
          if (sc.tod) await setState(page, sc.tod, sc.wet ?? 0);
          await page.evaluate((keep) => {
            const g = window.__game; const ls = [];
            g.scene.traverse((o) => { if (o.isPointLight) ls.push(o); });
            ls.forEach((l, i) => { if (i >= keep) l.visible = false; });
            g.scene.traverse((o) => { const m = o.material; if (!m) return;
              if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; });
          }, n);
          await respot(page, sc.place);
          for (const k of sc.hold) await page.keyboard.down(k);
          await sleep(WARMUP_MS);
          await respot(page, sc.place);
          const m = await measure(page, `pool ${n} r${r + 1}`);
          ps.push(m);
          console.log(row([`pool ${n}`, r + 1, m.n, f2(m.mean), f2(m.p50), f2(m.p90), f2(m.p99),
            m.lights, m.progs, `${m.gl.w}x${m.gl.h}@${m.rs.pixelRatio}`],
            [10, 3, 5, 8, 8, 8, 8, 4, 5, 14]));
          rows.push({ pool: n, run: r + 1, ...m });
        } finally { await page.close(); }
      }
    }
  } else { console.error(`unknown --mode ${MODE}`); process.exit(2); }
} finally {
  await browser.close();
  server.close();
  if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify({ when: new Date().toISOString(), mode: MODE, scenario: SCENARIO, rows }, null, 1));
}
