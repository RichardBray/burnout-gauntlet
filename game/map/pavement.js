// pavement.js — the graph's city-block FACES turned into chunk-sized kerb and pavement geometry.
// API: planPavement(doc, faces, {chunk, graph, ...}) -> {cells, stats}
//
// Data and arithmetic only. No three.js, no renderer, no materials — the same discipline as
// graph.js, blocks.js and ribbons.js, so `tools/_pavement.mjs` runs the whole thing in node and
// asserts on the FINAL VERTICES with no browser. world.js turns two arrays per cell into two
// BufferGeometries on the two materials that already exist.
//
// THE RULE THIS FILE EXISTS TO OBEY — risk 12 of tools/WAVE-T-GENERATE-MESH-PLAN.md
//
// The face polygon and the block AABB are two different shapes for the same block and they have
// two different jobs.
//
//   * The AABB is INSCRIBED. `world.blocks` stays `{cx, cz, w, d, bw, bd}`, a published contract
//     read by physics.js:922, traffic.js:1068 and camera.js:251. Buildings sit on `bw`/`bd`.
//   * The drawn kerb and pavement follow the FACE POLYGON and are always OUTSIDE the AABB.
//
// Both directions are failure modes. A pavement that laps over the road is a visual defect; an
// AABB that pokes outside the drawn pavement is `physics.js` colliding the car with empty air over
// the carriageway. `blocks.js` proves the first direction only ("zero blocks overlap tarmac"), so
// `tools/_pavement.mjs` measures BOTH and prints both numbers.
//
// THE THREE THINGS THIS FILE HAS TO GET RIGHT
//
// 1. THE KERB IS AT THE TARMAC EDGE, NOT AT THE FACE'S OWN EDGE'S HALF-WIDTH. Offsetting a face
//    polygon inward by its own bounding edges' paved half-widths is the obvious construction and
//    it is WRONG, for the reason blocks.js:244-250 already records: road corridors do not respect
//    faces. A 49.4 m arterial one face away reaches over a 9 m service road and into this face,
//    and junction fans overlap several faces at once. So each cross-section is MARCHED outward
//    from the naive offset until `surfaceAt` stops saying tarmac, and the band is then truncated
//    at the next tarmac it meets going inward. The kerb therefore lands on the real edge of the
//    real paved corridor, which is also exactly where the shoulder ribbon in ribbons.js ends.
//
// 2. CHUNK-BOUNDARY CONTINUITY (chunk contract rule 4), by the same discipline the ribbons use.
//    The strip is split at every `x = k*chunk` / `z = k*chunk` plane and the crossing cross-section
//    is interpolated by `lerpXs()` from the same two source cross-sections with the same `t` in the
//    same order by both sides, so the two chunks hold bit-identical IEEE doubles. Nothing is
//    re-derived from a fragment.
//
// 3. ONE BATCHED EXTRUSION PER CHUNK PER MATERIAL. The grid world builds two unshared
//    `BoxGeometry` meshes per block (world.js:1694, world.js:1704). At 868 blocks that discipline
//    is ~1736 unshared geometries; section 2 of the mesh plan caps a chunk at about six
//    chunk-owned geometries. This emits exactly two per occupied cell — one `kerbMat`, one
//    `walkMat` — and adds ZERO materials.

/** Must equal `graph.js`'s SHOULDER: the drawn kerb and `surfaceAt`'s tarmac are one surface. */
export const SHOULDER = 3.0;

/**
 * Kerb step height, metres. Lifted from the grid world's `BoxGeometry(w, 0.22, d)` at
 * `world.js:1694`, whose comment is the reason to keep it: the kerb is the only 22 cm step in the
 * frame and it is the cheapest hard shadow in the city, one thin dark line in the gutter that
 * grounds the pavement onto the road instead of letting the two abut as one flat grey.
 */
export const KERB_H = 0.22;

/** Pavement top height, metres. The grid world's inner slab at `world.js:1704` is 0.24. */
export const WALK_H = 0.24;

/**
 * Width of the kerb stone itself, metres — the band drawn in `kerbMat` before `walkMat` starts.
 *
 * The grid world insets its inner slab by 0.8 m on each side (`w - 1.6` at `world.js:1704`), so
 * this is that number, unchanged, expressed as a band instead of as a box inset.
 */
export const KERB_TOP_W = 0.8;

/**
 * Pavement depth from the inner edge of the kerb stone to the building line, metres.
 *
 * `LAYOUT.walkW = 7.0` (`world.js:23`) and `blocks.js`'s `WALK_W = 7.0`, which is what makes
 * `bw = w - 2*walkW` mean the same thing here as it does there.
 */
export const WALK_W = 7.0;

/** Total band depth from the kerb face inward. */
const BAND = KERB_TOP_W + WALK_W;

/**
 * A miter longer than this multiple of the local paved half-width is replaced by a BEVEL.
 *
 * At a node of degree d the face's interior angle is small whenever two roads leave in nearly the
 * same direction, and an unclamped miter then shoots the corner point tens of metres across the
 * junction and out the other side — past the tarmac march's start point, which would then march
 * from the wrong place. Two corner points instead of one costs two triangles and cannot diverge.
 * 2.0 admits everything down to a 60 degree interior angle and bevels the rest.
 */
const MITER_LIMIT = 2.0;

/**
 * Angular pitch of the ROUND join at a reflex corner, radians.
 *
 * 15 degrees. The join has to be an arc rather than a miter (see the corner code below), and at a
 * 15 degree pitch the chord's sag is `h * (1 - cos(7.5deg))` = 0.9% of the paved half-width, under
 * 5 cm on the widest road here. Finer buys nothing a 22 cm kerb can show.
 */
const ARC_STEP = Math.PI / 12;

/**
 * Longest ring segment before it is subdivided, metres.
 *
 * Not a smoothness parameter — the ring already carries every shape point of every bounding edge,
 * so curves are already curved. This exists because the tarmac march (item 1 above) is sampled
 * PER CROSS-SECTION, and the longest single segment in the graph is 230.3 m. A road intruding
 * halfway along an unsubdivided 230 m segment would be missed entirely and the pavement would be
 * drawn straight over it.
 */
const STATION_MAX = 12.0;

/** March step for the tarmac search, metres, refined by bisection afterwards. */
const MARCH_STEP = 0.25;
/** Bisection iterations after the march brackets the boundary: 0.25 / 2^12 = 0.06 mm. */
const MARCH_BISECT = 12;
/** Give up pushing the kerb inward past this, metres: the face is road here, not pavement. */
const MAX_PUSH = 24.0;
/** Give up pulling the kerb back toward the road past this, metres. */
const MAX_PULL = 8.0;
/** Longest chord between two adjacent kerb stations before one is inserted between them. */
const CHORD_MAX = 7.0;
/** How many times the chord subdivision may run. Each round halves the worst chord. */
const CHORD_ROUNDS = 4;
/** A band shallower than this is not a pavement; the strip breaks instead. */
const MIN_BAND = 1.2;

/** Planar world UV scale for `kerbMat`, metres per texture tile. */
const KERB_UV = 744.4;
/** Planar world UV scale for `walkMat`, metres per texture tile. */
const WALK_UV = 335.0;

const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

/**
 * A cross-section of the kerb/pavement band.
 *
 * `bx,bz` is the base point at zero offset and `mx,mz` is the offset vector per metre of inward
 * offset, so `point(c) = b + m*c` is EXACT and linear in `c`. That linearity is what lets the
 * tarmac march bisect on a scalar and what makes the boundary interpolation below a plain lerp of
 * six numbers rather than a re-solve of two line intersections.
 */
const xs = (bx, bz, mx, mz, c0, c1, c2) => ({ bx, bz, mx, mz, c0, c1, c2 });

const xsAt = (v, c) => [v.bx + v.mx * c, v.bz + v.mz * c];

/**
 * Interpolate a cross-section. THE function boundary continuity rests on.
 *
 * Both chunks either side of a plane call this with the SAME `a`, the SAME `b` and the SAME `t`,
 * in that order, so both get bit-identical IEEE doubles out. Do not reorder the operands and do
 * not hoist a subexpression — that is what breaks it. Same contract as `crossAt` in ribbons.js.
 */
function lerpXs(a, b, t) {
  return xs(
    a.bx + (b.bx - a.bx) * t,
    a.bz + (b.bz - a.bz) * t,
    a.mx + (b.mx - a.mx) * t,
    a.mz + (b.mz - a.mz) * t,
    a.c0 + (b.c0 - a.c0) * t,
    a.c1 + (b.c1 - a.c1) * t,
    a.c2 + (b.c2 - a.c2) * t,
  );
}

/** Intersection of two offset lines, or null when they are too near parallel to trust. */
function offsetCorner(p, dPrev, hPrev, dNext, hNext) {
  // Offset line k: point p + n_k*h_k, direction d_k, with n_k the LEFT normal of d_k (the face
  // ring winds counter-clockwise, so the interior is on the left).
  const n0x = -dPrev[1], n0z = dPrev[0];
  const n1x = -dNext[1], n1z = dNext[0];
  const cross = dPrev[0] * dNext[1] - dPrev[1] * dNext[0];
  if (Math.abs(cross) < 1e-9) return null;              // collinear: no unique corner
  const a0x = p[0] + n0x * hPrev, a0z = p[1] + n0z * hPrev;
  const a1x = p[0] + n1x * hNext, a1z = p[1] + n1z * hNext;
  const t = ((a1x - a0x) * dNext[1] - (a1z - a0z) * dNext[0]) / cross;
  return [a0x + dPrev[0] * t, a0z + dPrev[1] * t];
}

/**
 * Plan the whole city's kerbs and pavement.
 *
 * @param {object} doc    parsed paradise.json (only `extent` is read; widths come from `graph`)
 * @param {Array}  faces  `createBlocks(doc).faces` — each carries `polygon`, the source face ring
 * @param {object} opts   `chunk` (200), `graph` (a `createRoadGraph(doc)`), `shoulder` (3.0),
 *   optional `keep(x0,x1,z0,z1)=>boolean` — when set, skip the per-face cross-section march for
 *   faces whose polygon AABB does not overlap the keep region. `undefined` = march everything =
 *   today's behaviour exactly (S4b-1).
 * @returns {{cells: Map, stats: object}} `cells` maps a cell key to `{kerb, walk}` sinks, each
 *   `{pos, nor, uv, idx}` of plain numbers ready for a `BufferGeometry`.
 */
export function planPavement(doc, faces, opts = {}) {
  const chunk = opts.chunk ?? 200;
  const graph = opts.graph;
  if (!graph || typeof graph.surfaceAt !== 'function') {
    throw new Error('planPavement needs opts.graph — a createRoadGraph(doc), for the tarmac march');
  }
  const surfaceAt = graph.surfaceAt;
  const stationMax = opts.stationMax ?? STATION_MAX;
  const bandDepth = opts.band ?? BAND;
  const kerbTopW = opts.kerbTopW ?? KERB_TOP_W;
  const chordMax = opts.chordMax ?? CHORD_MAX;
  // S4b-1: residency filter on the per-face march only. Face list stays map-wide from createBlocks.
  const keep = typeof opts.keep === 'function' ? opts.keep : undefined;

  const cells = new Map();
  const cellFor = (k) => {
    let c = cells.get(k);
    if (!c) {
      cells.set(k, c = {
        key: k,
        kerb: { pos: [], nor: [], uv: [], idx: [] },
        walk: { pos: [], nor: [], uv: [], idx: [] },
      });
    }
    return c;
  };

  let stations = 0, stationsDropped = 0, pushed = 0, truncated = 0;
  let strips = 0, pieces = 0, boundaryVertices = 0, facesWithKerb = 0, quadsCut = 0;
  let kerbMetres = 0, ringMetres = 0;
  let maxPush = 0, maxTruncation = 0, pushSum = 0, pulled = 0, maxPull = 0, chordSplits = 0;
  const rings = [];             // the drawn kerb line per face, for the harness's overlap checks
  // THE DRAWN SURFACE, published so a harness can sample the thing that was actually emitted
  // rather than a reconstruction of it. One entry per maximal run of valid cross-sections, before
  // the chunk split - the split changes which cell owns a triangle, never which triangles exist.
  const runsOut = [];

  let facesMarchSkipped = 0;
  for (const f of faces) {
    // S4b-1: skip the expensive per-face march when the face AABB misses the keep region.
    // Topology and the face list remain map-wide; only this face's stations/cells are omitted.
    if (keep) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of f.polygon) {
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
        if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1];
      }
      if (!keep(x0, x1, z0, z1)) { facesMarchSkipped++; continue; }
    }

    // ---- 1. the ring, deduplicated and subdivided ---------------------------------------------
    const raw = [];
    for (const p of f.polygon) {
      const last = raw[raw.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      raw.push([p[0], p[1]]);
    }
    if (raw.length > 2) {
      const a = raw[0], b = raw[raw.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) raw.pop();
    }
    if (raw.length < 3) continue;

    // Per-segment direction and paved half-width. The width comes from `graph.nearest()` at the
    // segment MIDPOINT rather than from the face's own bookkeeping, because `faces[].polygon` is
    // the only thing blocks.js publishes and it carries no edge identity. The midpoint of a ring
    // segment lies exactly on a road centreline (measured: 0 of 4189 further than 0.1 mm), so the
    // lookup is exact and the harness asserts on that distance rather than trusting it.
    const N = raw.length;
    const dir = new Array(N), half = new Array(N);
    let lookupWorst = 0;
    for (let i = 0; i < N; i++) {
      const a = raw[i], b = raw[(i + 1) % N];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = hypot(dx, dz) || 1;
      dir[i] = [dx / len, dz / len];
      const nr = graph.nearest((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 300);
      lookupWorst = Math.max(lookupWorst, nr ? nr.dist : Infinity);
      half[i] = nr ? doc.edges[nr.edge].width / 2 + (opts.shoulder ?? SHOULDER) : SHOULDER;
    }
    if (lookupWorst > 0.5) {
      // Reported, never silently absorbed: a ring segment that is not on a centreline means the
      // face ring and the graph have diverged and every half-width below is a guess.
      rings.push({ faceId: f.id, ring: [], lookupWorst });
      continue;
    }

    // Subdivide long segments so the tarmac march below actually samples them. Positions only —
    // direction and half-width are the parent segment's, which is exact.
    const pts = [], seg = [];
    for (let i = 0; i < N; i++) {
      const a = raw[i], b = raw[(i + 1) % N];
      const len = hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / stationMax));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        seg.push(i);
      }
      ringMetres += len;
    }
    const M = pts.length;

    // ---- 2. cross-sections: corner, then march ------------------------------------------------
    const list = [];              // {xs, valid} in ring order, with bevels expanded in place
    for (let j = 0; j < M; j++) {
      const iPrev = seg[(j - 1 + M) % M], iNext = seg[j];
      const dPrev = dir[iPrev], dNext = dir[iNext];
      const hPrev = half[iPrev], hNext = half[iNext];
      const p = pts[j];
      const bases = [];
      if (iPrev === iNext) {
        // Interior of a subdivided segment: no corner at all.
        bases.push([p, dNext, hNext]);
      } else {
        // CONVEX or REFLEX, and they need different joins. This is not a stylistic choice, it is
        // the one that decides whether the drawn kerb stays outside the block AABBs.
        //
        // The ring winds counter-clockwise with the interior on the left, so a LEFT turn
        // (`cross > 0`) is a convex corner: the two offset lines CONVERGE and their intersection
        // lies ON both of them, hence at exactly `h` from each road and never deeper into the
        // block than the 0.5 m `KERB_MARGIN` blocks.js already holds. A miter is exact there.
        //
        // A RIGHT turn is reflex: the offset lines DIVERGE and their intersection runs away up the
        // bisector, `h / sin(theta/2)` from the node, which at a 340 degree interior angle is 5.7
        // times the paved half-width. Measured before this was split out: 14 drawn kerb vertices
        // landed inside a block AABB, the worst 7.54 m in, and every one was a reflex miter at the
        // 2.0*h clamp. The correct join there is a ROUND one - an arc of stations at radius `h`
        // about the ring vertex, which sits on the centreline, so every station is exactly `h`
        // from the road and the penetration cannot happen.
        const cross = dPrev[0] * dNext[1] - dPrev[1] * dNext[0];
        const c0 = cross > 0 ? offsetCorner(p, dPrev, hPrev, dNext, hNext) : null;
        const lim = MITER_LIMIT * Math.max(hPrev, hNext);
        if (c0 && hypot(c0[0] - p[0], c0[1] - p[1]) <= lim) {
          bases.push([p, null, 0, c0, offsetCorner(p, dPrev, hPrev + 1, dNext, hNext + 1)]);
        } else if (cross > 0) {
          // A convex corner too sharp to miter: a thin wedge of face running up to a node. Both
          // points sit on their own offset line, so both are correct; the chord between them is
          // long, and the subdivision pass below is what stops that chord slicing across whatever
          // sits in the wedge.
          bases.push([p, dPrev, hPrev]);
          bases.push([p, dNext, hNext]);
        } else {
          // ROUND JOIN. Sweep the inward normal from the previous arm's to the next arm's, the
          // short way, at no more than ARC_STEP per station, interpolating the half-width.
          const turn = Math.atan2(cross, dPrev[0] * dNext[0] + dPrev[1] * dNext[1]);
          const steps = Math.max(1, Math.ceil(Math.abs(turn) / ARC_STEP));
          const n0x = -dPrev[1], n0z = dPrev[0];
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const a = turn * t, ca = Math.cos(a), sa = Math.sin(a);
            const nx = n0x * ca - n0z * sa, nz = n0x * sa + n0z * ca;
            const h = hPrev + (hNext - hPrev) * t;
            bases.push([p, null, 0,
              [p[0] + nx * h, p[1] + nz * h],
              [p[0] + nx * (h + 1), p[1] + nz * (h + 1)]]);
          }
        }
      }
      for (const bs of bases) {
        let b0, b1;
        if (bs.length === 5) { b0 = bs[3]; b1 = bs[4]; } else {
          const [pp, d, h] = bs;
          const nx = -d[1], nz = d[0];
          b0 = [pp[0] + nx * h, pp[1] + nz * h];
          b1 = [pp[0] + nx * (h + 1), pp[1] + nz * (h + 1)];
        }
        if (!b0 || !b1) continue;
        const mx = b1[0] - b0[0], mz = b1[1] - b0[1];
        list.push(marchStation(b0[0], b0[1], mx, mz));
        stations++;
      }
    }

    // The tarmac march, per cross-section. `c0` is where the paved corridor really ends, found by
    // stepping outward from the naive offset and bisecting; `c2` is where the band runs back into
    // tarmac, or the full depth, whichever comes first.
    function marchStation(bx, bz, mx, mz) {
      const at = (c) => surfaceAt(bx + mx * c, bz + mz * c);
      let c0 = 0;
      if (at(0) !== 'tarmac') {
        // PULL BACK. The march below only ever pushes the kerb further from the road, so a base
        // point that starts too FAR in stays too far in - and a corner join can start too far in
        // by construction: a round join at a node where a 9 m service road meets a 49.4 m arterial
        // sweeps its radius from 7.5 m to 27.7 m, and the wide end of that sweep can be 20 m from
        // the road it is actually the kerb of. Measured: 10 kerb segments still cut up to 2.4 m
        // into a block AABB with the stations 3 m apart, so this is not chord sag and no amount of
        // subdivision fixes it. Stepping BACK toward the road until tarmac is met puts every
        // station on the real corridor boundary along its own ray, whichever direction it came in
        // from.
        for (let c = -MARCH_STEP; c >= -MAX_PULL; c -= MARCH_STEP) {
          if (at(c) === 'tarmac') {
            let lo = c, hi = c + MARCH_STEP;
            for (let k = 0; k < MARCH_BISECT; k++) {
              const mid = (lo + hi) / 2;
              if (at(mid) === 'tarmac') lo = mid; else hi = mid;
            }
            c0 = hi;
            pulled++;
            if (-c0 > maxPull) maxPull = -c0;
            break;
          }
        }
      }
      if (at(c0) === 'tarmac') {
        let lo = c0, hi = -1;
        for (let c = c0 + MARCH_STEP; c <= c0 + MAX_PUSH; c += MARCH_STEP) {
          if (at(c) !== 'tarmac') { hi = c; break; }
          lo = c;
        }
        if (hi < 0) return { v: null, valid: false, reason: 'allTarmac' };
        for (let k = 0; k < MARCH_BISECT; k++) {
          const mid = (lo + hi) / 2;
          if (at(mid) === 'tarmac') lo = mid; else hi = mid;
        }
        c0 = hi;
        pushed++;
        pushSum += c0;
        if (c0 > maxPush) maxPush = c0;
      }
      let c2 = c0 + bandDepth;
      for (let c = c0 + MARCH_STEP; c <= c0 + bandDepth; c += MARCH_STEP) {
        if (at(c) === 'tarmac') {
          let lo = c - MARCH_STEP, hi = c;
          for (let k = 0; k < MARCH_BISECT; k++) {
            const mid = (lo + hi) / 2;
            if (at(mid) === 'tarmac') hi = mid; else lo = mid;
          }
          c2 = lo;
          truncated++;
          if (bandDepth - (c2 - c0) > maxTruncation) maxTruncation = bandDepth - (c2 - c0);
          break;
        }
      }
      if (c2 - c0 < MIN_BAND) return { v: null, valid: false, reason: 'thin' };
      const c1 = Math.min(c0 + kerbTopW, c0 + (c2 - c0) * 0.5);
      return { v: xs(bx, bz, mx, mz, c0, c1, c2), valid: true };
    }

    // ---- 2b. LONG-CHORD SUBDIVISION -----------------------------------------------------------
    // Every station is individually correct - not one of the 15578 drawn kerb vertices lies inside
    // a block AABB - and the drawn kerb still cut 51 block corners, the worst 4.01 m deep, because
    // the CHORD between two correct stations is not the kerb. The offending chords are 17 to 35 m
    // long and they are all corner joins, where two adjacent stations legitimately sit far apart.
    //
    // So any chord longer than CHORD_MAX gets a station inserted at the mean of its two ends and
    // MARCHED like any other, which snaps it onto the real corridor boundary rather than onto the
    // straight line. Measured: at 7.0 m the crossings go to ZERO at 260400 triangles; 9.0 m still
    // leaves 5 crossings at 0.43 m and 5.0 m costs 52% more triangles for nothing.
    for (let round = 0; round < CHORD_ROUNDS; round++) {
      let split = 0;
      const next = [];
      for (let j = 0; j < list.length; j++) {
        next.push(list[j]);
        const A = list[j], B = list[(j + 1) % list.length];
        if (!A.valid || !B.valid) continue;
        const pa = xsAt(A.v, A.v.c0), pb = xsAt(B.v, B.v.c0);
        if (hypot(pb[0] - pa[0], pb[1] - pa[1]) <= chordMax) continue;
        const bx = (A.v.bx + B.v.bx) / 2, bz = (A.v.bz + B.v.bz) / 2;
        let mx = A.v.mx + B.v.mx, mz = A.v.mz + B.v.mz;
        const ml = hypot(mx, mz);
        if (ml < 1e-9) continue;
        mx /= ml; mz /= ml;
        next.push(marchStation(bx, bz, mx, mz));
        stations++;
        split++;
      }
      list.length = 0;
      list.push(...next);
      chordSplits += split;
      if (!split) break;
    }

    // ---- 3. the QUAD test, which the per-station march does not cover -------------------------
    // Marching each cross-section proves the RAY is clear. It says nothing about the quad BETWEEN
    // two cross-sections, and that is where the remaining overlap lives: at a corner the two
    // stations have very different offset directions, so the quad spanning them sweeps a wedge
    // across the junction, and at a bevel the two stations share a base point and the wedge is the
    // whole corner. Measured before this pass: 3.03% of the drawn band was on tarmac with every
    // station individually clear. So each quad is sampled on its own 3x4 grid and an edge that
    // touches tarmac is CUT - the strip breaks and the pavement stops short of the corner rather
    // than lapping over the carriageway. The grid is 5 x 6; at 3 x 4 six samples still slipped
    // through, which is the honest way to say this is a SAMPLED guarantee and not a proof.
    const cut = new Array(list.length).fill(false);
    for (let j = 0; j < list.length; j++) {
      const a = list[j], b = list[(j + 1) % list.length];
      if (!a.valid || !b.valid) continue;
      const ao = xsAt(a.v, a.v.c0), ai = xsAt(a.v, a.v.c2);
      const bo = xsAt(b.v, b.v.c0), bi = xsAt(b.v, b.v.c2);
      let bad = false;
      for (let u = 1; u <= 5 && !bad; u++) {
        const tu = u / 6;
        const ox = ao[0] + (bo[0] - ao[0]) * tu, oz = ao[1] + (bo[1] - ao[1]) * tu;
        const ix = ai[0] + (bi[0] - ai[0]) * tu, iz = ai[1] + (bi[1] - ai[1]) * tu;
        for (let v = 0; v < 6 && !bad; v++) {
          const tv = 0.02 + v * 0.196;
          if (surfaceAt(ox + (ix - ox) * tv, oz + (iz - oz) * tv) === 'tarmac') bad = true;
        }
      }
      if (bad) { cut[j] = true; quadsCut++; }
    }

    // ---- 4. maximal valid runs, cyclically ----------------------------------------------------
    const valid = list.map((s) => s.valid);
    stationsDropped += valid.filter((v) => !v).length;
    // A station is a break if it was dropped; an EDGE is a break if its quad was cut. Both are
    // expressed as "the run ends after this station".
    const runs = [];
    if (valid.every((v) => v) && cut.every((c) => !c)) {
      runs.push(list.map((s) => s.v).concat([list[0].v]));       // closed loop
    } else {
      let start = 0;
      while (start < list.length && valid[start] && !cut[(start - 1 + list.length) % list.length]) start++;
      if (start < list.length) {
        let cur = null;
        for (let k = 0; k < list.length; k++) {
          const j = (start + k) % list.length;
          if (!valid[j]) { if (cur) runs.push(cur); cur = null; continue; }
          (cur || (cur = [])).push(list[j].v);
          if (cut[j]) { runs.push(cur); cur = null; }
        }
        if (cur) runs.push(cur);
      }
    }
    let any = false;
    for (const run of runs) {
      if (run.length < 2) continue;
      any = true;
      strips++;
      runsOut.push({ faceId: f.id, xs: run.map((v) => ({ o: xsAt(v, v.c0), k: xsAt(v, v.c1), i: xsAt(v, v.c2) })) });
      for (let i = 1; i < run.length; i++) {
        const a = xsAt(run[i - 1], run[i - 1].c0), b = xsAt(run[i], run[i].c0);
        kerbMetres += hypot(b[0] - a[0], b[1] - a[1]);
      }
      emitStrip(run);
    }
    if (any) facesWithKerb++;
    // The drawn kerb LINE, published for the harness's two overlap checks. `complete` is the
    // honest qualifier: where a station was dropped the ring has a gap, so joining what is left
    // into a closed polygon would be a chord across a hole and a point-in-polygon test on it would
    // be measuring an invention. `tools/_pavement.mjs` reports the incomplete ones separately
    // rather than folding them into a pass.
    rings.push({
      faceId: f.id,
      complete: list.length > 2 && list.every((s) => s.valid),
      ring: list.filter((s) => s.valid).map((s) => xsAt(s.v, s.v.c0)),
      inner: list.filter((s) => s.valid).map((s) => xsAt(s.v, s.v.c2)),
      lookupWorst,
    });
  }

  /** Split a run of cross-sections at the chunk planes and emit each piece into its own cell. */
  function emitStrip(run) {
    const parts = splitByCell(run, chunk);
    pieces += parts.length;
    boundaryVertices += Math.max(0, parts.length - 1);
    for (const part of parts) emitPiece(cellFor(part.cell), part.vs);
  }

  function emitPiece(cell, vs) {
    // Five quad rows. `a`/`b` are the offset parameters of the row's two edges; `dy0`/`dy1` their
    // heights; `up` picks the normal. Kerb rows go to `kerbMat`, walk rows to `walkMat`, so the
    // whole cell is two draw calls.
    const rows = [
      { sink: cell.kerb, uv: KERB_UV, a: 'c0', b: 'c0', y0: 0, y1: KERB_H, nrm: 'out' },
      { sink: cell.kerb, uv: KERB_UV, a: 'c0', b: 'c1', y0: KERB_H, y1: KERB_H, nrm: 'up' },
      { sink: cell.walk, uv: WALK_UV, a: 'c1', b: 'c1', y0: KERB_H, y1: WALK_H, nrm: 'out' },
      { sink: cell.walk, uv: WALK_UV, a: 'c1', b: 'c2', y0: WALK_H, y1: WALK_H, nrm: 'up' },
      { sink: cell.walk, uv: WALK_UV, a: 'c2', b: 'c2', y0: WALK_H, y1: 0, nrm: 'in' },
    ];
    for (const row of rows) {
      const sk = row.sink;
      const base = sk.pos.length / 3;
      for (const v of vs) {
        const ml = hypot(v.mx, v.mz) || 1;
        const ux = v.mx / ml, uz = v.mz / ml;
        const n = row.nrm === 'up' ? [0, 1, 0] : row.nrm === 'out' ? [-ux, 0, -uz] : [ux, 0, uz];
        const pa = xsAt(v, v[row.a]), pb = xsAt(v, v[row.b]);
        sk.pos.push(pa[0], row.y0, pa[1], pb[0], row.y1, pb[1]);
        sk.nor.push(n[0], n[1], n[2], n[0], n[1], n[2]);
        sk.uv.push(pa[0] / row.uv, pa[1] / row.uv, pb[0] / row.uv, pb[1] / row.uv);
      }
      // Wound so the face points along `nrm`: the ring runs counter-clockwise and the band runs
      // inward, so (outer, inner, next-outer) is the up-facing order for a horizontal row.
      for (let i = 0; i + 1 < vs.length; i++) {
        const o0 = base + i * 2, i0 = o0 + 1, o1 = o0 + 2, i1 = o0 + 3;
        sk.idx.push(o0, i0, o1, i0, i1, o1);
      }
    }
  }

  /**
   * Split a cross-section run wherever its KERB LINE crosses an `x = k*chunk` or `z = k*chunk`
   * plane, and bucket the pieces by cell.
   *
   * The kerb line is the reference curve and the whole cross-section is interpolated at that same
   * `t`, so the two pieces share one cross-section computed by one call to `lerpXs` from one pair
   * of sources. The inner rows therefore stray a few metres over the plane, which is correct: a
   * cell is an ownership label, not a clipping volume, and a band cut separately per row would put
   * a tear in the pavement at every boundary.
   */
  function splitByCell(vs, size) {
    const out = [];
    let cur = [vs[0]];
    const cellOf = (x, z) => `${Math.floor(x / size)},${Math.floor(z / size)}`;
    for (let i = 1; i < vs.length; i++) {
      const a = vs[i - 1], b = vs[i];
      const [ax, az] = xsAt(a, a.c0), [bx, bz] = xsAt(b, b.c0);
      const ts = [];
      for (const [pa, pb] of [[ax, bx], [az, bz]]) {
        if (pa === pb) continue;
        const lo = Math.min(pa, pb), hi = Math.max(pa, pb);
        for (let k = Math.floor(lo / size) + 1; k <= Math.ceil(hi / size) - 1; k++) {
          const t = (k * size - pa) / (pb - pa);
          if (t > 0 && t < 1) ts.push(t);
        }
      }
      ts.sort((p, q) => p - q);
      for (const t of ts) {
        // THE SHARED CROSS-SECTION. The next piece starts at the identical object, and an
        // independent second plan re-derives it from the identical (a, b, t) in the identical
        // order — which is the claim `tools/_pavement.mjs` checks with Object.is across two
        // separate plans, because "we shared the object" is a different and weaker claim.
        const v = lerpXs(a, b, t);
        cur.push(v);
        out.push(cur);
        cur = [v];
      }
      cur.push(b);
    }
    out.push(cur);

    const parts = [];
    for (const p of out) {
      if (p.length < 2) continue;
      const [x0, z0] = xsAt(p[0], p[0].c0);
      const [x1, z1] = xsAt(p[p.length - 1], p[p.length - 1].c0);
      if (p.length === 2 && x0 === x1 && z0 === z1) continue;
      parts.push({ cell: cellOf((x0 + x1) / 2, (z0 + z1) / 2), vs: p });
    }
    return parts;
  }

  let tris = 0, verts = 0;
  for (const c of cells.values()) {
    tris += (c.kerb.idx.length + c.walk.idx.length) / 3;
    verts += (c.kerb.pos.length + c.walk.pos.length) / 3;
  }

  return {
    cells, rings, runs: runsOut, chunk,
    stats: {
      faces: faces.length,
      facesWithKerb,
      // S4b-1: only published when a keep filter ran (clause 4 no-filter identity).
      ...(keep ? { facesMarchSkipped } : {}),
      stations,
      stationsDropped,
      stationsPushedOffTarmac: pushed,
      stationsPulledBackToKerb: pulled,
      maxPull,
      stationsTruncated: truncated,
      chordSplits,
      quadsCutForTarmac: quadsCut,
      maxPush,
      meanPush: pushed ? pushSum / pushed : 0,
      maxTruncation,
      strips,
      pieces,
      boundaryVertices,
      cells: cells.size,
      geometriesPerCell: 2,
      ringMetres,
      kerbMetres,
      triangles: tris,
      vertices: verts,
      params: {
        chunk, band: bandDepth, kerbTopW, kerbH: KERB_H, walkH: WALK_H,
        stationMax, chordMax, miterLimit: MITER_LIMIT, minBand: MIN_BAND, maxPushLimit: MAX_PUSH,
        marchStep: MARCH_STEP, marchBisect: MARCH_BISECT, kerbUv: KERB_UV, walkUv: WALK_UV,
      },
    },
  };
}
