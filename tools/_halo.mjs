import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const [fv, fh, patch] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async ([dv, dh, spec]) => {
  const load = async (d) => { const i = new Image(); await new Promise(r => { i.onload = r; i.src = 'data:image/png;base64,' + d; }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return { d: g.getImageData(0, 0, i.width, i.height).data, W: i.width, H: i.height }; };
  const V = await load(dv), Hd = await load(dh);
  const [fx0, fx1, fy0, fy1] = spec.split(',').map(Number);
  const W = V.W, H = V.H;
  const x0 = Math.round(fx0*W), x1 = Math.round(fx1*W), y0 = Math.round(fy0*H), y1 = Math.round(fy1*H);
  const lum=(a,i)=>0.2126*a[i]+0.7152*a[i+1]+0.0722*a[i+2];
  let halo=0, core=0, mid=0, tot=0;
  for (let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){const i=(y*W+x)*4;const dl=lum(V.d,i)-lum(Hd.d,i);
    if(dl>=1&&dl<6)halo++; else if(dl>=6&&dl<40)mid++; else if(dl>=40)core++; if(dl>0)tot+=dl;}
  return {halo1to6:halo, mid6to40:mid, coreGE40:core, haloPerCore:+(halo/Math.max(1,core)).toFixed(2), totalAdded:+tot.toFixed(0)};
}, [(await readFile(fv)).toString('base64'), (await readFile(fh)).toString('base64'), patch]);
console.log(`${fv} ${JSON.stringify(out)}`);
await b.close();
