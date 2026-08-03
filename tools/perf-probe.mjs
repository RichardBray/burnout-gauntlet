// perf-probe.mjs — the three things tools/fps.mjs cannot do, for the perf-profile piece.
//
//   node tools/perf-probe.mjs --mode inspect                 scene/world census + frustum contents
//   node tools/perf-probe.mjs --mode phase                   per-phase CPU time inside tick()
//   node tools/perf-probe.mjs --mode finish                  render-CPU vs render+glFinish (GPU test)
//   node tools/perf-probe.mjs --mode stall                   timestamped stall timeline from boot
//   node tools/perf-probe.mjs --mode toggles                 extra kill-controls fps.mjs lacks
//
// WHY A SECOND HARNESS RATHER THAN A BIGGER fps.mjs. fps.mjs belongs to another piece and its
// contract is "one ranked p50 table, and refuse to print a number for the wrong buffer". Everything
// here is diagnostic instead of comparative: it patches live methods, calls gl.finish(), and reads
// engine counters per frame. Mixing those into the reporting harness would make it possible to
// publish a p50 that was taken with gl.finish() wired into the loop, which is a different quantity.
//
// THE MEASUREMENT CONTRACT IS THE SAME. Viewport 1280x720, deviceScaleFactor 1, `#res=<n>` so the
// drawing buffer is REAL pixels, and renderSize() is asserted before any statistic is printed.
//
// WHAT IS AND IS NOT A FRAME TIME HERE. Frame time is always window.__frameStats (rAF-to-rAF).
// The per-phase numbers in --mode phase are CPU times of individual calls and are NOT frame times;
// they are only ever compared against each other and against the rAF delta of the same window.
// --mode finish deliberately stalls the pipeline with gl.finish(), so ITS frame time is not the
// build's frame time and is never quoted as one.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const num = (v, d) => (v === undefined || v === true ? d : +v);
const list = (v, d) => (v === undefined || v === true ? d : String(v).split(',').map((s) => s.trim()).filter(Boolean));

const W = num(args.w, 1280);
const H = num(args.h, 720);
const SCENE = args.scene && args.scene !== true ? String(args.scene) : 'dusk-highway-chase';
const MODE = args.mode && args.mode !== true ? String(args.mode) : 'inspect';
const RES = num(args.res, 1);
const WARMUP_MS = num(args.warmup, 2.5) * 1000;
const MEASURE_MS = num(args.measure, 8) * 1000;
const REPEAT = Math.max(1, num(args.repeat, 3));
const SCEN = args.scenario && args.scenario !== true ? String(args.scenario) : 'cruise';
const STALL_MS = num(args.stall, 50);
const STALL_WINDOW_MS = num(args.window, 45) * 1000;
const JSON_OUT = args.json && args.json !== true ? resolve(String(args.json)) : null;

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');

// Mirrors tools/fps.mjs's scenario table ON PURPOSE, values included, so a row from this tool and a
// row from that one describe the same drive. If they ever diverge the two tables stop being
// comparable, which is worse than the duplication.
const SCENARIOS = {
  cruise: { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: 26 } },
  boost: { hold: ['KeyW', 'ShiftLeft'], place: { path: 'highway', u: 0.22, kmh: 300, follow: 34 } },
  city: { hold: ['KeyW'], place: { path: 'city', u: 0.34, kmh: 150, follow: 26 } },
  'night-wet': { hold: ['KeyW'], place: { path: 'city', u: 0.565, kmh: 150, follow: 26 }, tod: 'night', wet: 1 },
};

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
  // Same flags as tools/shot.mjs and tools/fps.mjs. --disable-frame-rate-limit is load-bearing:
  // without it rAF pins to the display refresh and every frame time reads 16.7 ms.
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit',
    // --mode stall wants to know whether a stall is a GC pause, and usedJSHeapSize alone cannot
    // prove that. --js-flags=--expose-gc lets the probe force a collection and time it, which is a
    // kill-control for the GC hypothesis rather than an argument about heap sawtooth.
    '--js-flags=--expose-gc'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '   -  ' : (+v).toFixed(2));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
};

class ProbeError extends Error {}

/** Same refusal as fps.mjs: no statistic is printed for a buffer that is not the one asked for. */
function assertRenderSize(rs, label, res = RES) {
  const wantW = Math.floor(W * res), wantH = Math.floor(H * res);
  const bad = [];
  if (rs.w !== wantW || rs.h !== wantH) bad.push(`buffer ${rs.w}x${rs.h}, expected ${wantW}x${wantH}`);
  if (Math.abs(rs.pixelRatio - res) > 1e-6) bad.push(`pixelRatio ${rs.pixelRatio}, expected ${res}`);
  if (rs.devicePixelRatio !== 1) bad.push(`devicePixelRatio ${rs.devicePixelRatio}, expected 1`);
  if (bad.length) {
    throw new ProbeError(`RENDER SIZE CONTRACT VIOLATED (${label})\n  observed: renderW ${rs.w} renderH ${rs.h} ` +
      `cssW ${rs.cssW} cssH ${rs.cssH} pixelRatio ${rs.pixelRatio} devicePixelRatio ${rs.devicePixelRatio}\n` +
      bad.map((b) => `  ! ${b}`).join('\n'));
  }
}

async function openPage({ initScript, res = RES } = {}) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page._errors = errors;
  if (initScript) await page.addInitScript(initScript);
  await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=${SCENE}&res=${res}`,
    { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true && !!window.__frameStats', null, { timeout: 120000 });
  return page;
}

async function respot(page, sc) {
  if (!sc.place) return;
  await page.evaluate((p) => {
    const g = window.__game;
    const path = g.world.paths[p.path];
    g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
    if (p.follow) g.physics.followPath(path, p.follow); else g.physics.clearPath();
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

async function frameWindow(page, label, ms, res = RES) {
  await page.evaluate(() => window.__frameStats.reset());
  await sleep(ms);
  const st = await page.evaluate(() => window.__frameStats.stats());
  const rs = await page.evaluate(() => window.__game.renderSize());
  assertRenderSize(rs, label, res);
  return st;
}

// ---------------------------------------------------------------------------
// --kill: patches applied to the LIVE page before a measurement window
// ---------------------------------------------------------------------------
// car.js's reflection probe is reached through a closure (`serviceEnv` calls the local
// `refreshEnv`, not the exported one), so there is no property on window.__game that can switch it
// off. It can still be killed without editing game/*.js, because both expensive halves go through
// three's own prototypes and ctx.THREE is the very module instance the game imported:
//   * CubeCamera.prototype.update  -> the six 512-px face renders of the whole scene
//   * PMREMGenerator.prototype.fromCubemap -> the prefilter chain, returned unchanged once an
//     output target already exists, so the car keeps a valid (stale) envMap and nothing goes black.
// This is a kill-control, not a proposed fix; the fix belongs in car.js and is routed, not applied.
const KILLS = {
  none: '',
  'probe-faces': `(() => { const T = window.__game.THREE;
      T.CubeCamera.prototype.update = function () {};
    })()`,
  probe: `(() => { const T = window.__game.THREE;
      T.CubeCamera.prototype.update = function () {};
      const f = T.PMREMGenerator.prototype.fromCubemap;
      T.PMREMGenerator.prototype.fromCubemap = function (tex, rt) { return rt || f.call(this, tex, rt); };
    })()`,
};
const KILL = args.kill && args.kill !== true ? String(args.kill) : 'none';
if (!(KILL in KILLS)) throw new Error(`unknown --kill ${KILL}. known: ${Object.keys(KILLS).join(', ')}`);
async function applyKill(page) {
  if (KILLS[KILL]) await page.evaluate(KILLS[KILL]);
}

/** Count cube-probe refreshes so any row can say how often the probe fired during it. */
const CUBE_COUNTER = `(() => {
  const T = window.__game.THREE;
  if (window.__cubeWrapped) return;
  window.__cubeWrapped = true;
  window.__cube = 0;
  const f = T.CubeCamera.prototype.update;
  T.CubeCamera.prototype.update = function (...a) { window.__cube++; return f.apply(this, a); };
})()`;

const report = { when: new Date().toISOString(), mode: MODE, scene: SCENE, scenario: SCEN,
  viewport: { w: W, h: H, deviceScaleFactor: 1 }, res: RES, alone: true };
let exitCode = 0;

try {
  // =========================================================================
  // inspect — what the scene contains, and what the frustum contains
  // =========================================================================
  // This is the census behind "is a smaller map a real win". It is contention-immune: every
  // number is a count, not a duration.
  if (MODE === 'inspect') {
    const page = await openPage();
    const sc = SCENARIOS[SCEN];
    await applyScenario(page, sc);
    await sleep(WARMUP_MS);
    const out = await page.evaluate(() => {
      const T = window.__game.THREE;
      const g = window.__game;
      const cam = g.camera;
      cam.updateMatrixWorld();
      g.scene.updateMatrixWorld(true);
      const frustum = new T.Frustum().setFromProjectionMatrix(
        new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const sphere = new T.Sphere();
      const triCount = (o) => {
        const geo = o.geometry;
        if (!geo) return 0;
        const idx = geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0);
        const per = idx / 3;
        return per * (o.isInstancedMesh ? o.count : 1);
      };
      /** One row per drawable, with the ancestor chain so it can be grouped by subsystem. */
      const rows = [];
      const walk = (o, chain) => {
        const nm = o.name || o.type;
        const c = chain.concat(nm);
        if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine || o.isSprite) {
          let inF = null, dist = null;
          if (o.geometry) {
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
            inF = frustum.intersectsSphere(sphere);
            dist = sphere.center.distanceTo(cam.position);
          }
          rows.push({ chain: c.join('/'), type: o.type, name: o.name || '',
            visible: o.visible, visWorld: (() => { let p = o, v = true; while (p) { v = v && p.visible; p = p.parent; } return v; })(),
            instances: o.isInstancedMesh ? o.count : 1,
            tris: triCount(o), inFrustum: inF, distM: dist,
            castShadow: !!o.castShadow, frustumCulled: o.frustumCulled });
        }
        for (const ch of o.children) walk(ch, c);
      };
      walk(g.scene, []);
      // Bucket by the top-level owner: which module put this in the scene.
      const owners = {};
      for (const r of rows) {
        const top = r.chain.split('/')[1] || 'scene';
        const k = r.chain.includes('/') ? top : 'scene';
        const b = owners[k] || (owners[k] = { objects: 0, drawn: 0, tris: 0, trisDrawn: 0, instances: 0, casters: 0 });
        b.objects++; b.instances += r.instances; b.tris += r.tris;
        if (r.castShadow) b.casters++;
        if (r.visWorld && (r.inFrustum || !r.frustumCulled)) { b.drawn++; b.trisDrawn += r.tris; }
      }
      const info = g.renderer.info;
      return { rows, owners, shadow: {
        mapSize: [g.sky.sun.shadow.mapSize.x, g.sky.sun.shadow.mapSize.y],
        cam: { left: g.sky.sun.shadow.camera.left, right: g.sky.sun.shadow.camera.right,
          top: g.sky.sun.shadow.camera.top, bottom: g.sky.sun.shadow.camera.bottom,
          near: g.sky.sun.shadow.camera.near, far: g.sky.sun.shadow.camera.far },
        type: g.renderer.shadowMap.type, enabled: g.renderer.shadowMap.enabled,
      },
      camera: { fov: cam.fov, near: cam.near, far: cam.far,
        pos: [cam.position.x, cam.position.y, cam.position.z] },
      fog: g.scene.fog ? { near: g.scene.fog.near, far: g.scene.fog.far, density: g.scene.fog.density } : null,
      memory: info.memory, programs: info.programs.length,
      passes: g.composer.passes.map((p) => ({ type: p.constructor.name, enabled: p.enabled })),
      rt: { w: g.composer.renderTarget1.width, h: g.composer.renderTarget1.height,
        samples: g.composer.renderTarget1.samples },
      ssao: { w: g.ssao._w, h: g.ssao._h },
      renderSize: g.renderSize() };
    });
    assertRenderSize(out.renderSize, 'inspect');
    report.inspect = out;
    console.log(`# scene census, scenario ${SCEN}, ${JSON.stringify(out.renderSize)}`);
    console.log(`# composer rt ${out.rt.w}x${out.rt.h} samples ${out.rt.samples}; ssao ${out.ssao.w}x${out.ssao.h}`);
    console.log(`# shadow map ${out.shadow.mapSize.join('x')} span ${out.shadow.cam.left}..${out.shadow.cam.right} ` +
      `type ${out.shadow.type} enabled ${out.shadow.enabled}`);
    console.log(`# geometries ${out.memory.geometries} textures ${out.memory.textures} programs ${out.programs}`);
    console.log('');
    console.log(`${pad('owner', 26)} ${lpad('objs', 6)} ${lpad('inFrust', 8)} ${lpad('instances', 10)} ` +
      `${lpad('tris', 12)} ${lpad('trisInFrust', 12)} ${lpad('casters', 8)}`);
    const entries = Object.entries(out.owners).sort((a, b) => b[1].tris - a[1].tris);
    for (const [k, v] of entries) {
      console.log(`${pad(k, 26)} ${lpad(v.objects, 6)} ${lpad(v.drawn, 8)} ${lpad(v.instances, 10)} ` +
        `${lpad(Math.round(v.tris), 12)} ${lpad(Math.round(v.trisDrawn), 12)} ${lpad(v.casters, 8)}`);
    }
    console.log('');
    console.log('# top 30 drawables by triangles (visWorld/inFrustum shown; * = would be drawn now)');
    const top = out.rows.slice().sort((a, b) => b.tris - a.tris).slice(0, 30);
    for (const r of top) {
      const drawn = r.visWorld && (r.inFrustum || !r.frustumCulled);
      console.log(`  ${drawn ? '*' : ' '} ${pad(r.chain.slice(-60), 60)} ${lpad(r.type, 14)} ` +
        `inst ${lpad(r.instances, 5)} tris ${lpad(Math.round(r.tris), 9)} dist ${lpad(f2(r.distM), 8)}`);
    }
    const tot = out.rows.reduce((s, r) => s + r.tris, 0);
    const totDrawn = out.rows.filter((r) => r.visWorld && (r.inFrustum || !r.frustumCulled))
      .reduce((s, r) => s + r.tris, 0);
    console.log('');
    console.log(`# scene total ${Math.round(tot)} triangles across ${out.rows.length} drawables; ` +
      `${Math.round(totDrawn)} in ${out.rows.filter((r) => r.visWorld && (r.inFrustum || !r.frustumCulled)).length} ` +
      `objects survive visibility+frustum right now (${(100 * totDrawn / tot).toFixed(1)}%)`);
    if (page._errors.length) console.log(`# page errors: ${page._errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }

  // =========================================================================
  // phase — per-phase CPU time inside tick(), and what is left over
  // =========================================================================
  // main.js's tick() calls each module through a property lookup on the module object
  // (`world.update(...)`), so replacing that property on the live object intercepts the real call
  // without touching a single byte of game/*.js.
  //
  // THE DECISIVE COLUMN IS "unaccounted": rAF-to-rAF minus all the CPU we can see. If our own JS
  // is 6 ms of a 40 ms frame then 34 ms is spent somewhere the main thread is not running our code,
  // and that is the GPU (or the compositor waiting on it).
  else if (MODE === 'phase') {
    const PATCH = `(() => {
      const g = window.__game;
      const marks = {};
      window.__marks = marks;
      const wrap = (obj, key, label) => {
        if (!obj || typeof obj[key] !== 'function') return;
        const f = obj[key];
        marks[label] = [];
        obj[key] = function (...a) {
          const t = performance.now();
          try { return f.apply(this, a); } finally { marks[label].push(performance.now() - t); }
        };
      };
      wrap(g.physics, 'step', 'physics.step');
      wrap(g.crash, 'update', 'crash.update');
      wrap(g.car, 'update', 'car.update');
      wrap(g.boost, 'update', 'boost.update');
      wrap(g.world, 'update', 'world.update');
      wrap(g.traffic, 'update', 'traffic.update');
      wrap(g.sky, 'update', 'sky.update');
      wrap(g.camRig, 'update', 'camRig.update');
      wrap(g.hud, 'update', 'hud.update');
      wrap(g.audio, 'update', 'audio.update');
      wrap(g.composer, 'render', 'composer.render');
      window.__marksReset = () => { for (const k in marks) marks[k].length = 0; };
    })()`;
    const rows = [];
    for (let i = 0; i < REPEAT; i++) {
      const page = await openPage();
      const sc = SCENARIOS[SCEN];
      await applyScenario(page, sc);
      await sleep(WARMUP_MS);
      await applyKill(page);
      await page.evaluate(PATCH);
      await page.evaluate(() => window.__marksReset());
      const st = await frameWindow(page, `phase run ${i + 1}`, MEASURE_MS);
      const marks = await page.evaluate(() => {
        const out = {};
        for (const [k, v] of Object.entries(window.__marks)) out[k] = v.slice();
        return out;
      });
      rows.push({ st, marks });
      await page.close();
    }
    report.phase = rows.map((r) => ({ stats: r.st,
      phases: Object.fromEntries(Object.entries(r.marks).map(([k, v]) => [k,
        { n: v.length, mean: v.reduce((a, b) => a + b, 0) / (v.length || 1), p50: q(v, 0.5), p99: q(v, 0.99),
          max: v.length ? Math.max(...v) : 0, totalMs: v.reduce((a, b) => a + b, 0) }])) }));
    for (let i = 0; i < rows.length; i++) {
      const { st, marks } = rows[i];
      console.log('');
      console.log(`# PHASE CPU run ${i + 1}: frame p50 ${f2(st.p50)} ms mean ${f2(st.mean)} p99 ${f2(st.p99)} ` +
        `over ${st.n} frames, renderW ${st.renderW} renderH ${st.renderH} pixelRatio ${st.pixelRatio} ` +
        `devicePixelRatio ${st.devicePixelRatio} resScale ${st.resScale}`);
      console.log(`${pad('phase', 18)} ${lpad('calls', 7)} ${lpad('meanMs', 8)} ${lpad('p50', 8)} ` +
        `${lpad('p99', 8)} ${lpad('maxMs', 9)} ${lpad('%frame', 8)}`);
      const ent = Object.entries(marks).map(([k, v]) => ({ k, n: v.length,
        mean: v.reduce((a, b) => a + b, 0) / (v.length || 1), p50: q(v, 0.5), p99: q(v, 0.99),
        max: v.length ? Math.max(...v) : 0 })).sort((a, b) => b.mean - a.mean);
      let acc = 0;
      for (const e of ent) {
        acc += e.mean;
        console.log(`${pad(e.k, 18)} ${lpad(e.n, 7)} ${lpad(f2(e.mean), 8)} ${lpad(f2(e.p50), 8)} ` +
          `${lpad(f2(e.p99), 8)} ${lpad(f2(e.max), 9)} ${lpad(f2(100 * e.mean / st.mean), 8)}`);
      }
      const tickAcc = acc - (ent.find((e) => e.k === 'composer.render')?.mean || 0);
      console.log(`${pad('-- accounted', 18)} ${lpad('', 7)} ${lpad(f2(acc), 8)} ${lpad('', 8)} ${lpad('', 8)} ` +
        `${lpad('', 9)} ${lpad(f2(100 * acc / st.mean), 8)}`);
      console.log(`${pad('-- tick() only', 18)} ${lpad('', 7)} ${lpad(f2(tickAcc), 8)}`);
      console.log(`${pad('-- unaccounted', 18)} ${lpad('', 7)} ${lpad(f2(st.mean - acc), 8)} ${lpad('', 8)} ` +
        `${lpad('', 8)} ${lpad('', 9)} ${lpad(f2(100 * (st.mean - acc) / st.mean), 8)}`);
    }
  }

  // =========================================================================
  // finish — the CPU-vs-GPU kill-control
  // =========================================================================
  // Two numbers from the same frame: the wall time of composer.render() (CPU submission only,
  // because GL is asynchronous) and the wall time of the gl.finish() that follows it (the GPU
  // draining the work just submitted). If finish dwarfs submission, the frame is GPU-bound and no
  // amount of JS optimisation moves it.
  //
  // THIS MODE'S FRAME TIME IS NOT THE BUILD'S FRAME TIME. gl.finish() serialises the pipeline, so
  // the loop it runs in is slower than the shipping loop by construction. Only the ratio is quoted.
  else if (MODE === 'finish') {
    const rows = [];
    for (let i = 0; i < REPEAT; i++) {
      const page = await openPage();
      const sc = SCENARIOS[SCEN];
      await applyScenario(page, sc);
      await sleep(WARMUP_MS);
      await applyKill(page);
      const base = await frameWindow(page, `finish run ${i + 1} baseline`, MEASURE_MS / 2);
      await page.evaluate(`(() => {
        const g = window.__game;
        const gl = g.renderer.getContext();
        const f = g.composer.render.bind(g.composer);
        window.__fin = { sub: [], fin: [] };
        g.composer.render = function (d) {
          const t0 = performance.now();
          f(d);
          const t1 = performance.now();
          gl.finish();
          const t2 = performance.now();
          window.__fin.sub.push(t1 - t0);
          window.__fin.fin.push(t2 - t1);
        };
      })()`);
      const withFin = await frameWindow(page, `finish run ${i + 1} instrumented`, MEASURE_MS / 2);
      const fin = await page.evaluate(() => ({ sub: window.__fin.sub.slice(), fin: window.__fin.fin.slice() }));
      rows.push({ base, withFin, fin });
      await page.close();
    }
    report.finish = rows.map((r) => ({ baseP50: r.base.p50, instrumentedP50: r.withFin.p50,
      submitP50: q(r.fin.sub, 0.5), finishP50: q(r.fin.fin, 0.5),
      submitMean: r.fin.sub.reduce((a, b) => a + b, 0) / r.fin.sub.length,
      finishMean: r.fin.fin.reduce((a, b) => a + b, 0) / r.fin.fin.length,
      n: r.fin.sub.length, renderW: r.base.renderW, renderH: r.base.renderH,
      pixelRatio: r.base.pixelRatio, devicePixelRatio: r.base.devicePixelRatio }));
    console.log('');
    console.log('# GPU-BOUND KILL-CONTROL. submit = CPU wall time of composer.render(); finish = the');
    console.log('# gl.finish() straight after it, i.e. the GPU draining that frame. res ' + RES.toFixed(2));
    console.log(`${pad('run', 5)} ${lpad('frameP50', 9)} ${lpad('instrP50', 9)} ${lpad('submitP50', 10)} ` +
      `${lpad('finishP50', 10)} ${lpad('submitMean', 11)} ${lpad('finishMean', 11)} ${lpad('gpu%', 6)}`);
    for (let i = 0; i < report.finish.length; i++) {
      const r = report.finish[i];
      console.log(`${pad(i + 1, 5)} ${lpad(f2(r.baseP50), 9)} ${lpad(f2(r.instrumentedP50), 9)} ` +
        `${lpad(f2(r.submitP50), 10)} ${lpad(f2(r.finishP50), 10)} ${lpad(f2(r.submitMean), 11)} ` +
        `${lpad(f2(r.finishMean), 11)} ${lpad(f2(100 * r.finishMean / (r.finishMean + r.submitMean)), 6)}`);
    }
    console.log(`# buffer: renderW ${report.finish[0].renderW} renderH ${report.finish[0].renderH} ` +
      `pixelRatio ${report.finish[0].pixelRatio} devicePixelRatio ${report.finish[0].devicePixelRatio}`);
  }

  // =========================================================================
  // stall — WHEN the p99 happens, with counters attached
  // =========================================================================
  // The p99 is a separate defect from the p50 and "at boot only" versus "every 4 seconds forever"
  // need different fixes, so this samples a TIMESTAMPED row per frame from the first paint onward:
  // dt, renderer.info.programs.length (shader compiles), geometries and textures (uploads and
  // streaming), and usedJSHeapSize (GC sawtooth). A stall is then attributed by which counter
  // moved on the same frame rather than by which candidate sounds plausible.
  else if (MODE === 'stall') {
    // Installed before any page script runs, so the very first frames of boot are in the record.
    const INIT = `(() => {
      const rows = [];
      window.__stallRows = rows;
      let prev = performance.now();
      let readyAt = null;
      const tick = () => {
        const t = performance.now();
        const dt = t - prev; prev = t;
        let progs = -1, geos = -1, texs = -1, calls = -1;
        const cube = window.__cube | 0;
        const g = window.__game;
        if (g) {
          const info = g.renderer.info;
          progs = info.programs ? info.programs.length : -1;
          geos = info.memory.geometries; texs = info.memory.textures; calls = info.render.calls;
          if (readyAt === null && window.__ready) readyAt = t;
        }
        const mem = performance.memory ? performance.memory.usedJSHeapSize : -1;
        rows.push([t, dt, progs, geos, texs, calls, mem, cube]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__readyAt = () => readyAt;
      if (window.PerformanceObserver) {
        window.__long = [];
        try {
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration, e.name]); })
            .observe({ entryTypes: ['longtask'] });
        } catch { /* not supported */ }
      }
    })()`;
    const page = await openPage({ initScript: INIT });
    await page.evaluate(CUBE_COUNTER);
    await applyKill(page);
    const sc = SCENARIOS[SCEN];
    await applyScenario(page, sc);
    await sleep(STALL_WINDOW_MS);
    // GC kill-control: force a full collection and time it. If a forced GC on this heap costs
    // 8 ms then a 400 ms stall is not GC, whatever the heap sawtooth looks like.
    const gc = await page.evaluate(`(() => {
      if (typeof window.gc !== 'function') return null;
      const t = performance.now(); window.gc(); return performance.now() - t;
    })()`);
    const data = await page.evaluate(() => ({ rows: window.__stallRows.slice(),
      readyAt: window.__readyAt(), long: (window.__long || []).slice(),
      heapLimit: performance.memory ? performance.memory.jsHeapSizeLimit : -1 }));
    const rs = await page.evaluate(() => window.__game.renderSize());
    assertRenderSize(rs, 'stall');
    const st = await page.evaluate(() => window.__frameStats.stats());
    const rows = data.rows.map(([t, dt, progs, geos, texs, calls, mem, cube]) => ({ t, dt, progs, geos, texs, calls, mem, cube }));
    const ready = data.readyAt || 0;
    const stalls = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].dt < STALL_MS) continue;
      const p = rows[i - 1];
      stalls.push({ tSinceReadyS: (rows[i].t - ready) / 1000, dt: rows[i].dt,
        dProgs: rows[i].progs - p.progs, dGeos: rows[i].geos - p.geos, dTexs: rows[i].texs - p.texs,
        dCube: rows[i].cube - p.cube,
        dMemKB: (rows[i].mem - p.mem) / 1024, progs: rows[i].progs, geos: rows[i].geos, texs: rows[i].texs });
    }
    report.stall = { thresholdMs: STALL_MS, windowMs: STALL_WINDOW_MS, forcedGcMs: gc,
      frames: rows.length, readyAtMs: ready, stalls, longtasks: data.long.slice(0, 40),
      frameStats: st, renderSize: rs,
      // The whole record, decimated, so a later reader can re-derive any statistic here.
      trace: rows.filter((_, i) => i % 5 === 0).map((r) => [Math.round(r.t), +r.dt.toFixed(2), r.progs, r.geos, r.texs, r.cube]) };
    console.log('');
    console.log(`# STALL TIMELINE  ${rows.length} sampled frames over ${(STALL_WINDOW_MS / 1000).toFixed(0)} s, ` +
      `threshold ${STALL_MS} ms. t=0 is window.__ready.`);
    console.log(`# renderW ${rs.w} renderH ${rs.h} pixelRatio ${rs.pixelRatio} devicePixelRatio ${rs.devicePixelRatio}`);
    console.log(`# forced-GC kill-control: window.gc() took ${f2(gc)} ms on this heap`);
    console.log(`# frameStats over the whole window: p50 ${f2(st.p50)} p99 ${f2(st.p99)} max ${f2(st.max)} n ${st.n}`);
    console.log('');
    console.log(`${lpad('t+s', 9)} ${lpad('dtMs', 9)} ${lpad('dProbe', 7)} ${lpad('dProgs', 7)} ${lpad('dGeos', 7)} ` +
      `${lpad('dTexs', 7)} ${lpad('dHeapKB', 10)} ${lpad('progs', 6)} ${lpad('geos', 6)} ${lpad('texs', 6)}`);
    for (const s of stalls) {
      console.log(`${lpad(f2(s.tSinceReadyS), 9)} ${lpad(f2(s.dt), 9)} ${lpad(s.dCube, 7)} ${lpad(s.dProgs, 7)} ${lpad(s.dGeos, 7)} ` +
        `${lpad(s.dTexs, 7)} ${lpad(f2(s.dMemKB), 10)} ${lpad(s.progs, 6)} ${lpad(s.geos, 6)} ${lpad(s.texs, 6)}`);
    }
    // ---- WITHIN-WINDOW attribution of the probe -----------------------------------------
    // The strongest form of this measurement available: split the SAME window's frames by whether
    // car.js's cube probe refreshed on that frame. Both groups are seconds apart at most, on the
    // same road, in the same page, so drift and contention cancel in a way no A/B across windows
    // can match. The first 1.5 s after __ready is dropped because boot's compile-and-upload stall
    // lives there and it is a different defect.
    const drive = rows.filter((r) => (r.t - ready) / 1000 > 1.5);
    const withP = [];
    const withoutP = [];
    for (let i = 1; i < drive.length; i++) {
      (drive[i].cube > drive[i - 1].cube ? withP : withoutP).push(drive[i].dt);
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const split = { nWith: withP.length, nWithout: withoutP.length,
      pctFramesRefreshing: 100 * withP.length / (withP.length + withoutP.length),
      meanWith: mean(withP), meanWithout: mean(withoutP),
      p50With: q(withP, 0.5), p50Without: q(withoutP, 0.5),
      perRefreshMs: mean(withP) - mean(withoutP) };
    split.contributionMs = split.perRefreshMs * split.pctFramesRefreshing / 100;
    report.stall.probeSplit = split;
    console.log('');
    console.log('# WITHIN-WINDOW PROBE ATTRIBUTION (same window, frames split by whether car.js re-baked');
    console.log('# its 512-px reflection cube on that frame; first 1.5 s after __ready dropped)');
    console.log(`  frames WITH a refresh   n ${split.nWith}  mean ${f2(split.meanWith)} ms  p50 ${f2(split.p50With)} ms`);
    console.log(`  frames WITHOUT one      n ${split.nWithout}  mean ${f2(split.meanWithout)} ms  p50 ${f2(split.p50Without)} ms`);
    console.log(`  -> ${f2(split.pctFramesRefreshing)}% of frames carry a refresh, each costing ` +
      `${f2(split.perRefreshMs)} ms, i.e. ${f2(split.contributionMs)} ms of the mean frame`);

    const after = stalls.filter((s) => s.tSinceReadyS > 0);
    console.log('');
    console.log(`# ${stalls.length} stalls total, ${after.length} of them AFTER __ready. ` +
      `Sum of post-ready stall time ${f2(after.reduce((a, b) => a + b.dt, 0))} ms.`);
    if (after.length > 1) {
      const gaps = after.slice(1).map((s, i) => s.tSinceReadyS - after[i].tSinceReadyS);
      console.log(`# gaps between post-ready stalls (s): ${gaps.map((v) => v.toFixed(2)).join(', ')}`);
    }
    if (page._errors.length) console.log(`# page errors: ${page._errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }

  // =========================================================================
  // toggles — extra kill-controls fps.mjs has no row for
  // =========================================================================
  // Same interleaved-paired design as fps.mjs --subsystem, and for the same reason: a serial sweep
  // drifts more than the deltas it is trying to resolve, so every toggle gets its own baseline
  // taken seconds before it from the same mark. The headline is min(baseline) - min(toggle) because
  // contention is one-sided; the median paired delta is printed beside it and disagreement between
  // the two is itself a finding.
  else if (MODE === 'toggles') {
    const TOGGLES = [
      // THE PROBE. car.js re-bakes a 512-px cube (six full scene renders) plus a PMREM chain every
      // PROBE_EVERY=6 frames OR every PROBE_MOVE=5 m of travel, whichever comes first. At this
      // build's cruise speed the 5 m clause is the one that fires. Both halves are killed through
      // three's prototypes because serviceEnv() calls a closure-local refreshEnv() that no property
      // on window.__game can reach. Restored by putting the original methods back.
      { name: 'car-env-probe-off', note: 'car.js reflection probe: six 512-px face renders AND the PMREM prefilter, both off',
        on: `(() => { const T = window.__game.THREE;
              window.__cc = window.__cc || T.CubeCamera.prototype.update;
              window.__pm = window.__pm || T.PMREMGenerator.prototype.fromCubemap;
              T.CubeCamera.prototype.update = function () {};
              T.PMREMGenerator.prototype.fromCubemap = function (tex, rt) { return rt || window.__pm.call(this, tex, rt); };
            })()`,
        off: `(() => { const T = window.__game.THREE;
              T.CubeCamera.prototype.update = window.__cc;
              T.PMREMGenerator.prototype.fromCubemap = window.__pm; })()` },
      { name: 'probe-faces-off', note: 'only the six 512-px scene renders killed; PMREM prefilter still runs every refresh',
        on: `(() => { const T = window.__game.THREE;
              window.__cc = window.__cc || T.CubeCamera.prototype.update;
              T.CubeCamera.prototype.update = function () {}; })()`,
        off: `(() => { window.__game.THREE.CubeCamera.prototype.update = window.__cc; })()` },
      { name: 'shadow-map-2048', note: '4096x4096 -> 2048x2048, same cascade span',
        on: `(() => { const s = window.__game.sky.sun.shadow;
              window.__shOld = [s.mapSize.x, s.mapSize.y];
              if (s.map) { s.map.dispose(); s.map = null; }
              s.mapSize.set(2048, 2048); })()`,
        off: `(() => { const s = window.__game.sky.sun.shadow;
              if (s.map) { s.map.dispose(); s.map = null; }
              s.mapSize.set(window.__shOld[0], window.__shOld[1]); })()` },
      { name: 'shadow-map-1024', note: '4096x4096 -> 1024x1024, same cascade span',
        on: `(() => { const s = window.__game.sky.sun.shadow;
              window.__shOld = [s.mapSize.x, s.mapSize.y];
              if (s.map) { s.map.dispose(); s.map = null; }
              s.mapSize.set(1024, 1024); })()`,
        off: `(() => { const s = window.__game.sky.sun.shadow;
              if (s.map) { s.map.dispose(); s.map = null; }
              s.mapSize.set(window.__shOld[0], window.__shOld[1]); })()` },
      { name: 'shadow-autoupdate-off', note: 'shadowMap.autoUpdate = false: the map is drawn ONCE and reused',
        on: `window.__game.renderer.shadowMap.autoUpdate = false;`,
        off: `window.__game.renderer.shadowMap.autoUpdate = true;` },
      { name: 'ssao-half-res', note: 'ssao.setSize(w/2, h/2): its normal prepass and AO at quarter the pixels',
        on: `(() => { const g = window.__game; const r = g.renderSize();
              window.__ssaoOld = [g.ssao._w, g.ssao._h]; g.ssao.setSize(r.w / 2, r.h / 2); })()`,
        off: `(() => { const g = window.__game; g.ssao.setSize(window.__ssaoOld[0], window.__ssaoOld[1]); })()` },
      { name: 'msaa-off', note: 'composer HalfFloat target samples 4 -> 0 (no MSAA resolve)',
        on: `(() => { const c = window.__game.composer;
              for (const rt of [c.renderTarget1, c.renderTarget2]) { rt.samples = 0; rt.dispose(); } })()`,
        off: `(() => { const c = window.__game.composer;
              for (const rt of [c.renderTarget1, c.renderTarget2]) { rt.samples = 4; rt.dispose(); } })()` },
      { name: 'buildings-hidden', note: 'world.buildings.visible = false (the city blocks themselves)',
        on: `window.__game.world.buildings.visible = false;`,
        off: `window.__game.world.buildings.visible = true;` },
      // WOULD A SMALLER MAP (or a per-instance distance cull) BUY ANYTHING? The census in --mode map
      // says 92% of the city's triangles sit more than 400 m from the car and every one of them is
      // submitted anyway, because an InstancedMesh's bounding sphere spans the whole map and three's
      // frustum test can therefore never reject it. Instance order is not spatial, so cutting
      // `count` to a tenth removes a spatially random 90% of the city: that is not what a cull would
      // LOOK like, but it costs exactly what a cull would SAVE, which is the number being asked for.
      { name: 'instances-10pct', note: 'every world InstancedMesh count cut to 10%: the cost a per-instance distance cull could recover',
        on: `(() => { const saved = [];
              window.__game.world.group.traverse((o) => { if (o.isInstancedMesh) {
                saved.push([o, o.count]); o.count = Math.max(1, Math.ceil(o.count * 0.1)); } });
              window.__inst = saved; })()`,
        off: `(() => { for (const [o, c] of window.__inst || []) o.count = c; window.__inst = null; })()` },
      { name: 'lamps-hidden', note: 'world.lamps.visible = false (street furniture instances)',
        on: `(() => { const l = window.__game.world.lamps; if (l) l.visible = false; })()`,
        off: `(() => { const l = window.__game.world.lamps; if (l) l.visible = true; })()` },
      { name: 'shadow-casters-off', note: 'every castShadow flag cleared: the shadow map still exists but draws nothing',
        on: `(() => { const w = []; window.__game.scene.traverse((o) => { if (o.castShadow) { o.castShadow = false; w.push(o); } });
              window.__casters = w; })()`,
        off: `(() => { for (const o of window.__casters || []) o.castShadow = true; window.__casters = null; })()` },
      { name: 'car-hidden', note: 'carRoot.visible = false — hides the hero in the MAIN pass; the probe still bakes',
        on: `window.__game.carRoot.visible = false;`,
        off: `window.__game.carRoot.visible = true;` },
      // ---- the fps.mjs --subsystem rows, re-implemented here ------------------------------
      // Not duplication for its own sake: fps.mjs cannot switch the probe off, so its table was
      // taken with a ~100 ms fixed cost landing on a random third of the frames in every window.
      // Carrying the same rows here lets ONE table be produced twice, as shipped and with
      // --kill probe, which is the only way to know what to optimise SECOND.
      { name: 'post-chain-off', note: 'every pass after RenderPass disabled, so RenderPass draws straight to the canvas',
        on: `(() => { const g = window.__game;
              window.__sub = g.composer.passes.slice(1).map((p) => [p, p.enabled]);
              for (const [p] of window.__sub) p.enabled = false; })()`,
        off: `(() => { for (const [p, e] of window.__sub) p.enabled = e; window.__sub = null; })()` },
      { name: 'ssao-off', note: 'SSAO pass disabled (it re-submits the whole scene for its normal prepass)',
        on: `window.__game.ssao.enabled = false;`, off: `window.__game.ssao.enabled = true;` },
      { name: 'bloom-off', note: 'UnrealBloomPass disabled',
        on: `window.__game.bloom.enabled = false;`, off: `window.__game.bloom.enabled = true;` },
      { name: 'smear-pass-off', note: 'boost radial-smear pass disabled',
        on: `window.__game.boost.pass.enabled = false;`, off: `window.__game.boost.pass.enabled = true;` },
      { name: 'output-grade-off', note: 'graded tonemap output pass disabled (frame looks wrong; cost only)',
        on: `window.__game.outputPass.enabled = false;`, off: `window.__game.outputPass.enabled = true;` },
      { name: 'world-hidden', note: 'world.group.visible = false (city, roads, props, lamps)',
        on: `window.__game.world.group.visible = false;`, off: `window.__game.world.group.visible = true;` },
      { name: 'traffic-hidden', note: 'traffic.group.visible = false (7 InstancedMeshes, 56 vehicles)',
        on: `window.__game.traffic.group.visible = false;`, off: `window.__game.traffic.group.visible = true;` },
      { name: 'sky-hidden', note: 'sky.skyMesh.visible = false',
        on: `(() => { const m = window.__game.sky.skyMesh; if (m) m.visible = false; })()`,
        off: `(() => { const m = window.__game.sky.skyMesh; if (m) m.visible = true; })()` },
      { name: 'hud-off', note: 'hud.setVisible(false) — hud.update() then skips draw() entirely (hud.js:2686)',
        on: `window.__game.hud.setVisible(false);`, off: `window.__game.hud.setVisible(true);` },
      // LAST ON PURPOSE, as in fps.mjs: the needsUpdate sweep is required for the DEFINE to take
      // effect, and it leaks ~60 permanent entries into renderer.info.programs, which would poison
      // the counters of every row measured after it.
      { name: 'shadows-off', note: 'renderer.shadowMap.enabled = false + full material recompile (4096 map, PCFSoft)',
        on: `(() => { const g = window.__game; g.renderer.shadowMap.enabled = false;
              g.scene.traverse((o) => { const m = o.material; if (!m) return;
                if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; }); })()`,
        off: `(() => { const g = window.__game; g.renderer.shadowMap.enabled = true;
              g.scene.traverse((o) => { const m = o.material; if (!m) return;
                if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; }); })()` },
    ];
    const names = list(args.toggles, null);
    const use = names ? TOGGLES.filter((t) => names.includes(t.name)) : TOGGLES;
    if (!use.length) throw new ProbeError(`no toggle matched. known: ${TOGGLES.map((t) => t.name).join(', ')}`);
    const page = await openPage();
    const sc = SCENARIOS[SCEN];
    await applyScenario(page, sc);
    await applyKill(page);
    await page.evaluate(CUBE_COUNTER);
    const counters = async () => page.evaluate(async (n) => {
      const info = window.__game.renderer.info;
      const prev = info.autoReset; info.autoReset = false; info.reset();
      let seen = 0;
      await new Promise((done) => { const s = () => { if (++seen >= n) return done(); requestAnimationFrame(s); }; requestAnimationFrame(s); });
      const out = { calls: info.render.calls / seen, triangles: info.render.triangles / seen };
      info.autoReset = prev; info.reset();
      return out;
    }, 40);
    const win = async (label) => {
      await respot(page, sc);
      await sleep(WARMUP_MS);
      const c0 = await page.evaluate(() => window.__cube | 0);
      const st = await frameWindow(page, label, MEASURE_MS);
      const c = await counters();
      const cubes = (await page.evaluate(() => window.__cube | 0)) - c0;
      // Probe refreshes per 100 frames: the row that proves whether a toggle changed how often
      // the probe fired (it changes speed, and the probe fires on distance travelled).
      return { ...st, counters: c, cubes, cubesPer100: 100 * cubes / st.n };
    };
    const acc = new Map(use.map((t) => [t.name, { name: t.name, note: t.note, pairs: [] }]));
    console.log('');
    console.log(`# EXTRA KILL-CONTROLS  scenario=${SCEN} res=${RES.toFixed(2)} passes=${REPEAT} ` +
      `warmup ${(WARMUP_MS / 1000).toFixed(1)}s measure ${(MEASURE_MS / 1000).toFixed(1)}s`);
    for (let p = 0; p < REPEAT; p++) {
      for (const t of use) {
        const base = await win(`baseline before ${t.name} pass ${p + 1}`);
        await page.evaluate(t.on);
        const off = await win(`${t.name} pass ${p + 1}`);
        await page.evaluate(t.off);
        acc.get(t.name).pairs.push({ base, off, delta: base.p50 - off.p50 });
        console.log(`  pass ${p + 1} ${pad(t.name, 22)} base p50 ${f2(base.p50)}  off p50 ${f2(off.p50)}  ` +
          `delta ${f2(base.p50 - off.p50)}  calls ${Math.round(base.counters.calls)}->${Math.round(off.counters.calls)}  ` +
          `probe/100f ${f2(base.cubesPer100)}->${f2(off.cubesPer100)}`);
      }
    }
    const ranked = [...acc.values()].map((r) => {
      const minBase = Math.min(...r.pairs.map((x) => x.base.p50));
      const minOff = Math.min(...r.pairs.map((x) => x.off.p50));
      const deltas = r.pairs.map((x) => x.delta);
      const sameSign = deltas.every((d) => d > 0) || deltas.every((d) => d < 0);
      return { name: r.name, note: r.note, minBase, minOff, cleanDelta: minBase - minOff,
        deltaMed: q(deltas, 0.5), deltas, sameSign,
        callsSaved: q(r.pairs.map((x) => x.base.counters.calls - x.off.counters.calls), 0.5),
        trisSaved: q(r.pairs.map((x) => x.base.counters.triangles - x.off.counters.triangles), 0.5) };
    }).sort((a, b) => b.cleanDelta - a.cleanDelta);
    const bases = [...acc.values()].map((r) => Math.min(...r.pairs.map((x) => x.base.p50)));
    const floor = Math.max(...bases) - Math.min(...bases);
    console.log('');
    console.log(`# per-toggle baseline MINIMA ${f2(Math.min(...bases))} .. ${f2(Math.max(...bases))} ms ` +
      `-> min-envelope noise floor ${f2(floor)} ms`);
    console.log(`${pad('kill-control', 24)} ${lpad('minBase', 8)} ${lpad('minOff', 8)} ${lpad('delta', 8)} ` +
      `${lpad('medDelta', 9)} ${lpad('calls-', 8)} ${lpad('tris-', 10)} ${lpad('sign', 6)} ${lpad('verdict', 8)}`);
    for (const r of ranked) {
      const verdict = (r.sameSign && r.cleanDelta > floor) ? 'REAL'
        : (r.sameSign && Math.min(...r.deltas.map(Math.abs)) >= 2) ? 'likely' : 'noise';
      r.verdict = verdict;
      console.log(`${pad(r.name, 24)} ${lpad(f2(r.minBase), 8)} ${lpad(f2(r.minOff), 8)} ${lpad(f2(r.cleanDelta), 8)} ` +
        `${lpad(f2(r.deltaMed), 9)} ${lpad(Math.round(r.callsSaved), 8)} ${lpad(Math.round(r.trisSaved), 10)} ` +
        `${lpad(`${r.deltas.filter((d) => d > 0).length}/${r.deltas.length}`, 6)} ${lpad(verdict, 8)}`);
    }
    for (const r of ranked) console.log(`  ${pad(r.name, 24)} ${r.note}`);
    report.toggles = { scenario: SCEN, res: RES, passes: REPEAT, noiseFloorMs: floor, ranked };
    if (page._errors.length) console.log(`# page errors: ${page._errors.slice(0, 6).join(' | ')}`);
    await page.close();
  }

  // =========================================================================
  // submits — how many times the scene is submitted per frame, and by whom
  // =========================================================================
  // The census says the scene holds 2.74M triangles. renderer.info says 13.2M are drawn per
  // frame. That factor of ~4.8 is the single most important structural fact about this frame and
  // no existing tool prints it. Wrapping renderer.render() and WebGLShadowMap.render() and taking
  // the counter delta across each call attributes every triangle to the pass that submitted it.
  //
  // WebGLShadowMap.render() runs INSIDE renderer.render(), so its cost is nested; the shadow row
  // is subtracted from the enclosing render row to keep the total honest.
  else if (MODE === 'submits') {
    const page = await openPage();
    const sc = SCENARIOS[SCEN];
    await applyScenario(page, sc);
    await sleep(WARMUP_MS);
    await applyKill(page);
    const out = await page.evaluate(async (frames) => {
      const g = window.__game;
      const r = g.renderer;
      const info = r.info;
      info.autoReset = false;
      const log = [];
      let depth = 0;
      const wrap = (obj, key, label) => {
        const f = obj[key];
        obj[key] = function (...a) {
          const c0 = info.render.calls, t0 = info.render.triangles;
          const w0 = performance.now();
          depth++;
          try { return f.apply(this, a); } finally {
            depth--;
            const tgt = r.getRenderTarget();
            log.push({ label, depth, calls: info.render.calls - c0, tris: info.render.triangles - t0,
              ms: performance.now() - w0,
              target: tgt ? `${tgt.width}x${tgt.height}${tgt.samples ? ` msaa${tgt.samples}` : ''}` : 'canvas' });
          }
        };
        return f;
      };
      wrap(r, 'render', 'renderer.render');
      wrap(r.shadowMap, 'render', 'shadowMap.render');
      const frameLogs = [];
      for (let i = 0; i < frames; i++) {
        log.length = 0;
        info.reset();
        await new Promise((d) => requestAnimationFrame(() => d()));
        frameLogs.push({ entries: log.slice(), calls: info.render.calls, tris: info.render.triangles });
      }
      return { frameLogs, renderSize: g.renderSize() };
    }, 12);
    assertRenderSize(out.renderSize, 'submits');
    // Aggregate identical (label, target) submissions across the sampled frames.
    const agg = new Map();
    let nf = 0;
    for (const f of out.frameLogs) {
      if (!f.entries.length) continue;
      nf++;
      const per = new Map();
      for (const e of f.entries) {
        const k = `${e.label} -> ${e.target}`;
        const b = per.get(k) || { calls: 0, tris: 0, ms: 0, n: 0 };
        b.calls += e.calls; b.tris += e.tris; b.ms += e.ms; b.n++;
        per.set(k, b);
      }
      for (const [k, v] of per) {
        const b = agg.get(k) || { calls: [], tris: [], ms: [], n: [] };
        b.calls.push(v.calls); b.tris.push(v.tris); b.ms.push(v.ms); b.n.push(v.n);
        agg.set(k, b);
      }
    }
    const rows = [...agg.entries()].map(([k, v]) => ({ what: k,
      perFrameCalls: q(v.calls, 0.5), perFrameTris: q(v.tris, 0.5), perFrameMs: q(v.ms, 0.5),
      invocations: q(v.n, 0.5) })).sort((a, b) => b.perFrameTris - a.perFrameTris);
    report.submits = { rows, frames: nf, renderSize: out.renderSize,
      frameTotals: out.frameLogs.map((f) => ({ calls: f.calls, tris: f.tris })) };
    console.log('');
    console.log(`# SCENE SUBMISSIONS PER FRAME (median over ${nf} frames), scenario ${SCEN}, ` +
      `renderW ${out.renderSize.w} renderH ${out.renderSize.h} pixelRatio ${out.renderSize.pixelRatio}`);
    console.log('# shadowMap.render is NESTED inside renderer.render, so its calls/tris are also');
    console.log('# counted in the renderer.render row that encloses it.');
    console.log(`${pad('submission', 46)} ${lpad('invocs', 7)} ${lpad('calls', 8)} ${lpad('tris', 11)} ${lpad('cpuMs', 8)}`);
    for (const r of rows) {
      console.log(`${pad(r.what, 46)} ${lpad(r.invocations, 7)} ${lpad(Math.round(r.perFrameCalls), 8)} ` +
        `${lpad(Math.round(r.perFrameTris), 11)} ${lpad(f2(r.perFrameMs), 8)}`);
    }
    if (page._errors.length) console.log(`# page errors: ${page._errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }

  // =========================================================================
  // res — does frame time follow pixel count?
  // =========================================================================
  // Test (a) of the CPU-vs-GPU question. A fresh page per cell, because resScale is set from the
  // URL at boot and that is the path the player and the pause menu actually take; poking
  // setResScale() on a live page also works but leaves the composer's targets recreated mid-run.
  //
  // The pixel-count column is the point: if p50 falls in proportion to pixels the frame is
  // fragment-bound, if it barely moves it is CPU- or fixed-cost-bound. The probe's cube faces are
  // 512x512 REGARDLESS of resScale, which is exactly why this sweep must also be run with
  // --kill probe: with the probe live, a fixed cost sits inside every cell and flattens the curve.
  else if (MODE === 'res') {
    const RES_LIST = list(args['res-list'], ['1.0', '0.7', '0.5', '0.4']).map(Number);
    const out = [];
    console.log('');
    console.log(`# RESOLUTION SWEEP  scenario=${SCEN} kill=${KILL} repeat=${REPEAT}`);
    console.log(`${pad('res', 6)} ${lpad('run', 4)} ${lpad('n', 5)} ${lpad('p50', 8)} ${lpad('mean', 8)} ` +
      `${lpad('p99', 9)} ${lpad('renderW', 8)} ${lpad('renderH', 8)} ${lpad('ratio', 6)} ${lpad('dpr', 4)} ` +
      `${lpad('Mpx', 6)} ${lpad('probe/100f', 11)} ${lpad('km/h', 7)}`);
    for (const res of RES_LIST) {
      for (let i = 0; i < REPEAT; i++) {
        const page = await openPage({ res });
        const sc = SCENARIOS[SCEN];
        await applyScenario(page, sc);
        await sleep(WARMUP_MS);
        await applyKill(page);
        await page.evaluate(CUBE_COUNTER);
        const c0 = await page.evaluate(() => window.__cube | 0);
        const st = await frameWindow(page, `res ${res} run ${i + 1}`, MEASURE_MS, res);
        const cubes = (await page.evaluate(() => window.__cube | 0)) - c0;
        const kmh = await page.evaluate(() => Math.abs(window.__game.physics.state.speed) * 3.6);
        const mpx = st.renderW * st.renderH / 1e6;
        out.push({ res, run: i + 1, ...st, cubesPer100: 100 * cubes / st.n, kmh, mpx });
        console.log(`${pad(res.toFixed(2), 6)} ${lpad(i + 1, 4)} ${lpad(st.n, 5)} ${lpad(f2(st.p50), 8)} ` +
          `${lpad(f2(st.mean), 8)} ${lpad(f2(st.p99), 9)} ${lpad(st.renderW, 8)} ${lpad(st.renderH, 8)} ` +
          `${lpad(st.pixelRatio, 6)} ${lpad(st.devicePixelRatio, 4)} ${lpad(f2(mpx), 6)} ` +
          `${lpad(f2(100 * cubes / st.n), 11)} ${lpad(f2(kmh), 7)}`);
        await page.close();
      }
    }
    console.log('');
    console.log('# best p50 per res (contention is one-sided, so the floor is the robust estimator),');
    console.log('# with the ms-per-megapixel implied slope. A fragment-bound frame keeps that slope flat.');
    const base = out.filter((r) => r.res === RES_LIST[0]);
    const bestBase = Math.min(...base.map((r) => r.p50));
    for (const res of RES_LIST) {
      const cell = out.filter((r) => r.res === res);
      const best = Math.min(...cell.map((r) => r.p50));
      const mpx = cell[0].mpx;
      console.log(`  res ${res.toFixed(2)}  ${cell[0].renderW}x${cell[0].renderH} (${f2(mpx)} Mpx)  ` +
        `best p50 ${f2(best)} ms  med ${f2(q(cell.map((r) => r.p50), 0.5))}  ` +
        `x${f2(best / bestBase)} of res ${RES_LIST[0].toFixed(2)}  ` +
        `pixels x${f2(mpx / base[0].mpx)}  ms/Mpx ${f2(best / mpx)}${best <= 16.7 ? '   <= 16.7 HOLDS 60' : ''}`);
    }
    report.res = { kill: KILL, rows: out };
  }

  // =========================================================================
  // map — is a SMALLER MAP a real win?
  // =========================================================================
  // The prompt authorises shrinking the map to buy frames, so the question has to be answered with
  // geometry rather than intuition. Everything repeated in this city is an InstancedMesh spanning
  // the whole 1120 m extent, so its bounding sphere is centred on the map and frustum culling can
  // never reject it: the WHOLE city is submitted every frame no matter where the car is. This mode
  // decodes every instance matrix, bins the instances by distance from the car, and reports how
  // many triangles a given draw radius would actually remove.
  //
  // Contention-immune: every number here is a count, so a busy machine cannot move it.
  else if (MODE === 'map') {
    const page = await openPage();
    const sc = SCENARIOS[SCEN];
    await applyScenario(page, sc);
    await sleep(WARMUP_MS);
    const out = await page.evaluate(() => {
      const g = window.__game;
      const T = g.THREE;
      g.scene.updateMatrixWorld(true);
      const car = g.physics.state.pos;
      const carV = new T.Vector3(car.x, car.y, car.z);
      const m = new T.Matrix4();
      const v = new T.Vector3();
      const BANDS = [50, 100, 150, 200, 300, 400, 600, 1e9];
      const bandTris = new Array(BANDS.length).fill(0);
      const bandInst = new Array(BANDS.length).fill(0);
      let totalInst = 0, totalTris = 0, instancedObjs = 0, plainTris = 0, plainObjs = 0;
      const perObject = [];
      g.world.group.traverse((o) => {
        const geo = o.geometry;
        if (!geo) return;
        const per = (geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0)) / 3;
        if (o.isInstancedMesh) {
          instancedObjs++;
          const bins = new Array(BANDS.length).fill(0);
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m);
            v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
            const d = v.distanceTo(carV);
            let b = 0; while (BANDS[b] < d) b++;
            bins[b]++; bandInst[b]++; bandTris[b] += per;
          }
          totalInst += o.count; totalTris += per * o.count;
          perObject.push({ instanced: true, count: o.count, trisEach: per, tris: per * o.count, bins });
        } else if (o.isMesh) {
          plainObjs++;
          v.setFromMatrixPosition(o.matrixWorld);
          const d = v.distanceTo(carV);
          let b = 0; while (BANDS[b] < d) b++;
          bandTris[b] += per; bandInst[b]++;
          totalTris += per; plainTris += per; totalInst++;
          perObject.push({ instanced: false, count: 1, trisEach: per, tris: per, dist: d });
        }
      });
      return { BANDS, bandTris, bandInst, totalInst, totalTris, instancedObjs, plainObjs, plainTris,
        biggest: perObject.sort((a, b) => b.tris - a.tris).slice(0, 12),
        layout: g.world.LAYOUT, carPos: [car.x, car.y, car.z],
        fog: g.scene.fog ? { near: g.scene.fog.near, far: g.scene.fog.far } : null,
        cameraFar: g.camera.far, renderSize: g.renderSize() };
    });
    assertRenderSize(out.renderSize, 'map');
    report.map = out;
    console.log('');
    console.log(`# MAP COST CENSUS, scenario ${SCEN}, car at ${out.carPos.map((v) => v.toFixed(0)).join(',')}`);
    console.log(`# world.group: ${out.instancedObjs} InstancedMeshes + ${out.plainObjs} plain meshes, ` +
      `${out.totalInst} instances, ${Math.round(out.totalTris)} triangles of unique+instanced geometry`);
    console.log(`# grid extent ${out.layout.extent} m, camera far ${out.cameraFar} m, ` +
      `fog ${out.fog ? `${out.fog.near}..${out.fog.far}` : 'exp'}`);
    console.log('');
    console.log(`${lpad('withinM', 9)} ${lpad('instances', 10)} ${lpad('cumInst%', 9)} ${lpad('tris', 11)} ${lpad('cumTris%', 9)}`);
    let ci = 0, ct = 0;
    for (let i = 0; i < out.BANDS.length; i++) {
      ci += out.bandInst[i]; ct += out.bandTris[i];
      console.log(`${lpad(out.BANDS[i] > 1e8 ? 'all' : out.BANDS[i], 9)} ${lpad(out.bandInst[i], 10)} ` +
        `${lpad(f2(100 * ci / out.totalInst), 9)} ${lpad(Math.round(out.bandTris[i]), 11)} ${lpad(f2(100 * ct / out.totalTris), 9)}`);
    }
    await page.close();
  } else if (!['inspect', 'phase', 'finish', 'stall', 'toggles', 'submits', 'res', 'map'].includes(MODE)) {
    throw new ProbeError(`unknown --mode ${MODE}`);
  }

  if (JSON_OUT) {
    await mkdir(dirname(JSON_OUT), { recursive: true });
    await writeFile(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`\njson ${JSON_OUT}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`\nFAILED: ${e.message}`);
  if (!(e instanceof ProbeError)) console.error(e.stack);
} finally {
  await browser.close();
  server.close();
  process.exit(exitCode);
}
