// Draw `game/map/paradise.json` back over the reference image it was traced from. Wave T.
//
// THIS IS THE ACCEPTANCE EVIDENCE FOR THE `digitise` PIECE, not a debug convenience. Every numeric
// check on a road graph - component count, degree-1 nodes, total kilometres - can pass on a graph
// that looks nothing like the city, and this project has shipped that failure five times under
// permanent rule 3. The only test that cannot be faked is putting the traced network on top of the
// picture and looking at whether it lands on the roads.
//
//   node tools/_mapoverlay.mjs game/map/paradise.json --img <rgba-prefix> --out <prefix>
//   node tools/_mappng.mjs <prefix> out.png
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const GRAPH = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const IMG = arg('--img'), OUT = arg('--out');
const DIM = +arg('--dim', 0.45);
if (!GRAPH || !IMG || !OUT) {
  console.error('usage: node tools/_mapoverlay.mjs <graph.json> --img <prefix> --out <prefix>');
  process.exit(2);
}

const doc = JSON.parse(readFileSync(GRAPH, 'utf8'));
const { w, h } = doc.scale.image;
const src = readFileSync(`${IMG}.rgba`);
const o = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) {
  o[i * 4] = src[i * 4] * DIM;
  o[i * 4 + 1] = src[i * 4 + 1] * DIM;
  o[i * 4 + 2] = src[i * 4 + 2] * DIM;
  o[i * 4 + 3] = 255;
}

const S = doc.scale.metresPerPixel;
const toPx = ([x, z]) => [x / S + w / 2, z / S + h / 2];

// One colour per class, so a misclassified motorway is visible rather than merely wrong in JSON.
const CLASS_RGB = {
  motorway: [255, 170, 40],
  arterial: [90, 220, 255],
  street: [255, 255, 255],
  service: [150, 150, 150],
};

function dot(x, y, rgb, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const i = (ny * w + nx) * 4;
    o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2];
  }
}
function line(a, b, rgb, r) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let k = 0; k <= steps; k++) {
    dot(a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps, rgb, r);
  }
}

const nodeAt = new Map(doc.nodes.map((n) => [n.id, n.p]));
for (const e of doc.edges) {
  const pts = [nodeAt.get(e.a), ...e.shape, nodeAt.get(e.b)].map(toPx);
  const rgb = CLASS_RGB[e.class] || [255, 0, 255];
  for (let k = 1; k < pts.length; k++) line(pts[k - 1], pts[k], rgb, e.class === 'motorway' ? 2 : 1);
}
// Junctions in red, dead ends in green, so both failure modes are visible at a glance.
const deg = new Map();
for (const e of doc.edges) {
  deg.set(e.a, (deg.get(e.a) || 0) + 1);
  deg.set(e.b, (deg.get(e.b) || 0) + 1);
}
for (const n of doc.nodes) {
  const d = deg.get(n.id) || 0;
  if (d === 1) dot(...toPx(n.p), [80, 255, 80], 4);
  else if (d >= 3) dot(...toPx(n.p), [255, 60, 60], 2);
}

writeFileSync(`${OUT}.rgba`, o);
writeFileSync(`${OUT}.json`, JSON.stringify({ w, h }));
console.log(`overlay -> ${OUT}.rgba  (${doc.edges.length} edges, ${doc.nodes.length} nodes)`);
console.log('white=street  cyan=arterial  orange=motorway  grey=service  red=junction  green=dead end');
