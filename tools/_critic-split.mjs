// Insert a node at each of the 4 shared-node crossings, in a COPY of the doc, and re-run
// createBlocks. If the face count then satisfies Euler, the 6-face deficit is caused by them.
import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc0 = JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const doc = JSON.parse(JSON.stringify(doc0));
const nodeP = () => new Map(doc.nodes.map(n=>[n.id,n.p]));
const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
let nextId = Math.max(...doc.nodes.map(n=>n.id))+1;

function findOne(){
  const NP=nodeP();
  const segs=[]; doc.edges.forEach((e,ei)=>{const p=[NP.get(e.a),...e.shape,NP.get(e.b)];
    for(let k=1;k<p.length;k++) segs.push({a:p[k-1],b:p[k],e:ei,k,na:e.a,nb:e.b});});
  for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){
    const s=segs[i],t=segs[j]; if(s.e===t.e) continue;
    const d1=cr(s.a,s.b,t.a),d2=cr(s.a,s.b,t.b),d3=cr(t.a,t.b,s.a),d4=cr(t.a,t.b,s.b);
    if(!(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0)))) continue;
    const tt=d1/(d1-d2);
    return {s,t,p:[t.a[0]+(t.b[0]-t.a[0])*tt, t.a[1]+(t.b[1]-t.a[1])*tt]};
  }
  return null;
}
// split edge ei at index k (segment k, i.e. between pts[k-1] and pts[k]) at point P
function splitEdge(ei, k, P, nid){
  const e = doc.edges[ei]; const NP=nodeP();
  const pts=[NP.get(e.a),...e.shape,NP.get(e.b)];
  const left = pts.slice(0,k).concat([P]);
  const right = [P].concat(pts.slice(k));
  const mk=(a,b,shape)=>({...e, a, b, shape});
  const e1 = mk(e.a, nid, left.slice(1,-1));
  const e2 = mk(nid, e.b, right.slice(1,-1));
  doc.edges[ei]=e1; doc.edges.push(e2);
}
let n=0;
for(;;){
  const x = findOne(); if(!x) break;
  const nid = nextId++;
  doc.nodes.push({id:nid, p:x.p, district: doc.nodes[0].district});
  // split the later-index edge first is irrelevant since we replace in place + push
  const {s,t,p}=x;
  const se=s.e, sk=s.k, te=t.e, tk=t.k;
  splitEdge(se, sk, p, nid);
  splitEdge(te, tk, p, nid);
  n++;
  if(n>20) throw new Error('runaway');
}
console.log(`split ${n} crossings`);
const V=doc.nodes.length,E=doc.edges.length;
console.log(`after split: V=${V} E=${E}  Euler F = ${E-V+2}`);
const B=createBlocks(doc);
console.log(`walked faces = ${B.stats.facesWalked}  outerFaces=${B.stats.outerFaces} closed=${B.stats.facesClosed}`);
console.log(`chi = ${V-E+B.stats.facesWalked}`);
console.log(`kept faces ${B.stats.keptFaces} (was 234), blocks ${B.stats.blockCount} (was 693), blockArea ${(B.stats.blockArea/1e6).toFixed(3)} km2 (was 3.708)`);
console.log(`interiorArea ${(B.stats.interiorArea/1e6).toFixed(4)} km2 outerArea ${(B.stats.outerArea/1e6).toFixed(4)}`);
import("node:fs").then(fs=>fs.writeFileSync("/tmp/split-blocks.json",JSON.stringify(B.blocks)));
