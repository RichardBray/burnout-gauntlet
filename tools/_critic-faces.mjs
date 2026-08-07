import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc = JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const B = createBlocks(doc);
// re-walk to get ALL 237 rings incl outer + dropped; createBlocks only returns kept 234.
// Use returned faces (234) + report.
const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
const proper=(p1,p2,p3,p4)=>{const d1=cr(p1,p2,p3),d2=cr(p1,p2,p4),d3=cr(p3,p4,p1),d4=cr(p3,p4,p2);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));};
let bad=[];
for (const f of B.faces){
  const p=f.polygon; const n=p.length; let hits=0; const where=[];
  for(let i=0;i<n;i++) for(let j=i+2;j<n;j++){
    if(i===0 && j===n-1) continue;
    if(proper(p[i],p[(i+1)%n],p[j],p[(j+1)%n])){hits++; if(where.length<3) where.push([i,j]);}
  }
  // repeated vertices (a ring passing through the same point twice = pinched/merged face)
  const seen=new Map(); let dupes=0;
  for(const q of p){const k=`${q[0]},${q[1]}`; seen.set(k,(seen.get(k)||0)+1);}
  for(const c of seen.values()) if(c>1) dupes+=c-1;
  if(hits||dupes) bad.push({id:f.id,area:f.area,verts:n,halfEdges:f.halfEdges,hits,dupes,district:f.district,where,
    bbox:[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))],
    blocks:f.blocks});
}
console.log(`faces with self-intersecting ring or repeated vertex: ${bad.length} of ${B.faces.length}`);
bad.sort((a,b)=>b.area-a.area);
for(const b of bad) console.log(`  face ${b.id} ${b.district} area=${b.area.toFixed(0)} m2 verts=${b.verts} halfEdges=${b.halfEdges} properSelfX=${b.hits} dupVerts=${b.dupes} blocks=${b.blocks} bbox=[${b.bbox.map(v=>v.toFixed(0)).join(', ')}]`);
console.log(`total area in bad faces: ${(bad.reduce((s,x)=>s+x.area,0)/1e6).toFixed(3)} km2`);
console.log(`blocks emitted from bad faces: ${bad.reduce((s,x)=>s+x.blocks,0)}`);
// biggest faces overall
console.log('\nlargest 12 faces:');
[...B.faces].sort((a,b)=>b.area-a.area).slice(0,12).forEach(f=>{
  const p=f.polygon;
  console.log(`  face ${f.id} ${f.district} ${(f.area/1e6).toFixed(3)} km2 he=${f.halfEdges} blocks=${f.blocks} blockArea=${(f.blockArea/1e6).toFixed(3)}`);
});
