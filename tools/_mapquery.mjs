// Check `game/map/graph.js` against brute force, and measure what a query costs. Wave T, `queries`.
//
// The index exists to make `surfaceAt` cheap. Two things therefore have to be true, and BOTH are
// checked here, because either one alone is a metric this project has been burned by:
//
//   1. It must be RIGHT. Every answer is compared against a brute-force scan of all 2373 segments.
//      A fast index that quietly misses the segment in the next cell reads as "the car is off-road
//      on a road", which is a handling bug nobody would trace back to a grid.
//   2. It must be FAST. `surfaceAt` runs per wheel per frame - four calls at 60 fps is 240/s
//      minimum, and traffic and the surface spray will want more.
//
//   node tools/_mapquery.mjs [--n 200000]
import { readFileSync } from 'node:fs';
import { createRoadGraph } from '../game/map/graph.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const N = +arg('--n', 200000);

const doc = JSON.parse(readFileSync(new URL('../game/map/paradise.json', import.meta.url), 'utf8'));

const t0 = performance.now();
const g = createRoadGraph(doc);
const buildMs = performance.now() - t0;

console.log(`index built in ${buildMs.toFixed(1)} ms`);
console.log(`  ${g.stats.segments} segments, ${g.stats.cells} cells of ${g.stats.cell} m, ` +
            `${g.stats.entries} entries (${g.stats.meanPerCell.toFixed(2)} per cell), ` +
            `${(g.stats.bytes / 1024).toFixed(0)} KB`);

// ---- brute force, written independently of the index ------------------------------------------
const SHOULDER = 3.0;
const segs = [];
{
  const nodeP = new Map(doc.nodes.map((n) => [n.id, n.p]));
  for (const e of doc.edges) {
    const pts = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    for (let k = 1; k < pts.length; k++) segs.push({ a: pts[k - 1], b: pts[k], hp: e.width / 2 + SHOULDER });
  }
}
function bruteNearest(x, z) {
  let bd = Infinity, best = null;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.a[0] + dx * t, pz = s.a[1] + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = { d, s }; }
  }
  return best;
}
const bruteSurface = (x, z) => {
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.a[0] + dx * t, pz = s.a[1] + dz * t;
    if ((x - px) ** 2 + (z - pz) ** 2 <= s.hp * s.hp) return 'tarmac';
  }
  return 'dirt';
};

// ---- correctness --------------------------------------------------------------------------------
// Points are drawn two ways on purpose. Uniform random over the map is mostly dirt, so on its own
// it would "pass" against an index that always said dirt. The second set walks the roads
// themselves, plus a jittered band around them, which is where the boundary cases live.
let rng = 20260807;
const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const [X0, X1] = doc.extent.x, [Z0, Z1] = doc.extent.z;

const probes = [];
for (let i = 0; i < 4000; i++) probes.push([X0 + rnd() * (X1 - X0), Z0 + rnd() * (Z1 - Z0)]);
for (let i = 0; i < 6000; i++) {
  const s = segs[Math.floor(rnd() * segs.length)];
  const t = rnd();
  const x = s.a[0] + (s.b[0] - s.a[0]) * t, z = s.a[1] + (s.b[1] - s.a[1]) * t;
  const jitter = (rnd() - 0.5) * 4 * s.hp;      // straddles the kerb face in both directions
  const ang = rnd() * Math.PI * 2;
  probes.push([x + Math.cos(ang) * jitter, z + Math.sin(ang) * jitter]);
}

let surfaceBad = 0, nearestBad = 0, worstNearest = 0;
const firstBad = [];
for (const [x, z] of probes) {
  const got = g.surfaceAt(x, z), want = bruteSurface(x, z);
  if (got !== want) { surfaceBad++; if (firstBad.length < 5) firstBad.push(`surfaceAt(${x.toFixed(1)}, ${z.toFixed(1)}) = ${got}, brute force says ${want}`); }
  const gn = g.nearest(x, z), bn = bruteNearest(x, z);
  // A null is CORRECT when the nearest road is beyond the search radius - out at sea, mostly.
  // Counting it as a miss was this harness's own bug and reported 480 false failures on a run
  // whose worst real error was 6e-5 m.
  if (!gn) {
    if (bn.d <= 400) { nearestBad++; if (firstBad.length < 5) firstBad.push(`nearest(${x.toFixed(1)}, ${z.toFixed(1)}) = null but brute force found road at ${bn.d.toFixed(1)} m`); }
    continue;
  }
  const err = Math.abs(gn.dist - bn.d);
  if (err > worstNearest) worstNearest = err;
  // float32 segment endpoints against the harness's float64 arithmetic; 1e-3 m is 1 mm.
  if (err > 1e-3) { nearestBad++; if (firstBad.length < 5) firstBad.push(`nearest(${x.toFixed(1)}, ${z.toFixed(1)}) = ${gn.dist.toFixed(3)} m, brute force says ${bn.d.toFixed(3)} m`); }
}
const surfaceTarmac = probes.filter(([x, z]) => bruteSurface(x, z) === 'tarmac').length;
console.log(`\ncorrectness over ${probes.length} probes (${surfaceTarmac} of them on tarmac, ` +
            `${(surfaceTarmac / probes.length * 100).toFixed(0)}%)`);
console.log(`  surfaceAt disagreements: ${surfaceBad}`);
console.log(`  nearest disagreements:   ${nearestBad} (worst distance error ${worstNearest.toExponential(2)} m)`);
for (const b of firstBad) console.log(`    ! ${b}`);

// ---- cost ---------------------------------------------------------------------------------------
// Measured on the DRIVEN case, not on empty desert: a query out in the ocean exits on an empty
// cell and is unrepresentatively fast. Road-following points are what the car actually asks about.
const road = [];
for (let i = 0; i < N; i++) {
  const s = segs[i % segs.length];
  const t = (i * 0.618033) % 1;
  road.push([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
}
const bench = (label, fn, pts) => {
  fn(pts[0][0], pts[0][1]);
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < pts.length; i++) sink += fn(pts[i][0], pts[i][1]) === 'dirt' ? 1 : 0;
  const ms = performance.now() - t0;
  console.log(`  ${label.padEnd(22)} ${(ms / pts.length * 1e6).toFixed(0).padStart(5)} ns/query  ` +
              `(${(pts.length / ms / 1000).toFixed(2)} M/s)  [sink ${sink}]`);
  return ms / pts.length;
};
console.log(`\ncost, ${N} queries on road positions`);
const usSurface = bench('surfaceAt (indexed)', (x, z) => g.surfaceAt(x, z), road);
bench('nearest (indexed)', (x, z) => (g.nearest(x, z) ? 'tarmac' : 'dirt'), road);
const small = road.slice(0, 2000);
const t1 = performance.now();
for (const [x, z] of small) bruteSurface(x, z);
const usBrute = (performance.now() - t1) / small.length;
console.log(`  ${'surfaceAt (brute force)'.padEnd(22)} ${(usBrute * 1e6).toFixed(0).padStart(5)} ns/query  ` +
            `(speedup ${(usBrute / usSurface).toFixed(0)}x)`);

// A frame's worth: four wheels at 60 fps, plus headroom for traffic asking too.
console.log(`\n  four wheels per frame = ${(usSurface * 4 * 1000).toFixed(1)} ns = ` +
            `${(usSurface * 4).toFixed(5)} ms, against a 16.7 ms budget`);

const ok = surfaceBad === 0 && nearestBad === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'} - index agrees with brute force on every probe`);
process.exit(ok ? 0 : 1);
