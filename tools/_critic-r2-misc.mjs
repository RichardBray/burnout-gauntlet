import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
import { createRoadGraph } from '../game/map/graph.js';
const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const B=createBlocks(doc);
// ---- the 31 long blocks
const long=B.blocks.map((b,i)=>({b,i})).filter(({b})=>b.w>200||b.d>200).sort((p,q)=>Math.max(q.b.w,q.b.d)-Math.max(p.b.w,p.b.d));
console.log(`blocks over 200 m on one side: ${long.length}, area ${(long.reduce((s,{b})=>s+b.w*b.d,0)/1e6).toFixed(3)} km2`);
console.log(`  long side / short side / face / district:`);
long.slice(0,12).forEach(({b,i})=>console.log(`    block ${String(i).padStart(3)}  ${Math.max(b.w,b.d).toFixed(0).padStart(4)} x ${Math.min(b.w,b.d).toFixed(0).padStart(3)} m  face ${String(b.faceId).padStart(3)} ${b.district}  bw/bd ${b.bw.toFixed(0)}/${b.bd.toFixed(0)}`));
const shorts=long.map(({b})=>Math.min(b.w,b.d));
console.log(`  short side: min ${Math.min(...shorts)} max ${Math.max(...shorts)} median ${shorts.sort((a,b)=>a-b)[shorts.length>>1]}`);
console.log(`  how many have short side > 40 (i.e. NOT a frontage strip): ${shorts.filter(s=>s>40).length}`);
console.log(`  how many are on a RING face: ${long.filter(({b})=>B.faces[b.faceId].big).length} of ${long.length}`);

// ---- index: pad > 0 path, never exercised by the harness
console.log(`\nindex.at(x,z,pad) with pad>0 - the path _mapblocks.mjs never tests:`);
let rng=99991; const rnd=()=>((rng=(rng*1103515245+12345)&0x7fffffff)/0x7fffffff);
const [X0,X1]=doc.extent.x,[Z0,Z1]=doc.extent.z;
for (const pad of [1.0, 5.0, 50.0, 200.0]){
  let bad=0;
  for(let k=0;k<4000;k++){
    const x=X0+rnd()*(X1-X0), z=Z0+rnd()*(Z1-Z0);
    const got=B.index.at(x,z,pad).sort((a,b)=>a-b);
    const want=[]; B.blocks.forEach((b,i)=>{if(Math.abs(x-b.cx)<b.w/2+pad&&Math.abs(z-b.cz)<b.d/2+pad)want.push(i);});
    if(got.join()!==want.join())bad++;
  }
  console.log(`  pad ${String(pad).padStart(6)}: ${bad} disagreements over 4000 probes`);
}
// ---- the harness's minClear method vs a true min-over-all-segments
console.log(`\nharness minClear method (nearest CENTRELINE then subtract that edge's hp) vs true min:`);
const SH=3.0, NP=new Map(doc.nodes.map(n=>[n.id,n.p]));
const A=[];for(const e of doc.edges){const p=[NP.get(e.a),...e.shape,NP.get(e.b)];
 for(let k=1;k<p.length;k++)A.push([p[k-1][0],p[k-1][1],p[k][0],p[k][1],e.width/2+SH]);}
const trueClr=(x,z)=>{let best=Infinity;for(const s of A){const dx=s[2]-s[0],dz=s[3]-s[1],l2=dx*dx+dz*dz;
 let t=l2>0?((x-s[0])*dx+(z-s[1])*dz)/l2:0;t=t<0?0:t>1?1:t;
 const ex=x-(s[0]+dx*t),ez=z-(s[1]+dz*t);const c=Math.sqrt(ex*ex+ez*ez)-s[4];if(c<best)best=c;}return best;};
const g=createRoadGraph(doc); const hp=doc.edges.map(e=>e.width/2+SH);
let maxOver=0, overAt=null, hMin=Infinity, tMin=Infinity;
for(const b of B.blocks){
  for(const [x,z] of [[b.cx-b.w/2,b.cz-b.d/2],[b.cx+b.w/2,b.cz-b.d/2],[b.cx-b.w/2,b.cz+b.d/2],[b.cx+b.w/2,b.cz+b.d/2]]){
    const n=g.nearest(x,z,200); if(!n) continue;
    const h=n.dist-hp[n.edge], t=trueClr(x,z);
    if(h<hMin)hMin=h; if(t<tMin)tMin=t;
    if(h-t>maxOver){maxOver=h-t;overAt=[x,z,h,t];}
  }
}
console.log(`  harness min ${hMin.toFixed(4)} m,  true min ${tMin.toFixed(4)} m`);
console.log(`  worst per-point OVERESTIMATE by the harness method: ${maxOver.toFixed(4)} m at ${overAt?overAt.slice(0,2).map(v=>v.toFixed(1)).join(', '):'-'} (harness ${overAt?overAt[2].toFixed(3):'-'} vs true ${overAt?overAt[3].toFixed(3):'-'})`);
console.log(`  => the harness method can report MORE clearance than exists; it agrees at the global minimum here but is not sound in general`);
