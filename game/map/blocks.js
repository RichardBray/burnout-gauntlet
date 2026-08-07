// City blocks, derived from the road graph. Wave T, `generate-blocks`.
//
// A city block is not a thing anyone digitised. `paradise.json` has 688 nodes and 929 edges and
// says nothing at all about what is BETWEEN the roads. But it does say it implicitly and exactly:
// the blocks are the FACES of the planar graph. Every closed loop of road bounds one piece of
// ground, and the set of those loops is the set of city blocks, with no sampling, no clustering
// and no threshold to tune.
//
// So this file does the standard planar face traversal - sort each node's outgoing half-edges by
// bearing, walk next-clockwise from each twin, 2*E half-edges each used exactly once - discards
// the outer face, insets each remaining face behind its own kerbs, and fills the result with
// axis-aligned rectangles in `world.blocks`' published `{cx, cz, w, d, bw, bd}` shape.
//
// No three.js import, deliberately, same discipline as `game/map/graph.js`: this is data and
// arithmetic, it runs in node under `tools/_mapblocks.mjs` as happily as in the browser, and the
// whole piece is judgeable with no renderer.

/**
 * Metres of paved shoulder beyond an edge's own half-width, out to the kerb face.
 *
 * This is not an independent choice. It MUST equal `SHOULDER` in `game/map/graph.js:16`, because
 * that is the number `surfaceAt` uses to decide where tarmac ends, and the whole acceptance test
 * for this file is that no point of any block is tarmac. Two constants that have to agree and do
 * not is the bug that presents as a building in the middle of the road.
 */
const SHOULDER = 3.0;

/**
 * Extra metres of clearance held between the kerb face and the nearest block corner.
 *
 * `surfaceAt` answers `tarmac` when the distance to a centreline is <= the paved half-width, so a
 * block inset by EXACTLY the paved half-width has its boundary on tarmac by that inclusive test.
 * Half a metre is the smallest margin that is unambiguously more than float32 endpoint error
 * (`graph.js` stores segments as `Float32Array`; the measured disagreement against float64 is
 * 6.1e-5 m per `verdicts/wave-t/queries.md`) while staying far below the 7 m pavement, so it
 * costs no visible ground.
 */
const KERB_MARGIN = 0.5;

/**
 * Pavement depth between the kerb and the building line, metres.
 *
 * Lifted unchanged from `LAYOUT.walkW = 7.0` at `game/world.js:22`, and used the same way: the
 * block's `w`/`d` is the paved plot kerb-to-kerb, `bw`/`bd` is that minus `2 * WALK_W` and is
 * where buildings may stand. `world.js:1232` computes `bw: w - LAYOUT.walkW * 2` and this must
 * keep meaning the same thing, because seven tools and three modules read the result.
 */
const WALK_W = 7.0;

/**
 * Faces smaller than this are discarded as digitisation slivers, m^2.
 *
 * The shortest edge in the graph is 5.20 m, so the traversal can and does close loops that are
 * artefacts of the tracer rather than city blocks. 400 m^2 is a 20 x 20 m plot, which is also
 * `MIN_BLOCK_SIDE` squared: a face below it cannot contain a single legal block even before the
 * kerb inset, so dropping it early costs nothing and keeps the face list honest.
 */
const MIN_FACE_AREA = 400;

/**
 * Cell size of the rectangle-fill grid, metres.
 *
 * The fill is a raster: mark every 4 m cell that is provably clear of tarmac, then pull maximal
 * rectangles out of the mask. 4 m is a quarter of a lane pair and roughly a doorway, so the
 * quantisation is invisible next to a 14-49 m road, and it keeps the largest face (785450 m^2) at
 * ~49k cells, which is milliseconds. A finer pitch buys sub-car-width accuracy at the polygon
 * corners that no consumer of an AXIS-ALIGNED AABB list can express anyway.
 */
const FILL_PITCH = 4.0;

/**
 * Shortest side a block may have, metres.
 *
 * `bw = w - 2 * WALK_W`, so a block narrower than 14 m has a NEGATIVE building line and every
 * consumer that trusts `bw` gets nonsense. 20 m leaves 6 m of building between two 7 m pavements,
 * which is a narrow terrace and the smallest thing worth calling a block.
 */
const MIN_BLOCK_SIDE = 20.0;

/**
 * A face bigger than this emits a RING of street-frontage rectangles, never one slab, m^2.
 *
 * Round 1 filled every face solid and produced 51 blocks over 200 m on a side carrying 54.7% of all
 * block area. The overlay showed what the number did not: a spine of solid slabs down the length of
 * the map. `physics.js:922` makes each `{cx, cz, w, d}` one collidable AABB, so that spine is a wall
 * through White Mountain and the harbour, and the drive probe would meet it at 70 m/s.
 *
 * 40000 m^2 is a 200 x 200 m face. Below that, a face is a plausible city block whose interior is
 * genuinely built over and a solid fill is right. Above it, the ground is enclosed by roads but not
 * SUBDIVIDED by them, and the honest reading is street frontage around an open interior - quarry,
 * mountainside, water, or (see the verdict) a street grid `digitise` did not trace. Open ground must
 * be drivable.
 */
const BIG_FACE_AREA = 40000;

/**
 * Depth of the frontage band on a big face, metres, measured inward from the kerb inset.
 *
 * 40 m gives `bw = 40 - 2 * WALK_W = 26 m` of building depth between two 7 m pavements, which is a
 * real downtown floor plate; the usual range is 20-30 m because that is as far as daylight reaches
 * from a street facade. Deeper wastes the drivable interior the band exists to preserve; shallower
 * than 2 * WALK_W + MIN_BLOCK_SIDE - 2 * WALK_W would start failing to fit any block at all.
 */
const RING_DEPTH = 40.0;

/**
 * Build city blocks from a parsed `paradise.json`.
 *
 * @param {object} doc  the parsed graph document
 * @param {object} [opts] overrides for any constant above, for a harness that wants to sweep them
 * @returns {{blocks: Array, faces: Array, stats: object}}
 *   `blocks` is the published `{cx, cz, w, d, bw, bd}` shape plus optional `district`/`faceId`.
 *   `faces` carries the source polygon so a critic can re-derive every block from it.
 *   `stats` carries the area figure at every stage, because silent shrinkage is what that catches.
 */
export function createBlocks(doc, opts = {}) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const shoulder = opts.shoulder ?? SHOULDER;
  const kerbMargin = opts.kerbMargin ?? KERB_MARGIN;
  const walkW = opts.walkW ?? WALK_W;
  const minFaceArea = opts.minFaceArea ?? MIN_FACE_AREA;
  const pitch = opts.pitch ?? FILL_PITCH;
  const minSide = opts.minBlockSide ?? MIN_BLOCK_SIDE;
  const bigFaceArea = opts.bigFaceArea ?? BIG_FACE_AREA;
  const ringDepth = opts.ringDepth ?? RING_DEPTH;
  const doSplit = opts.split !== false;

  // `bw = w - 2 * walkW`, so this is the invariant that keeps the published building line positive.
  // Nothing stated it in round 1; the coupling was real and only guarded by two constants happening
  // to be 20 and 7.
  if (minSide <= 2 * walkW) throw new Error(`minBlockSide (${minSide}) must exceed 2 * walkW (${2 * walkW}) or bw/bd go non-positive`);

  const srcDoc = doc;

  // ---- planarity, and the repair ----------------------------------------------------------------
  // Counted BEFORE anything else, on the ORIGINAL document, because the reported edge ids have to
  // be ids a reader can look up in `paradise.json`. See `findCrossings` and `splitAtCrossings`.
  const tCross0 = now();
  const crossings = findCrossings(srcDoc, new Map(srcDoc.nodes.map((n) => [n.id, n.p])));
  const nCross = crossings.nonAdjacent.length + crossings.sharedNode.length + crossings.selfCrossing.length;
  const split = doSplit && nCross > 0 ? splitAtCrossings(srcDoc, crossings) : null;
  if (split) doc = split.doc;
  const crossMs = now() - tCross0;

  const nodeP = new Map(doc.nodes.map((n) => [n.id, n.p]));

  // ---- half-edges ------------------------------------------------------------------------------
  // Two per edge, laid out so `h ^ 1` is the twin. An edge is a POLYLINE: `pts` carries the full
  // chain including both endpoints, and the reverse half-edge carries it reversed, so a face walk
  // can concatenate `pts` directly and follow the road rather than cutting the chord. Blocks built
  // on chords would sit on top of every curved road in the city, and 804 of the 929 edges curve.
  const H = [];
  doc.edges.forEach((e, ei) => {
    const pts = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    H.push({ id: H.length, edge: ei, from: e.a, to: e.b, pts });
    H.push({ id: H.length, edge: ei, from: e.b, to: e.a, pts: [...pts].reverse() });
  });

  // The sort key is the bearing of the FIRST SEGMENT leaving the node, never the chord to the far
  // endpoint. A road that leaves a junction eastward and then hooks north sits between its
  // neighbours by the direction it actually departs in; sorting it by its chord would order it
  // against roads it never touches and produce a face that is not a loop on the ground.
  for (const h of H) {
    let k = 1;
    while (k < h.pts.length - 1 && h.pts[k][0] === h.pts[0][0] && h.pts[k][1] === h.pts[0][1]) k++;
    h.bearing = Math.atan2(h.pts[k][1] - h.pts[0][1], h.pts[k][0] - h.pts[0][0]);
  }

  const outgoing = new Map();
  for (const h of H) {
    if (!outgoing.has(h.from)) outgoing.set(h.from, []);
    outgoing.get(h.from).push(h.id);
  }
  const slot = new Int32Array(H.length);
  for (const list of outgoing.values()) {
    list.sort((a, b) => H[a].bearing - H[b].bearing);
    list.forEach((hid, i) => { slot[hid] = i; });
  }

  /**
   * The face-traversal successor: cross to the twin, then take the next half-edge CLOCKWISE around
   * the twin's origin. With bearings sorted ascending (counter-clockwise), "next clockwise" is the
   * PREDECESSOR in the list. This is the whole algorithm; everything else is bookkeeping.
   */
  const next = (hid) => {
    const t = hid ^ 1;
    const list = outgoing.get(H[t].from);
    return list[(slot[t] - 1 + list.length) % list.length];
  };

  // ---- walk the faces --------------------------------------------------------------------------
  const used = new Uint8Array(H.length);
  const walks = [];
  for (let s = 0; s < H.length; s++) {
    if (used[s]) continue;
    const walk = [];
    let h = s;
    do {
      if (used[h]) throw new Error(`face traversal revisited half-edge ${h}; the permutation is not a permutation`);
      used[h] = 1;
      walk.push(h);
      h = next(h);
    } while (h !== s);
    walks.push(walk);
  }
  let unusedHalfEdges = 0;
  for (let i = 0; i < H.length; i++) if (!used[i]) unusedHalfEdges++;

  // ---- polygons and winding --------------------------------------------------------------------
  // The polygon takes every point of every half-edge except its last, because that point is the
  // first point of the next half-edge in the walk. The ring therefore closes implicitly and
  // `closed` below is an assertion on that, not a hope.
  const rings = walks.map((walk) => {
    const p = [];
    for (const hid of walk) {
      const pts = H[hid].pts;
      for (let k = 0; k < pts.length - 1; k++) p.push(pts[k]);
    }
    return p;
  });
  const closedFaces = walks.filter((walk, i) => {
    const last = H[walk[walk.length - 1]].pts;
    const end = last[last.length - 1];
    return end[0] === rings[i][0][0] && end[1] === rings[i][0][1];
  }).length;

  const signedArea = (p) => {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
    return a / 2;
  };
  const areas = rings.map(signedArea);

  // THE OUTER FACE. Under a consistent winding exactly one face runs the other way round, and that
  // is the unbounded one - the whole map boundary traversed backwards. It is identified by a
  // NEGATIVE signed area and discarded. If more than one face is negative the embedding is not
  // planar and the faces are fiction, so that count is REPORTED rather than silently dropped;
  // `tools/_mapblocks.mjs` fails the build on it.
  const outer = [];
  for (let i = 0; i < areas.length; i++) if (areas[i] < 0) outer.push(i);

  // ---- the paved corridor, indexed --------------------------------------------------------------
  // EVERY road, not just the face's own boundary, and this is a correction of the obvious design
  // rather than a belt-and-braces addition. Insetting a face only from the edges that bound it
  // leaves 1089 sample points on tarmac, and the mechanism is that road corridors do not respect
  // faces: a 49 m arterial one face away, across a 9 m service road, has a 27.7 m paved half-width
  // that reaches straight over the service road and into this face, which was only ever held back
  // 7.5 m from it. Junction fans do the same thing - five roads off one node have five overlapping
  // corridors and only two of them bound any given wedge.
  //
  // Each segment still carries its OWN road's half-width, which is the per-edge requirement; what
  // changed is the SET of segments consulted, not the distance used.
  const tIdx0 = now();
  const corridor = buildCorridorIndex(doc, nodeP, shoulder + kerbMargin);
  const indexMs = now() - tIdx0;

  // ---- per-face assembly -------------------------------------------------------------------------
  const tFill0 = now();
  const faces = [];
  const blocks = [];
  let droppedTiny = 0, droppedTinyArea = 0, insetArea = 0, blockArea = 0, buildArea = 0;
  let ringFaces = 0, ringInteriorArea = 0;

  for (let i = 0; i < walks.length; i++) {
    if (areas[i] < 0) continue;                       // the outer face
    const ring = rings[i];
    const area = areas[i];
    if (area < minFaceArea) { droppedTiny++; droppedTinyArea += area; continue; }

    const faceId = faces.length;
    const district = majorityDistrict(doc, walks[i], H);
    // A big face gets a frontage RING, not a slab. See BIG_FACE_AREA and RING_DEPTH.
    const big = area >= bigFaceArea;
    const fill = fillFace(ring, corridor, pitch, minSide, big ? ringDepth : 0);
    insetArea += fill.freeArea;
    if (big) ringFaces++, ringInteriorArea += fill.freeArea - fill.fillableArea;

    const faceBlocks = [];
    for (const r of fill.rects) {
      const w = r.w, d = r.d;
      const b = {
        cx: r.cx, cz: r.cz, w, d,
        bw: w - walkW * 2, bd: d - walkW * 2,
        district, faceId,
      };
      blocks.push(b);
      faceBlocks.push(b);
      blockArea += w * d;
      buildArea += Math.max(0, b.bw) * Math.max(0, b.bd);
    }

    faces.push({
      id: faceId,
      big,
      polygon: ring,          // the source polygon, so a critic can re-derive every block below
      area,
      freeArea: fill.freeArea,
      district,
      halfEdges: walks[i].length,
      vertices: ring.length,
      blocks: faceBlocks.length,
      blockArea: faceBlocks.reduce((s, b) => s + b.w * b.d, 0),
    });
  }

  const fillMs = now() - tFill0;

  const interiorArea = areas.filter((a) => a > 0).reduce((s, a) => s + a, 0);
  const outerArea = outer.length ? -areas[outer[0]] : 0;
  const [X0, X1] = doc.extent.x, [Z0, Z1] = doc.extent.z;
  const extentArea = (X1 - X0) * (Z1 - Z0);

  const byDistrict = {};
  for (const d of doc.districts) byDistrict[d.id] = { faces: 0, faceArea: 0, blocks: 0, blockArea: 0 };
  for (const f of faces) {
    const s = byDistrict[f.district] || (byDistrict[f.district] = { faces: 0, faceArea: 0, blocks: 0, blockArea: 0 });
    s.faces++; s.faceArea += f.area; s.blocks += f.blocks; s.blockArea += f.blockArea;
  }

  const sizes = blocks.map((b) => b.w * b.d);

  // ---- the block index, published for `rewire` ---------------------------------------------------
  // `world.blocks` stays a flat array - decision 5 of `tools/WAVE-T-GENERATE-PLAN.md` - so this goes
  // ALONGSIDE it, never instead of it. It exists because of a number the critic put on the record:
  // `physics.js:921-958` is a linear scan over every block, called from `physics.js:1953` inside a
  // `SUBSTEP = 1/240` loop, and it returns on first hit so the common no-contact case is a full
  // scan. Today's `LAYOUT` publishes 36 blocks = 8640 AABB tests/s. This piece publishes far more.
  // `camera.js:251` and `traffic.js:1068` scan the same array again.
  const index = buildBlockIndex(blocks, doc.extent);

  const buildMs = now() - t0;

  // ---- Euler, which is the check round 1 did not have --------------------------------------------
  // `V - E + F = 1 + C` for a planar embedding (the +1 rather than +2 because F here counts the
  // outer face once and C is the number of connected components). This is NOT satisfiable by a
  // broken rotation system the way the signed-area identity is: every crossing left unrepaired
  // merges two faces and drops F by one, and there is nothing the traversal can do to hide it.
  // Measured on the raw document it is -4 with six faces merged; after `splitAtCrossings` it is 2.
  const V = doc.nodes.length, E = doc.edges.length, F = walks.length;
  const components = componentCount(doc);
  const euler = { V, E, F, components, chi: V - E + F, expected: 1 + components };

  return {
    blocks,
    faces,
    index,
    stats: {
      // traversal
      halfEdges: H.length,
      halfEdgesUsed: H.length - unusedHalfEdges,
      unusedHalfEdges,
      facesWalked: walks.length,
      facesClosed: closedFaces,
      outerFaces: outer.length,
      outerArea,
      euler,
      // planarity
      crossingsNonAdjacent: crossings.nonAdjacent.length,
      crossingsSharedNode: crossings.sharedNode.length,
      crossingsSelf: crossings.selfCrossing.length,
      crossings,
      split: split
        ? { applied: true, nodesBefore: srcDoc.nodes.length, nodesAfter: V, edgesBefore: srcDoc.edges.length, edgesAfter: E, inserted: split.inserted, shortestNewEdge: split.splitShortestEdge }
        : { applied: false, nodesBefore: srcDoc.nodes.length, nodesAfter: V, edgesBefore: srcDoc.edges.length, edgesAfter: E, inserted: 0, shortestNewEdge: Infinity },
      // area at every stage
      extentArea,
      interiorArea,
      droppedTiny,
      droppedTinyArea,
      keptFaces: faces.length,
      keptFaceArea: faces.reduce((s, f) => s + f.area, 0),
      insetArea,
      blockArea,
      buildArea,
      // blocks
      blockCount: blocks.length,
      largestBlock: sizes.length ? Math.max(...sizes) : 0,
      smallestBlock: sizes.length ? Math.min(...sizes) : 0,
      byDistrict,
      // big-face frontage rings
      ringFaces,
      ringInteriorArea,
      // constants, published so a harness asserts on the real value and not on a docstring
      params: { shoulder, kerbMargin, walkW, minFaceArea, pitch, minSide, bigFaceArea, ringDepth, split: doSplit },
      buildMs,
      // Split, because a 260 ms total that is 95% raster fill and a 260 ms total that is 95% face
      // traversal want completely different work if this ever needs to be faster.
      timing: { crossMs, indexMs, fillMs, traversalMs: buildMs - crossMs - indexMs - fillMs },
    },
  };
}

/**
 * Majority district for a face, voted by its own bounding edges and WEIGHTED BY LENGTH.
 *
 * Weighted, not counted: a face with one 400 m arterial and three 30 m service stubs belongs to
 * the arterial's district, and a raw headcount would say the opposite. `district` is denormalised
 * onto every edge by `digitise` precisely so nothing downstream has to run point-in-polygon.
 */
function majorityDistrict(doc, walk, H) {
  const w = new Map();
  for (const hid of walk) {
    const e = doc.edges[H[hid].edge];
    const pts = H[hid].pts;
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    w.set(e.district, (w.get(e.district) || 0) + len);
  }
  let best = null, bestW = -1;
  for (const [d, l] of w) if (l > bestW) { bestW = l; best = d; }
  return best;
}

/**
 * Index every road segment into a uniform grid, each carrying its own paved half-width plus the
 * kerb margin. Same structure and the same justification as `game/map/graph.js`: short segments
 * spread evenly over the map is the case a uniform grid is best at.
 *
 * `reach` is precomputed from the WIDEST corridor on the map, so a query knows how many cells out
 * it must look to be sure it has seen every segment that could possibly cover it. Getting that
 * radius from the local segment set instead would miss the one 49.4 m arterial three cells away,
 * which is exactly the class of miss this whole index exists to prevent.
 */
function buildCorridorIndex(doc, nodeP, extra) {
  const CELL = 64;
  const cells = new Map();
  let maxHp = 0;
  for (const e of doc.edges) {
    const hp = e.width / 2 + extra;
    if (hp > maxHp) maxHp = hp;
    const pts = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    for (let k = 1; k < pts.length; k++) {
      const s = [pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], hp];
      const x0 = Math.floor((Math.min(s[0], s[2]) - hp) / CELL), x1 = Math.floor((Math.max(s[0], s[2]) + hp) / CELL);
      const z0 = Math.floor((Math.min(s[1], s[3]) - hp) / CELL), z1 = Math.floor((Math.max(s[1], s[3]) + hp) / CELL);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const k2 = z * 100000 + x;
        let l = cells.get(k2);
        if (!l) { l = []; cells.set(k2, l); }
        l.push(s);
      }
    }
  }
  return { CELL, cells, maxHp };
}

/**
 * Fill one face with axis-aligned rectangles.
 *
 * Two steps, and the first is where the correctness lives.
 *
 * 1. Rasterise a mask on a global grid anchored at the world origin, so blocks in neighbouring
 *    faces line up rather than each face inventing its own phase. A cell is FREE only if its
 *    centre is inside the ring AND its centre clears every road corridor by that road's own paved
 *    half-width plus the cell's half-diagonal. The half-diagonal term is what makes this a proof
 *    rather than a sample: distance-to-a-segment is 1-Lipschitz, so if the centre clears by more
 *    than the half-diagonal then EVERY point of the cell clears, corners included. It also means
 *    the cell cannot straddle a bounding road, so "centre inside the ring" implies all of it is.
 *
 * 2. Pull maximal rectangles out of the mask, largest first, clearing each as it is taken. Largest
 *    first is deliberate: the brief asks for a small number of large rectangles, and an uncovered
 *    concave corner is empty ground while a rectangle spilling over a kerb is a building in the
 *    road. This fill under-covers and never over-covers, by construction.
 */
function fillFace(ring, corridor, pitch, minSide, band) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
  }
  const gx0 = Math.floor(minX / pitch), gx1 = Math.ceil(maxX / pitch);
  const gz0 = Math.floor(minZ / pitch), gz1 = Math.ceil(maxZ / pitch);
  const W = gx1 - gx0, D = gz1 - gz0;
  if (W <= 0 || D <= 0) return { rects: [], freeArea: 0, fillableArea: 0 };

  const half = pitch * Math.SQRT1_2;   // half-diagonal of a cell; the Lipschitz slack, see above
  const reach = Math.ceil((corridor.maxHp + half) / corridor.CELL);
  // For a big face only: the same corridor test with every road fattened by `band`. A cell that
  // clears the real corridor but NOT the fattened one is within `band` metres of the kerb inset,
  // which is exactly the street-frontage ring. Correctness lives in the FIRST test - this second
  // one only decides how deep the frontage runs, so it needs no Lipschitz slack.
  const bandReach = band > 0 ? Math.ceil((corridor.maxHp + band + half) / corridor.CELL) : 0;

  const free = new Uint8Array(W * D);
  let freeCells = 0, bandCells = 0;
  for (let j = 0; j < D; j++) {
    const z = (gz0 + j + 0.5) * pitch;
    for (let i = 0; i < W; i++) {
      const x = (gx0 + i + 0.5) * pitch;
      // Clearance first, ring second: the clearance test touches a couple of dozen segments and
      // rejects most cells near a road, while the ring test is O(vertices) and the biggest face
      // has 200 of them.
      if (!clears(x, z, half, corridor, reach)) continue;
      if (!pointInRing(ring, x, z)) continue;
      freeCells++;
      if (band > 0 && clears(x, z, half + band, corridor, bandReach)) continue;   // deep interior
      free[j * W + i] = 1;
      bandCells++;
    }
  }

  const minCells = Math.ceil(minSide / pitch);
  const rects = [];
  for (;;) {
    const r = largestRect(free, W, D, minCells);
    if (!r) break;
    for (let j = r.j0; j < r.j0 + r.h; j++) for (let i = r.i0; i < r.i0 + r.w; i++) free[j * W + i] = 0;
    rects.push({
      cx: (gx0 + r.i0 + r.w / 2) * pitch,
      cz: (gz0 + r.j0 + r.h / 2) * pitch,
      w: r.w * pitch,
      d: r.h * pitch,
    });
  }
  return { rects, freeArea: freeCells * pitch * pitch, fillableArea: bandCells * pitch * pitch };
}

/** Does (x, z) clear every road corridor by that road's own half-width plus `half`? */
function clears(x, z, half, corridor, reach) {
  const cx = Math.floor(x / corridor.CELL), cz = Math.floor(z / corridor.CELL);
  for (let gz = cz - reach; gz <= cz + reach; gz++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      const list = corridor.cells.get(gz * 100000 + gx);
      if (!list) continue;
      for (const s of list) {
        const need = s[4] + half;
        if (d2seg(s[0], s[1], s[2], s[3], x, z) < need * need) return false;
      }
    }
  }
  return true;
}

/** Squared distance from (x, z) to the segment (ax,az)-(bx,bz). */
function d2seg(ax, az, bx, bz, x, z) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = x - (ax + dx * t), ez = z - (az + dz * t);
  return ex * ex + ez * ez;
}

/** Even-odd ray cast. The ring is closed implicitly, so `j` wraps to the last vertex. */
function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const zi = ring[i][1], zj = ring[j][1];
    if ((zi > z) !== (zj > z)) {
      const xi = ring[i][0], xj = ring[j][0];
      if (x < xi + (xj - xi) * (z - zi) / (zj - zi)) inside = !inside;
    }
  }
  return inside;
}

/**
 * Largest all-free axis-aligned rectangle in a boolean mask, at least `minCells` on each side.
 *
 * Classic largest-rectangle-in-histogram, run once per row over the running column heights: O(W*D)
 * for the whole mask, which matters because the fill loop calls it once per emitted rectangle.
 */
function largestRect(free, W, D, minCells) {
  const heights = new Int32Array(W);
  let best = null, bestArea = 0;
  const stackI = new Int32Array(W + 1), stackH = new Int32Array(W + 1);
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) heights[i] = free[j * W + i] ? heights[i] + 1 : 0;
    let sp = 0;
    for (let i = 0; i <= W; i++) {
      const h = i < W ? heights[i] : 0;
      let startI = i;
      while (sp > 0 && stackH[sp - 1] > h) {
        sp--;
        const hh = stackH[sp], ii = stackI[sp];
        const w = i - ii;
        if (w >= minCells && hh >= minCells && w * hh > bestArea) {
          bestArea = w * hh;
          best = { i0: ii, j0: j - hh + 1, w, h: hh };
        }
        startI = ii;
      }
      if (h > 0) { stackI[sp] = startI; stackH[sp] = h; sp++; }
    }
  }
  return best;
}

/**
 * Segment-segment crossings, in three categories, each recording WHERE on each polyline it happens
 * so `splitAtCrossings` below can repair it.
 *
 * A proper crossing only - collinear overlap and touching endpoints are excluded, because those
 * are how a polyline legitimately meets itself at a junction. Broad-phased on the same 64 m grid
 * pitch `graph.js` uses, for the same reason: 2373 segments is 2.8 M pairs brute force.
 *
 * `selfCrossing` was a hole in round 1: the scan skipped every pair on the same edge, so a polyline
 * that folded back through itself was invisible. Measured on the shipped graph it is 0, which is
 * why it cost nothing, but "it happens to be zero" is not the same as "it is checked", and the
 * critic was right to name it.
 */
function findCrossings(doc, nodeP) {
  const segs = [];
  doc.edges.forEach((e, ei) => {
    const pts = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    for (let k = 1; k < pts.length; k++) segs.push({ a: pts[k - 1], b: pts[k], e: ei, na: e.a, nb: e.b, k });
  });
  const CELL = 64;
  const grid = new Map();
  segs.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / CELL), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / CELL);
    const z0 = Math.floor(Math.min(s.a[1], s.b[1]) / CELL), z1 = Math.floor(Math.max(s.a[1], s.b[1]) / CELL);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = `${x},${z}`;
      let list = grid.get(k);
      if (!list) { list = []; grid.set(k, list); }
      list.push(i);
    }
  });
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const seen = new Set();
  const nonAdjacent = [], sharedNode = [], selfCrossing = [];
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = Math.min(list[i], list[j]), B = Math.max(list[i], list[j]);
      const k = A * 100000 + B;
      if (seen.has(k)) continue;
      seen.add(k);
      const s = segs[A], t = segs[B];
      // Consecutive segments of one polyline share an endpoint and can never PROPERLY cross, so
      // skipping only the adjacent pair - rather than the whole edge, as round 1 did - leaves the
      // self-crossing case visible.
      const sameEdge = s.e === t.e;
      if (sameEdge && Math.abs(s.k - t.k) <= 1) continue;
      const d1 = cr(s.a, s.b, t.a), d2 = cr(s.a, s.b, t.b);
      const d3 = cr(t.a, t.b, s.a), d4 = cr(t.a, t.b, s.b);
      if (!(((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))) continue;
      // Parameter along each segment, for the split. `tt` walks t, `ss` walks s: d3 and d4 are the
      // orientations of s's endpoints about t, so d3/(d3-d4) is the crossing's parameter along s.
      const tt = d1 / (d1 - d2), ss = d3 / (d3 - d4);
      const at = {
        edges: [s.e, t.e],
        segK: [s.k, t.k],
        t: [ss, tt],
        x: t.a[0] + (t.b[0] - t.a[0]) * tt,
        z: t.a[1] + (t.b[1] - t.a[1]) * tt,
      };
      if (sameEdge) selfCrossing.push(at);
      else if (s.na === t.na || s.na === t.nb || s.nb === t.na || s.nb === t.nb) sharedNode.push(at);
      else nonAdjacent.push(at);
    }
  }
  return { nonAdjacent, sharedNode, selfCrossing };
}

/**
 * Insert a node at every crossing, in a COPY of the document, so the embedding becomes planar.
 *
 * This is round 2's correction, and the reasoning is worth keeping because round 1 got half of it
 * right. The four shared-node crossings do not move a single block - the critic proved the block
 * set is identical either way, and so does `--no-split` here - so round 1's decision not to disturb
 * them was correct ABOUT THE BLOCKS. It was wrong about the TRAVERSAL: an embedding with crossings
 * is not planar, its face walk merges faces across every crossing, and `V - E + F` came out at -4
 * instead of 2 with six faces silently welded into three. `generate-mesh` is going to build
 * frontages and signage per face and would have been handed three objects where the city has six.
 *
 * The repair is local and it is done HERE, in memory, never in `paradise.json`: this piece is
 * forbidden to touch that file, the edge ids in it are published, and `queries` already ships
 * against them. So `doc` is deep-copied, a node goes in at each crossing point, and both crossing
 * edges are split there. Reported crossings keep the ORIGINAL edge ids so the table in the verdict
 * stays a work list for whoever does eventually rebuild the graph.
 */
function splitAtCrossings(doc, crossings) {
  const cuts = new Map();
  const nodes = doc.nodes.map((n) => ({ ...n, p: [n.p[0], n.p[1]] }));
  let nextId = nodes.reduce((m, n) => Math.max(m, n.id), -1) + 1;
  const all = [...crossings.nonAdjacent, ...crossings.sharedNode, ...crossings.selfCrossing];
  for (const c of all) {
    const id = nextId++;
    nodes.push({ id, p: [c.x, c.z], y: 0, deadEnd: false });
    for (let s = 0; s < 2; s++) {
      const ei = c.edges[s];
      let l = cuts.get(ei);
      if (!l) { l = []; cuts.set(ei, l); }
      l.push({ k: c.segK[s], t: c.t[s], node: id });
    }
  }
  const nodeP = new Map(doc.nodes.map((n) => [n.id, n.p]));
  const edges = [];
  let shortest = Infinity;
  doc.edges.forEach((e, ei) => {
    const base = { lanes: e.lanes, width: e.width, oneWay: e.oneWay, class: e.class, elevationClass: e.elevationClass, district: e.district };
    const list = cuts.get(ei);
    if (!list) {
      edges.push({ id: edges.length, a: e.a, b: e.b, ...base, shape: e.shape.map((p) => [p[0], p[1]]) });
      return;
    }
    const pts = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    const aug = pts.map((p, i) => ({ p: [p[0], p[1]], node: i === 0 ? e.a : i === pts.length - 1 ? e.b : null }));
    // Descending, so an earlier splice cannot shift the index of a later one, and so two cuts on
    // the same segment end up in increasing-t order after both inserts at the same index.
    list.sort((a, b) => (b.k - a.k) || (b.t - a.t));
    for (const c of list) {
      const p0 = pts[c.k - 1], p1 = pts[c.k];
      aug.splice(c.k, 0, { p: [p0[0] + (p1[0] - p0[0]) * c.t, p0[1] + (p1[1] - p0[1]) * c.t], node: c.node });
    }
    let start = 0;
    for (let i = 1; i < aug.length; i++) {
      if (aug[i].node == null) continue;
      let len = 0;
      for (let k = start + 1; k <= i; k++) len += Math.hypot(aug[k].p[0] - aug[k - 1].p[0], aug[k].p[1] - aug[k - 1].p[1]);
      if (len < shortest) shortest = len;
      edges.push({ id: edges.length, a: aug[start].node, b: aug[i].node, ...base, shape: aug.slice(start + 1, i).map((x) => x.p) });
      start = i;
    }
  });
  return { doc: { ...doc, nodes, edges }, splitShortestEdge: all.length ? shortest : Infinity, inserted: all.length };
}

/**
 * A uniform-grid index over the block AABBs, published on the result as `index`.
 *
 * `rewire` is the consumer and the reason is arithmetic, not taste. `game/physics.js:921-958`
 * `collide(h)` is `for (const b of blocks)` with no index, driven from `physics.js:1953` inside the
 * `SUBSTEP = 1/240` substep loop; `game/camera.js:251` scans the same array per frame and
 * `game/traffic.js:1068` scans it per wrecked vehicle. The flat array stays exactly as it is -
 * decision 5 of the plan makes `world.blocks`' shape a contract - so this is additive, and a
 * consumer that ignores it behaves exactly as it does today.
 *
 * 128 m cells rather than `graph.js`'s 64 m: blocks are much larger objects than road segments, and
 * at 64 m a 352 m frontage strip would be registered in 18 cells. 128 m keeps the mean occupancy
 * near one while a query still only ever reads a 2x2 neighbourhood for a car-sized probe.
 */
function buildBlockIndex(blocks, extent) {
  const CELL = 128;
  const [X0] = extent.x, [Z0] = extent.z;
  const cells = new Map();
  const key = (cx, cz) => cz * 100000 + cx;
  const cellOf = (x, z) => [Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL)];
  blocks.forEach((b, i) => {
    const [x0, z0] = cellOf(b.cx - b.w / 2, b.cz - b.d / 2);
    const [x1, z1] = cellOf(b.cx + b.w / 2, b.cz + b.d / 2);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = key(cx, cz);
      let l = cells.get(k);
      if (!l) { l = []; cells.set(k, l); }
      l.push(i);
    }
  });
  let entries = 0;
  for (const l of cells.values()) entries += l.length;

  // Mark-and-sweep dedup state. A block spanning several cells is registered in each of them, so a
  // multi-cell query MUST be able to say "I have already seen this one". Round 2 shipped without
  // this and returned the same block up to seven times at `pad = 1.0`, which is the pad
  // `physics.js:922` uses: `traffic.js:1068` bounces per hit with no early return, so a duplicate
  // is a doubled impulse on a wrecked car.
  //
  // A generation counter rather than a `Set` per call, because the intended caller runs this at
  // `SUBSTEP = 1/240` per car: `seen[i] === gen` is one typed-array compare, and allocating a Set
  // 240 times a second per consumer is exactly the garbage a streaming world does not need.
  //
  // `seen` is an Int32Array, so `gen` must stay inside int32 or a stored value would truncate and
  // alias a stale mark onto a live one. 2^31 queries is ~100 days at 240 Hz, which is long enough
  // that it would never be reproduced and short enough that it is not impossible; the wrap is
  // handled rather than argued away.
  const seen = new Int32Array(blocks.length);
  let gen = 0;

  /**
   * Indices of every block whose AABB, grown by `pad`, contains (x, z). Each block AT MOST ONCE.
   *
   * Allocation-free per call except the result array, which is empty in the common case.
   */
  function at(x, z, pad = 0) {
    const [cx, cz] = cellOf(x, z);
    const out = [];
    // A pad wider than a cell would need a wider sweep; `reach` keeps that honest rather than
    // silently missing a block when a future caller passes a large pad.
    const reach = Math.max(0, Math.ceil(pad / CELL));
    if (reach === 0) {
      // One cell, so a block cannot be reached twice and the dedup bookkeeping is pure cost.
      const l = cells.get(key(cx, cz));
      if (l) for (const i of l) {
        const b = blocks[i];
        if (Math.abs(x - b.cx) < b.w / 2 + pad && Math.abs(z - b.cz) < b.d / 2 + pad) out.push(i);
      }
      return out;
    }
    if (++gen === 0x7fffffff) { seen.fill(0); gen = 1; }
    for (let gz = cz - reach; gz <= cz + reach; gz++) for (let gx = cx - reach; gx <= cx + reach; gx++) {
      const l = cells.get(key(gx, gz));
      if (!l) continue;
      for (const i of l) {
        if (seen[i] === gen) continue;   // already considered this block from another cell
        seen[i] = gen;
        const b = blocks[i];
        if (Math.abs(x - b.cx) < b.w / 2 + pad && Math.abs(z - b.cz) < b.d / 2 + pad) out.push(i);
      }
    }
    return out;
  }

  return {
    cell: CELL,
    cells,
    at,
    stats: { cells: cells.size, entries, meanPerCell: cells.size ? entries / cells.size : 0 },
  };
}

/** Undirected connected components, for the Euler check. Union-find over the edge list. */
function componentCount(doc) {
  const parent = new Map(doc.nodes.map((n) => [n.id, n.id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  for (const e of doc.edges) {
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const roots = new Set();
  for (const n of doc.nodes) roots.add(find(n.id));
  return roots.size;
}

/** Fetch and build. Browser path; a node harness passes a parsed doc to `createBlocks`. */
export async function loadBlocks(url = './map/paradise.json', opts) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`city blocks ${url}: ${res.status}`);
  return createBlocks(await res.json(), opts);
}
