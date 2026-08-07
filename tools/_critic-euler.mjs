import { readFileSync } from 'node:fs';
const doc = JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const V = doc.nodes.length, E = doc.edges.length;
// degrees, self loops, parallel edges
const deg = new Map(); doc.nodes.forEach(n=>deg.set(n.id,0));
let selfLoops=0; const pairSeen = new Map();
for (const e of doc.edges){
  deg.set(e.a,(deg.get(e.a)??0)+1); deg.set(e.b,(deg.get(e.b)??0)+1);
  if (e.a===e.b) selfLoops++;
  const k = e.a<e.b?`${e.a}-${e.b}`:`${e.b}-${e.a}`;
  pairSeen.set(k,(pairSeen.get(k)||0)+1);
}
let parallel=0; for(const [k,c] of pairSeen) if(c>1) parallel+=c-1;
const degs=[...deg.values()];
const d0=degs.filter(d=>d===0).length, d1=degs.filter(d=>d===1).length, d2=degs.filter(d=>d===2).length;
// components
const adj=new Map(); doc.nodes.forEach(n=>adj.set(n.id,[]));
for(const e of doc.edges){adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
const seen=new Set(); let C=0;
for(const n of doc.nodes){ if(seen.has(n.id))continue; C++; const st=[n.id];seen.add(n.id);
  while(st.length){const u=st.pop(); for(const v of adj.get(u)) if(!seen.has(v)){seen.add(v);st.push(v);} } }
console.log(`V=${V} E=${E} components=${C} selfLoops=${selfLoops} parallelExtra=${parallel}`);
console.log(`deg0=${d0} deg1=${d1} deg2=${d2} min=${Math.min(...degs)} max=${Math.max(...degs)}`);
const Fexp = E - V + 1 + C;
console.log(`Euler predicts F = E - V + 1 + C = ${E} - ${V} + 1 + ${C} = ${Fexp}`);
const Fact = 237;
console.log(`harness walked F = ${Fact}   deficit = ${Fexp-Fact}`);
const chi = V - E + Fact;
console.log(`chi = V - E + F = ${chi}  => 2 - 2g  => genus g = ${(2-chi)/2}`);
// distinct node ids
console.log(`distinct node ids = ${new Set(doc.nodes.map(n=>n.id)).size}`);
// edges referencing missing nodes
const ids=new Set(doc.nodes.map(n=>n.id));
console.log(`edges with dangling refs = ${doc.edges.filter(e=>!ids.has(e.a)||!ids.has(e.b)).length}`);
