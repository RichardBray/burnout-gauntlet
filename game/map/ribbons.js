// ribbons.js — the road graph turned into chunk-sized ribbon, junction and taper geometry.
// API: planRoads(doc, {chunk, shoulder}) -> {cells, edges, nodes, stats}
//
// Data and arithmetic only. No three.js, no renderer, no materials — the same discipline as
// graph.js and blocks.js, so `tools/_ribbons.mjs` can run the whole thing in node and assert on
// it without a browser. world.js turns the output into geometry through roadKit.
//
// THE THREE THINGS THIS FILE EXISTS TO GET RIGHT
//
// 1. CHUNK-BOUNDARY CONTINUITY. The longest single segment in the graph is 230.3 m and the chunk
//    is 200 m, so a segment can span a boundary and "give the whole edge to one chunk" is not
//    available at any cell size below 240 m. The clip therefore happens INSIDE a segment, and the
//    two chunks either side must land on bit-identical vertices. They do, because the crossing
//    point AND its normal are computed by `crossAt()` from the same two source points with the
//    same `t` in the same order, and because the normal is interpolated from a normal array
//    computed over the FULL edge polyline rather than re-derived from a one-sided difference at
//    the sub-polyline's end. A one-sided difference is what puts a V-notch at every boundary on
//    every curved road, and 804 of the 929 edges are curved.
//
// 2. JUNCTIONS. The grid world faked them by retracting one road 11 m and dropping it 2 mm, which
//    needs orthogonal crossings of equal width. This graph has 688 nodes of degree 2 to 9 and 21
//    widths from 9.0 to 49.4 m. Real polygons instead: retreat each incident ribbon to `r_i`, take
//    the terminal cross-section corners, and fan-triangulate the loop between them. Because the
//    polygon's corners ARE the ribbons' terminal vertices, nothing overlaps and the 2 mm hack is
//    not needed — every ground road sits at one y.
//
// 3. PER-EDGE WIDTH ON TWO MATERIALS. Option (b) of the plan: the marked carriageway is drawn at
//    the class's spec width and everything out to `width/2 + SHOULDER` is unmarked shoulder. Zero
//    new materials, and it tiles at any width because the shoulder is a flat colour plus a
//    repeating normal map.

/**
 * Paved half-width is `width/2 + SHOULDER`. This MUST equal `graph.js`'s SHOULDER or the drawn
 * tarmac and the tarmac `surfaceAt()` reports stop being the same surface — the car would drive
 * on grass that looks like road, or vice versa, and the drive probe would not catch it because it
 * asks `surfaceAt`, not the mesh.
 */
export const SHOULDER = 3.0;

/** Near-collinear floor for the retreat formula. Without it `r_i` diverges as two edges align. */
const SIN_FLOOR = 0.20;
/** A retreat may never eat more than this fraction of its edge; the shortest edge is 5.2 m. */
const MAX_EAT = 0.45;
/** Retreat is capped at this multiple of the widest incident paved half-width. */
const RETREAT_CAP = 3.0;

const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

/**
 * Unit left-normal of the polyline at every point, by central difference over the WHOLE polyline.
 *
 * The formula is `road.js`'s, kept identical on purpose: tangent from the point before to the
 * point after, normal is the tangent rotated a quarter turn. Endpoints clamp to a one-sided
 * difference, which is correct HERE because this is the whole edge — the entire point of passing
 * these into `ribbonInto` is that a chunk never recomputes them from its own fragment.
 */
function normalsOf(pts) {
  const n = pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const len = hypot(dx, dz) || 1;
    const inv = 1 / len;
    out[i] = [-(dz * inv), dx * inv];
  }
  return out;
}

/** Cumulative arclength, so a sub-polyline can carry the V it would have had on the full edge. */
function arclenOf(pts) {
  const s = new Array(pts.length);
  s[0] = 0;
  for (let i = 1; i < pts.length; i++) s[i] = s[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/**
 * A vertex on the ribbon centreline: position, unit left-normal, arclength along the FULL edge.
 * `s` is what keeps the asphalt texture continuous across a chunk boundary.
 */
const vtx = (x, z, nx, nz, s) => ({ x, z, nx, nz, s });

/**
 * The single most important function in this file.
 *
 * Interpolate a vertex between two polyline vertices at parameter `t`. Both chunks either side of
 * a boundary call this with the SAME `a`, the SAME `b` and the SAME `t`, in that order, so both
 * get bit-identical IEEE doubles out. Any change here — reordering the operands, hoisting a
 * subexpression, normalising differently — breaks boundary continuity, so do not "tidy" it.
 */
function crossAt(a, b, t) {
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  let nx = a.nx + (b.nx - a.nx) * t;
  let nz = a.nz + (b.nz - a.nz) * t;
  const len = hypot(nx, nz) || 1;
  const inv = 1 / len;
  nx *= inv; nz *= inv;
  const s = a.s + (b.s - a.s) * t;
  return vtx(x, z, nx, nz, s);
}

/** Resample a vertex list at an arclength, keeping the full-edge normal field. */
function atArc(vs, target) {
  if (target <= vs[0].s) return vs[0];
  const last = vs[vs.length - 1];
  if (target >= last.s) return last;
  for (let i = 1; i < vs.length; i++) {
    if (vs[i].s < target) continue;
    const a = vs[i - 1], b = vs[i];
    const span = b.s - a.s;
    return crossAt(a, b, span > 0 ? (target - a.s) / span : 0);
  }
  return last;
}

/** The sub-list of `vs` strictly between two arclengths, with interpolated ends. */
function slice(vs, s0, s1) {
  const out = [atArc(vs, s0)];
  for (const v of vs) if (v.s > s0 && v.s < s1) out.push(v);
  out.push(atArc(vs, s1));
  return out;
}

/**
 * Split a vertex list wherever it crosses an `x = k*chunk` or `z = k*chunk` plane, and bucket the
 * pieces by cell.
 *
 * Crossings inside one segment are collected first and sorted by `t`, because a diagonal segment
 * can cross an x plane and a z plane in the same span and emitting them out of order would fold
 * the ribbon back on itself.
 */
function splitByCell(vs, chunk) {
  const pieces = [];
  let cur = [vs[0]];
  const cellOf = (v) => `${Math.floor(v.x / chunk)},${Math.floor(v.z / chunk)}`;

  for (let i = 1; i < vs.length; i++) {
    const a = vs[i - 1], b = vs[i];
    const ts = [];
    for (const [pa, pb, axis] of [[a.x, b.x, 'x'], [a.z, b.z, 'z']]) {
      if (pa === pb) continue;
      const lo = Math.min(pa, pb), hi = Math.max(pa, pb);
      const k0 = Math.floor(lo / chunk) + 1, k1 = Math.ceil(hi / chunk) - 1;
      for (let k = k0; k <= k1; k++) {
        const plane = k * chunk;
        const t = (plane - pa) / (pb - pa);
        if (t > 0 && t < 1) ts.push({ t, axis, k });
      }
    }
    ts.sort((p, q) => p.t - q.t);
    for (const c of ts) {
      const v = crossAt(a, b, c.t);
      cur.push(v);
      pieces.push(cur);
      // THE SHARED VERTEX. The next piece starts at the identical object, so the two chunks do
      // not merely agree to within a rounding error — they hold the same doubles. The harness
      // re-derives it independently from (a, b, t) and checks with Object.is, because "we shared
      // the object" is not the same claim as "an independent chunk build would agree".
      cur = [v];
    }
    cur.push(b);
  }
  pieces.push(cur);

  const out = [];
  for (const p of pieces) {
    if (p.length < 2) continue;
    // Degenerate: a crossing that lands exactly on an existing vertex makes a zero-length piece.
    if (p.length === 2 && p[0].x === p[1].x && p[0].z === p[1].z) continue;
    // The owning cell is the midpoint's, which cannot be ambiguous the way an endpoint sitting
    // exactly on a plane is.
    const mid = { x: (p[0].x + p[p.length - 1].x) / 2, z: (p[0].z + p[p.length - 1].z) / 2 };
    out.push({ cell: cellOf(mid), pts: p });
  }
  return out;
}

/**
 * Plan the whole road network.
 *
 * @param {object} doc parsed paradise.json
 * @param {object} [opts] `chunk` (200), `shoulder` (3.0)
 * @returns {{cells: Map, edges: Array, nodes: Array, stats: object}}
 */
export function planRoads(doc, opts = {}) {
  const chunk = opts.chunk ?? 200;
  const shoulder = opts.shoulder ?? SHOULDER;

  const nodeP = new Map(doc.nodes.map((n) => [n.id, n.p]));
  const nodeIx = new Map(doc.nodes.map((n, i) => [n.id, i]));

  // ---- full-edge polylines, normals and arclength, computed ONCE ------------------------------
  const edges = doc.edges.map((e, ei) => {
    const raw = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    const nrm = normalsOf(raw);
    const arc = arclenOf(raw);
    const vs = raw.map((p, i) => vtx(p[0], p[1], nrm[i][0], nrm[i][1], arc[i]));
    return {
      id: ei, a: e.a, b: e.b, cls: e.class, width: e.width,
      paved: e.width / 2 + shoulder,
      length: arc[arc.length - 1],
      vs,
    };
  });

  // ---- incidence ------------------------------------------------------------------------------
  const inc = doc.nodes.map(() => []);
  for (const e of edges) {
    inc[nodeIx.get(e.a)].push({ edge: e, atA: true });
    inc[nodeIx.get(e.b)].push({ edge: e, atA: false });
  }

  /** Bearing of an edge leaving a node, toward the first interior point of its polyline. */
  const bearing = (rec) => {
    const vs = rec.edge.vs;
    const p = rec.atA ? vs[0] : vs[vs.length - 1];
    const q = rec.atA ? vs[1] : vs[vs.length - 2];
    return Math.atan2(q.z - p.z, q.x - p.x);
  };

  // ---- retreat distances, degree >= 3 only ----------------------------------------------------
  // Degree-2 nodes get NO retreat and NO polygon: there is no mutual overlap to cover, and
  // applying the formula there would be actively wrong — two edges meeting head-on have
  // |sin(dtheta)| ~ 0, so the SIN_FLOOR would hand back 5*h and gut 358 nodes with a 65 m gap
  // apiece that nothing fills.
  const nodes = doc.nodes.map((n, i) => {
    const recs = inc[i];
    const deg = recs.length;
    const th = recs.map(bearing);
    const h = recs.map((r) => r.edge.paved);
    const hMax = Math.max(...h);
    const r = new Array(deg).fill(0);
    if (deg >= 3) {
      for (let a = 0; a < deg; a++) {
        let ra = 0;
        for (let b = 0; b < deg; b++) {
          if (a === b) continue;
          const s = Math.abs(Math.sin(th[a] - th[b]));
          ra = Math.max(ra, h[b] / Math.max(SIN_FLOOR, s));
        }
        ra = Math.min(Math.max(ra, h[a]), RETREAT_CAP * hMax);
        r[a] = Math.min(ra, MAX_EAT * recs[a].edge.length);
      }
    }
    return { id: n.id, ix: i, p: n.p, deg, recs, theta: th, h, r, hMax };
  });

  // ---- a shared normal at every degree-2 node -------------------------------------------------
  // Both incident edges terminate here at full extent, so their cross-sections have to agree or
  // there is a V-notch at 358 more places. Each edge's own end normal is a ONE-SIDED difference;
  // the joint normal is a central difference taken THROUGH the node, across the two edges, and
  // both edges are then told to use it. Same two source points, same order, so bit-identical.
  const jointNormal = new Map();          // `${edgeId}:${'a'|'b'}` -> [nx, nz]
  for (const nd of nodes) {
    if (nd.deg !== 2) continue;
    const [r0, r1] = nd.recs;
    const near = (rec) => {
      const vs = rec.edge.vs;
      return rec.atA ? vs[1] : vs[vs.length - 2];
    };
    // Order the two by edge id then end, so the pair is enumerated identically however the
    // incidence list happened to be built.
    const key = (rec) => `${rec.edge.id}:${rec.atA ? 'a' : 'b'}`;
    const [first, second] = key(r0) < key(r1) ? [r0, r1] : [r1, r0];
    const p = near(first), q = near(second);
    const dx = q.x - p.x, dz = q.z - p.z;
    const len = hypot(dx, dz) || 1;
    const inv = 1 / len;
    const nrm = [-(dz * inv), dx * inv];
    jointNormal.set(key(first), nrm);
    jointNormal.set(key(second), nrm);
  }

  // ---- trim, re-normal the ends, clip to cells -------------------------------------------------
  const cells = new Map();
  const cellFor = (k) => {
    let c = cells.get(k);
    if (!c) cells.set(k, c = { key: k, ribbons: [], junctions: [], tapers: [] });
    return c;
  };

  const retreatOf = (nd, edgeId, atA) => {
    for (let i = 0; i < nd.recs.length; i++) {
      const rc = nd.recs[i];
      if (rc.edge.id === edgeId && rc.atA === atA) return nd.r[i];
    }
    return 0;
  };

  let dropped = 0, ribbonPieces = 0, boundaryVertices = 0;
  const terminal = new Map();             // `${edgeId}:${'a'|'b'}` -> the terminal cross-section

  for (const e of edges) {
    const nA = nodes[nodeIx.get(e.a)], nB = nodes[nodeIx.get(e.b)];
    const rA = retreatOf(nA, e.id, true);
    const rB = retreatOf(nB, e.id, false);
    const s0 = rA, s1 = e.length - rB;

    // Both ends clamped past each other: a very short link between two big junctions. The two
    // junction polygons abut directly and the edge contributes no ribbon, which is correct.
    if (!(s1 > s0)) { dropped++; continue; }

    let vs = slice(e.vs, s0, s1);

    // A degree-2 end keeps its position but takes the joint normal, so the two edges' terminal
    // cross-sections coincide exactly.
    const jn0 = nA.deg === 2 ? jointNormal.get(`${e.id}:a`) : null;
    const jn1 = nB.deg === 2 ? jointNormal.get(`${e.id}:b`) : null;
    if (jn0) vs[0] = vtx(vs[0].x, vs[0].z, jn0[0], jn0[1], vs[0].s);
    if (jn1) { const L = vs.length - 1; vs[L] = vtx(vs[L].x, vs[L].z, jn1[0], jn1[1], vs[L].s); }

    terminal.set(`${e.id}:a`, vs[0]);
    terminal.set(`${e.id}:b`, vs[vs.length - 1]);

    const pieces = splitByCell(vs, chunk);
    ribbonPieces += pieces.length;
    boundaryVertices += Math.max(0, pieces.length - 1);
    for (const pc of pieces) {
      cellFor(pc.cell).ribbons.push({
        edge: e.id, cls: e.cls, width: e.width, paved: e.paved,
        length: e.length, pts: pc.pts,
      });
    }
  }

  // ---- junction polygons ------------------------------------------------------------------------
  let junctions = 0, junctionTris = 0, tapers = 0;
  for (const nd of nodes) {
    if (nd.deg < 3) {
      // Degree 2: no polygon. A taper quad only if the two cross-sections differ in width; with
      // the joint normal they are collinear, so it is a clean trapezoid.
      if (nd.deg === 2) {
        const [r0, r1] = nd.recs;
        if (Math.abs(r0.edge.paved - r1.edge.paved) > 1e-9) {
          const t0 = terminal.get(`${r0.edge.id}:${r0.atA ? 'a' : 'b'}`);
          const t1 = terminal.get(`${r1.edge.id}:${r1.atA ? 'a' : 'b'}`);
          if (t0 && t1) {
            cellFor(`${Math.floor(nd.p[0] / chunk)},${Math.floor(nd.p[1] / chunk)}`).tapers.push({
              node: nd.id,
              a: { v: t0, paved: r0.edge.paved }, b: { v: t1, paved: r1.edge.paved },
            });
            tapers++;
          }
        }
      }
      continue;
    }

    // THE RING. Arms in bearing order, each contributing its own two corners ADJACENTLY.
    //
    // Two orderings have to be right and they are separate problems.
    //
    // (1) Arms are sorted by bearing, so consecutive arms are neighbours around the node. That is
    //     the plan's prescription and it is what makes the ring star-shaped about the node, which
    //     is the precondition for fanning from it.
    // (2) Within an arm, the two corners must be emitted in a CONSISTENT rotational sense. They
    //     are `t +- n*h`, and `n` is the left normal of the edge's own polyline direction, which
    //     runs a->b: for an arm that TERMINATES here that direction points inward, so its pair
    //     comes out reversed relative to an arm that leaves. Sorting all corners by angle instead
    //     looks like it fixes this and does not - it breaks (1) by interleaving corners from two
    //     arms of similar bearing and very different width, and the fan then self-intersects.
    //     The fix is to keep `n` (so the corners stay EXACTLY the ribbon's terminal vertices, which
    //     is what makes the join watertight) and flip only its SIGN, against the outward direction
    //     from the node.
    const order = nd.recs.map((rc, i) => i).sort((p, q) => nd.theta[p] - nd.theta[q]);
    const ring = [];
    let ok = true;
    for (const i of order) {
      const rc = nd.recs[i];
      const t = terminal.get(`${rc.edge.id}:${rc.atA ? 'a' : 'b'}`);
      if (!t) { ok = false; break; }
      const h = nd.h[i];
      // Outward direction from the node to this arm's terminal cross-section.
      let dx = t.x - nd.p[0], dz = t.z - nd.p[1];
      const dl = hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      // 2-D cross product of outward with the polyline normal: its sign says which way round
      // this arm's pair currently runs.
      const sgn = (dx * t.nz - dz * t.nx) >= 0 ? 1 : -1;
      ring.push([t.x - t.nx * h * sgn, t.z - t.nz * h * sgn]);
      ring.push([t.x + t.nx * h * sgn, t.z + t.nz * h * sgn]);
    }
    if (!ok || ring.length < 6) continue;
    // Signed area fixes the overall winding once, here, so the consumer fans without guessing.
    let a2 = 0;
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i], v = ring[(i + 1) % ring.length];
      a2 += u[0] * v[1] - v[0] * u[1];
    }
    if (a2 < 0) ring.reverse();

    // Material comes from the widest incident edge's class, so a motorway junction reads as
    // motorway asphalt rather than as whatever happened to be listed first.
    let wCls = nd.recs[0].edge.cls, wW = -1;
    for (const rc of nd.recs) if (rc.edge.width > wW) { wW = rc.edge.width; wCls = rc.edge.cls; }
    cellFor(`${Math.floor(nd.p[0] / chunk)},${Math.floor(nd.p[1] / chunk)}`).junctions.push({
      node: nd.id, deg: nd.deg, centre: [nd.p[0], nd.p[1]], ring, cls: wCls,
    });
    junctions++;
    junctionTris += ring.length;          // fan from the centre: one triangle per ring edge
  }

  return {
    cells, edges, nodes, chunk, shoulder,
    stats: {
      edges: edges.length, nodes: doc.nodes.length,
      cells: cells.size,
      ribbonPieces, boundaryVertices,
      edgesWithNoRibbon: dropped,
      junctions, junctionTris, tapers,
      degreeHistogram: nodes.reduce((h, n) => { h[n.deg] = (h[n.deg] || 0) + 1; return h; }, {}),
      maxRetreat: Math.max(...nodes.map((n) => (n.r.length ? Math.max(...n.r) : 0))),
    },
  };
}
