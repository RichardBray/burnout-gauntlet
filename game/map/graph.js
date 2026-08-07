// The road graph, and the spatial index every other system will ask questions of. Wave T,
// `queries`.
//
// This is the piece the map brief calls the canary. `world.js` today answers "what surface is the
// car on?" with two loops over twelve numbers in `LAYOUT`; every other road-aware system in the
// tree - traffic lanes, parked ranks, signal queues, physics blocks, the minimap, spawn points -
// reads that same literal. Replacing it with 929 curved edges means the cheap comparison becomes a
// nearest-segment search, and if that search is not cheap enough to run per wheel per frame then
// the index is wrong and every consumer inherits the mistake. So the index comes first, and
// `surfaceAt` is what proves it.
//
// No three.js import, deliberately: this is data and arithmetic, it runs in node under a harness
// as happily as in the browser, and nothing here should ever need a renderer.

/** Metres of paved shoulder beyond an edge's own half-width, out to the kerb face. */
const SHOULDER = 3.0;

/**
 * Build a queryable road graph from a parsed `paradise.json`.
 *
 * The index is a uniform grid of segment lists. A uniform grid rather than an R-tree or a BVH
 * because the input is a ROAD NETWORK: segments are short, similar in length, and spread fairly
 * evenly over the map, which is the case a uniform grid is best at and the case where a tree's
 * extra indirection buys nothing. 2373 segments over 4000 x 2861 m at a 64 m cell is ~2800 cells
 * averaging under one segment each.
 */
export function createRoadGraph(doc) {
  const nodeP = new Map(doc.nodes.map((n) => [n.id, n.p]));

  // ---- flatten to segments -------------------------------------------------------------------
  // Typed arrays, not objects. Every query touches a handful of segments and does the same four
  // multiplies on each; an array of objects would chase a pointer per segment for no reason.
  const ax = [], az = [], bx = [], bz = [], halfPaved = [], edgeOf = [];
  doc.edges.forEach((e, ei) => {
    const pts = [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];
    const hp = e.width / 2 + SHOULDER;
    for (let k = 1; k < pts.length; k++) {
      ax.push(pts[k - 1][0]); az.push(pts[k - 1][1]);
      bx.push(pts[k][0]); bz.push(pts[k][1]);
      halfPaved.push(hp);
      edgeOf.push(ei);
    }
  });
  const S = {
    ax: Float32Array.from(ax), az: Float32Array.from(az),
    bx: Float32Array.from(bx), bz: Float32Array.from(bz),
    hp: Float32Array.from(halfPaved),
    edge: Int32Array.from(edgeOf),
    n: ax.length,
  };

  // ---- uniform grid --------------------------------------------------------------------------
  const CELL = 64;
  const [x0, x1] = doc.extent.x, [z0, z1] = doc.extent.z;
  const gw = Math.ceil((x1 - x0) / CELL) + 1;
  const gh = Math.ceil((z1 - z0) / CELL) + 1;
  const cellOf = (x, z) => {
    const cx = Math.min(gw - 1, Math.max(0, Math.floor((x - x0) / CELL)));
    const cz = Math.min(gh - 1, Math.max(0, Math.floor((z - z0) / CELL)));
    return cz * gw + cx;
  };

  // Counting sort into a CSR layout: `start[c]..start[c+1]` indexes `items`. One pass to count,
  // one to fill. No per-cell array allocation, which matters because this runs at chunk-load time
  // and a few thousand small arrays is exactly the garbage a streaming world does not need.
  const counts = new Int32Array(gw * gh + 1);
  const touch = (i, fn) => {
    // A segment is registered in every cell its bounding box covers, widened by its own paved
    // half-width so a query inside the tarmac always finds it in its own cell.
    const pad = S.hp[i];
    const lo = cellCoords(Math.min(S.ax[i], S.bx[i]) - pad, Math.min(S.az[i], S.bz[i]) - pad);
    const hi = cellCoords(Math.max(S.ax[i], S.bx[i]) + pad, Math.max(S.az[i], S.bz[i]) + pad);
    for (let cz = lo.cz; cz <= hi.cz; cz++) for (let cx = lo.cx; cx <= hi.cx; cx++) fn(cz * gw + cx);
  };
  function cellCoords(x, z) {
    return {
      cx: Math.min(gw - 1, Math.max(0, Math.floor((x - x0) / CELL))),
      cz: Math.min(gh - 1, Math.max(0, Math.floor((z - z0) / CELL))),
    };
  }
  for (let i = 0; i < S.n; i++) touch(i, (c) => { counts[c + 1]++; });
  for (let c = 0; c < gw * gh; c++) counts[c + 1] += counts[c];
  const start = counts;
  const items = new Int32Array(start[gw * gh]);
  const cursor = Int32Array.from(start.subarray(0, gw * gh));
  for (let i = 0; i < S.n; i++) touch(i, (c) => { items[cursor[c]++] = i; });

  /** Squared distance from (x, z) to segment i, and the parameter t along it. */
  function d2seg(i, x, z) {
    const dx = S.bx[i] - S.ax[i], dz = S.bz[i] - S.az[i];
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - S.ax[i]) * dx + (z - S.az[i]) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = S.ax[i] + dx * t, pz = S.az[i] + dz * t;
    const ex = x - px, ez = z - pz;
    return { d2: ex * ex + ez * ez, t, px, pz };
  }

  /**
   * Nearest road centreline to a point.
   *
   * Searches the point's own cell first, then expanding rings, and stops as soon as the best hit
   * so far is closer than the nearest possible point in the next ring. That early-out is what
   * makes this constant-time in practice rather than proportional to the search radius: on a road
   * it returns after one ring.
   *
   * @returns {{dist, edge, t, x, z}|null} null only if nothing is within `maxDist`.
   */
  function nearest(x, z, maxDist = 400) {
    const { cx, cz } = cellCoords(x, z);
    let best = null, bestD2 = maxDist * maxDist;
    const maxRing = Math.ceil(maxDist / CELL);
    for (let r = 0; r <= maxRing; r++) {
      // Nothing in ring r can be closer than (r-1) cells away, so once the best hit beats that
      // bound no further ring can improve it.
      if (best && (r - 1) * CELL > 0 && bestD2 < ((r - 1) * CELL) ** 2) break;
      const zLo = cz - r, zHi = cz + r, xLo = cx - r, xHi = cx + r;
      for (let gz = zLo; gz <= zHi; gz++) {
        if (gz < 0 || gz >= gh) continue;
        // Only the ring, not the filled square: the interior was covered by earlier rings. On the
        // top and bottom rows that means every column; on the rows between, just the two ends.
        const onZEdge = gz === zLo || gz === zHi;
        for (let gx = xLo; gx <= xHi; gx++) {
          if (!onZEdge && gx !== xLo && gx !== xHi) continue;
          if (gx < 0 || gx >= gw) continue;
          const c = gz * gw + gx;
          for (let k = start[c]; k < start[c + 1]; k++) {
            const i = items[k];
            const h = d2seg(i, x, z);
            if (h.d2 < bestD2) { bestD2 = h.d2; best = { dist: 0, edge: S.edge[i], t: h.t, x: h.px, z: h.pz, seg: i }; }
          }
        }
      }
    }
    if (!best) return null;
    best.dist = Math.sqrt(bestD2);
    return best;
  }

  /**
   * @returns {'tarmac'|'dirt'} the surface class at a world position.
   *
   * Same two classes and the same meaning as `world.js`'s `LAYOUT` version this replaces: PAVED is
   * wider than the painted road, running out to the kerb face, so clipping a kerb or cutting a
   * junction is still tarmac. Here that is the edge's own `width/2` plus a shoulder, which means
   * a motorway's paved corridor is correctly wider than a service road's rather than every road
   * sharing one hardcoded 13 m.
   *
   * More classes arrive with terrain, exactly as the T4 docstring says: this returns the key and
   * every caller already switches on it, so `physics.js` needs no edit when 'grass' appears.
   */
  function surfaceAt(x, z) {
    const { cx, cz } = cellCoords(x, z);
    // One cell plus its neighbours is enough: every segment is registered in each cell its
    // width-padded bounding box touches, so any road whose tarmac covers this point is in this
    // cell already. The ring is belt and braces for a point exactly on a cell seam.
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      if (gz < 0 || gz >= gh) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= gw) continue;
        const c = gz * gw + gx;
        for (let k = start[c]; k < start[c + 1]; k++) {
          const i = items[k];
          const hp = S.hp[i];
          if (d2seg(i, x, z).d2 <= hp * hp) return 'tarmac';
        }
      }
    }
    return 'dirt';
  }

  return {
    doc,
    surfaceAt,
    nearest,
    /** Diagnostics a harness can assert on, so "the index was built" is checkable, not assumed. */
    stats: {
      segments: S.n,
      cells: gw * gh,
      cell: CELL,
      entries: items.length,
      meanPerCell: items.length / (gw * gh),
      bytes: (S.ax.byteLength * 4) + S.hp.byteLength + S.edge.byteLength + items.byteLength + start.byteLength,
    },
  };
}

/** Fetch and build. Browser path; a node harness passes a parsed doc to `createRoadGraph`. */
export async function loadRoadGraph(url = './map/paradise.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`road graph ${url}: ${res.status}`);
  return createRoadGraph(await res.json());
}
