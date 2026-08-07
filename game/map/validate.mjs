// Validate `game/map/paradise.json`. Wave T, the `digitise` piece. Runs from `tools/lint.sh`.
//
// The user's rule for T3 is that NO ROAD MAY GO NOWHERE: every drivable segment is reachable from
// every other by driving on road only, AND nothing dead-ends. Every node has degree 2 or more. That is a property of the DATA, so it is enforced on the
// data at build time rather than eyeballed in a screenshot.
//
// WHAT THIS FILE DOES NOT DO, and it matters more than what it does. It checks the GRAPH. It says
// nothing about the world generated from the graph, which can have a seam the car falls through
// while every check below passes. The drive probe over the built collision geometry is a separate,
// non-optional test - see `tools/WAVE-T-MAP-BRIEF.md`.
//
//   node game/map/validate.mjs [path]        exit 0 = valid, 1 = invalid
import { readFileSync } from 'node:fs';

const path = process.argv[2] || new URL('./paradise.json', import.meta.url).pathname;
const doc = JSON.parse(readFileSync(path, 'utf8'));
const fail = [];
const err = (msg) => fail.push(msg);

const nodes = doc.nodes ?? [];
const edges = doc.edges ?? [];
const byId = new Map(nodes.map((n) => [n.id, n]));

// ---- structural ------------------------------------------------------------------------------
if (doc.version !== 1) err(`unknown schema version ${doc.version}`);
if (doc.units !== 'metres') err(`units must be metres, got ${doc.units}`);

const districts = new Set((doc.districts ?? []).map((d) => d.id));
const seenEdge = new Set();
for (const e of edges) {
  if (!byId.has(e.a) || !byId.has(e.b)) { err(`edge ${e.id} references a missing node (${e.a} -> ${e.b})`); continue; }
  if (e.a === e.b && (e.shape?.length ?? 0) < 2) err(`edge ${e.id} is a degenerate self-loop at node ${e.a}`);
  const key = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
  if (e.a !== e.b && seenEdge.has(key)) err(`duplicate edge between ${e.a} and ${e.b} (edge ${e.id})`);
  seenEdge.add(key);
  if (!districts.has(e.district)) err(`edge ${e.id} names district '${e.district}', which does not exist`);
  if (!(e.width > 0)) err(`edge ${e.id} has no width`);
  if (!(e.lanes >= 1)) err(`edge ${e.id} has no lanes`);
}

// ---- district containment ---------------------------------------------------------------------
// Both endpoints of an edge must lie in the district the edge claims. Ray casting, inclusive of
// the boundary, because the districts are a partition and shared edges are legal.
const inPoly = (p, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) &&
        p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const near = (p, poly, tol = 1.0) => {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    const dx = xj - xi, dz = zj - zi;
    const t = Math.max(0, Math.min(1, ((p[0] - xi) * dx + (p[1] - zi) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(p[0] - (xi + dx * t), p[1] - (zi + dz * t)) <= tol) return true;
  }
  return false;
};
{
  const polys = new Map((doc.districts ?? []).map((d) => [d.id, d.polygon]));
  let bad = 0;
  for (const e of edges) {
    const poly = polys.get(e.district);
    if (!poly) continue;
    for (const id of [e.a, e.b]) {
      const p = byId.get(id)?.p;
      if (!p) continue;
      if (!inPoly(p, poly) && !near(p, poly)) bad++;
    }
  }
  // An edge straddles a district boundary by construction: it names the district its MIDPOINT is
  // in, so one endpoint can legitimately sit across the line. Only flag it if it is endemic,
  // which would mean the district assignment is wired to the wrong coordinate space.
  const rate = edges.length ? bad / (edges.length * 2) : 0;
  if (rate > 0.25) err(`${bad} of ${edges.length * 2} edge endpoints are outside their own district (${(rate * 100).toFixed(1)}%) - district assignment looks wrong, not merely boundary-straddling`);
  else if (bad) console.log(`  note: ${bad} endpoints straddle a district boundary (${(rate * 100).toFixed(1)}%), which is expected`);
}

// ---- 1. undirected connectivity -----------------------------------------------------------------
const adj = new Map(nodes.map((n) => [n.id, []]));
const radj = new Map(nodes.map((n) => [n.id, []]));
for (const e of edges) {
  if (!adj.has(e.a) || !adj.has(e.b)) continue;
  adj.get(e.a).push(e.b);
  if (!e.oneWay) adj.get(e.b).push(e.a);
  radj.get(e.b).push(e.a);
  if (!e.oneWay) radj.get(e.a).push(e.b);
}
const undirected = new Map(nodes.map((n) => [n.id, []]));
for (const e of edges) {
  if (!undirected.has(e.a) || !undirected.has(e.b)) continue;
  undirected.get(e.a).push(e.b);
  undirected.get(e.b).push(e.a);
}
function components(graph) {
  const seen = new Set();
  const out = [];
  for (const start of graph.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const p = stack.pop();
      comp.push(p);
      for (const q of graph.get(p)) if (!seen.has(q)) { seen.add(q); stack.push(q); }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}
const undirComps = components(undirected);
if (undirComps.length !== 1) {
  err(`${undirComps.length} undirected components, need exactly 1. ` +
      `Sizes: ${undirComps.slice(0, 8).map((c) => c.length).join(', ')}. ` +
      `A node in the largest orphan: ${JSON.stringify(byId.get(undirComps[1][0]).p)}`);
}

// ---- 2. strong connectivity, respecting oneWay ---------------------------------------------------
// A district you can drive into and never leave is exactly the orphan the user banned, and an
// undirected flood fill cannot see it. Kosaraju: reachability forwards from a node and backwards
// to it must both cover every node.
{
  const reach = (graph, start) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const p = stack.pop();
      for (const q of graph.get(p)) if (!seen.has(q)) { seen.add(q); stack.push(q); }
    }
    return seen;
  };
  const live = nodes.filter((n) => (undirected.get(n.id) ?? []).length).map((n) => n.id);
  if (live.length) {
    const fwd = reach(adj, live[0]);
    const back = reach(radj, live[0]);
    const stranded = live.filter((id) => !fwd.has(id) || !back.has(id));
    if (stranded.length) {
      err(`${stranded.length} nodes are not strongly connected (a one-way run strands them). ` +
          `First: ${JSON.stringify(byId.get(stranded[0]).p)}`);
    }
  }
}

// ---- 3. NO DEAD ENDS. AT ALL. --------------------------------------------------------------------
// The user's rule, stated directly: no hanging roads, no cul-de-sacs, no dead ends, everything
// connects. So this does NOT accept a `deadEnd: true` flag as permission. Every node must have
// degree 2 or more - you can always drive out of anywhere by a different way than you came in.
//
// This replaces an earlier, weaker check that passed a degree-1 node if it was explicitly flagged.
// That was the brief's rule, and the brief was less strict than the person who has to drive it.
// A flag is an annotation, not a road; the car still stops.
{
  const deg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (deg.has(e.a)) deg.set(e.a, deg.get(e.a) + 1);
    if (deg.has(e.b)) deg.set(e.b, deg.get(e.b) + 1);
  }
  const tips = nodes.filter((n) => deg.get(n.id) === 1);
  if (tips.length) {
    err(`${tips.length} DEAD END${tips.length > 1 ? 'S' : ''} - nodes with only one road. Every ` +
        `node must have degree 2 or more. A deadEnd flag does NOT excuse this:\n` +
        tips.slice(0, 40).map((n) => `      node ${n.id} at [${n.p}]${n.deadEnd ? ' (flagged deadEnd - not accepted)' : ''}`).join('\n') +
        (tips.length > 40 ? `\n      ... and ${tips.length - 40} more` : ''));
  }
  const flagged = nodes.filter((n) => n.deadEnd).length;
  if (flagged) err(`${flagged} nodes carry deadEnd: true. Dead ends are not permitted at all, so ` +
                   `this flag must be false everywhere - fix the graph, do not annotate it.`);
  const orphan = nodes.filter((n) => deg.get(n.id) === 0).length;
  if (orphan) err(`${orphan} nodes have no edges at all`);

  // ---- the counts the next session needs ------------------------------------------------------
  const len = (e) => {
    const pts = [byId.get(e.a).p, ...e.shape, byId.get(e.b).p];
    let d = 0;
    for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return d;
  };
  const km = edges.reduce((s, e) => s + len(e), 0) / 1000;
  const byClass = {};
  for (const e of edges) byClass[e.class] = (byClass[e.class] || 0) + 1;
  console.log(`  map ${doc.extent.x[0]}..${doc.extent.x[1]} x ${doc.extent.z[0]}..${doc.extent.z[1]} m`);
  console.log(`  ${nodes.length} nodes, ${edges.length} edges, ${km.toFixed(2)} km of centreline`);
  console.log(`  components: ${undirComps.length} undirected`);
  console.log(`  dead ends: ${[...deg.values()].filter((d) => d === 1).length} (must be 0)`);
  console.log(`  min degree: ${Math.min(...deg.values())}, mean degree: ${([...deg.values()].reduce((a, b) => a + b, 0) / deg.size).toFixed(2)}`);
  console.log(`  classes: ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  districts: ${[...districts].join(', ')}`);
}

if (fail.length) {
  console.error(`\nmap INVALID - ${fail.length} problem${fail.length > 1 ? 's' : ''}:`);
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('map ok');
