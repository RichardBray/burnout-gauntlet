import { chromium } from 'playwright';
import fs from 'node:fs';
const [file, ...regs] = process.argv.slice(2);
const b64 = fs.readFileSync(file).toString('base64');
const mime = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
const R = {}; for (const r of regs){const [n,v]=r.split('='); R[n]=v.split(',').map(Number);}
const br = await chromium.launch();
const p = await br.newPage();
const out = await p.evaluate(async ([b64,R,mime])=>{
  const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
  const c=document.createElement('canvas'); c.width=img.width;c.height=img.height;
  const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0);
  const px=x.getImageData(0,0,c.width,c.height).data;
  const L=(xx,yy)=>{const i=(yy*c.width+xx)*4;return 0.2126*px[i]+0.7152*px[i+1]+0.0722*px[i+2];};
  const res={};
  for(const [n,r] of Object.entries(R)){
    const x0=Math.floor(r[0]*c.width),x1=Math.floor(r[1]*c.width);
    const y0=Math.floor(r[2]*c.height),y1=Math.floor(r[3]*c.height);
    let s=0,n2=0,sm=0;
    for(let y=y0+1;y<y1-1;y++)for(let xx=x0+1;xx<x1-1;xx++){
      let a=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)a+=L(xx+dx,y+dy);
      const d=L(xx,y)-a/9; s+=d*d; sm+=L(xx,y); n2++;
    }
    res[n]={hfRms:+Math.sqrt(s/n2).toFixed(3), mean:+(sm/n2).toFixed(1), px:n2};
  }
  return res;
},[b64,R,mime]);
console.log(file); for(const[k,v] of Object.entries(out)) console.log(`  ${k.padEnd(12)} hfRms ${String(v.hfRms).padEnd(8)} mean ${String(v.mean).padEnd(7)} n ${v.px}`);
await br.close();
