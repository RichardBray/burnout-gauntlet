// Trace a road GRAPH out of a reference map image. Wave T, the `digitise` piece.
//
// Input is `_mapdump.mjs` output; output is a node/edge graph in IMAGE PIXEL space, which
// `_mapgraph.mjs` then converts to metres and dresses with classes and districts.
//
// WHY A TRACER AND NOT HAND-AUTHORED COORDINATES. Paradise City is mostly curves. A graph typed
// out by eye would be a few hundred straight segments and would read as the orthogonal grid this
// task exists to replace - `world.js`'s LAYOUT is twelve numbers and looks it. The pixels already
// hold the real curve geometry, so the honest move is to take it from them.
//
// EVERY STAGE DUMPS A PREVIEW, and that is not a convenience. This repo's recurring failure is a
// metric that passes without the thing it claims to measure (STATE.md permanent rule 3), and a
// road graph is a perfect host for it: a skeleton of building outlines and car parks validates as
// beautifully connected while being undrivable nonsense. The stage previews are the render-side
// assert. Look at them.
//
//   node tools/_maptrace.mjs <rgba-prefix> --out <graph.json> [--preview <dir>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const prefix = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const OUT = arg('--out');
const PREV = arg('--preview');
if (!prefix || !OUT) {
  console.error('usage: node tools/_maptrace.mjs <rgba-prefix> --out <graph.json> [--preview <dir>]');
  process.exit(2);
}

const { w, h } = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const px = readFileSync(`${prefix}.rgba`);
const N = w * h;
const idx = (x, y) => y * w + x;

if (PREV) mkdirSync(PREV, { recursive: true });

/** Dump a boolean mask as a black/white RGBA blob for `_mappng.mjs`. */
function preview(name, mask, tint) {
  if (!PREV) return;
  const o = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const on = mask[i];
    o[i * 4] = on ? (tint ? tint[0] : 255) : 0;
    o[i * 4 + 1] = on ? (tint ? tint[1] : 255) : 0;
    o[i * 4 + 2] = on ? (tint ? tint[2] : 255) : 0;
    o[i * 4 + 3] = 255;
  }
  writeFileSync(`${PREV}/${name}.rgba`, o);
  writeFileSync(`${PREV}/${name}.json`, JSON.stringify({ w, h }));
}

const count = (m) => { let n = 0; for (let i = 0; i < N; i++) if (m[i]) n++; return n; };
const say = (stage, m, note = '') =>
  console.log(`${stage.padEnd(14)} ${count(m).toString().padStart(8)} px  ${(count(m) / N * 100).toFixed(2)}%  ${note}`);

// ---- STAGE 1: the road mask -------------------------------------------------------------------
// Roads on this map are bright and desaturated against green terrain, teal water and brown rock.
// Thresholds were swept and looked at; they are not a first guess.
// TWO CLAUSES, AND THE SECOND ONE IS NOT OPTIONAL. Surface streets are bright and desaturated.
// The MOTORWAY IS NOT: it is drawn as a gold ribbon whose saturation runs well past any threshold
// that keeps terrain out, so a brightness-and-greyness rule alone misses it entirely. The first
// version of this file did exactly that, and the result looked fine - the network traced, the
// validator would have passed - while the single most important road on the map was absent and
// every edge came back classified `street`. It was only visible by cropping the overlay and
// looking at the gold ribbon with no line on it.
const LUM_MIN = 90, SAT_MAX = 70;
const GOLD_RB = 18, GOLD_MIN = 75;
const road = new Uint8Array(N);
const sat = new Uint8Array(N), lum = new Uint8Array(N);
let goldPx = 0;
for (let i = 0; i < N; i++) {
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  lum[i] = (mx + mn) >> 1;
  sat[i] = mx === 0 ? 0 : Math.round((mx - mn) / mx * 255);
  const grey = lum[i] >= LUM_MIN && sat[i] <= SAT_MAX;
  const gold = r - b > GOLD_RB && mx > GOLD_MIN;
  if (gold && !grey) goldPx++;
  road[i] = grey || gold ? 1 : 0;
}
say('mask', road, `lum>=${LUM_MIN} sat<=${SAT_MAX}, plus ${goldPx} gold px the grey rule misses`);
preview('01-mask', road);

// ---- STAGE 2: delete the event pins -----------------------------------------------------------
// The overlay drops filled discs on top of the roads. Their white ring and white letter land
// squarely inside the road mask, so left alone they become blobs and then spurious junctions.
//
// They are found by SHAPE, not just by colour, because the motorway on this map is gold and is
// also strongly saturated - a colour-only rule would delete the motorway. A pin is a small,
// compact, high-fill disc; a motorway is a long thin ribbon. The bbox and fill-ratio test is what
// separates them, and the pin count it reports is the check that it did.
const strong = new Uint8Array(N);
for (let i = 0; i < N; i++) strong[i] = sat[i] > 95 && lum[i] > 35 && lum[i] < 210 ? 1 : 0;

const PIN_MAX = 46;      // px, generous against the ~30 px discs
const PIN_FILL = 0.45;   // a disc fills ~0.79 of its bbox; a road fragment fills far less
const pinSeed = new Uint8Array(N);
let pins = 0;
{
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!strong[s] || seen[s]) continue;
    let sp = 0, n = 0;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    const cell = [];
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const p = stack[--sp];
      cell.push(p); n++;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = idx(nx, ny);
        if (strong[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw > PIN_MAX || bh > PIN_MAX || n < 120) continue;
    if (n / (bw * bh) < PIN_FILL) continue;
    if (Math.min(bw, bh) / Math.max(bw, bh) < 0.6) continue;   // discs are round
    pins++;
    for (const p of cell) pinSeed[p] = 1;
  }
}
// Grow the seed out over the ring and the letter, which are OUTSIDE the saturated fill.
const dilate = (src, r) => {
  let cur = src;
  for (let pass = 0; pass < r; pass++) {
    const nxt = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (cur[i]) { nxt[i] = 1; continue; }
      if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) ||
          (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) nxt[i] = 1;
    }
    cur = nxt;
  }
  return cur;
};
const erode = (src, r) => {
  let cur = src;
  for (let pass = 0; pass < r; pass++) {
    const nxt = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (!cur[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      if (cur[i - 1] && cur[i + 1] && cur[i - w] && cur[i + w]) nxt[i] = 1;
    }
    cur = nxt;
  }
  return cur;
};

const pinMask = dilate(pinSeed, 4);
for (let i = 0; i < N; i++) if (pinMask[i]) road[i] = 0;
say('pins-cut', road, `${pins} pins removed`);
preview('02-pins', road);

// ---- STAGE 3: bridge the holes the pins left --------------------------------------------------
// A pin sits ON a road, so cutting it out severs that road. THE FIRST VERSION OF THIS FILE LEFT
// THE HOLES AND TRIED TO SPAN THEM WITH A CLOSING, and the component table said exactly what that
// was worth: 2088 components with the largest at 13724 px, i.e. no network at all. A closing wide
// enough to span a 40 px hole also fuses roads that merely run near each other, which is worse
// than the disease.
//
// So the road is reconstructed instead of guessed at. Each removed pin is a disc; the road it
// covered enters and leaves it. Sample a ring just outside the hole, cluster the road pixels on
// that ring by angle, and rejoin the clusters through the centre. Two clusters is the normal case
// (a road passing under a pin); one is a pin at a dead end and correctly bridges nothing.
{
  let bridged = 0;
  const centres = [];
  {
    const seen = new Uint8Array(N);
    const stack = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (!pinMask[s] || seen[s]) continue;
      let sp = 0, n = 0, sx = 0, sy = 0;
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p / w) | 0;
        n++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = idx(nx, ny);
          if (pinMask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
        }
      }
      centres.push({ cx: sx / n, cy: sy / n, r: Math.max(x1 - x0, y1 - y0) / 2 });
    }
  }

  const line = (ax, ay, bx, by) => {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(ax + (bx - ax) * k / steps), y = Math.round(ay + (by - ay) * k / steps);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) road[idx(nx, ny)] = 1;
      }
    }
  };

  for (const { cx, cy, r } of centres) {
    const ring = r + 3;
    const hits = [];
    const STEPS = 360;
    for (let k = 0; k < STEPS; k++) {
      const th = k / STEPS * Math.PI * 2;
      const x = Math.round(cx + Math.cos(th) * ring), y = Math.round(cy + Math.sin(th) * ring);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      hits.push(road[idx(x, y)] ? { th, x, y } : null);
    }
    // Cluster the angular runs of road, wrapping at 2*PI.
    const groups = [];
    let run = [];
    for (let k = 0; k < hits.length * 2; k++) {
      const hit = hits[k % hits.length];
      if (hit) { if (k < hits.length || run.length) run.push(hit); }
      else if (run.length) { groups.push(run); run = []; }
      if (k >= hits.length && !run.length) break;
    }
    if (run.length) groups.push(run);
    const pts = groups.map((g) => ({
      x: g.reduce((s, p) => s + p.x, 0) / g.length,
      y: g.reduce((s, p) => s + p.y, 0) / g.length,
    }));
    if (pts.length < 2) continue;
    // Rejoin every stub through the centre: a pin on a junction has more than two.
    for (const p of pts) line(p.x, p.y, cx, cy);
    bridged++;
  }
  say('bridged', road, `${bridged} of ${centres.length} pin holes rejoined`);
  preview('03-bridged', road);
}

// ---- STAGE 4: despeckle -----------------------------------------------------------------------
// Rock faces, surf and building roofs are bright and desaturated too, and arrive as speckle. An
// opening removes anything thinner than a road; roads survive because they are ribbons several
// pixels wide.
let clean = dilate(erode(road, 1), 1);
say('opened', clean);
preview('04-opened', clean);

// ---- STAGE 5: keep the network ----------------------------------------------------------------
// The road network is one enormous connected component. Everything that survived the opening but
// is not attached to it is terrain. This is the stage that does the real cleaning, so its
// component table is printed: if the largest component is not overwhelmingly the biggest, the
// mask is wrong and nothing downstream is worth running. That check has already earned its keep
// once - see stage 3.
const MIN_COMPONENT = 4000;
{
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const sizes = [];
  const keep = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!clean[s] || seen[s]) continue;
    let sp = 0, n = 0;
    const cell = [];
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const p = stack[--sp];
      cell.push(p); n++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = idx(nx, ny);
        if (clean[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    sizes.push(n);
    if (n >= MIN_COMPONENT) for (const p of cell) keep[p] = 1;
  }
  sizes.sort((a, b) => b - a);
  console.log(`components     ${sizes.length}, largest: ${sizes.slice(0, 6).join(', ')}`);
  clean = keep;
}
say('components', clean, `kept >= ${MIN_COMPONENT} px`);
preview('05-components', clean);

// ---- STAGE 6: close remaining small gaps ----------------------------------------------------
// Stage 3 already rejoined the pin holes, so this is only sealing pinholes in the mask itself.
// KEEP THE RADIUS SMALL. At r=6 it welded roads that merely run near each other into blobs, and a
// blob thins into a little web rather than a line: the skeleton came back branching every 7.7 m,
// which made every downstream cleanup either useless or destructive.
const CLOSE = 2;
clean = erode(dilate(clean, CLOSE), CLOSE);
say('closed', clean, `r=${CLOSE}`);
preview('06-closed', clean);

// ---- STAGE 7: thin to a one-pixel skeleton ----------------------------------------------------
// Zhang-Suen. Standard, and correct on the edge cases a hand-rolled thinner gets wrong (it does
// not break 8-connectivity, which is the whole point - a broken skeleton becomes a disconnected
// graph and the validator would then be blamed for it).
{
  const g = clean;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : g[idx(x, y)];
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const del = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!g[idx(x, y)]) continue;
        const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
        const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let a = 0;
        for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) a++;
        if (a !== 1) continue;
        if (step === 0) {
          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;
        } else {
          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;
        }
        del.push(idx(x, y));
      }
      if (del.length) { changed = true; for (const p of del) g[p] = 0; }
    }
  }
}
say('thinned', clean);
preview('07-skeleton', clean);

// ---- STAGE 8: skeleton -> graph ---------------------------------------------------------------
// Pixels with exactly two neighbours are interior; everything else (1 neighbour, or 3+) is a node.
// Walk each interior run between nodes to get one polyline per edge.
const nb = (p) => {
  const x = p % w, y = (p / w) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const q = idx(nx, ny);
    if (clean[q]) out.push(q);
  }
  return out;
};

const isNode = new Uint8Array(N);
for (let i = 0; i < N; i++) if (clean[i]) { const d = nb(i).length; if (d !== 2) isNode[i] = 1; }

const nodeId = new Map();
const nodes = [];
for (let i = 0; i < N; i++) if (isNode[i]) { nodeId.set(i, nodes.length); nodes.push({ px: i % w, py: (i / w) | 0 }); }

const edges = [];
const usedStep = new Set();
const stepKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
for (const [start] of nodeId) {
  for (const first of nb(start)) {
    if (usedStep.has(stepKey(start, first))) continue;
    const path = [start];
    let prev = start, cur = first;
    usedStep.add(stepKey(prev, cur));
    while (!isNode[cur]) {
      path.push(cur);
      const next = nb(cur).find((q) => q !== prev);
      if (next === undefined) break;
      usedStep.add(stepKey(cur, next));
      prev = cur; cur = next;
    }
    path.push(cur);
    if (!isNode[cur]) continue;                       // ran into a dead pixel, drop it
    edges.push({ a: nodeId.get(start), b: nodeId.get(cur), path });
  }
}
console.log(`raw graph      ${nodes.length} nodes, ${edges.length} edges`);

// The pin mask ships alongside the graph. `_mapgraph.mjs` reads the ORIGINAL colours to tell a
// gold motorway from a grey street, and the pins are gold discs sitting on the roads - without
// this it classifies every pinned junction as motorway, which is exactly what the first run did.
{
  const o = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) { const v = pinMask[i] ? 255 : 0; o[i*4] = v; o[i*4+1] = v; o[i*4+2] = v; o[i*4+3] = 255; }
  writeFileSync(`${OUT}.pins.rgba`, o);
  writeFileSync(`${OUT}.pins.json`, JSON.stringify({ w, h }));
}

writeFileSync(OUT, JSON.stringify({
  image: { w, h, src: prefix },
  nodes,
  edges: edges.map((e) => ({ a: e.a, b: e.b, path: e.path.map((p) => [p % w, (p / w) | 0]) })),
}));
console.log(`wrote ${OUT}`);
