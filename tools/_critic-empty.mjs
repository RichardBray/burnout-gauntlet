import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const B=createBlocks(doc);
const empty=B.faces.filter(f=>f.blocks===0);
console.log(`empty faces: ${empty.length} / ${B.faces.length}, area ${(empty.reduce((s,f)=>s+f.area,0)/1e6).toFixed(3)} km2`);
console.log(`  of which freeArea (survived the kerb inset) > 400 m2: ${empty.filter(f=>f.freeArea>400).length}`);
let sumFree=0; for(const f of empty) sumFree+=f.freeArea;
console.log(`  total freeArea in empty faces: ${sumFree.toFixed(0)} m2 (${(sumFree/1e6).toFixed(4)} km2) - this is inset ground the fill could not rectangle`);
// width proxy: 2*area/perimeter
const per=(p)=>{let s=0;for(let i=0,j=p.length-1;i<p.length;j=i++)s+=Math.hypot(p[i][0]-p[j][0],p[i][1]-p[j][1]);return s;};
const rows=empty.map(f=>({id:f.id,area:f.area,free:f.freeArea,w:2*f.area/per(f.polygon),verts:f.polygon.length}));
rows.sort((a,b)=>b.area-a.area);
console.log('  top 12 empty faces by area:  id / area m2 / freeArea m2 / 2A/P width m / verts');
rows.slice(0,12).forEach(r=>console.log(`    ${String(r.id).padStart(4)} ${r.area.toFixed(0).padStart(7)} ${r.free.toFixed(0).padStart(7)} ${r.w.toFixed(1).padStart(7)} ${String(r.verts).padStart(4)}`));
console.log(`  empty faces with 2A/P mean width < 20 m (genuinely too narrow): ${rows.filter(r=>r.w<20).length}`);
console.log(`  empty faces with freeArea >= 400 m2 but no block (fill failure, not narrowness):`);
rows.filter(r=>r.free>=400).sort((a,b)=>b.free-a.free).slice(0,10).forEach(r=>console.log(`    face ${r.id}: freeArea ${r.free.toFixed(0)} m2, mean width ${r.w.toFixed(1)} m`));
// non-empty faces: how much inset ground is left uncovered
let lostFree=0;
for(const f of B.faces) lostFree += f.freeArea - f.blockArea;
console.log(`\ninset ground with NO block over it, all faces: ${(lostFree/1e6).toFixed(3)} km2 of ${(B.stats.insetArea/1e6).toFixed(3)} km2 inset`);
