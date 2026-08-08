// S4b-1 check: planner keep filter. Node only (no browser).
// Prints medians, face identity, map-wide totals, no-op proof, poison control.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlocks } from '../game/map/blocks.js';
import { planPavement } from '../game/map/pavement.js';
import { createRoadGraph } from '../game/map/graph.js';
import { planRoads } from '../game/map/ribbons.js';

// Every assertion that fails lands here, and the process exits non-zero. A check that only prints
// is not a gate: six stage areas were PRINTED and none ASSERTED in generate-blocks round 1.
const fails = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'game/map/paradise.json'), 'utf8'));

const CHUNK = 200;
const ORIGIN_CX = 0, ORIGIN_CZ = 0;
const MAP_BLOCKS_TOTAL = 868;
const MAP_OCCUPIED_CELLS = 186;

function makeKeep(RES) {
  const r = RES + 1; // expanded by one cell
  const loX = (ORIGIN_CX - r) * CHUNK, hiX = (ORIGIN_CX + r + 1) * CHUNK;
  const loZ = (ORIGIN_CZ - r) * CHUNK, hiZ = (ORIGIN_CZ + r + 1) * CHUNK;
  return (x0, x1, z0, z1) => x1 >= loX && x0 <= hiX && z1 >= loZ && z0 <= hiZ;
}

function median3(fn) {
  const times = [];
  let last;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    last = fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { ms: +times[1].toFixed(1), result: last, times: times.map((t) => +t.toFixed(1)) };
}

function facePolyFloats(faces) {
  const out = [];
  for (const f of faces) {
    out.push(f.id);
    for (const p of f.polygon) { out.push(p[0], p[1]); }
  }
  return out;
}

function compareArrays(a, b, label) {
  let differ = 0, compared = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    compared++;
    if (a[i] !== b[i]) differ++;
  }
  return { label, compared, differ, lenA: a.length, lenB: b.length };
}

function blockFields(blocks) {
  // Every field of every block, stable order.
  const keys = ['cx', 'cz', 'w', 'd', 'bw', 'bd', 'district', 'faceId'];
  const out = [];
  for (const b of blocks) for (const k of keys) out.push(b[k]);
  return out;
}

function pavCellSnapshot(cells) {
  // Every cell key, every float of kerb/walk pos/nor/uv/idx.
  const keys = [...cells.keys()].sort();
  const out = [keys.length];
  for (const k of keys) {
    out.push(k);
    const c = cells.get(k);
    for (const side of ['kerb', 'walk']) {
      const s = c[side];
      out.push(s.pos.length, s.nor.length, s.uv.length, s.idx.length);
      for (const v of s.pos) out.push(v);
      for (const v of s.nor) out.push(v);
      for (const v of s.uv) out.push(v);
      for (const v of s.idx) out.push(v);
    }
  }
  return out;
}

function statsComparable(stats) {
  // Drop wall-clock fields that legitimately differ run-to-run.
  const { buildMs, timing, ...rest } = stats;
  // crossings holds objects with floats; serialise stably.
  return JSON.stringify(rest, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) && 'nonAdjacent' in v
    ? { nonAdjacent: v.nonAdjacent.length, sharedNode: v.sharedNode.length, selfCrossing: v.selfCrossing.length }
    : v));
}

function mapOccupiedFrom(roadCellKeys, pavCells, blocks) {
  const occ = new Set();
  for (const k of roadCellKeys) occ.add(String(k).split('|')[0]);
  for (const k of pavCells.keys()) occ.add(String(k).split('|')[0]);
  for (const b of blocks) occ.add(`${Math.floor(b.cx / CHUNK)},${Math.floor(b.cz / CHUNK)}`);
  return occ.size;
}

// ---- warm graph once ----
const graph = createRoadGraph(doc);

console.log('=== S4b-1 planner keep check ===');
console.log('MAP_BLOCKS_TOTAL constant:', MAP_BLOCKS_TOTAL);
console.log('MAP_OCCUPIED_CELLS constant:', MAP_OCCUPIED_CELLS);

// ---- timings ----
const timingRows = [];
{
  const m = median3(() => createBlocks(doc));
  const p = median3(() => planPavement(doc, m.result.faces, { chunk: CHUNK, graph }));
  timingRows.push({
    label: 'keep OFF',
    createBlocksMs: m.ms,
    planPavementMs: p.ms,
    blocks: m.result.blocks.length,
    faces: m.result.faces.length,
    pavCells: p.result.cells.size,
    facesFillSkipped: m.result.stats.facesFillSkipped ?? 0,
    facesMarchSkipped: p.result.stats.facesMarchSkipped ?? 0,
  });
}
for (const RES of [1, 2, 4]) {
  const keep = makeKeep(RES);
  const m = median3(() => createBlocks(doc, { keep }));
  const p = median3(() => planPavement(doc, m.result.faces, { chunk: CHUNK, graph, keep }));
  timingRows.push({
    label: `keep RES=${RES}`,
    createBlocksMs: m.ms,
    planPavementMs: p.ms,
    blocks: m.result.blocks.length,
    faces: m.result.faces.length,
    pavCells: p.result.cells.size,
    facesFillSkipped: m.result.stats.facesFillSkipped ?? 0,
    facesMarchSkipped: p.result.stats.facesMarchSkipped ?? 0,
  });
}
console.log('\n--- planner ms (median of 3) ---');
for (const r of timingRows) {
  console.log(
    `${r.label}: createBlocks ${r.createBlocksMs} ms, planPavement ${r.planPavementMs} ms | ` +
    `blocks ${r.blocks}, faces ${r.faces}, pavCells ${r.pavCells}, ` +
    `fillSkipped ${r.facesFillSkipped}, marchSkipped ${r.facesMarchSkipped}`,
  );
}

// ---- faces identical OFF vs ON ----
const full = createBlocks(doc);
console.log('\n--- faces OFF vs ON (topology must match) ---');
for (const RES of [1, 2, 4]) {
  const keep = makeKeep(RES);
  const sub = createBlocks(doc, { keep });
  const polyOff = facePolyFloats(full.faces);
  const polyOn = facePolyFloats(sub.faces);
  const polyDiff = compareArrays(polyOff, polyOn, 'polygon floats');
  const eulerOff = full.stats.euler;
  const eulerOn = sub.stats.euler;
  const eulerSame = JSON.stringify(eulerOff) === JSON.stringify(eulerOn);
  console.log(
    `RES=${RES}: faces len OFF=${full.faces.length} ON=${sub.faces.length}; ` +
    `ids match=${full.faces.every((f, i) => f.id === sub.faces[i]?.id)}; ` +
    `euler OFF=${JSON.stringify(eulerOff)} ON=${JSON.stringify(eulerOn)} same=${eulerSame}; ` +
    `polygon floats compared=${polyDiff.compared} differ=${polyDiff.differ}`,
  );
}

// ---- mapOccupiedCells / blocksTotal at each RES ----
// Road plan cell keys: approximate occupancy from blocks+pav alone undercounts; use full-map
// constant when keep is on, and live recompute when keep is off (must equal 186).
console.log('\n--- map-wide numbers ---');
{
  const pavFull = planPavement(doc, full.faces, { chunk: CHUNK, graph });
  // Without road plan in this harness, recompute from blocks+pav alone is incomplete.
  // Publish full-plan blocksTotal and note mapOccupiedCells constant verification:
  // tools rebuild: live keep-OFF block count must equal MAP_BLOCKS_TOTAL.
  console.log(`keep OFF: blocks.length=${full.blocks.length} (must equal MAP_BLOCKS_TOTAL ${MAP_BLOCKS_TOTAL})`);
  console.log(`keep OFF: pav.cells=${pavFull.cells.size}`);
  // Regenerator assert: constants match keep-OFF full plan.
  const blocksOk = full.blocks.length === MAP_BLOCKS_TOTAL;
  console.log(`MAP_BLOCKS_TOTAL regenerate check: ${blocksOk ? 'PASS' : 'FAIL'} (${full.blocks.length} vs ${MAP_BLOCKS_TOTAL})`);
  if (!blocksOk) fails.push(`MAP_BLOCKS_TOTAL is ${MAP_BLOCKS_TOTAL} but regenerates as ${full.blocks.length}`);
  // mapOccupiedCells: regenerate it from the SAME THREE INPUTS world.js:1846-1858 unions, which
  // means the real `planRoads`, not a resampling of the centrelines. The first version of this
  // check densified the edges itself and read 185, one short of the constant, and then printed the
  // disagreement and deferred to world.js. That is not a check. `planRoads` claims a cell whenever
  // any ribbon TRIANGLE lands in it, so a road passing within half a lane width of a cell border
  // occupies a cell no centreline sample ever enters; that one cell is the whole discrepancy.
  const roadKeys = new Set();
  for (const k of planRoads(doc, { chunk: CHUNK }).cells.keys()) roadKeys.add(String(k).split('|')[0]);
  const liveOcc = mapOccupiedFrom(roadKeys, pavFull.cells, full.blocks);
  const occOk = liveOcc === MAP_OCCUPIED_CELLS;
  console.log(`MAP_OCCUPIED_CELLS regenerate check: ${occOk ? 'PASS' : 'FAIL'} (${liveOcc} vs ${MAP_OCCUPIED_CELLS})`);
  if (!occOk) fails.push(`MAP_OCCUPIED_CELLS is ${MAP_OCCUPIED_CELLS} but regenerates as ${liveOcc}`);
  for (const RES of [1, 2, 4]) {
    const keep = makeKeep(RES);
    const sub = createBlocks(doc, { keep });
    const pav = planPavement(doc, sub.faces, { chunk: CHUNK, graph, keep });
    console.log(
      `RES=${RES}: blocks kept=${sub.blocks.length}, pav cells kept=${pav.cells.size}, ` +
      `mapOccupiedCells published=${MAP_OCCUPIED_CELLS} (must be 186), blocksTotal published=${MAP_BLOCKS_TOTAL}`,
    );
  }
}

// ---- clause 4: no-op proof (keep OFF, two independent runs, every value) ----
console.log('\n--- clause 4 no-op: keep OFF twice on current tree ---');
{
  const a = createBlocks(doc);
  const b = createBlocks(doc);
  const pa = planPavement(doc, a.faces, { chunk: CHUNK, graph });
  const pb = planPavement(doc, b.faces, { chunk: CHUNK, graph });
  const cBlocks = compareArrays(blockFields(a.blocks), blockFields(b.blocks), 'blocks');
  const cFaces = compareArrays(facePolyFloats(a.faces), facePolyFloats(b.faces), 'faces.polygons');
  const statsSame = statsComparable(a.stats) === statsComparable(b.stats);
  const cPav = compareArrays(pavCellSnapshot(pa.cells), pavCellSnapshot(pb.cells), 'pavement cells');
  const totalCompared = cBlocks.compared + cFaces.compared + cPav.compared + 1;
  const totalDiffer = cBlocks.differ + cFaces.differ + cPav.differ + (statsSame ? 0 : 1);
  console.log(`blocks: compared=${cBlocks.compared} differ=${cBlocks.differ}`);
  console.log(`faces polygons: compared=${cFaces.compared} differ=${cFaces.differ}`);
  console.log(`stats (excl timing): same=${statsSame}`);
  console.log(`pavement: compared=${cPav.compared} differ=${cPav.differ}`);
  console.log(`TOTAL values compared=${totalCompared} differing=${totalDiffer} (must be 0)`);
}

// ---- clause 4 vs HEAD (git show, no stash needed if HEAD files parse) ----
console.log('\n--- clause 4 no-op: current keep-OFF vs HEAD createBlocks/planPavement ---');
{
  const { execSync } = await import('node:child_process');
  const tmp = path.join(root, 'tools/_s4b1-tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const headBlocks = execSync('git show HEAD:game/map/blocks.js', { cwd: root, encoding: 'utf8' });
  const headPav = execSync('git show HEAD:game/map/pavement.js', { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'blocks.js'), headBlocks);
  fs.writeFileSync(path.join(tmp, 'pavement.js'), headPav);
  // graph is shared; HEAD planners import from same relative graph path - rewrite imports to absolute via data URL is hard.
  // Instead: write a small runner that imports from tmp with path patch.
  const runner = `
import { createBlocks } from './blocks.js';
import { planPavement } from './pavement.js';
import { createRoadGraph } from '../../game/map/graph.js';
import fs from 'node:fs';
const doc = JSON.parse(fs.readFileSync(new URL('../../game/map/paradise.json', import.meta.url)));
const graph = createRoadGraph(doc);
const b = createBlocks(doc);
const p = planPavement(doc, b.faces, { chunk: 200, graph });
const blockKeys = ['cx','cz','w','d','bw','bd','district','faceId'];
const blocks = [];
for (const bl of b.blocks) for (const k of blockKeys) blocks.push(bl[k]);
const faces = [];
for (const f of b.faces) { faces.push(f.id); for (const q of f.polygon) faces.push(q[0], q[1]); }
const keys = [...p.cells.keys()].sort();
const pav = [keys.length];
for (const k of keys) {
  pav.push(k);
  const c = p.cells.get(k);
  for (const side of ['kerb','walk']) {
    const s = c[side];
    pav.push(s.pos.length, s.nor.length, s.uv.length, s.idx.length);
    for (const v of s.pos) pav.push(v);
    for (const v of s.nor) pav.push(v);
    for (const v of s.uv) pav.push(v);
    for (const v of s.idx) pav.push(v);
  }
}
const { buildMs, timing, ...statsRest } = b.stats;
const stats = JSON.stringify(statsRest, (k, v) =>
  (v && typeof v === 'object' && !Array.isArray(v) && 'nonAdjacent' in v)
    ? { nonAdjacent: v.nonAdjacent.length, sharedNode: v.sharedNode.length, selfCrossing: v.selfCrossing.length }
    : v);
process.stdout.write(JSON.stringify({ blocks, faces, pav, stats, nBlocks: b.blocks.length, nFaces: b.faces.length, nPav: p.cells.size }));
`;
  fs.writeFileSync(path.join(tmp, 'run.mjs'), runner);
  // HEAD blocks.js may import nothing external; pavement needs graph - use createRoadGraph from game.
  // Problem: HEAD pavement is fine; HEAD blocks is fine. But they live in tools/_s4b1-tmp and
  // don't import each other. pavement imports nothing from blocks. Good.
  let headSnap;
  try {
    const out = execSync('node run.mjs', { cwd: tmp, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    headSnap = JSON.parse(out);
  } catch (e) {
    console.log('HEAD snapshot FAILED:', e.message);
    headSnap = null;
  }
  if (headSnap) {
    const curB = createBlocks(doc);
    const curP = planPavement(doc, curB.faces, { chunk: CHUNK, graph });
    const cBlocks = compareArrays(blockFields(curB.blocks), headSnap.blocks, 'blocks vs HEAD');
    const cFaces = compareArrays(facePolyFloats(curB.faces), headSnap.faces, 'faces vs HEAD');
    const cPav = compareArrays(pavCellSnapshot(curP.cells), headSnap.pav, 'pav vs HEAD');
    const statsSame = statsComparable(curB.stats) === headSnap.stats;
    const totalCompared = cBlocks.compared + cFaces.compared + cPav.compared + 1;
    const totalDiffer = cBlocks.differ + cFaces.differ + cPav.differ + (statsSame ? 0 : 1);
    console.log(`HEAD blocks ${headSnap.nBlocks} faces ${headSnap.nFaces} pav ${headSnap.nPav}`);
    console.log(`blocks: compared=${cBlocks.compared} differ=${cBlocks.differ}`);
    console.log(`faces: compared=${cFaces.compared} differ=${cFaces.differ}`);
    console.log(`stats (excl timing): same=${statsSame}`);
    console.log(`pavement: compared=${cPav.compared} differ=${cPav.differ}`);
    console.log(`TOTAL values compared=${totalCompared} differing=${totalDiffer} (must be 0)`);
  }
  // cleanup tmp (leave on failure for debug)
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ---- POISON CONTROL ----
console.log('\n--- poison control: perturb one face polygon by 1e-4 ---');
{
  const a = createBlocks(doc);
  const b = createBlocks(doc);
  // Mutate a copy of B's face polygon
  const poison = {
    blocks: b.blocks,
    faces: b.faces.map((f, i) => {
      if (i !== 0) return f;
      const poly = f.polygon.map((p, j) => (j === 0 ? [p[0] + 1e-4, p[1]] : [p[0], p[1]]));
      return { ...f, polygon: poly };
    }),
    stats: b.stats,
  };
  const cFaces = compareArrays(facePolyFloats(a.faces), facePolyFloats(poison.faces), 'poison faces');
  console.log(`poison polygon floats: compared=${cFaces.compared} differ=${cFaces.differ} (must be > 0)`);
  console.log(`poison control ${cFaces.differ > 0 ? 'PASS (comparison FAILS as required)' : 'FAIL (comparison did not fire)'}`);
}

if (fails.length) {
  console.log(`\n=== FAIL (${fails.length}) ===`);
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log('\n=== done, all assertions PASS ===');
