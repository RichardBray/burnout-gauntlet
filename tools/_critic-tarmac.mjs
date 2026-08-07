// INDEPENDENT block-vs-tarmac check. Shares no code with game/map/graph.js: no createRoadGraph,
// no spatial index, brute force point-to-polyline distance straight off paradise.json.
// Reports the MINIMUM SIGNED CLEARANCE in metres, not a boolean, because a boolean cannot
// distinguish "clears by 10 m" from "clears by 1 nanometre".
import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc = JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const PITCH = +(process.argv[2] ?? 2);
const SHOULDER = 3.0;
const NP = new Map(doc.nodes.map(n=>[n.id,n.p]));
const AX=[],AZ=[],BX=[],BZ=[],HP=[];
for (const e of doc.edges){
  const p=[NP.get(e.a),...e.shape,NP.get(e.b)];
  for(let k=1;k<p.length;k++){AX.push(p[k-1][0]);AZ.push(p[k-1][1]);BX.push(p[k][0]);BZ.push(p[k][1]);HP.push(e.width/2+SHOULDER);}
}
const N=AX.length;
const ax=Float64Array.from(AX),az=Float64Array.from(AZ),bx=Float64Array.from(BX),bz=Float64Array.from(BZ),hp=Float64Array.from(HP);
console.log(`${N} segments, float64, no index. pitch ${PITCH} m.`);
const B=createBlocks(doc).blocks;
let samples=0, viol=0, worstClear=Infinity, worstAt=null;
const t0=Date.now();
for(let bi=0;bi<B.length;bi++){
  const b=B[bi];
  const x0=b.cx-b.w/2,x1=b.cx+b.w/2,z0=b.cz-b.d/2,z1=b.cz+b.d/2;
  const nx=Math.max(1,Math.round(b.w/PITCH)), nz=Math.max(1,Math.round(b.d/PITCH));
  const pts=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++) pts.push([x0+(x1-x0)*i/nx, z0+(z1-z0)*j/nz]);
  for(const [px,pz] of pts){
    samples++;
    let best=Infinity;
    for(let s=0;s<N;s++){
      const dx=bx[s]-ax[s], dz=bz[s]-az[s];
      const l2=dx*dx+dz*dz;
      let t = l2>0 ? ((px-ax[s])*dx+(pz-az[s])*dz)/l2 : 0;
      t = t<0?0:t>1?1:t;
      const ex=px-(ax[s]+dx*t), ez=pz-(az[s]+dz*t);
      const d2=ex*ex+ez*ez;
      // cheap reject before the sqrt
      if (d2 >= (hp[s]+best)*(hp[s]+best) && best<Infinity) continue;
      const c=Math.sqrt(d2)-hp[s];
      if(c<best) best=c;
    }
    if(best<0){viol++; if(viol<=10) console.log(`  VIOLATION block ${bi} at ${px.toFixed(2)},${pz.toFixed(2)} inside tarmac by ${(-best).toFixed(4)} m`);}
    if(best<worstClear){worstClear=best; worstAt={bi,px,pz,b};}
  }
}
console.log(`samples ${samples} in ${((Date.now()-t0)/1000).toFixed(1)} s`);
console.log(`violations (sample strictly inside a paved corridor): ${viol}`);
console.log(`MINIMUM CLEARANCE over all samples: ${worstClear.toFixed(4)} m`);
console.log(`  at block ${worstAt.bi} (${worstAt.b.w}x${worstAt.b.d}, face ${worstAt.b.faceId}) sample ${worstAt.px.toFixed(2)}, ${worstAt.pz.toFixed(2)}`);
console.log(`expected floor = KERB_MARGIN = 0.5 m; anything below that means blocks.js's own inset is not holding`);
