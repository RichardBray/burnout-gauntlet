// Check `game/map/blocks.js`. Wave T, `generate-blocks`.
//
// The blocks are the faces of the road graph, inset behind their own kerbs and filled with
// axis-aligned rectangles. Four things have to be true and each one is a separate way to ship a
// broken city, so each is asserted here rather than inferred from the next:
//
//   1. The EMBEDDING IS PLANAR. `V - E + F === 1 + components`. Round 1 of this piece did not check
//      it, shipped at chi = -4 with six faces silently welded together, and every other check in
//      this file passed on it. Euler is the one identity a broken rotation system cannot satisfy:
//      each unrepaired crossing merges two faces and drops F by exactly one.
//   2. The TRAVERSAL is a traversal. Every one of the 2*E half-edges used exactly once, every face
//      closed, exactly one negative-area face.
//   3. NOTHING SILENTLY SHRINKS. Every stage area and every count is asserted against a literal
//      baseline with a stated band. Round 1 PRINTED six stage areas and asserted none of them, and
//      the critic passed this harness with 53% of the deliverable deleted. Printing is not checking.
//   4. NO BLOCK OVERLAPS TARMAC. Probed against `game/map/graph.js`'s own `surfaceAt`, the function
//      the car will be judged by, over all 2373 segments. A block on the road is a building the
//      drive probe hits at 70 m/s. The minimum CLEARANCE is reported too, because a boolean cannot
//      tell "clears by 10 m" from "clears by a nanometre".
//
// The area figure is printed at every stage of the pipeline, exactly as `digitise` prints the
// kilometre figure at every stage, and now asserted as well.
//
//   node tools/_mapblocks.mjs [--probe 0.5] [--no-split]
import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
import { createRoadGraph } from '../game/map/graph.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
/** Probe pitch for the tarmac check, metres. 2 m is half the fill pitch, so no free cell of the
 *  mask can hide between samples, and it is a tenth of the narrowest legal block. */
const PROBE = +arg('--probe', 2);
/** `--no-split` reproduces round 1's non-planar embedding, so the Euler assert can be seen failing
 *  rather than taken on trust. It is a demonstration switch, not a supported mode. */
const NO_SPLIT = argv.includes('--no-split');

// ---- THE BASELINE ---------------------------------------------------------------------------------
// Literal values measured on the current `paradise.json`, with a two-sided band each. Two-sided on
// purpose: silent GROWTH is as much a symptom of a broken fill as silent shrinkage, and a one-sided
// floor is the rubber stamp wave-S rule 7 bans.
//
// The bands are not one number because the quantities do not have one sensitivity:
//   - `interiorArea` and `keptFaceArea` are pure functions of `paradise.json` and the traversal.
//     No threshold, no raster, no packing. 1% is already far more than anything legitimate can move
//     them; only a graph change or a traversal change can, and both should be deliberate.
//   - `keptFaces` likewise, but it is a small integer, so the band is stated in faces.
//   - `insetArea` additionally depends on SHOULDER, KERB_MARGIN and the 4 m raster. 3%.
//   - `blockArea` and `blockCount` depend on all of that plus MIN_BLOCK_SIDE, BIG_FACE_AREA,
//     RING_DEPTH and the maximal-rectangle packing, which is the most brittle step. 5%.
// A deliberate retune moves these literals in the same commit as the constant, which is the point:
// the number has to be typed twice, in two files, by someone who looked at it.
const BASELINE = {
  chi:           { v: 2,       band: 0,      unit: '' },
  facesWalked:   { v: 247,     band: 0,      unit: ' faces' },
  keptFaces:     { v: 240,     band: 3,      unit: ' faces' },
  interiorArea:  { v: 5853075, band: 0.01,   unit: ' m2', rel: true },
  keptFaceArea:  { v: 5851799, band: 0.01,   unit: ' m2', rel: true },
  insetArea:     { v: 4217616, band: 0.03,   unit: ' m2', rel: true },
  blockArea:     { v: 1847856, band: 0.05,   unit: ' m2', rel: true },
  blockCount:    { v: 868,     band: 0.05,   unit: ' blocks', rel: true },
  // The measured minimum signed clearance from any block corner to any paved corridor. A LITERAL,
  // not `S.params.kerbMargin`: round 2 compared it to the live constant, so `KERB_MARGIN 0.5 ->
  // 0.05` moved the bar with it and passed at exit 0. An assert that reads its expected value out
  // of the thing under test is not an assert. The band is one-sided in effect - the tarmac boolean
  // already catches anything that goes negative - but stated two-sided because clearance growing
  // well past 0.5 m means the inset changed and nobody said so.
  minClearance:  { v: 0.5050,  band: 0.02,   unit: ' m', rel: true, dp: 4 },
};

const doc = JSON.parse(readFileSync(new URL('../game/map/paradise.json', import.meta.url), 'utf8'));

const t0 = performance.now();
const B = createBlocks(doc, NO_SPLIT ? { split: false } : undefined);
const wallMs = performance.now() - t0;
const S = B.stats;
const km2 = (m2) => `${(m2 / 1e6).toFixed(3)} km2`;
const pct = (a, b) => `${(a / b * 100).toFixed(1)}%`;

let fail = 0;
const check = (ok, label, detail = '') => {
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};
/** Assert a measured value against its literal baseline and band. */
const band = (key, got) => {
  const b = BASELINE[key];
  const lo = b.rel ? b.v * (1 - b.band) : b.v - b.band;
  const hi = b.rel ? b.v * (1 + b.band) : b.v + b.band;
  const dev = b.v === 0 ? 0 : (got - b.v) / b.v * 100;
  check(got >= lo && got <= hi, `${key} within baseline`,
        `${got.toFixed(b.dp ?? 0)}${b.unit} vs ${b.v}${b.unit} ` +
        `(${dev >= 0 ? '+' : ''}${dev.toFixed(2)}%, band ${b.rel ? `+-${(b.band * 100).toFixed(0)}%` : `+-${b.band}`})`);
};

if (NO_SPLIT) console.log('*** --no-split: crossings NOT repaired, this is round 1 behaviour and must fail Euler ***\n');

// Build time, because `generate-mesh` runs this at load and the map brief's budget is 5.0 s total
// against a 3493 ms baseline. Note this is a WHOLE-MAP build, run once, not per chunk.
console.log(`blocks built in ${S.buildMs.toFixed(1)} ms (wall ${wallMs.toFixed(1)} ms)`);
console.log(`  traversal ${S.timing.traversalMs.toFixed(1)} ms | crossing scan + split ${S.timing.crossMs.toFixed(1)} ms | ` +
            `corridor index ${S.timing.indexMs.toFixed(1)} ms | raster fill ${S.timing.fillMs.toFixed(1)} ms`);
console.log(`  params ${JSON.stringify(S.params)}`);

// ---- 1. planarity, and the repair -----------------------------------------------------------------
console.log(`\nplanarity of the embedding`);
console.log(`  non-adjacent segment crossings: ${S.crossingsNonAdjacent}`);
for (const c of S.crossings.nonAdjacent.slice(0, 20)) {
  console.log(`    ! edges ${c.edges[0]} x ${c.edges[1]} cross at ${c.x.toFixed(1)}, ${c.z.toFixed(1)} with no node`);
}
check(S.crossingsNonAdjacent === 0, 'no two edges cross without sharing a node');
console.log(`  self-crossing polylines: ${S.crossingsSelf}`);
check(S.crossingsSelf === 0, 'no edge polyline crosses itself');
console.log(`  shared-node crossings (two roads off one junction whose polylines cross further along): ${S.crossingsSharedNode}`);
for (const c of S.crossings.sharedNode) {
  console.log(`      edges ${c.edges[0]} x ${c.edges[1]} at ${c.x.toFixed(1)}, ${c.z.toFixed(1)}`);
}
console.log(`  repair: ${S.split.applied ? 'APPLIED' : 'NOT APPLIED'} - ${S.split.inserted} node(s) inserted in a COPY of the doc, ` +
            `V ${S.split.nodesBefore} -> ${S.split.nodesAfter}, E ${S.split.edgesBefore} -> ${S.split.edgesAfter}` +
            (S.split.inserted ? `, shortest resulting edge ${S.split.shortestNewEdge.toFixed(2)} m` : ''));
check(!S.split.applied || S.split.shortestNewEdge >= 1.0, 'the split created no degenerate sub-metre edge',
      `${S.split.shortestNewEdge.toFixed(2)} m`);
check(S.crossingsNonAdjacent + S.crossingsSharedNode + S.crossingsSelf === S.split.inserted || !S.split.applied,
      'every crossing found got a node');

// THE EULER CHECK. This is the assert round 1 did not have.
console.log(`\nEuler characteristic`);
const E = S.euler;
console.log(`  V ${E.V}  E ${E.E}  F ${E.F}  components ${E.components}`);
console.log(`  chi = V - E + F = ${E.chi}, planar requires 1 + components = ${E.expected}` +
            (E.chi !== E.expected ? `  => ${E.expected - E.chi} face(s) merged, genus ${(2 - E.chi) / 2}` : ''));
check(E.chi === E.expected, 'V - E + F === 1 + components (the embedding is planar)',
      `chi ${E.chi} vs ${E.expected}`);
band('chi', E.chi);
check(E.components === 1, 'the graph is one connected component');

// ---- 2. the traversal -------------------------------------------------------------------------------
console.log(`\ntraversal`);
console.log(`  ${E.V} nodes, ${E.E} edges -> ${S.halfEdges} half-edges, ${S.facesWalked} faces walked`);
check(S.halfEdges === E.E * 2, 'half-edge count is 2*E', `${S.halfEdges} vs ${E.E * 2}`);
check(S.unusedHalfEdges === 0, 'every half-edge used exactly once', `${S.halfEdgesUsed}/${S.halfEdges} used, ${S.unusedHalfEdges} unused`);
check(S.facesClosed === S.facesWalked, 'every face closed', `${S.facesClosed}/${S.facesWalked}`);
check(S.outerFaces === 1, 'exactly one outer (negative-area) face', `${S.outerFaces} found${S.outerFaces > 1 ? ' - the embedding is NOT planar and these faces are fiction' : ''}`);
console.log(`  outer face encloses ${km2(S.outerArea)}`);
band('facesWalked', S.facesWalked);
// NOT asserted, and deliberately so: the signed areas of all faces sum to zero for ANY rotation
// system, broken or not, because each geometric segment is summed once in each direction. Round 1's
// report called this "a real check on the traversal, not a tautology". It is a tautology; the critic
// demonstrated it by swapping two entries in one node's list and watching it pass to one decimal
// place with two extra faces merged. It is printed as a numerical sanity check on the shoelace
// arithmetic and nothing more. Euler above is the check that has the property this one claimed.
console.log(`  outer area vs sum of interior: ${S.outerArea.toFixed(1)} vs ${S.interiorArea.toFixed(1)} ` +
            `(identically equal for any rotation system - NOT a planarity check, see the comment here)`);

// ---- 3. area at every stage, ASSERTED ----------------------------------------------------------------
const [X0, X1] = doc.extent.x, [Z0, Z1] = doc.extent.z;
console.log(`\narea at every stage`);
console.log(`  extent            ${(X1 - X0).toFixed(0)} x ${(Z1 - Z0).toFixed(1)} m = ${km2(S.extentArea)}`);
console.log(`  interior faces    ${km2(S.interiorArea)}  (${pct(S.interiorArea, S.extentArea)} of extent)`);
console.log(`  after tiny drop   ${km2(S.keptFaceArea)}  (${S.keptFaces} faces; dropped ${S.droppedTiny} below ${S.params.minFaceArea} m2, ${S.droppedTinyArea.toFixed(0)} m2 total)`);
console.log(`  inset (off kerb)  ${km2(S.insetArea)}  (${pct(S.insetArea, S.keptFaceArea)} of face area; the rest is the paved corridor)`);
console.log(`  ring interior     ${km2(S.ringInteriorArea)}  left OPEN on ${S.ringFaces} big faces - drivable ground, not a block`);
console.log(`  block AABBs       ${km2(S.blockArea)}  (${pct(S.blockArea, S.insetArea - S.ringInteriorArea)} of fillable inset)`);
console.log(`  building line     ${km2(S.buildArea)}  (bw x bd, ${S.params.walkW} m pavement each side)`);
console.log(`  NOT enclosed      ${km2(S.extentArea - S.interiorArea)}  (${pct(S.extentArea - S.interiorArea, S.extentArea)}) - outside the road network: ocean, mountainside, map margin`);
console.log(`  asserted against baseline:`);
band('interiorArea', S.interiorArea);
band('keptFaceArea', S.keptFaceArea);
band('keptFaces', S.keptFaces);
band('insetArea', S.insetArea);
band('blockArea', S.blockArea);
band('blockCount', S.blockCount);

// ---- 4. blocks ---------------------------------------------------------------------------------------
const sizes = B.blocks.map((b) => ({ b, a: b.w * b.d })).sort((p, q) => q.a - p.a);
console.log(`\nblocks`);
console.log(`  ${S.blockCount} blocks over ${S.keptFaces} faces (${(S.blockCount / S.keptFaces).toFixed(2)} per face), ${S.ringFaces} of the faces filled as a frontage ring`);
if (sizes.length) {
  const L = sizes[0].b, Sm = sizes[sizes.length - 1].b;
  console.log(`  largest   ${L.w.toFixed(0)} x ${L.d.toFixed(0)} m = ${sizes[0].a.toFixed(0)} m2 at ${L.cx.toFixed(0)}, ${L.cz.toFixed(0)} (${L.district}, face ${L.faceId})`);
  console.log(`  smallest  ${Sm.w.toFixed(0)} x ${Sm.d.toFixed(0)} m = ${sizes[sizes.length - 1].a.toFixed(0)} m2 at ${Sm.cx.toFixed(0)}, ${Sm.cz.toFixed(0)} (${Sm.district}, face ${Sm.faceId})`);
  console.log(`  longest side ${Math.max(...B.blocks.map((b) => Math.max(b.w, b.d))).toFixed(0)} m; ` +
              `deepest short side ${Math.max(...B.blocks.map((b) => Math.min(b.w, b.d))).toFixed(0)} m`);
}
// A single block may not be as large as the face area at which this file stopped treating a face as
// one block.
//
// CORRECTION, and it is the second prose-versus-code error in this piece so it gets stated plainly:
// round 2's comment here claimed that without this assert, `BIG_FACE_AREA` could be raised to
// infinity and "the slab spine would come straight back with every other check still green". THAT
// IS FALSE. The critic ran `bigFaceArea: Infinity` and it is caught twice over without this line -
// `solid.length === 0` below fires on 8 slabs, and the `blockArea` band fires at +100% against +-5%.
// This assert is REDUNDANT, and like round 2's clearance assert it measured itself against a
// parameter rather than a literal, so raising `bigFaceArea` raised its own bar too.
//
// It is kept, at a literal, because redundancy that names the failure directly is worth four lines:
// `blockArea +100%` does not say "there is a wall in the map" and this does. 40000 is BIG_FACE_AREA
// typed a second time on purpose - see the BASELINE comment above.
check(S.largestBlock < 40000, 'no block is as large as BIG_FACE_AREA (literal 40000 m2)',
      `largest ${S.largestBlock.toFixed(0)} m2`);
{
  const bands = [[0, 2500], [2500, 1e4], [1e4, 4e4], [4e4, 1e9]];
  for (const [lo, hi] of bands) {
    const c = B.blocks.filter((b) => b.w * b.d >= lo && b.w * b.d < hi);
    console.log(`  ${String(lo).padStart(6)}..${String(hi).padEnd(9)} m2: ${String(c.length).padStart(4)} blocks, ${km2(c.reduce((s, b) => s + b.w * b.d, 0))}`);
  }
  const long = B.blocks.filter((b) => b.w > 200 || b.d > 200);
  const solid = B.blocks.filter((b) => Math.min(b.w, b.d) > 200);
  console.log(`  over 200 m on a side: ${long.length}, ${km2(long.reduce((s, b) => s + b.w * b.d, 0))} (${pct(long.reduce((s, b) => s + b.w * b.d, 0), S.blockArea)} of block area) - frontage strips, one dimension only`);
  console.log(`  over 200 m on BOTH sides: ${solid.length} - these are the slabs, and this is the number that must stay 0`);
  check(solid.length === 0, 'no block is a solid slab over 200 m in both dimensions', `${solid.length} found`);
}
const emptyFaces = B.faces.filter((f) => f.blocks === 0);
console.log(`  faces that produced no block at all: ${emptyFaces.length} (${km2(emptyFaces.reduce((s, f) => s + f.area, 0))})`);
check(B.blocks.every((b) => b.w > 0 && b.d > 0 && Number.isFinite(b.cx) && Number.isFinite(b.cz)), 'every block has finite positive extents');
check(B.blocks.every((b) => b.bw > 0 && b.bd > 0), 'every block has a positive building line (bw, bd)',
      `${B.blocks.filter((b) => b.bw <= 0 || b.bd <= 0).length} bad`);
check(B.blocks.every((b) => Math.abs(b.bw - (b.w - 2 * S.params.walkW)) < 1e-9 && Math.abs(b.bd - (b.d - 2 * S.params.walkW)) < 1e-9),
      'bw/bd is exactly w/d minus twice the pavement depth');
check(B.blocks.every((b) => b.w >= S.params.minSide - 1e-9 && b.d >= S.params.minSide - 1e-9),
      `every block is at least ${S.params.minSide} m on both sides`);
check(B.blocks.every((b) => b.cx - b.w / 2 >= X0 && b.cx + b.w / 2 <= X1 && b.cz - b.d / 2 >= Z0 && b.cz + b.d / 2 <= Z1),
      'every block lies inside the map extent');

// Blocks must not overlap each other either: `physics.js:922` resolves against the FIRST block it
// finds inside, so two overlapping AABBs give a car two contradictory push-outs in one frame.
{
  const CELL = 64;
  const g = new Map();
  let overlaps = 0;
  const worst = [];
  const put = (k, i) => { let l = g.get(k); if (!l) { l = []; g.set(k, l); } l.push(i); };
  B.blocks.forEach((b, i) => {
    for (let z = Math.floor((b.cz - b.d / 2) / CELL); z <= Math.floor((b.cz + b.d / 2) / CELL); z++)
      for (let x = Math.floor((b.cx - b.w / 2) / CELL); x <= Math.floor((b.cx + b.w / 2) / CELL); x++) put(`${x},${z}`, i);
  });
  const seen = new Set();
  for (const list of g.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = Math.min(list[i], list[j]), C = Math.max(list[i], list[j]);
      const k = A * 100000 + C;
      if (seen.has(k)) continue;
      seen.add(k);
      const p = B.blocks[A], q = B.blocks[C];
      const ox = (p.w + q.w) / 2 - Math.abs(p.cx - q.cx);
      const oz = (p.d + q.d) / 2 - Math.abs(p.cz - q.cz);
      if (ox > 1e-6 && oz > 1e-6) { overlaps++; if (worst.length < 5) worst.push(`blocks ${A} and ${C} overlap by ${ox.toFixed(2)} x ${oz.toFixed(2)} m`); }
    }
  }
  check(overlaps === 0, 'no two blocks overlap each other', `${overlaps} overlapping pairs`);
  for (const w of worst) console.log(`      ! ${w}`);
}

// ---- 5. THE CHECK THAT MATTERS: zero blocks overlapping tarmac ----------------------------------------
// Probed against `createRoadGraph(doc).surfaceAt`, the same function `physics.js` will be given.
// Every block is sampled on a PROBE-metre grid over its AABB, and its four corners are sampled
// explicitly on top of that, because the grid can step over a corner and the corner is exactly
// where an inset goes wrong. The frontage rings make this materially harder than round 1: a ring has
// far more perimeter per unit area than a slab, so far more of the block boundary is near a kerb.
console.log(`\ntarmac overlap, probed against game/map/graph.js surfaceAt at ${PROBE} m pitch plus explicit corners`);
const g = createRoadGraph(doc);
const halfPaved = doc.edges.map((e) => e.width / 2 + 3.0);
let samples = 0, violations = 0, minClear = Infinity, minAt = null;
const offenders = [];
const tp0 = performance.now();
for (let bi = 0; bi < B.blocks.length; bi++) {
  const b = B.blocks[bi];
  const x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2, z0 = b.cz - b.d / 2, z1 = b.cz + b.d / 2;
  const probe = (x, z) => {
    samples++;
    if (g.surfaceAt(x, z) === 'tarmac') {
      violations++;
      if (offenders.length < 12) offenders.push(`block ${bi} (face ${b.faceId}, ${b.district}) ${b.w}x${b.d} at ${b.cx.toFixed(1)},${b.cz.toFixed(1)} : tarmac at ${x.toFixed(2)}, ${z.toFixed(2)}`);
    }
  };
  // Signed clearance is measured on the CORNERS only. They are where the minimum lives - the fill
  // clears every cell centre by construction and the corner is the extreme of the Lipschitz bound -
  // and `nearest` is four times the cost of `surfaceAt`, so doing it on 500k interior samples buys
  // a number that is already known.
  const clearance = (x, z) => {
    const n = g.nearest(x, z, 200);
    if (!n) return;
    const c = n.dist - halfPaved[n.edge];
    if (c < minClear) { minClear = c; minAt = `${x.toFixed(1)}, ${z.toFixed(1)} (block ${bi}, face ${b.faceId})`; }
  };
  probe(x0, z0); probe(x1, z0); probe(x0, z1); probe(x1, z1);
  clearance(x0, z0); clearance(x1, z0); clearance(x0, z1); clearance(x1, z1);
  const nx = Math.max(1, Math.round(b.w / PROBE)), nz = Math.max(1, Math.round(b.d / PROBE));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) probe(x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * j / nz);
}
const tpMs = performance.now() - tp0;
console.log(`  ${samples} samples over ${B.blocks.length} blocks in ${tpMs.toFixed(0)} ms`);
console.log(`  minimum signed clearance to any paved corridor: ${minClear.toFixed(4)} m at ${minAt}`);
check(violations === 0, 'ZERO block samples land on tarmac', `${violations} violating samples`);
// A boolean cannot distinguish a comfortable inset from one holding by a nanometre, so the measured
// minimum is asserted against its own literal in BASELINE. It is deliberately NOT compared to
// `S.params.kerbMargin`: that is the constant this assert exists to guard, and a bar that moves with
// the thing it guards guards nothing. `blocks.js:38` justifies 0.5 m as float32-error headroom, and
// this is what makes that justification checkable from outside the module.
band('minClearance', minClear);
for (const o of offenders) console.log(`      ! ${o}`);

// ---- 6. districts --------------------------------------------------------------------------------------
console.log(`\nper-district, attributed by length-weighted majority of each face's own bounding edges`);
console.log(`  ${'district'.padEnd(12)} ${'faces'.padStart(6)} ${'face km2'.padStart(10)} ${'blocks'.padStart(7)} ${'block km2'.padStart(10)}`);
for (const [id, s] of Object.entries(S.byDistrict).sort((a, b) => b[1].blockArea - a[1].blockArea)) {
  console.log(`  ${id.padEnd(12)} ${String(s.faces).padStart(6)} ${(s.faceArea / 1e6).toFixed(3).padStart(10)} ${String(s.blocks).padStart(7)} ${(s.blockArea / 1e6).toFixed(3).padStart(10)}`);
}
check(Object.values(S.byDistrict).every((s) => s.blocks > 0), 'every district got blocks');

// ---- 7. the block index, published for `rewire` ---------------------------------------------------------
// Reported with the number that motivates it: `physics.js:921-958` is an unindexed linear scan called
// from inside a `SUBSTEP = 1/240` loop.
console.log(`\nblock index (published as \`index\` alongside the flat array, never instead of it)`);
console.log(`  ${S.blockCount} blocks in ${B.index.stats.cells} cells of ${B.index.cell} m, ` +
            `${B.index.stats.entries} entries, ${B.index.stats.meanPerCell.toFixed(2)} per cell`);
console.log(`  unindexed scan at 240 Hz: ${(S.blockCount * 240).toLocaleString('en-US')} AABB tests/s ` +
            `(LAYOUT's 36 blocks = 8,640/s)`);
{
  // Correctness before speed: the index must agree with a linear scan, or it is a faster way to be
  // wrong.
  //
  // SWEPT OVER `pad`, and that is the whole point of this block. Round 2 exercised it at the default
  // `pad = 0` only, where `reach = ceil(0 / 128) = 0`, one cell is read, and a block cannot be
  // returned twice no matter what the code does. It passed 20000 probes against a defect that
  // returned some blocks up to seven times at `pad = 1.0` - which is the pad `physics.js:922`
  // actually uses. A check scoped to the one parameter value where the bug is structurally
  // impossible is not a check; it is this project's permanent rule 2 in new code.
  //
  // So: several pads including 1.0 and one larger than a whole 128 m cell, results compared as
  // MULTISETS against the linear scan, with misses, spurious hits and DUPLICATES counted separately
  // so the failure mode is named rather than just totalled.
  const PADS = [0, 1.0, 5, 50, 200];
  let rng = 20260807;
  const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pts = [];
  for (let i = 0; i < 8000; i++) {
    // Half uniform, half on block boundaries, because the boundary is where a grid index goes wrong.
    if (i % 2 === 0) pts.push([X0 + rnd() * (X1 - X0), Z0 + rnd() * (Z1 - Z0)]);
    else {
      const b = B.blocks[Math.floor(rnd() * B.blocks.length)];
      pts.push([b.cx + (rnd() - 0.5) * (b.w + 8), b.cz + (rnd() - 0.5) * (b.d + 8)]);
    }
  }
  let totalBad = 0, totalDup = 0;
  for (const pad of PADS) {
    let miss = 0, spurious = 0, dup = 0, probesBad = 0, worstDup = 0;
    for (const [x, z] of pts) {
      const got = B.index.at(x, z, pad);
      const want = new Set();
      B.blocks.forEach((b, i) => { if (Math.abs(x - b.cx) < b.w / 2 + pad && Math.abs(z - b.cz) < b.d / 2 + pad) want.add(i); });
      const uniq = new Set(got);
      const d = got.length - uniq.size;
      if (d > worstDup) worstDup = d;
      dup += d;
      let m = 0, sp = 0;
      for (const i of want) if (!uniq.has(i)) m++;
      for (const i of uniq) if (!want.has(i)) sp++;
      miss += m; spurious += sp;
      if (d || m || sp) probesBad++;
    }
    totalBad += miss + spurious; totalDup += dup;
    console.log(`  pad ${String(pad).padStart(5)} m: ${String(probesBad).padStart(5)} bad probes of ${pts.length}  ` +
                `(missing ${miss}, spurious ${spurious}, DUPLICATE ${dup}, worst ${worstDup} extra copies)`);
  }
  check(totalBad === 0, `index.at() finds exactly the right blocks at every pad in [${PADS}]`, `${totalBad} missing or spurious`);
  check(totalDup === 0, 'index.at() returns each block AT MOST ONCE at every pad', `${totalDup} duplicate entries`);

  const bench = (pad) => {
    const t = performance.now();
    let sink = 0;
    for (const [x, z] of pts) sink += B.index.at(x, z, pad).length;
    const perQ = (performance.now() - t) / pts.length;
    const tl = performance.now();
    let sink2 = 0;
    for (const [x, z] of pts) B.blocks.forEach((b) => { if (Math.abs(x - b.cx) < b.w / 2 + pad && Math.abs(z - b.cz) < b.d / 2 + pad) sink2++; });
    const perL = (performance.now() - tl) / pts.length;
    console.log(`  pad ${String(pad).padStart(5)} m: index.at ${(perQ * 1e6).toFixed(0)} ns/query vs linear scan ` +
                `${(perL * 1e6).toFixed(0)} ns/query (${(perL / perQ).toFixed(0)}x)  [sink ${sink}/${sink2}]`);
  };
  bench(0);
  bench(1.0);   // the pad `physics.js:922` uses
}

// ---- 8. determinism ---------------------------------------------------------------------------------------
// `generate-mesh` will build a chunk, dispose it and build it again; if the block list is not a
// pure function of the document then that comparison can never be made. It also proves the split
// does not mutate the caller's doc: the second build starts from the same object.
{
  const before = JSON.stringify(doc.nodes.length) + '/' + JSON.stringify(doc.edges.length);
  const again = createBlocks(doc, NO_SPLIT ? { split: false } : undefined);
  const after = JSON.stringify(doc.nodes.length) + '/' + JSON.stringify(doc.edges.length);
  check(JSON.stringify(again.blocks) === JSON.stringify(B.blocks), 'a second build produces a byte-identical block list');
  check(before === after, 'createBlocks did not mutate the caller\'s document', `${before} -> ${after}`);
}

console.log(`\n${fail === 0 ? 'PASS' : `FAIL - ${fail} check(s)`}`);
process.exit(fail === 0 ? 0 : 1);
