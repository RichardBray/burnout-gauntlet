import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const SH=3.0;
// independent min-clearance engine (float64, all segments, no index)
const NP=new Map(doc.nodes.map(n=>[n.id,n.p]));
const A=[];for(const e of doc.edges){const p=[NP.get(e.a),...e.shape,NP.get(e.b)];
 for(let k=1;k<p.length;k++)A.push([p[k-1][0],p[k-1][1],p[k][0],p[k][1],e.width/2+SH]);}
const clr=(x,z)=>{let best=Infinity;for(const s of A){const dx=s[2]-s[0],dz=s[3]-s[1],l2=dx*dx+dz*dz;
 let t=l2>0?((x-s[0])*dx+(z-s[1])*dz)/l2:0;t=t<0?0:t>1?1:t;
 const ex=x-(s[0]+dx*t),ez=z-(s[1]+dz*t);const c=Math.sqrt(ex*ex+ez*ez)-s[4];if(c<best)best=c;}return best;};

// ---- 1. IS THE BAND A SUBSET? Structural claim: ring mask subset of solid mask. Test empirically.
const solid=createBlocks(doc,{bigFaceArea:Infinity});   // no rings at all: round-1 behaviour
const ring =createBlocks(doc);
console.log(`solid fill (bigFaceArea=Inf): ${solid.blocks.length} blocks, ${(solid.stats.blockArea/1e6).toFixed(3)} km2, largest ${solid.stats.largestBlock.toFixed(0)} m2`);
console.log(`ring  fill (shipped):         ${ring.blocks.length} blocks, ${(ring.stats.blockArea/1e6).toFixed(3)} km2, largest ${ring.stats.largestBlock.toFixed(0)} m2`);
// every ring block's AREA must be covered by the solid fill's FREE mask. Proxy: no ring block may
// contain a point that the solid build considered occupied by road. Use the oracle directly.
let worst=Infinity, worstAt=null, viol=0, n=0;
for(const b of ring.blocks){
  for(const [x,z] of [[b.cx-b.w/2,b.cz-b.d/2],[b.cx+b.w/2,b.cz-b.d/2],[b.cx-b.w/2,b.cz+b.d/2],[b.cx+b.w/2,b.cz+b.d/2]]){
    n++; const c=clr(x,z); if(c<0)viol++; if(c<worst){worst=c;worstAt=[x,z,b];}
  }
}
console.log(`ring-block corners: ${n}, violations ${viol}, min clearance ${worst.toFixed(4)} m at ${worstAt[0]},${worstAt[1]}`);

// ---- 2. does the band EVER push a block roadward? compare min clearance of solid vs ring build
let ws=Infinity; for(const b of solid.blocks) for(const [x,z] of [[b.cx-b.w/2,b.cz-b.d/2],[b.cx+b.w/2,b.cz+b.d/2]]) {const c=clr(x,z); if(c<ws)ws=c;}
console.log(`solid build min corner clearance (2 corners/block): ${ws.toFixed(4)} m`);

// ---- 3. THRESHOLD SENSITIVITY -------------------------------------------------------------------
console.log(`\nBIG_FACE_AREA sweep (ringDepth 40):`);
for(const bfa of [10000,20000,30000,39000,40000,41000,60000,100000,200000,Infinity]){
  const r=createBlocks(doc,{bigFaceArea:bfa});
  const solidSlabs=r.blocks.filter(b=>Math.min(b.w,b.d)>200).length;
  const long=r.blocks.filter(b=>b.w>200||b.d>200).length;
  console.log(`  ${String(bfa).padStart(9)}: ${String(r.blocks.length).padStart(4)} blocks, ${(r.stats.blockArea/1e6).toFixed(3)} km2, ringFaces ${String(r.stats.ringFaces).padStart(3)}, largest ${String(r.stats.largestBlock.toFixed(0)).padStart(6)} m2, >200 one side ${String(long).padStart(3)}, SLABS(both) ${solidSlabs}`);
}
console.log(`\nRING_DEPTH sweep (bigFaceArea 40000):`);
for(const rd of [20,28,30,34,40,50,60,80,120]){
  const r=createBlocks(doc,{ringDepth:rd});
  const solidSlabs=r.blocks.filter(b=>Math.min(b.w,b.d)>200).length;
  console.log(`  ${String(rd).padStart(4)} m: ${String(r.blocks.length).padStart(4)} blocks, ${(r.stats.blockArea/1e6).toFixed(3)} km2, open interior ${(r.stats.ringInteriorArea/1e6).toFixed(3)} km2, largest ${String(r.stats.largestBlock.toFixed(0)).padStart(6)} m2, SLABS ${solidSlabs}`);
}
// faces just either side of the cut
console.log(`\nfaces near the 40000 m2 cut (shipped build):`);
const near=ring.faces.filter(f=>f.area>25000&&f.area<70000).sort((a,b)=>a.area-b.area);
for(const f of near) console.log(`  face ${String(f.id).padStart(3)} ${f.district.padEnd(11)} area ${f.area.toFixed(0).padStart(6)} m2  big=${f.big?'RING':'solid'}  blocks ${String(f.blocks).padStart(3)}  blockArea ${f.blockArea.toFixed(0).padStart(6)}  coverage ${(f.blockArea/f.area*100).toFixed(0)}%`);
