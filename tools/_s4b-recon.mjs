import fs from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
import { planPavement } from '../game/map/pavement.js';
import { createRoadGraph } from '../game/map/graph.js';
const doc = JSON.parse(fs.readFileSync(new URL('../game/map/paradise.json', import.meta.url)));
const t = (f) => { const a = performance.now(); const r = f(); return [r, +(performance.now()-a).toFixed(1)]; };
const [g, tg] = t(() => createRoadGraph(doc));
const [b, tb] = t(() => createBlocks(doc));
const [p, tp] = t(() => planPavement(doc, b.faces, { chunk: 200, graph: g }));
console.log('graph', tg, 'blocks', tb, 'pavement', tp);
console.log('blocks.stats', JSON.stringify(b.stats ?? {}).slice(0, 400));
console.log('faces', b.faces.length, 'blocks', b.blocks.length, 'pavCells', p.cells.size);
// face bbox extents, to see how filterable
const bb = b.faces.map((f) => { let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for(const q of f.polygon){x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);z0=Math.min(z0,q[1]);z1=Math.max(z1,q[1]);} return {x0,x1,z0,z1}; });
const inBox = (r, R) => { const lo=-R*200, hi=(R+1)*200; return bb.filter((f)=>f.x1>=lo&&f.x0<=hi&&f.z1>=lo&&f.z0<=hi).length; };
console.log('faces intersecting RES=1 box:', inBox(1), 'RES=2:', inBox(2));
