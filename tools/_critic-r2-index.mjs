import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const B=createBlocks(doc);
let rng=99991; const rnd=()=>((rng=(rng*1103515245+12345)&0x7fffffff)/0x7fffffff);
const [X0,X1]=doc.extent.x,[Z0,Z1]=doc.extent.z;
let dupOnly=0, missing=0, spurious=0, total=0, worstDup=0, example=null;
for(let k=0;k<8000;k++){
  const x=X0+rnd()*(X1-X0), z=Z0+rnd()*(Z1-Z0), pad=1.0;
  const got=B.index.at(x,z,pad);
  const gotSet=[...new Set(got)].sort((a,b)=>a-b);
  const want=[]; B.blocks.forEach((b,i)=>{if(Math.abs(x-b.cx)<b.w/2+pad&&Math.abs(z-b.cz)<b.d/2+pad)want.push(i);});
  if(got.join()!==want.join()){
    total++;
    if(gotSet.join()===want.join()){dupOnly++; const d=got.length-gotSet.length; if(d>worstDup){worstDup=d;example=[x,z,got.slice()];}}
    else { if(want.some(i=>!gotSet.includes(i))) missing++; if(gotSet.some(i=>!want.includes(i))) spurious++; }
  }
}
console.log(`pad=1.0, 8000 probes: ${total} disagreements`);
console.log(`  explained ENTIRELY by duplicate indices: ${dupOnly}`);
console.log(`  genuinely MISSING a block: ${missing}`);
console.log(`  genuinely SPURIOUS block:  ${spurious}`);
console.log(`  worst duplication: ${worstDup} extra copies, e.g. at ${example?example[0].toFixed(1)+', '+example[1].toFixed(1):'-'} -> ${example?JSON.stringify(example[2]):''}`);
// concrete: one block, queried at its own centre with pad 1
const b=B.blocks.find(b=>b.w>200||b.d>200);
const i=B.blocks.indexOf(b);
console.log(`\nconcrete: block ${i} is ${b.w}x${b.d} at ${b.cx},${b.cz}`);
console.log(`  index.at(cx, cz, 0)   -> ${JSON.stringify(B.index.at(b.cx,b.cz,0))}`);
console.log(`  index.at(cx, cz, 1.0) -> ${JSON.stringify(B.index.at(b.cx,b.cz,1.0))}   <- the same block, returned ${B.index.at(b.cx,b.cz,1.0).filter(v=>v===i).length} times`);
