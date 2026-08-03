import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const browser = await chromium.launch(); const page = await browser.newPage();
for (const spec of args) {
  const [f, x0, x1, y0, y1, bands] = spec.split(':');
  const buf = await readFile(f);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const r = await page.evaluate(async ([data, mimeType, X0,X1,Y0,Y1,N]) => {
    const img = new Image();
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=`data:${mimeType};base64,${data}`;});
    const c = document.createElement('canvas'); c.width=img.width; c.height=img.height;
    const g = c.getContext('2d'); g.drawImage(img,0,0);
    const fx = (v)=> v<=1? Math.round(v*img.width) : v;
    const fy = (v)=> v<=1? Math.round(v*img.height) : v;
    const x0=fx(+X0), x1=fx(+X1), y0=fy(+Y0), y1=fy(+Y1), n=+N;
    const d = g.getImageData(x0,y0,x1-x0,y1-y0).data;
    const W=x1-x0, H=y1-y0;
    const out=[];
    for(let b=0;b<n;b++){
      const ya=Math.floor(b*H/n), yb=Math.floor((b+1)*H/n);
      let L=0,S=0,cnt=0,mx=0;
      for(let y=ya;y<yb;y++) for(let x=0;x<W;x++){
        const i=(y*W+x)*4, R=d[i],G=d[i+1],B=d[i+2];
        const l=0.2126*R+0.7152*G+0.0722*B;
        const mxc=Math.max(R,G,B), mnc=Math.min(R,G,B);
        L+=l; S+= mxc? (mxc-mnc)/mxc:0; cnt++; if(l>mx)mx=l;
      }
      out.push({y:[ya+y0,yb+y0], L:+(L/cnt).toFixed(1), sat:+(S/cnt).toFixed(3), max:+mx.toFixed(0)});
    }
    // local contrast: stdev of luma over whole region
    let m=0,c2=0; for(let i=0;i<d.length;i+=4){m+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];c2++;}
    m/=c2; let v=0; for(let i=0;i<d.length;i+=4){const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];v+=(l-m)*(l-m);}
    return {size:[img.width,img.height], mean:+m.toFixed(1), std:+Math.sqrt(v/c2).toFixed(1), bands:out};
  }, [buf.toString('base64'), mime, x0,x1,y0,y1,bands||8]);
  console.log(f, JSON.stringify(r.size), 'mean', r.mean, 'std', r.std);
  for (const b of r.bands) console.log('   y', b.y.join('-'), 'L', b.L, 'sat', b.sat, 'max', b.max);
}
await browser.close();
