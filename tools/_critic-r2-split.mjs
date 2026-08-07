import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBlocks } from '../game/map/blocks.js';
const raw = readFileSync('game/map/paradise.json','utf8');
const md5 = s=>createHash('md5').update(s).digest('hex');
console.log('paradise.json md5 in memory:', md5(raw));
const doc = JSON.parse(raw);
// deep snapshot BEFORE
const snap = JSON.stringify(doc);
const maxNodeId = Math.max(...doc.nodes.map(n=>n.id));
const maxEdgeId = Math.max(...doc.edges.map((e,i)=>e.id ?? i));
console.log(`before: V=${doc.nodes.length} E=${doc.edges.length} maxNodeId=${maxNodeId} maxEdgeId=${maxEdgeId}`);
const B = createBlocks(doc);
console.log('caller doc unchanged (deep):', JSON.stringify(doc) === snap);
// prove deep, not shallow: mutate a nested array of the ORIGINAL and see if it was ever aliased
// -> better: check that no node/edge OBJECT in the split doc is the same reference as the original's.
//    createBlocks does not return the split doc, so reach it via a re-implementation of the split.
console.log('split stats:', JSON.stringify(B.stats.split));
const S=B.stats.split;
console.log(`arithmetic: 4 crossings, each splits 2 edges -> V +${S.nodesAfter-S.nodesBefore} (expect +4), E +${S.edgesAfter-S.edgesBefore} (expect +4*... )`);
console.log(`  each crossing: +1 node, and each of 2 edges 1->2 so +1 edge each => +2 edges per crossing => expect +8? got +${S.edgesAfter-S.edgesBefore}`);
// Are any of the 4 crossings on the SAME edge? then the arithmetic differs.
const all=[...B.stats.crossings.nonAdjacent,...B.stats.crossings.sharedNode,...B.stats.crossings.selfCrossing];
const edgeHits=new Map();
for(const c of all) for(const e of c.edges) edgeHits.set(e,(edgeHits.get(e)||0)+1);
console.log('  edges cut, and how many times:', [...edgeHits].map(([e,n])=>`${e}x${n}`).join(' '));
console.log('  distinct edges cut:', edgeHits.size, ' total cuts:', [...edgeHits.values()].reduce((a,b)=>a+b,0));
console.log('  => E after = E before - distinctEdgesCut + sum(cuts+1 pieces) =',
  doc.edges.length - edgeHits.size + [...edgeHits.values()].reduce((a,b)=>a+b+1,0));
// Euler, independently, on the SPLIT graph. Recompute components myself with BFS not union-find.
const E=B.stats.euler;
console.log(`\nreported euler: V=${E.V} E=${E.E} F=${E.F} C=${E.components} chi=${E.chi} expected=${E.expected}`);
console.log(`  V - E + F = ${E.V - E.E + E.F}`);
// independent component count on the ORIGINAL doc via BFS
const adj=new Map(doc.nodes.forEach?[]:[]);
const a2=new Map(); doc.nodes.forEach(n=>a2.set(n.id,[]));
for(const e of doc.edges){a2.get(e.a).push(e.b);a2.get(e.b).push(e.a);}
const seen=new Set(); let C=0;
for(const n of doc.nodes){if(seen.has(n.id))continue;C++;const st=[n.id];seen.add(n.id);
 while(st.length){const u=st.pop();for(const v of a2.get(u))if(!seen.has(v)){seen.add(v);st.push(v);}}}
console.log(`  BFS components on the ORIGINAL doc: ${C} (splitting cannot change connectivity)`);
console.log(`  new node ids would start at ${maxNodeId+1}; collision with existing ids: ${doc.nodes.some(n=>n.id>maxNodeId)}`);
// droppedTiny story: 2 -> 6. Which 4 new tiny faces appeared, and are they the crossing lenses?
console.log(`\ndroppedTiny=${B.stats.droppedTiny}, area ${B.stats.droppedTinyArea.toFixed(1)} m2`);
const noSplit = createBlocks(doc,{split:false});
console.log(`--no-split: droppedTiny=${noSplit.stats.droppedTiny} area ${noSplit.stats.droppedTinyArea.toFixed(1)} m2, chi=${noSplit.stats.euler.chi}, facesWalked=${noSplit.stats.facesWalked}, keptFaces=${noSplit.stats.keptFaces}`);
console.log(`  delta droppedTiny = ${B.stats.droppedTiny - noSplit.stats.droppedTiny} (claimed 4 new lens faces)`);
console.log(`  delta area = ${(B.stats.droppedTinyArea - noSplit.stats.droppedTinyArea).toFixed(1)} m2 over 4 lenses`);
