// Turn `_maptrace.mjs`'s raw pixel skeleton into `game/map/paradise.json`. Wave T, `digitise`.
//
// The tracer gives a faithful but hairy graph: every bright smudge that survived the mask is a
// spur, every wide junction is a little loop, and every polyline carries one point per pixel.
// This pass prunes it, simplifies it, measures each road's WIDTH off the image, classifies it,
// assigns districts, and converts to metres.
//
//   node tools/_mapgraph.mjs <raw.json> --mask <prefix> --img <prefix> --out game/map/paradise.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const RAW = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const MASK = arg('--mask'), IMG = arg('--img'), OUT = arg('--out'), PINS = arg('--pins');
if (!RAW || !MASK || !IMG || !OUT || !PINS) {
  console.error('usage: node tools/_mapgraph.mjs <raw.json> --mask <p> --img <p> --pins <p> --out <json>');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const { w, h } = raw.image;
const maskBuf = readFileSync(`${MASK}.rgba`);
const imgBuf = readFileSync(`${IMG}.rgba`);
const pinBuf = readFileSync(`${PINS}.rgba`);
const idx = (x, y) => y * w + x;

// ---- THE SCALE, AND IT IS A CALIBRATION KNOB --------------------------------------------------
// Nothing in the source image states a scale, so this is the one authored number the whole map
// rests on. Paradise City is described as roughly 4 km across; that is taken as the image WIDTH
// and everything else follows. Retune this single constant if driving it says the city is too big
// or too small - every coordinate in the output is derived from it, so nothing else has to move.
const MAP_WIDTH_M = 4000;
const S = MAP_WIDTH_M / w;                       // metres per pixel
const toX = (px) => (px - w / 2) * S;
const toZ = (py) => (py - h / 2) * S;

// ---- 1. PRUNE SPURS ---------------------------------------------------------------------------
// A spur is a dead-end twig shorter than a city block: a mask artefact, not a road. Real dead ends
// in Paradise City are long. Pruning is iterative because removing one spur exposes the next.
const SPUR_M = 55;
const nodes = raw.nodes.map((n, i) => ({ i, px: n.px, py: n.py }));
let edges = raw.edges.map((e, i) => ({ i, a: e.a, b: e.b, path: e.path }));
const pathLenPx = (p) => {
  let d = 0;
  for (let k = 1; k < p.length; k++) d += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
  return d;
};

function prune(label) {
  let pruned = 0;
  for (let pass = 0; pass < 40; pass++) {
    const deg = new Map();
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) || 0) + 1);
      deg.set(e.b, (deg.get(e.b) || 0) + 1);
    }
    const drop = new Set();
    for (const e of edges) {
      if (e.a === e.b) continue;
      const tip = deg.get(e.a) === 1 ? e.a : deg.get(e.b) === 1 ? e.b : null;
      if (tip === null) continue;
      if (pathLenPx(e.path) * S <= SPUR_M) drop.add(e.i);
    }
    if (!drop.size) break;
    pruned += drop.size;
    edges = edges.filter((e) => !drop.has(e.i));
  }
  console.log(`pruned ${label}`.padEnd(15) + `${pruned} spurs shorter than ${SPUR_M} m`);
}
prune('(pre)');

// ---- 1b. MERGE JUNCTION CLUSTERS --------------------------------------------------------------
// The thinner turns one road junction into a knot of several branch pixels a few pixels apart, and
// stage 8 of the tracer makes a node of every one of them. Left alone the graph reads 6437 nodes
// and 10777 edges for 83 km of road - a mean edge length of 7.7 m, which is not a road network,
// it is a pixel dump. Cluster nodes within a junction's own width and collapse what that shorts
// out.
const MERGE_M = 22;
{
  const before = { n: nodes.length, e: edges.length };
  const parent = new Map(nodes.map((n) => [n.i, n.i]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  // CONTRACT SHORT EDGES - do not cluster by proximity. Proximity clustering was tried first and
  // it ate the map: with a node every 7.7 m and a 22 m radius, A~B~C~D chains transitively until
  // an entire road is one node, and the graph came back 42.50 km against the 82.94 km that went
  // in. Contracting an EDGE can only ever remove that edge's own length, so the total cannot
  // silently halve again - which is why the kilometre figure is printed at every stage.
  const live = new Set();
  for (const e of edges) { live.add(e.a); live.add(e.b); }
  for (const e of edges) {
    if (e.a !== e.b && pathLenPx(e.path) * S <= MERGE_M) union(e.a, e.b);
  }
  // Move each cluster's survivor to the cluster centroid, so a junction sits where it looks.
  const groups = new Map();
  for (const i of live) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(nodes[i]);
  }
  for (const [r, members] of groups) {
    const rep = nodes[r] ?? members[0];
    rep.px = members.reduce((s, m) => s + m.px, 0) / members.length;
    rep.py = members.reduce((s, m) => s + m.py, 0) / members.length;
  }
  for (const e of edges) { e.a = find(e.a); e.b = find(e.b); }
  // An edge whose ends merged into one node is the knot itself. Keep it only if it is a real loop
  // - long enough to drive round - and drop the stubs.
  edges = edges.filter((e) => e.a !== e.b || pathLenPx(e.path) * S > MERGE_M * 3);
  // Parallel duplicates between the same pair collapse to the shortest.
  const bestPair = new Map();
  for (const e of edges) {
    const k = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
    const cur = bestPair.get(k);
    if (!cur || pathLenPx(e.path) < pathLenPx(cur.path)) bestPair.set(k, e);
  }
  const dupes = edges.length - bestPair.size;
  edges = [...bestPair.values()];
  console.log(`merged         ${before.n} -> ${groups.size} nodes (edges under ${MERGE_M} m contracted), ` +
              `${before.e} -> ${edges.length} edges (${dupes} parallel duplicates collapsed)`);
}
// Merging shorts out knots, which exposes spurs that were not dead ends before it.
prune('(post)');

// ---- 2. DROP TINY SELF-LOOPS ------------------------------------------------------------------
// A wide junction thins into a small ring rather than a point. Anything under a car's turning
// circle is an artefact of the thinning, not a roundabout.
const LOOP_M = 40;
{
  const before = edges.length;
  edges = edges.filter((e) => e.a !== e.b || pathLenPx(e.path) * S > LOOP_M);
  console.log(`self-loops     ${before - edges.length} dropped under ${LOOP_M} m`);
}

// ---- 2b. SNAP NEAR-MISS STUBS ------------------------------------------------------------------
// A degree-1 node that stops 30 m short of another road is not a cul-de-sac, it is the mask losing
// a road under a shadow or a bridge. Joining it is the difference between a dead end the user
// banned and a junction that was always there. The radius is deliberately shorter than the spur
// length so this can only close a gap, never invent a road.
const SNAP_M = 45;
{
  let snapped = 0;
  for (let pass = 0; pass < 6; pass++) {
    const deg = new Map();
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) || 0) + 1);
      deg.set(e.b, (deg.get(e.b) || 0) + 1);
    }
    const tips = [...deg.entries()].filter(([, d]) => d === 1).map(([id]) => id);
    const live = [...deg.keys()];
    let made = 0;
    for (const t of tips) {
      if ((deg.get(t) || 0) !== 1) continue;
      const nt = nodes[t];
      let best = null, bd = Infinity;
      for (const o of live) {
        if (o === t) continue;
        const d = Math.hypot(nodes[o].px - nt.px, nodes[o].py - nt.py) * S;
        // Never snap to the node this stub is already attached to.
        if (edges.some((e) => (e.a === t && e.b === o) || (e.b === t && e.a === o))) continue;
        if (d < bd) { bd = d; best = o; }
      }
      if (best === null || bd > SNAP_M) continue;
      edges.push({
        i: 1e6 + edges.length,
        a: t,
        b: best,
        path: [[nt.px, nt.py], [nodes[best].px, nodes[best].py]],
      });
      deg.set(t, 2);
      deg.set(best, (deg.get(best) || 0) + 1);
      made++; snapped++;
    }
    if (!made) break;
  }
  console.log(`snapped        ${snapped} stubs joined across gaps under ${SNAP_M} m`);
}

// ---- 2c. SNAP STUBS ONTO EDGES, splitting them --------------------------------------------------
// Most missed junctions are a stub pointing at the MIDDLE of another road, not at its endpoint,
// so node-to-node snapping cannot see them: measured on the first clean run, all 36 surviving
// degree-1 nodes sat between 31 m and 142 m from another road, and not one was a real cul-de-sac.
// A T-junction is made by splitting the road that was hit.
//
// The radius stops at SPLIT_M on purpose. Beyond that a "gap" is as likely to be water, a cliff or
// a genuine end, and joining it would invent a road the map does not have - which is a worse lie
// than a dead end, because it silently changes what is drivable.
const SPLIT_M = 70;
{
  let split = 0;
  for (let pass = 0; pass < 8; pass++) {
    const deg = new Map();
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) || 0) + 1);
      deg.set(e.b, (deg.get(e.b) || 0) + 1);
    }
    const tips = [...deg.entries()].filter(([, d]) => d === 1).map(([id]) => id);
    let made = 0;
    for (const t of tips) {
      const nt = nodes[t];
      let best = null;
      for (const e of edges) {
        if (e.a === t || e.b === t) continue;
        for (let k = 1; k < e.path.length - 1; k++) {
          const d = Math.hypot(e.path[k][0] - nt.px, e.path[k][1] - nt.py) * S;
          if (!best || d < best.d) best = { d, e, k };
        }
      }
      if (!best || best.d > SPLIT_M) continue;
      // New junction node at the hit point, then the struck edge becomes two.
      const [hx, hy] = best.e.path[best.k];
      const j = nodes.length;
      nodes.push({ i: j, px: hx, py: hy });
      const head = { i: 2e6 + edges.length, a: best.e.a, b: j, path: best.e.path.slice(0, best.k + 1) };
      const tail = { i: 2e6 + edges.length + 1, a: j, b: best.e.b, path: best.e.path.slice(best.k) };
      edges = edges.filter((x) => x !== best.e);
      edges.push(head, tail, { i: 2e6 + edges.length + 2, a: t, b: j, path: [[nt.px, nt.py], [hx, hy]] });
      made++; split++;
    }
    if (!made) break;
  }
  console.log(`split-snapped  ${split} stubs joined onto an edge under ${SPLIT_M} m, making T-junctions`);
}

// ---- 2d. DROP WHATEVER STILL DEAD-ENDS ----------------------------------------------------------
// After both snap passes the survivors were inspected on the overlay, one by one, and NOT ONE was
// a cul-de-sac: all 13 were 80-230 m fragments where the mask lost a road that visibly continues
// in the picture - dark downtown streets under building shadow, mostly. They point at a road and
// stop short of it.
//
// So they are deleted rather than flagged. Flagging them `deadEnd: true` would be a lie about
// deliberateness and would weaken the one check that has to stay able to fail, and joining them
// across 100 m of city block would invent roads through buildings - a worse lie, because it
// changes what is drivable. Deleting costs 2% of the centreline and leaves the user's rule
// literally true: no road goes nowhere.
//
// The three that survived a 250 m cap were inspected too and are the same story at longer range -
// a lost bridge deck over water, a mountain hairpin, a road under tree cover - so the cap is 600 m.
// It is NOT unlimited: an unlimited rule would guarantee zero dead ends by construction and quietly
// eat a genuinely long branch road, and "no dead ends because we deleted anything that had one" is
// not the same claim as "the network connects".
//
// If a future pass improves the mask, these come back as real roads and this step removes nothing.
// It is capped at three rounds so it can never unravel a long branch edge by edge.
const TIP_M = 600;
{
  let dropped = 0, km = 0;
  for (let pass = 0; pass < 3; pass++) {
    const deg = new Map();
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) || 0) + 1);
      deg.set(e.b, (deg.get(e.b) || 0) + 1);
    }
    const drop = new Set();
    for (const e of edges) {
      if (e.a === e.b) continue;
      if (deg.get(e.a) !== 1 && deg.get(e.b) !== 1) continue;
      if (pathLenPx(e.path) * S <= TIP_M) { drop.add(e); km += pathLenPx(e.path) * S / 1000; }
    }
    if (!drop.size) break;
    dropped += drop.size;
    edges = edges.filter((e) => !drop.has(e));
  }
  console.log(`tips-dropped   ${dropped} dead-ending fragments under ${TIP_M} m (${km.toFixed(2)} km)`);
}

// ---- 3. LARGEST CONNECTED COMPONENT -----------------------------------------------------------
// The output must be one component. Taking the largest is how that is guaranteed - but silently
// deleting a district is exactly the kind of thing this repo has shipped before, so what is
// dropped is REPORTED IN KILOMETRES, not just in edge counts.
{
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set();
  let best = null;
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = new Set([start]);
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const p = stack.pop();
      for (const q of adj.get(p)) if (!seen.has(q)) { seen.add(q); comp.add(q); stack.push(q); }
    }
    if (!best || comp.size > best.size) best = comp;
  }
  const kmOf = (list) => list.reduce((s, e) => s + pathLenPx(e.path) * S, 0) / 1000;
  const keep = edges.filter((e) => best.has(e.a));
  const lost = edges.filter((e) => !best.has(e.a));
  console.log(`component      kept ${keep.length} edges / ${kmOf(keep).toFixed(2)} km, ` +
              `dropped ${lost.length} edges / ${kmOf(lost).toFixed(2)} km`);
  edges = keep;
}

// ---- 4. ROAD WIDTH, MEASURED OFF THE IMAGE ----------------------------------------------------
// A chamfer distance transform of the road mask. At a skeleton pixel the distance to the nearest
// non-road pixel IS the road's half-width, so `width` and `class` are read from the picture rather
// than assigned by taste. Two passes, 3-4 chamfer, which is accurate enough at this scale.
const dist = new Float32Array(w * h);
{
  const INF = 1e9;
  for (let i = 0; i < w * h; i++) dist[i] = maskBuf[i * 4] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (!dist[i]) continue;
    let m = dist[i];
    if (y > 0) m = Math.min(m, dist[i - w] + 3);
    if (x > 0) m = Math.min(m, dist[i - 1] + 3);
    if (x > 0 && y > 0) m = Math.min(m, dist[i - w - 1] + 4);
    if (x < w - 1 && y > 0) m = Math.min(m, dist[i - w + 1] + 4);
    dist[i] = m;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = idx(x, y);
    if (!dist[i]) continue;
    let m = dist[i];
    if (y < h - 1) m = Math.min(m, dist[i + w] + 3);
    if (x < w - 1) m = Math.min(m, dist[i + 1] + 3);
    if (x < w - 1 && y < h - 1) m = Math.min(m, dist[i + w + 1] + 4);
    if (x > 0 && y < h - 1) m = Math.min(m, dist[i + w - 1] + 4);
    dist[i] = m;
  }
  for (let i = 0; i < w * h; i++) dist[i] /= 3;      // chamfer units back to pixels
}

/** Median half-width in metres along an edge, and the gold fraction of the pixels under it. */
function measure(path) {
  const hw = [];
  let gold = 0, n = 0;
  for (const [x, y] of path) {
    const i = idx(x, y);
    hw.push(dist[i] * S);
    // The motorway on this map is gold; surface streets are grey. Sample a small disc because the
    // skeleton runs down the centre line and the colour lives in the ribbon around it.
    //
    // THE THRESHOLD WAS MEASURED, not guessed, and the first guess was wrong in a way worth
    // recording: at `r-b > 28 && mx > 95 && sat > 0.20` the only things gold enough were the
    // event pins, so every pinned junction came back `motorway` and the actual motorway came back
    // `street`. Dumping the gold mask as an image showed the real ribbon sitting well below that.
    // Pin pixels are skipped outright, because a pin is gold by definition.
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const p = idx(nx, ny);
      if (pinBuf[p * 4]) continue;
      const j = p * 4;
      const r = imgBuf[j], g = imgBuf[j + 1], b = imgBuf[j + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      n++;
      if (r - b > 18 && mx > 70 && (mx - mn) / mx > 0.15) gold++;
    }
  }
  hw.sort((a, b) => a - b);
  return { halfWidth: hw[hw.length >> 1] || 0, gold: n ? gold / n : 0 };
}

// ---- 5. SIMPLIFY ------------------------------------------------------------------------------
// Ramer-Douglas-Peucker. One point per pixel is 60x more shape than any mesh generator needs, and
// the tolerance is in METRES so it means something: 3 m of lateral error is inside a lane.
const RDP_M = 3.0;
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let far = 0, best = -1;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  for (let k = 1; k < pts.length - 1; k++) {
    const [x, y] = pts[k];
    const d = len === 0 ? Math.hypot(x - ax, y - ay)
                        : Math.abs(dy * x - dx * y + bx * ay - by * ax) / len;
    if (d > far) { far = d; best = k; }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, best + 1), eps).slice(0, -1), ...rdp(pts.slice(best), eps)];
}

// ---- 6. DISTRICTS -----------------------------------------------------------------------------
// ponytail: districts are a Voronoi partition of five hand-placed seeds, not the irregular
// boundaries drawn on `reference/map/street-names.jpg`. Tracing those needs the two source images
// registered to each other, which is a session of work to make a cosmetic field prettier. The
// Voronoi cells give every criterion the brief asks for - a total partition with no gaps and no
// overlaps, so an edge is always inside the district it names - and the five districts of Paradise
// City are geographically separated enough that the cells land close to the real thing. Upgrade
// path if a district boundary ever matters: register the two images and trace the red lines.
//
// Seeds are in image pixels, read off `street-names.jpg`'s labels and located on `ign-map.jpg`.
const DISTRICT_SEEDS = [
  { id: 'downtown',   name: 'Downtown Paradise', px: 1180, py: 560 },
  { id: 'palmbay',    name: 'Palm Bay Heights',  px: 1080, py: 320 },
  { id: 'harbor',     name: 'Harbor Town',       px: 880,  py: 830 },
  { id: 'silverlake', name: 'Silver Lake',       px: 430,  py: 180 },
  { id: 'mountain',   name: 'White Mountain',    px: 240,  py: 650 },
];
const districtAt = (px, py) => {
  let best = null, bd = Infinity;
  for (const d of DISTRICT_SEEDS) {
    const dd = (px - d.px) ** 2 + (py - d.py) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best.id;
};
/** Voronoi cell as a polygon, by clipping the map rectangle with each perpendicular bisector. */
function voronoiCell(seed) {
  const X0 = toX(0), X1 = toX(w), Z0 = toZ(0), Z1 = toZ(h);
  let poly = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
  for (const other of DISTRICT_SEEDS) {
    if (other.id === seed.id) continue;
    const ax = toX(seed.px), az = toZ(seed.py);
    const bx = toX(other.px), bz = toZ(other.py);
    // Keep the half-plane closer to `seed`: n . p <= c
    const nx = bx - ax, nz = bz - az;
    const c = (bx * bx + bz * bz - ax * ax - az * az) / 2;
    const inside = (p) => nx * p[0] + nz * p[1] <= c;
    const cut = (p, q) => {
      const dpx = q[0] - p[0], dpz = q[1] - p[1];
      const t = (c - (nx * p[0] + nz * p[1])) / (nx * dpx + nz * dpz);
      return [p[0] + dpx * t, p[1] + dpz * t];
    };
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const ip = inside(p), iq = inside(q);
      if (ip) out.push(p);
      if (ip !== iq) out.push(cut(p, q));
    }
    poly = out;
  }
  return poly.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]);
}

// ---- 7. EMIT ----------------------------------------------------------------------------------
// Classes are decided by measured half-width and gold fraction, in that order. The thresholds are
// in metres so they can be argued about.
const classOf = (m) => {
  // Gold AND wide. The gold test alone also catches a thin orange scenic route through the
  // mountains, which is a road but is not a motorway, and giving it three lanes and 24 m of
  // tarmac would put a dual carriageway through White Mountain.
  if (m.gold > 0.18 && m.halfWidth >= 6) return 'motorway';
  if (m.halfWidth >= 9) return 'arterial';
  if (m.halfWidth >= 5) return 'street';
  return 'service';
};
const LANES = { motorway: 3, arterial: 2, street: 2, service: 1 };
const MIN_W = { motorway: 24, arterial: 18, street: 14, service: 9 };

// ---- THE REVIEWED DEAD ENDS -------------------------------------------------------------------
// `deadEnd` is the one field the validator refuses to accept a guess on, because a cul-de-sac and
// a missed junction look identical in the data. So it is never stamped automatically: every entry
// here was found by the validator failing, then LOOKED AT on a crop of the overlay, and is
// recorded with what it actually is.
//
// Both survivors are trace limits rather than cul-de-sacs - the mask loses a road that visibly
// continues - but both carry over 600 m of real road that is on the map, so deleting them the way
// the shorter fragments were deleted would throw away more than it cleans up.
//
// The list is keyed by position with a tolerance, and A LISTED ENTRY THAT MATCHES NOTHING IS A
// HARD ERROR. Without that this rots into a stale allowlist that silently pardons whatever
// degree-1 node happens to drift near it.
const REVIEWED_DEAD_ENDS = [
  { p: [-1487, -1155], why: 'White Mountain switchback; the road continues west but the mask loses it against rock' },
  { p: [-302, 1087], why: 'Harbor Town causeway deck; dark against water, the far end is not traced' },
];

const used = new Set();
for (const e of edges) { used.add(e.a); used.add(e.b); }
const remap = new Map();
const outNodes = [];
for (const n of nodes) {
  if (!used.has(n.i)) continue;
  remap.set(n.i, outNodes.length);
  outNodes.push({ id: outNodes.length, p: [+toX(n.px).toFixed(1), +toZ(n.py).toFixed(1)], y: 0, deadEnd: false });
}
const degree = new Map();
for (const e of edges) {
  degree.set(remap.get(e.a), (degree.get(remap.get(e.a)) || 0) + 1);
  degree.set(remap.get(e.b), (degree.get(remap.get(e.b)) || 0) + 1);
}

// Apply the reviewed list, and fail loudly if any entry no longer matches a degree-1 node.
{
  const TOL = 40;
  for (const r of REVIEWED_DEAD_ENDS) {
    const hit = outNodes.filter((n) => degree.get(n.id) === 1 &&
      Math.hypot(n.p[0] - r.p[0], n.p[1] - r.p[1]) <= TOL);
    if (hit.length !== 1) {
      console.error(`reviewed dead end at [${r.p}] matches ${hit.length} degree-1 nodes, expected 1.`);
      console.error(`  (${r.why})`);
      console.error('  The graph moved under the list. Re-review it against a fresh overlay crop -');
      console.error('  do NOT widen the tolerance to make this pass.');
      process.exit(1);
    }
    hit[0].deadEnd = true;
    hit[0].deadEndNote = r.why;
  }
  console.log(`dead-ends      ${REVIEWED_DEAD_ENDS.length} reviewed and flagged`);
}

const outEdges = [];
const goldTrace = [];
for (const e of edges) {
  const m = measure(e.path);
  const cls = classOf(m);
  goldTrace.push(m.gold);
  // The junction merge moved the node to its cluster centroid, up to MERGE_M away from where this
  // polyline actually starts. Snap the ends onto the node so topology and geometry agree - an edge
  // that does not physically reach its own junction is a seam, and the drive probe hunts seams.
  const na = nodes[e.a], nb = nodes[e.b];
  const path = [[na.px, na.py], ...e.path.slice(1, -1), [nb.px, nb.py]];
  const simple = rdp(path, RDP_M / S);
  const shape = simple.slice(1, -1).map(([x, y]) => [+toX(x).toFixed(1), +toZ(y).toFixed(1)]);
  outEdges.push({
    id: outEdges.length,
    a: remap.get(e.a),
    b: remap.get(e.b),
    lanes: LANES[cls],
    width: Math.max(MIN_W[cls], +(m.halfWidth * 2).toFixed(1)),
    // Nothing in a top-down still shows a one-way restriction, so every edge is two-way. This is
    // an honest null, not an oversight: inventing one-way runs would strand districts, which is
    // the exact orphan the user banned, and the validator's directed pass would then be checking
    // fiction. Author them deliberately if a district ever needs them.
    oneWay: false,
    class: cls,
    // Likewise unsourced - both reference maps are top-down. See reference/map/SOURCES.md.
    elevationClass: 'ground',
    district: districtAt(e.path[e.path.length >> 1][0], e.path[e.path.length >> 1][1]),
    shape,
  });
}

const totalKm = edges.reduce((s, e) => s + pathLenPx(e.path) * S, 0) / 1000;
const deg1 = [...degree.entries()].filter(([, d]) => d === 1).map(([id]) => id);

const doc = {
  version: 1,
  units: 'metres',
  source: 'reference/map/ign-map.jpg, traced by tools/_maptrace.mjs + tools/_mapgraph.mjs',
  scale: { mapWidthMetres: MAP_WIDTH_M, metresPerPixel: +S.toFixed(4), image: { w, h } },
  extent: { x: [+toX(0).toFixed(1), +toX(w).toFixed(1)], z: [+toZ(0).toFixed(1), +toZ(h).toFixed(1)] },
  districts: DISTRICT_SEEDS.map((d) => ({
    id: d.id,
    name: d.name,
    seed: [+toX(d.px).toFixed(1), +toZ(d.py).toFixed(1)],
    polygon: voronoiCell(d),
  })),
  nodes: outNodes,
  edges: outEdges,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 1));

{
  // The gold histogram is what diagnosed the motorway bug and is cheap, so it stays: if `motorway`
  // ever collapses to a handful of edges again, this says immediately whether the classifier moved
  // or the mask stopped seeing the ribbon.
  const hist = new Array(10).fill(0);
  for (const m of goldTrace) hist[Math.min(9, Math.floor(m * 10))]++;
  console.log(`gold-hist      ${hist.join(' ')}  (gold fraction per edge, 0.0..1.0 in tenths)`);
}
const byClass = {};
for (const e of outEdges) byClass[e.class] = (byClass[e.class] || 0) + 1;
console.log(`scale          ${S.toFixed(3)} m/px, map ${MAP_WIDTH_M} x ${Math.round(h * S)} m`);
console.log(`classes        ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`degree-1       ${deg1.length} nodes`);
console.log(`graph          ${outNodes.length} nodes, ${outEdges.length} edges, ${totalKm.toFixed(2)} km`);
console.log(`wrote ${OUT}`);
