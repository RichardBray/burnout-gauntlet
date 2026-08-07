import { readFileSync } from 'node:fs';
const doc = JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const nodeP = new Map(doc.nodes.map(n=>[n.id,n.p]));
const ptsOf = e => [nodeP.get(e.a), ...e.shape, nodeP.get(e.b)];

// 1. bearing ties at a node
const out=new Map();
doc.edges.forEach((e,ei)=>{
  for (const [from,rev] of [[e.a,false],[e.b,true]]){
    let p = ptsOf(e); if(rev) p=[...p].reverse();
    let k=1; while(k<p.length-1 && p[k][0]===p[0][0] && p[k][1]===p[0][1]) k++;
    const b=Math.atan2(p[k][1]-p[0][1], p[k][0]-p[0][0]);
    if(!out.has(from)) out.set(from,[]); out.get(from).push({ei,b,rev});
  }
});
let ties=0, near=0;
for (const [n,l] of out){
  l.sort((a,b)=>a.b-b.b);
  for(let i=0;i<l.length;i++){
    const j=(i+1)%l.length; if(l.length<2) continue;
    let d=Math.abs(l[j].b-l[i].b); if(d>Math.PI) d=2*Math.PI-d;
    if(d===0){ties++;console.log(`EXACT bearing tie at node ${n}: edges ${l[i].ei} & ${l[j].ei} bearing ${l[i].b}`);}
    else if(d<0.02){near++; if(near<=10) console.log(`near tie at node ${n}: edges ${l[i].ei} & ${l[j].ei} delta ${(d*180/Math.PI).toFixed(3)} deg`);}
  }
}
console.log(`exact bearing ties: ${ties}, near ties (<1.15deg): ${near}`);

// 2. self-crossing polylines (blocks.js findCrossings skips s.e===t.e)
const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
const proper=(p1,p2,p3,p4)=>{const d1=cr(p1,p2,p3),d2=cr(p1,p2,p4),d3=cr(p3,p4,p1),d4=cr(p3,p4,p2);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));};
let selfX=0;
doc.edges.forEach((e,ei)=>{const p=ptsOf(e);
  for(let i=1;i<p.length;i++) for(let j=i+2;j<p.length;j++){
    if(proper(p[i-1],p[i],p[j-1],p[j])){selfX++;console.log(`SELF-CROSSING edge ${ei} segs ${i} x ${j}`);}
  }});
console.log(`self-crossing polylines: ${selfX}`);

// 3. FULL brute force all-pairs segment crossing, no grid, incl. touching/collinear
const segs=[]; doc.edges.forEach((e,ei)=>{const p=ptsOf(e); for(let k=1;k<p.length;k++) segs.push({a:p[k-1],b:p[k],e:ei,na:e.a,nb:e.b,k});});
console.log(`segments: ${segs.length}`);
let nonAdj=0, shared=0, sameEdge=0, touch=0;
const list=[];
for(let i=0;i<segs.length;i++) for(let j=i+1;j<segs.length;j++){
  const s=segs[i],t=segs[j];
  if(s.e===t.e && Math.abs(s.k-t.k)<=1) continue;
  if(proper(s.a,s.b,t.a,t.b)){
    if(s.e===t.e) sameEdge++;
    else if(s.na===t.na||s.na===t.nb||s.nb===t.na||s.nb===t.nb) {shared++; list.push(`shared  e${s.e}xe${t.e}`);}
    else {nonAdj++; list.push(`NONADJ  e${s.e}xe${t.e}`);}
  } else {
    // touching: an endpoint of one lies exactly on the other (degenerate crossing the strict test misses)
    const d1=cr(s.a,s.b,t.a),d2=cr(s.a,s.b,t.b),d3=cr(t.a,t.b,s.a),d4=cr(t.a,t.b,s.b);
    if((d1===0||d2===0||d3===0||d4===0) && s.e!==t.e){
      const on=(p,q,r)=>Math.min(p[0],q[0])<=r[0]&&r[0]<=Math.max(p[0],q[0])&&Math.min(p[1],q[1])<=r[1]&&r[1]<=Math.max(p[1],q[1]);
      if((d1===0&&on(s.a,s.b,t.a))||(d2===0&&on(s.a,s.b,t.b))||(d3===0&&on(t.a,t.b,s.a))||(d4===0&&on(t.a,t.b,s.b))){
        const sharesNode=(s.na===t.na||s.na===t.nb||s.nb===t.na||s.nb===t.nb);
        if(!sharesNode){touch++; if(touch<=10) list.push(`TOUCH   e${s.e}xe${t.e}`);}
      }
    }
  }
}
console.log(`brute force: nonAdjacent=${nonAdj} sharedNode=${shared} sameEdge(non-consec)=${sameEdge} degenerate-touch(non-adjacent)=${touch}`);
list.slice(0,40).forEach(x=>console.log('  '+x));
