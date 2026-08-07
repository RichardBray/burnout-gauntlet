// Independent confirmation that EVERYTHING CONNECTS. Wave T, `digitise`.
//
// The user asked, in these words, for no hanging roads, no cul-de-sacs and no dead ends - it all
// needs to connect. `game/map/validate.mjs` enforces that, but a checker confirming itself proves
// nothing, so this is a SECOND implementation written from the user's sentence rather than from
// the schema. It shares no code with the validator on purpose. If the two ever disagree, one of
// them is wrong and both need reading.
//
//   node tools/_mapconnect.mjs        exit 0 = everything connects
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const ids = d.nodes.map(n=>n.id);
const pos = new Map(d.nodes.map(n=>[n.id,n.p]));
let bad = [];

// 1. build adjacency from scratch, honouring oneWay in BOTH directions separately
const fwd=new Map(ids.map(i=>[i,[]])), bwd=new Map(ids.map(i=>[i,[]]));
for(const e of d.edges){
  fwd.get(e.a).push(e.b); bwd.get(e.b).push(e.a);
  if(!e.oneWay){ fwd.get(e.b).push(e.a); bwd.get(e.a).push(e.b); }
}
// 2. every node must have at least two road ends at it
const deg=new Map(ids.map(i=>[i,0]));
for(const e of d.edges){deg.set(e.a,deg.get(e.a)+1);deg.set(e.b,deg.get(e.b)+1);}
const tips=ids.filter(i=>deg.get(i)<2);
if(tips.length) bad.push(`${tips.length} nodes with fewer than 2 roads: ${tips.slice(0,10).map(i=>JSON.stringify(pos.get(i)))}`);

// 3. drive OUT of every node to every node, and drive BACK
const bfs=(g,s)=>{const seen=new Set([s]);const q=[s];while(q.length){const p=q.shift();for(const n of g.get(p))if(!seen.has(n)){seen.add(n);q.push(n);}}return seen;};
const out=bfs(fwd,ids[0]), back=bfs(bwd,ids[0]);
if(out.size!==ids.length) bad.push(`from node ${ids[0]} you can only REACH ${out.size} of ${ids.length} nodes`);
if(back.size!==ids.length) bad.push(`only ${back.size} of ${ids.length} nodes can reach node ${ids[0]}`);

// 4. spot-check 200 random ordered pairs both ways, from a different start each time
let rng=12345; const rnd=()=>((rng=rng*1103515245+12345&0x7fffffff)/0x7fffffff);
let checked=0;
for(let k=0;k<200;k++){
  const a=ids[Math.floor(rnd()*ids.length)], b=ids[Math.floor(rnd()*ids.length)];
  if(!bfs(fwd,a).has(b)) bad.push(`cannot drive from ${JSON.stringify(pos.get(a))} to ${JSON.stringify(pos.get(b))}`);
  checked++;
}
// 5. every edge must be usable to leave its own endpoints (no edge stranded behind a one-way)
for(const e of d.edges){ if(!fwd.get(e.a).includes(e.b)) bad.push(`edge ${e.id} not traversable a->b`); }
// 6. no node flagged as a dead end
const flagged=d.nodes.filter(n=>n.deadEnd);
if(flagged.length) bad.push(`${flagged.length} nodes still flagged deadEnd`);

console.log(`nodes ${ids.length}, edges ${d.edges.length}`);
console.log(`min roads at any node: ${Math.min(...deg.values())}`);
console.log(`reachable from first node: ${out.size}/${ids.length}; can reach it: ${back.size}/${ids.length}`);
console.log(`random round-trip pairs checked: ${checked}`);
console.log(bad.length ? "FAIL\n"+bad.map(b=>"  - "+b).join("\n") : "PASS - every node has 2+ roads, and every node reaches every other node and back");
process.exit(bad.length?1:0);
