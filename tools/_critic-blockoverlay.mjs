// Draw the 693 blocks over reference/map/ign-map.jpg with the road graph in a second colour.
// THE OVERLAY IS THE ACCEPTANCE TEST. 2x supersample so 20 m blocks are legible.
//   node tools/_critic-blockoverlay.mjs <ign-prefix> <out-prefix> [--crop x0,z0,x1,z1] [--scale N]
import { readFileSync, writeFileSync } from 'node:fs';
import { createBlocks } from '../game/map/blocks.js';

const argv=process.argv.slice(2);
const IMG=argv[0], OUT=argv[1];
const arg=(k,d)=>{const i=argv.indexOf(k);return i<0?d:argv[i+1];};
const SC=+arg('--scale',2);
const CROP=arg('--crop',null);   // world metres x0,z0,x1,z1
const DIM=+arg('--dim',0.40);

const doc=JSON.parse(readFileSync('game/map/paradise.json','utf8'));
const {w:iw,h:ih}=doc.scale.image;
const M=doc.scale.metresPerPixel;
const src=readFileSync(`${IMG}.rgba`);

// world -> source pixel
const sx=(x)=>x/M+iw/2, sz=(z)=>z/M+ih/2;
let px0=0,pz0=0,px1=iw,pz1=ih;
if(CROP){const [a,b,c,d]=CROP.split(',').map(Number); px0=Math.max(0,Math.floor(sx(a)));pz0=Math.max(0,Math.floor(sz(b)));px1=Math.min(iw,Math.ceil(sx(c)));pz1=Math.min(ih,Math.ceil(sz(d)));}
const cw=px1-px0, ch=pz1-pz0;
const w=cw*SC, h=ch*SC;
const o=Buffer.alloc(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const s=((pz0+Math.floor(y/SC))*iw+(px0+Math.floor(x/SC)))*4, i=(y*w+x)*4;
  o[i]=src[s]*DIM;o[i+1]=src[s+1]*DIM;o[i+2]=src[s+2]*DIM;o[i+3]=255;
}
// world -> output pixel
const X=(x)=>(sx(x)-px0)*SC, Z=(z)=>(sz(z)-pz0)*SC;
const put=(x,y,rgb,a=1)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;
  o[i]=o[i]*(1-a)+rgb[0]*a;o[i+1]=o[i+1]*(1-a)+rgb[1]*a;o[i+2]=o[i+2]*(1-a)+rgb[2]*a;};
const line=(ax,ay,bx,by,rgb,r=0,a=1)=>{const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)));
  for(let k=0;k<=n;k++){const x=ax+(bx-ax)*k/n,y=ay+(by-ay)*k/n;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) put(x+dx,y+dy,rgb,a);}};

const B=createBlocks(doc);

// 1. blocks: translucent magenta fill + solid outline. Blocks >200 m on a side in RED.
for(const b of B.blocks){
  const x0=X(b.cx-b.w/2),x1=X(b.cx+b.w/2),z0=Z(b.cz-b.d/2),z1=Z(b.cz+b.d/2);
  const huge = b.w>200||b.d>200;
  const fill = huge?[255,40,40]:[255,0,220];
  for(let y=Math.max(0,Math.floor(z0));y<=Math.min(h-1,Math.ceil(z1));y++)
    for(let x=Math.max(0,Math.floor(x0));x<=Math.min(w-1,Math.ceil(x1));x++) put(x,y,fill,huge?0.45:0.35);
  const oc = huge?[255,120,120]:[255,120,255];
  line(x0,z0,x1,z0,oc);line(x1,z0,x1,z1,oc);line(x1,z1,x0,z1,oc);line(x0,z1,x0,z0,oc);
}
// 2. road graph on top, cyan/yellow
const NP=new Map(doc.nodes.map(n=>[n.id,n.p]));
for(const e of doc.edges){
  const p=[NP.get(e.a),...e.shape,NP.get(e.b)];
  const rgb = e.class==='motorway'?[255,200,0]:e.class==='arterial'?[0,255,255]:[120,255,160];
  for(let k=1;k<p.length;k++) line(X(p[k-1][0]),Z(p[k-1][1]),X(p[k][0]),Z(p[k][1]),rgb,e.class==='motorway'?1:0,0.95);
}
// 3. the 4 shared-node crossings, big white rings
const CROSS=[[1369.4,-467.4],[1510.9,-418.4],[-1177.2,119.2],[792.8,247.2]];
for(const [x,z] of CROSS){const cx=X(x),cy=Z(z);
  for(let a=0;a<360;a+=2){const r=9;put(cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180),[255,255,255]);
    put(cx+(r+1)*Math.cos(a*Math.PI/180),cy+(r+1)*Math.sin(a*Math.PI/180),[255,255,255]);}}

writeFileSync(`${OUT}.rgba`,o);
writeFileSync(`${OUT}.json`,JSON.stringify({w,h}));
console.log(`${OUT}.rgba ${w}x${h}  ${B.blocks.length} blocks (${B.blocks.filter(b=>b.w>200||b.d>200).length} red = over 200 m)`);
