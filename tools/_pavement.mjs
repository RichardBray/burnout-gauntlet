// _pavement.mjs — assert on game/map/pavement.js in node, with no renderer. Wave T, S3a kerbs.
//   node tools/_pavement.mjs
//
// Four claims, and the first two are RISK 12 of tools/WAVE-T-GENERATE-MESH-PLAN.md, which says the
// face polygon and the block AABB are two different shapes for the same block and that BOTH
// directions of their disagreement are failure modes:
//
//   A. PAVEMENT-IN-ROAD.   No drawn kerb or pavement may lie on tarmac. Measured as an area
//      fraction over the drawn band, sampled on a grid, against game/map/graph.js's surfaceAt.
//   B. AABB-OUTSIDE-PAVEMENT. No published block AABB may poke outside the drawn kerb line of its
//      own face. This is the direction NOBODY HAS CHECKED - blocks.js proves only that no block
//      overlaps tarmac - and its failure mode is physics.js:922 colliding the car with empty air
//      over the road.
//   C. CHUNK-BOUNDARY BIT-IDENTITY, by the discipline _ribbons.mjs established: build the plan
//      TWICE as two separate computations and compare run 1's upstream cross-section against run
//      2's downstream one. Comparing two cells within ONE plan compares the same object and proves
//      nothing.
//   D. ORDER-INDEPENDENCE. Shuffle the face order and the emitted geometry must be the same SET of
//      triangles. A build/rebuild test would not show an order dependency; S2 records that the
//      shuffle test found 287 of 288 lamp panels invisible from the road.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createBlocks } from '../game/map/blocks.js';
import { createRoadGraph } from '../game/map/graph.js';
import { planPavement, KERB_H, WALK_H, KERB_TOP_W, WALK_W } from '../game/map/pavement.js';

const here = dirname(new URL(import.meta.url).pathname);
const doc = JSON.parse(await readFile(resolve(here, '../game/map/paradise.json'), 'utf8'));
const CHUNK = 200;

let fail = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) { fail++; console.log(`FAIL ${label} ${detail}`); } else console.log(`ok   ${label} ${detail}`);
};

const graph = createRoadGraph(doc);
const t0 = Date.now();
const { blocks, faces } = createBlocks(doc);
const tBlocks = Date.now() - t0;
const t1 = Date.now();
const plan = planPavement(doc, faces, { chunk: CHUNK, graph });
const tPlan = Date.now() - t1;

console.log('--- plan ---');
console.log(`  createBlocks: ${tBlocks} ms   planPavement: ${tPlan} ms`);
for (const [k, v] of Object.entries(plan.stats)) {
  console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
}
ok(plan.stats.cells > 0 && plan.stats.triangles > 0, 'geometry was produced',
  `(${plan.stats.cells} cells, ${plan.stats.triangles} triangles)`);
ok(plan.stats.geometriesPerCell === 2, 'two chunk-owned geometries per cell (plan section 2 caps it at ~6)');
ok(plan.rings.every((r) => r.lookupWorst <= 0.5), 'every ring segment midpoint sits on a road centreline',
  `(worst ${Math.max(...plan.rings.map((r) => r.lookupWorst)).toExponential(2)} m)`);

// ---------------------------------------------------------------------------------------------
// A. PAVEMENT-IN-ROAD
// ---------------------------------------------------------------------------------------------
// Sampled over the DRAWN band itself, from `plan.runs` - the maximal runs of cross-sections the
// emitter actually turned into triangles. NOT from the per-face ring: where the tarmac march drops
// a station the ring has a hole, and interpolating across it samples a surface that was never
// drawn. The first version of this check did exactly that and reported 5.36% on tarmac, all of it
// invented.
//
// The kerb FACE is reported separately. surfaceAt's tarmac test is INCLUSIVE (`d2 <= hp*hp`,
// graph.js:165), so a point exactly on the corridor boundary is tarmac by definition and the kerb
// is built to sit exactly there - that is what makes the shoulder ribbon and the kerb one
// continuous surface with no gap. Counting it as a violation would be scoring the design as a bug.
{
  const ACROSS = 12, ALONG = 4, EDGE_EPS = 0.01;
  let samples = 0, tarmac = 0, atKerbFace = 0, kerbFaceSamples = 0;
  let worstDepth = 0;
  const worst = [];
  for (const { xs: run } of plan.runs) {
    for (let i = 0; i + 1 < run.length; i++) {
      const a = run[i], b = run[i + 1];
      for (let u = 0; u < ALONG; u++) {
        const tu = (u + 0.5) / ALONG;
        const p0x = a.o[0] + (b.o[0] - a.o[0]) * tu, p0z = a.o[1] + (b.o[1] - a.o[1]) * tu;
        const p2x = a.i[0] + (b.i[0] - a.i[0]) * tu, p2z = a.i[1] + (b.i[1] - a.i[1]) * tu;
        kerbFaceSamples++;
        if (graph.surfaceAt(p0x, p0z) === 'tarmac') atKerbFace++;
        for (let v = 0; v < ACROSS; v++) {
          const tv = EDGE_EPS + (1 - EDGE_EPS) * ((v + 0.5) / ACROSS);
          const x = p0x + (p2x - p0x) * tv, z = p0z + (p2z - p0z) * tv;
          samples++;
          if (graph.surfaceAt(x, z) === 'tarmac') {
            tarmac++;
            const d = tv * Math.hypot(p2x - p0x, p2z - p0z);
            if (d > worstDepth) worstDepth = d;
            if (worst.length < 6) worst.push({ x: +x.toFixed(1), z: +z.toFixed(1), inFromKerb: +d.toFixed(2) });
          }
        }
      }
    }
  }
  console.log('\n--- A. pavement-in-road ---');
  console.log(`  band samples: ${samples}   on tarmac: ${tarmac}   (${(100 * tarmac / samples).toFixed(4)}%)`);
  console.log(`  deepest tarmac sample, measured in from the kerb face: ${worstDepth.toFixed(2)} m`);
  console.log(`  kerb-face samples reading tarmac (inclusive boundary, by design): ${atKerbFace} of ${kerbFaceSamples}`);
  if (worst.length) console.log('  examples:', JSON.stringify(worst));
  ok(tarmac === 0, 'zero drawn pavement on tarmac', `(${tarmac} of ${samples})`);

  // POISON CONTROL. A probe reporting zero has to be shown able to report non-zero: push one
  // sample 4 m back toward the road and confirm it is caught.
  let poisoned = 0;
  for (const { xs: run } of plan.runs) {
    if (poisoned) continue;
    const a = run[0];
    const dx = a.i[0] - a.o[0], dz = a.i[1] - a.o[1];
    const L = Math.hypot(dx, dz) || 1;
    if (graph.surfaceAt(a.o[0] - (dx / L) * 4, a.o[1] - (dz / L) * 4) === 'tarmac') poisoned = 1;
  }
  ok(poisoned === 1, 'poison control: a sample moved 4 m onto the carriageway IS reported as tarmac');
}

// ---------------------------------------------------------------------------------------------
// B. AABB-OUTSIDE-PAVEMENT  - the direction nobody has checked
// ---------------------------------------------------------------------------------------------
// blocks.js proves one direction: no block overlaps tarmac. Nobody has proved the other, which is
// that the AABB does not poke out past the DRAWN kerb - the case where physics.js:922 collides the
// car with empty air over the carriageway. Both are measured here.
//
// A SIGNED nearest-kerb test was tried first and it is the WRONG INSTRUMENT, which is worth
// recording because the number it produced looked like a defect. On a big face's frontage ring a
// block sits up to 40 m from the road (blocks.js RING_DEPTH), the nearest surviving kerb segment
// can be 37 m away and around a corner, and the sign of the offset against that segment's inward
// direction is then meaningless. It reported 159 samples "outside" with a 25.99 m worst case, and
// every example inspected was a correct block measured against a kerb it has nothing to do with.
//
// The exact test needs no orientation and no closed polygon: the kerb is outside the AABB if and
// only if no drawn kerb-face vertex lies inside any AABB and no drawn kerb SEGMENT crosses one.
{
  const K = 5;
  // Segment-versus-AABB, exact, via the slab clip. A vertex inside is the degenerate case of this,
  // so one routine covers both claims.
  const hits = [];
  let kerbVerts = 0, vertsInside = 0, segsCrossing = 0, worstPen = 0;
  let minClear = Infinity;
  const bx0 = blocks.map((b) => b.cx - b.w / 2), bx1 = blocks.map((b) => b.cx + b.w / 2);
  const bz0 = blocks.map((b) => b.cz - b.d / 2), bz1 = blocks.map((b) => b.cz + b.d / 2);
  // Bucket blocks so this is not 11123 x 868.
  const CELL = 64, grid = new Map();
  blocks.forEach((b, bi) => {
    for (let cz = Math.floor(bz0[bi] / CELL); cz <= Math.floor(bz1[bi] / CELL); cz++) {
      for (let cx = Math.floor(bx0[bi] / CELL); cx <= Math.floor(bx1[bi] / CELL); cx++) {
        const k = `${cx},${cz}`;
        (grid.get(k) || grid.set(k, []).get(k)).push(bi);
      }
    }
  });
  const near = (ax, az, bx, bz) => {
    const out = new Set();
    for (let cz = Math.floor(Math.min(az, bz) / CELL); cz <= Math.floor(Math.max(az, bz) / CELL); cz++) {
      for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++) {
        for (const bi of grid.get(`${cx},${cz}`) || []) out.add(bi);
      }
    }
    return out;
  };
  const inside = (x, z, bi) => x > bx0[bi] && x < bx1[bi] && z > bz0[bi] && z < bz1[bi];
  const crosses = (ax, az, bx, bz, bi) => {
    let t0 = 0, t1 = 1;
    for (const [p, q, lo, hi] of [[ax, bx - ax, bx0[bi], bx1[bi]], [az, bz - az, bz0[bi], bz1[bi]]]) {
      if (q === 0) { if (p <= lo || p >= hi) return false; continue; }
      let a = (lo - p) / q, b = (hi - p) / q;
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 >= t1) return false;
    }
    return true;
  };
  const clearance = (x, z, bi) => Math.max(bx0[bi] - x, x - bx1[bi], bz0[bi] - z, z - bz1[bi]);
  for (const { faceId, xs: run } of plan.runs) {
    for (let i = 0; i < run.length; i++) {
      const [x, z] = run[i].o;
      kerbVerts++;
      for (const bi of near(x, z, x, z)) {
        const c = clearance(x, z, bi);
        if (c < minClear) minClear = c;
        if (inside(x, z, bi)) {
          vertsInside++;
          if (-c > worstPen) worstPen = -c;
          if (hits.length < 6) hits.push({ face: faceId, x: +x.toFixed(1), z: +z.toFixed(1), into: +(-c).toFixed(2) });
        }
      }
      if (i + 1 < run.length) {
        const [x2, z2] = run[i + 1].o;
        for (const bi of near(x, z, x2, z2)) if (crosses(x, z, x2, z2, bi)) segsCrossing++;
      }
    }
  }
  // And the direction blocks.js already owns, re-run here so both are in one place.
  let onTarmac = 0, samples = 0;
  for (const b of blocks) {
    for (let i = 0; i <= K; i++) for (let j = 0; j <= K; j++) {
      const x = b.cx - b.w / 2 + (b.w * i) / K, z = b.cz - b.d / 2 + (b.d * j) / K;
      samples++;
      if (graph.surfaceAt(x, z) === 'tarmac') onTarmac++;
    }
  }
  console.log('\n--- B. AABB-outside-pavement ---');
  console.log(`  drawn kerb vertices: ${kerbVerts}   inside a block AABB: ${vertsInside}   worst penetration ${worstPen.toFixed(3)} m`);
  console.log(`  drawn kerb segments crossing a block AABB: ${segsCrossing}`);
  console.log(`  tightest kerb-to-AABB clearance anywhere: ${minClear.toFixed(3)} m`);
  console.log(`  AABB samples: ${samples} over ${blocks.length} blocks   on tarmac: ${onTarmac}`);
  if (hits.length) console.log('  examples:', JSON.stringify(hits));
  ok(vertsInside === 0, 'the drawn kerb is OUTSIDE every block AABB (risk 12)', `(${vertsInside} of ${kerbVerts})`);
  ok(segsCrossing === 0, 'no drawn kerb segment crosses a block AABB', `(${segsCrossing})`);
  ok(onTarmac === 0, 'no block AABB sample is on tarmac (blocks.js\' direction, re-run)',
    `(${onTarmac} of ${samples})`);

  // POISON CONTROL: move one kerb vertex 5 m into its nearest block and confirm it is caught.
  {
    let caught = 0;
    for (const b of blocks) {
      const x = b.cx, z = b.cz;
      for (const bi of near(x, z, x, z)) if (inside(x, z, bi)) { caught = 1; break; }
      if (caught) break;
    }
    ok(caught === 1, 'poison control: a point at a block centre IS reported inside that block');
  }
}

// ---------------------------------------------------------------------------------------------
// C. CHUNK-BOUNDARY BIT-IDENTITY
// ---------------------------------------------------------------------------------------------
// TWO INDEPENDENT PLANS, for the reason _ribbons.mjs records: within one plan the two cells either
// side of a boundary hold the SAME cross-section object, so comparing them proves sharing, not
// agreement. The claim that matters is the streaming one.
{
  const plan2 = planPavement(doc, faces, { chunk: CHUNK, graph });
  // Index the emitted pieces by (cell, first-vertex) is not stable across runs, so instead the
  // comparison is done on the geometry itself: for every pair of cells, the vertices that lie on
  // their shared plane must appear in both, bit for bit. Simpler and stronger: harvest every
  // vertex of every cell, and for each cell-boundary plane compare the multiset of vertices that
  // sit exactly on it between run 1 and run 2.
  const onPlane = (pl) => {
    const m = new Map();
    for (const c of pl.cells.values()) {
      for (const sink of [c.kerb, c.walk]) {
        for (let i = 0; i < sink.pos.length; i += 3) {
          const x = sink.pos[i], y = sink.pos[i + 1], z = sink.pos[i + 2];
          const kx = x / CHUNK, kz = z / CHUNK;
          if (Number.isInteger(kx) || Number.isInteger(kz)) {
            const key = `${x}|${y}|${z}`;
            m.set(key, (m.get(key) || 0) + 1);
          }
        }
      }
    }
    return m;
  };
  const m1 = onPlane(plan), m2 = onPlane(plan2);
  let shared = 0, differing = 0;
  for (const [k, n] of m1) {
    shared++;
    if (m2.get(k) !== n) differing++;
  }
  for (const k of m2.keys()) if (!m1.has(k)) differing++;
  console.log('\n--- C. chunk-boundary continuity ---');
  console.log(`  strips split at a chunk plane: ${plan.stats.boundaryVertices}`);
  console.log(`  distinct vertices lying exactly ON a chunk plane: ${shared}`);
  console.log(`  differing between two independent plans: ${differing}`);
  ok(plan.stats.boundaryVertices >= 20, 'at least 20 boundary splits walked',
    `(${plan.stats.boundaryVertices})`);
  ok(shared >= 20, 'boundary vertices land exactly on the plane, so both sides can share them',
    `(${shared})`);
  ok(differing === 0, 'boundary vertices bit-identical across two independent plans');

  // The stronger statement of the same claim, at the level the plan words it: the two pieces
  // either side of a split must share ONE cross-section, and an independent run must re-derive it
  // to the last bit. Walk the split points directly.
  const splits = (pl) => {
    const out = [];
    for (const c of pl.cells.values()) {
      for (const sink of [c.kerb, c.walk]) {
        for (let i = 0; i < sink.pos.length; i += 3) {
          const x = sink.pos[i], z = sink.pos[i + 2];
          if (Number.isInteger(x / CHUNK) || Number.isInteger(z / CHUNK)) {
            out.push([x, sink.pos[i + 1], z, sink.nor[i], sink.nor[i + 1], sink.nor[i + 2],
              sink.uv[(i / 3) * 2], sink.uv[(i / 3) * 2 + 1]]);
          }
        }
      }
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[6] - b[6]);
    return out;
  };
  const s1 = splits(plan), s2 = splits(plan2);
  let vals = 0, diff = 0;
  ok(s1.length === s2.length, 'the two plans emit the same number of on-plane vertices',
    `(${s1.length} / ${s2.length})`);
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    for (let k = 0; k < 8; k++) { vals++; if (!Object.is(s1[i][k], s2[i][k])) diff++; }
  }
  ok(diff === 0, 'position, normal and UV of every on-plane vertex identical',
    `(${vals} values compared, ${diff} differing)`);

  // POISON CONTROL: 1 ULP on one on-plane vertex must be caught.
  {
    const v = s2[0][1];
    s2[0][1] = v + Number.EPSILON * Math.max(1e-3, Math.abs(v));
    let d2 = 0;
    for (let k = 0; k < 8; k++) if (!Object.is(s1[0][k], s2[0][k])) d2++;
    s2[0][1] = v;
    ok(d2 > 0, 'poison control: a 1 ULP perturbation of an on-plane vertex is caught');
  }
}

// ---------------------------------------------------------------------------------------------
// D. DETERMINISM AND ORDER-INDEPENDENCE
// ---------------------------------------------------------------------------------------------
{
  const canon = (pl) => {
    const tris = [];
    for (const c of pl.cells.values()) {
      for (const [name, sink] of [['k', c.kerb], ['w', c.walk]]) {
        for (let i = 0; i < sink.idx.length; i += 3) {
          const v = [];
          for (let k = 0; k < 3; k++) {
            const o = sink.idx[i + k];
            v.push(`${sink.pos[o * 3]},${sink.pos[o * 3 + 1]},${sink.pos[o * 3 + 2]},` +
              `${sink.nor[o * 3]},${sink.nor[o * 3 + 1]},${sink.nor[o * 3 + 2]},` +
              `${sink.uv[o * 2]},${sink.uv[o * 2 + 1]}`);
          }
          tris.push(`${c.key}|${name}|${v.join(';')}`);
        }
      }
    }
    tris.sort();
    return tris;
  };
  const base = canon(plan);
  const rebuild = canon(planPavement(doc, faces, { chunk: CHUNK, graph }));
  const cmp = (a, b) => {
    if (a.length !== b.length) return -1;
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  };
  console.log('\n--- D. determinism and order-independence ---');
  console.log(`  canonical triangles: ${base.length}`);
  ok(cmp(base, rebuild) === 0, 'rebuild in the same order is identical', `(${base.length} triangles)`);

  const shuffles = [0x5EED, 0xA11CE, 0xBEEF, 0x1234, 0xFFFF];
  for (const seed of shuffles) {
    let s = seed >>> 0;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const perm = faces.slice();
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const d = cmp(base, canon(planPavement(doc, perm, { chunk: CHUNK, graph })));
    ok(d === 0, `shuffled face order 0x${seed.toString(16).toUpperCase()} is identical`, `(${d} differing)`);
  }

  // POISON CONTROL for the comparator itself.
  const poisoned = base.slice();
  poisoned[0] = `${poisoned[0]}x`;
  ok(cmp(base, poisoned) === 1, 'poison control: the triangle comparator reports a single change');
}

// ---------------------------------------------------------------------------------------------
// E. THE CONSTANTS, published rather than described
// ---------------------------------------------------------------------------------------------
console.log('\n--- E. constants ---');
console.log(`  KERB_H ${KERB_H}  WALK_H ${WALK_H}  KERB_TOP_W ${KERB_TOP_W}  WALK_W ${WALK_W}`);
ok(KERB_H === 0.22, 'kerb step is the grid world\'s 0.22 m (world.js:1694)');
ok(WALK_H === 0.24, 'pavement top is the grid world\'s 0.24 m (world.js:1704)');
ok(KERB_TOP_W === 0.8, 'kerb stone is the grid world\'s 0.8 m inset (world.js:1704, w - 1.6)');
ok(WALK_W === 7.0, 'pavement depth is LAYOUT.walkW = 7.0 (world.js:23)');

console.log(`\n${fail === 0 ? 'PAVEMENT OK' : `PAVEMENT FAILED (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
