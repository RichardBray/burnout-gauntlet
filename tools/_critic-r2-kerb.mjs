import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const SH=3.0,NP=new Map(doc.nodes.map(n=>[n.id,n.p]));
const A=[];for(const e of doc.edges){const p=[NP.get(e.a),...e.shape,NP.get(e.b)];
 for(let k=1;k<p.length;k++)A.push([p[k-1][0],p[k-1][1],p[k][0],p[k][1],e.width/2+SH]);}
const clr=(x,z)=>{let b=Infinity;for(const s of A){const dx=s[2]-s[0],dz=s[3]-s[1],l2=dx*dx+dz*dz;
 let t=l2>0?((x-s[0])*dx+(z-s[1])*dz)/l2:0;t=t<0?0:t>1?1:t;
 const ex=x-(s[0]+dx*t),ez=z-(s[1]+dz*t);const c=Math.sqrt(ex*ex+ez*ez)-s[4];if(c<b)b=c;}return b;};
console.log('kerbMargin sweep - true min corner clearance and true violations (float64 oracle):');
for(const km of [0.5,0.25,0.05,0.0,-0.25,-0.5,-1.0,-2.0]){
  const B=createBlocks(doc,{kerbMargin:km});
  let mn=Infinity,v=0;
  for(const b of B.blocks) for(const [x,z] of [[b.cx-b.w/2,b.cz-b.d/2],[b.cx+b.w/2,b.cz-b.d/2],[b.cx-b.w/2,b.cz+b.d/2],[b.cx+b.w/2,b.cz+b.d/2]]){
    const c=clr(x,z); if(c<mn)mn=c; if(c<0)v++;}
  const insetPct=(B.stats.insetArea/4217616-1)*100;
  console.log(`  kerbMargin ${String(km).padStart(6)}: blocks ${String(B.blocks.length).padStart(4)}, insetArea ${(insetPct>=0?'+':'')}${insetPct.toFixed(2)}% vs baseline (band +-3%), true min clearance ${mn.toFixed(4)} m, corner violations ${v}`);
}
