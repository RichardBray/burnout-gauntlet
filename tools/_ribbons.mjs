// _ribbons.mjs — assert on game/map/ribbons.js in node, with no renderer.
//   node tools/_ribbons.mjs
//
// The headline assertion is CHUNK-BOUNDARY BIT-IDENTITY. Section 3 of the mesh plan says the two
// chunks either side of a boundary must land on identical vertices, and that the way to get that
// is to interpolate both the point and its normal from the same two source points with the same
// `t`. "The two cells hold the same object" is NOT that claim - it is a structural fact about one
// run. So this harness builds the whole plan TWICE, as two separate computations with two
// separate object graphs, and compares run 1's upstream vertex against run 2's downstream vertex
// with Object.is. That is the streaming claim: a chunk built at boot and its neighbour built ten
// minutes later agree to the last bit.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { planRoads, SHOULDER } from '../game/map/ribbons.js';

const here = dirname(new URL(import.meta.url).pathname);
const doc = JSON.parse(await readFile(resolve(here, '../game/map/paradise.json'), 'utf8'));
const CHUNK = 200;
const plan = planRoads(doc, { chunk: CHUNK });

let fail = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) { fail++; console.log(`FAIL ${label} ${detail}`); } else console.log(`ok   ${label} ${detail}`);
};

console.log('--- plan ---');
for (const [k, v] of Object.entries(plan.stats)) {
  console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
}

// ---------------------------------------------------------------------------------------------
// 1. BOUNDARY BIT-IDENTITY
// ---------------------------------------------------------------------------------------------
// TWO INDEPENDENT PLANS. Within one plan the two cells either side of a boundary hold the SAME
// vertex object, so comparing them proves only that the object was shared - a structural fact,
// not the numerical claim. The claim that matters is the streaming one: a chunk built at boot and
// its neighbour built ten minutes later must land on the same doubles. So the whole plan is built
// twice, from the same document but as two separate computations with two separate object graphs,
// and cell A's piece-END from run 1 is compared against cell B's piece-START from run 2.
const plan2 = planRoads(doc, { chunk: CHUNK });

const indexPieces = (pl) => {
  const m = new Map();
  for (const cell of pl.cells.values()) {
    for (const r of cell.ribbons) {
      if (!m.has(r.edge)) m.set(r.edge, []);
      m.get(r.edge).push({ cell: cell.key, r });
    }
  }
  for (const list of m.values()) list.sort((a, b) => a.r.pts[0].s - b.r.pts[0].s);
  return m;
};
const byEdge = indexPieces(plan);
const byEdge2 = indexPieces(plan2);

let pairs = 0, valuesCompared = 0, differing = 0, sameObject = 0;
const straddling = new Set();
const examples = [];
const FIELDS = ['x', 'z', 'nx', 'nz', 's'];

for (const [edgeId, list] of byEdge) {
  const list2 = byEdge2.get(edgeId);
  if (!list2 || list2.length !== list.length) continue;
  for (let i = 1; i < list.length; i++) {
    if (list[i - 1].cell === list[i].cell) continue;      // not a boundary
    straddling.add(edgeId);
    pairs++;
    // run 1's upstream cell, run 2's downstream cell: different objects, different computations.
    const A = list[i - 1].r.pts[list[i - 1].r.pts.length - 1];
    const B = list2[i].r.pts[0];
    if (A === B) sameObject++;
    for (const f of FIELDS) {
      valuesCompared++;
      if (!Object.is(A[f], B[f])) {
        differing++;
        if (examples.length < 6) examples.push({ edge: edgeId, field: f, runA: A[f], runB: B[f] });
      }
    }
  }
}

console.log('\n--- chunk-boundary continuity ---');
console.log(`  edges straddling a boundary: ${straddling.size} of ${plan.stats.edges}`);
console.log(`  boundary crossings walked:   ${pairs}`);
console.log(`  cross-run pairs that are the same object: ${sameObject} (must be 0, or the test is vacuous)`);
ok(pairs >= 20, 'at least 20 boundary crossings walked', `(${pairs})`);
ok(sameObject === 0, 'the two sides come from genuinely separate computations');
ok(differing === 0, 'shared boundary vertices bit-identical across two independent plans',
  `(${valuesCompared} values compared, ${differing} differing)`);
if (examples.length) console.log('  examples:', JSON.stringify(examples.slice(0, 4)));

// POISON CONTROL. Perturb one normal component of run 2 by 1 ULP and confirm it is caught.
{
  const list2 = [...byEdge2.values()].find((l) => l.length > 1);
  const V = list2[1].r.pts[0];
  const before = V.nx;
  V.nx = before + Number.EPSILON * Math.abs(before);
  const caught = !Object.is(V.nx, before);
  let detected = 0;
  for (const [edgeId, list] of byEdge) {
    const l2 = byEdge2.get(edgeId);
    if (!l2 || l2.length !== list.length) continue;
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].cell === list[i].cell) continue;
      const A = list[i - 1].r.pts[list[i - 1].r.pts.length - 1];
      const B = l2[i].r.pts[0];
      for (const f of FIELDS) if (!Object.is(A[f], B[f])) detected++;
    }
  }
  V.nx = before;
  ok(caught && detected > 0, 'poison control: a 1 ULP perturbation is caught',
    `(${detected} values flagged)`);
}

// The V coordinate must also be continuous, or the asphalt texture jumps at every boundary.
// `s` is arclength along the FULL edge, so this is the same check stated as a texture claim.
{
  let vJumps = 0;
  for (const list of byEdge.values()) {
    for (let i = 1; i < list.length; i++) {
      const A = list[i - 1].r.pts[list[i - 1].r.pts.length - 1];
      const B = list[i].r.pts[0];
      if (!Object.is(A.s, B.s)) vJumps++;
    }
  }
  ok(vJumps === 0, 'arclength (and therefore the texture V) is continuous across every join',
    `(${vJumps} jumps)`);
}

// ---------------------------------------------------------------------------------------------
// 2. NO RIBBON OVERLAP AT JUNCTIONS, AND THE POLYGON CLOSES THE GAP
// ---------------------------------------------------------------------------------------------
console.log('\n--- junctions ---');
const deg = plan.stats.degreeHistogram;
console.log(`  degree histogram: ${JSON.stringify(deg)}`);
ok((deg[2] || 0) > 0 && plan.stats.junctions === plan.nodes.filter((n) => n.deg >= 3).length,
  'one polygon per node of degree >= 3, none for degree 2',
  `(${plan.stats.junctions} polygons)`);
ok(plan.stats.maxRetreat <= RETREAT_LIMIT(), 'no retreat exceeds the 0.45 * length clamp',
  `(max ${plan.stats.maxRetreat.toFixed(2)} m)`);
function RETREAT_LIMIT() {
  let m = 0;
  for (const n of plan.nodes) for (let i = 0; i < n.recs.length; i++) {
    m = Math.max(m, Math.min(3.0 * n.hMax, 0.45 * n.recs[i].edge.length));
  }
  return m + 1e-9;
}
// Every retreat must leave the edge with something, or be recorded as a dropped edge.
let overEaten = 0;
for (const e of plan.edges) {
  const na = plan.nodes.find((n) => n.id === e.a), nb = plan.nodes.find((n) => n.id === e.b);
  const ra = na.recs.findIndex((rc) => rc.edge.id === e.id && rc.atA);
  const rb = nb.recs.findIndex((rc) => rc.edge.id === e.id && !rc.atA);
  if (na.r[ra] + nb.r[rb] > e.length) overEaten++;
}
console.log(`  edges whose two retreats exceed their length: ${overEaten} (reported as edgesWithNoRibbon=${plan.stats.edgesWithNoRibbon})`);
ok(overEaten === plan.stats.edgesWithNoRibbon || plan.stats.edgesWithNoRibbon >= overEaten,
  'over-eaten edges are accounted for, not silently emitted');

// Ring winding sanity: a junction polygon must have non-zero area, or the fan is degenerate.
let zeroArea = 0, minArea = Infinity, maxArea = 0;
for (const cell of plan.cells.values()) {
  for (const j of cell.junctions) {
    let A2 = 0;
    for (let i = 0; i < j.ring.length; i++) {
      const p = j.ring[i], q = j.ring[(i + 1) % j.ring.length];
      A2 += p[0] * q[1] - q[0] * p[1];
    }
    const a = Math.abs(A2) / 2;
    if (a < 1) zeroArea++;
    minArea = Math.min(minArea, a); maxArea = Math.max(maxArea, a);
  }
}
ok(zeroArea === 0, 'every junction polygon has real area', `(min ${minArea.toFixed(1)} m2, max ${maxArea.toFixed(1)} m2)`);

// ---------------------------------------------------------------------------------------------
// 3. COVERAGE — the drawn tarmac must be the tarmac surfaceAt() reports
// ---------------------------------------------------------------------------------------------
console.log('\n--- coverage ---');
ok(SHOULDER === 3.0, 'ribbons.js SHOULDER matches graph.js', `(${SHOULDER})`);
let minPaved = Infinity, maxPaved = 0;
for (const e of plan.edges) { minPaved = Math.min(minPaved, e.paved); maxPaved = Math.max(maxPaved, e.paved); }
console.log(`  paved half-width range: ${minPaved.toFixed(2)} .. ${maxPaved.toFixed(2)} m`);
console.log(`  cells occupied: ${plan.stats.cells}`);

console.log(`\n${fail === 0 ? 'ribbons ok' : `${fail} FAILURES`}`);
process.exit(fail === 0 ? 0 : 1);
