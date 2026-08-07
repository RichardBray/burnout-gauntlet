// Independent classification of the 34 big faces: open ground vs untraced street grid.
// Does NOT use _maptrace.mjs constants. Samples the reference RGBA inside each face's RING
// INTERIOR (the part left open) and classifies each pixel as grey-built / water / vegetation.
import { readFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';
const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const B=createBlocks(doc);
const {w:IW,h:IH}=doc.scale.image, M=doc.scale.metresPerPixel;
const img=readFileSync('/tmp/critic-ign.rgba');
const px=(x)=>Math.round(x/M+IW/2), pz=(z)=>Math.round(z/M+IH/2);
function inRing(ring,x,z){let s=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const zi=ring[i][1],zj=ring[j][1];if((zi>z)!==(zj>z)){const xi=ring[i][0],xj=ring[j][0];
 if(x<xi+(xj-xi)*(z-zi)/(zj-zi))s=!s;}}return s;}
const big=B.faces.filter(f=>f.big);
console.log(`${big.length} big (ring) faces. Sampling the reference image at 6 m inside each ring.\n`);
const rows=[];
for(const f of big){
  const p=f.polygon;
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(const q of p){x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);z0=Math.min(z0,q[1]);z1=Math.max(z1,q[1]);}
  let n=0,grey=0,water=0,veg=0;
  for(let z=z0;z<=z1;z+=6)for(let x=x0;x<=x1;x+=6){
    if(!inRing(p,x,z))continue;
    const ix=px(x),iy=pz(z); if(ix<0||iy<0||ix>=IW||iy>=IH)continue;
    const i=(iy*IW+ix)*4, r=img[i],g=img[i+1],b=img[i+2];
    n++;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b), sat=mx===0?0:(mx-mn)/mx, lum=(r+g+b)/3;
    if(b>r+8 && lum<95) water++;                 // teal/blue and dark = sea or lake
    else if(lum>=105 && sat<0.22) grey++;        // light and desaturated = built/paved
    else veg++;
  }
  rows.push({id:f.id,d:f.district,area:f.area,n,grey:grey/n,water:water/n,veg:veg/n,blocks:f.blocks});
}
rows.sort((a,b)=>b.grey-a.grey);
console.log(`  face  district     area ha   samples   grey%  water%   veg%  blocks   my call`);
for(const r of rows){
  const call = r.grey>0.30 ? 'BUILT (5b)' : r.water>0.30 ? 'WATER (5a)' : 'OPEN  (5a)';
  console.log(`  ${String(r.id).padStart(4)}  ${r.d.padEnd(11)} ${(r.area/1e4).toFixed(1).padStart(7)}   ${String(r.n).padStart(6)}  ${(r.grey*100).toFixed(1).padStart(5)}  ${(r.water*100).toFixed(1).padStart(6)}  ${(r.veg*100).toFixed(1).padStart(5)}  ${String(r.blocks).padStart(6)}   ${call}`);
}
const built=rows.filter(r=>r.grey>0.30), water=rows.filter(r=>r.grey<=0.30&&r.water>0.30);
console.log(`\nmy split: BUILT ${built.length} faces (${(built.reduce((s,r)=>s+r.area,0)/1e6).toFixed(3)} km2), WATER ${water.length}, OPEN ${rows.length-built.length-water.length}`);
console.log(`builder:  5b BUILT 11 faces (1.064 km2), 5a OPEN 23 faces (3.213 km2)`);
