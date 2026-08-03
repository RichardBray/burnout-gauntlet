// r8 critic measures: Schroeder RT, band decay, formants, sweep. Reads shots/audio/*.wav + refs.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'r8-'));
const SR = 48000;
function readWavMono(p){const b=readFileSync(p);let off=12,fmt=null,data=null;
 while(off+8<=b.length){const id=b.toString('ascii',off,off+4),sz=b.readUInt32LE(off+4);
  if(id==='fmt ')fmt={ch:b.readUInt16LE(off+10),sr:b.readUInt32LE(off+12)};
  if(id==='data')data=b.subarray(off+8,off+8+sz);off+=8+sz+(sz&1);}
 const n=Math.floor(data.length/2/fmt.ch),out=new Float32Array(n);
 for(let i=0;i<n;i++){let s=0;for(let c=0;c<fmt.ch;c++)s+=data.readInt16LE((i*fmt.ch+c)*2)/32768;out[i]=s/fmt.ch;}
 return {x:out,sr:fmt.sr};}
function ref(m){const o=join(tmp,m.replace(/\W/g,'_')+'.wav');
 execFileSync('ffmpeg',['-v','quiet','-y','-i',join(root,'reference/audio',m),'-ac','1','-ar',String(SR),o]);return readWavMono(o);}
function ours(f){return readWavMono(join(root,'shots/audio',f));}
// --- biquad bandpass (2nd order, applied twice = 4th order) ---
function bp(x,sr,f0,Q){const w=2*Math.PI*f0/sr,a=Math.sin(w)/(2*Q),c=Math.cos(w);
 const b0=a,b1=0,b2=-a,a0=1+a,a1=-2*c,a2=1-a;
 let y=x;for(let pass=0;pass<2;pass++){const o=new Float32Array(y.length);let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<y.length;i++){const v=(b0/a0)*y[i]+(b1/a0)*x1+(b2/a0)*x2-(a1/a0)*y1-(a2/a0)*y2;
   x2=x1;x1=y[i];y2=y1;y1=v;o[i]=v;}y=o;}return y;}
// Schroeder backward-integrated decay: linear fit dB over [d1,d2] below peak -> extrapolate T60
function rtSchroeder(x,sr,onset,d1=-5,d2=-25){
 const seg=x.subarray(onset);
 let pk=0,pi=0;for(let i=0;i<seg.length;i++){const a=Math.abs(seg[i]);if(a>pk){pk=a;pi=i;}}
 const s=seg.subarray(pi);
 const e=new Float64Array(s.length);let acc=0;
 for(let i=s.length-1;i>=0;i--){acc+=s[i]*s[i];e[i]=acc;}
 const db=new Float64Array(s.length);const e0=e[0];
 for(let i=0;i<s.length;i++)db[i]=10*Math.log10(e[i]/e0+1e-30);
 let i1=-1,i2=-1;
 for(let i=0;i<s.length;i++){if(i1<0&&db[i]<=d1)i1=i;if(db[i]<=d2){i2=i;break;}}
 if(i1<0||i2<0||i2<=i1)return null;
 let n=0,sx=0,sy=0,sxx=0,sxy=0;
 for(let i=i1;i<=i2;i++){const t=i/sr;n++;sx+=t;sy+=db[i];sxx+=t*t;sxy+=t*db[i];}
 const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx);       // dB/s (negative)
 // T-x times measured directly too
 const tAt=(d)=>{for(let i=0;i<s.length;i++)if(db[i]<=d)return i/sr;return -1;};
 return {t60:-60/slope,slope,t20:tAt(-20),t30:tAt(-30),t40:tAt(-40)};
}
function onsetOf(x,sr){let pk=0;for(const v of x)pk=Math.max(pk,Math.abs(v));
 for(let i=0;i<x.length;i++)if(Math.abs(x[i])>0.1*pk)return Math.max(0,i-Math.round(0.005*sr));return 0;}
function spec(x,sr,N=16384){const win=new Float32Array(N);
 for(let i=0;i<N;i++)win[i]=0.5-0.5*Math.cos(2*Math.PI*i/N);
 const mag=new Float64Array(N/2);let fr=0;
 for(let s=0;s+N<=x.length;s+=N/2){const re=new Float64Array(N),im=new Float64Array(N);
  for(let i=0;i<N;i++)re[i]=x[s+i]*win[i];fftr(re,im);
  for(let k=0;k<N/2;k++)mag[k]+=Math.hypot(re[k],im[k]);fr++;}
 for(let k=0;k<N/2;k++)mag[k]/=Math.max(1,fr);return {mag,binHz:sr/N};}
function fftr(re,im){const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);
  for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){
   const ur=re[i+k],ui=im[i+k];
   const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
   re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;
   const ncr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=ncr;}}}}
function bandE(mag,binHz,f0,f1){let s=0;for(let k=Math.max(1,Math.ceil(f0/binHz));k<Math.round(f1/binHz)&&k<mag.length;k++)s+=mag[k]*mag[k];return s;}
function bandShare(x,sr){const{mag,binHz}=spec(x,sr);const tot=bandE(mag,binHz,20,20000);
 return {sub120:bandE(mag,binHz,20,120)/tot,b120_400:bandE(mag,binHz,120,400)/tot,
  b400_2k:bandE(mag,binHz,400,2000)/tot,b2k_8k:bandE(mag,binHz,2000,8000)/tot,
  a8k:bandE(mag,binHz,8000,20000)/tot};}
// smoothed spectral peaks (formant-ish) in a range
function peaks(x,sr,lo,hi,nsm=9){const{mag,binHz}=spec(x,sr);
 const sm=new Float64Array(mag.length);
 for(let k=0;k<mag.length;k++){let s=0,c=0;for(let j=k-nsm;j<=k+nsm;j++)if(j>0&&j<mag.length){s+=mag[j];c++;}sm[k]=s/c;}
 const out=[];const k0=Math.round(lo/binHz),k1=Math.round(hi/binHz);
 for(let k=k0+1;k<Math.min(k1,mag.length-1);k++){
  if(sm[k]>sm[k-1]&&sm[k]>=sm[k+1]){
   let loc=0,c=0;for(let j=k-120;j<=k+120;j++)if(j>0&&j<sm.length){loc+=sm[j];c++;}
   out.push({f:Math.round(k*binHz),prom:+(20*Math.log10(sm[k]/(loc/c))).toFixed(1)});}}
 out.sort((a,b)=>b.prom-a.prom);return out.slice(0,5);}
const OCT=[63,125,250,500,1000,2000,4000,8000];
function report(name,x,sr){
 const on=onsetOf(x,sr);
 const full=rtSchroeder(x,sr,on);
 const per=OCT.map(f=>{const r=rtSchroeder(bp(x,sr,f,1.4),sr,on);return r?+r.t60.toFixed(2):null;});
 const bs=bandShare(x.subarray(on),sr);
 console.log(`\n## ${name}`);
 console.log(' T60(broadband) %s s   T20 %s  T30 %s  T40 %s',
   full?full.t60.toFixed(2):'n/a',full?full.t20.toFixed(3):'-',full?full.t30.toFixed(3):'-',full?full.t40.toFixed(3):'-');
 console.log(' T60 per oct   ',OCT.map((f,i)=>`${f}:${per[i]??'-'}`).join('  '));
 console.log(' band share    ',Object.entries(bs).map(([k,v])=>`${k}=${(100*v).toFixed(1)}%`).join(' '));
}
const mode=process.argv[2];
if(mode==='crash'){
 const o=ours('ours-crash-solo.wav');report('OURS crash (isolated)',o.x,o.sr);
 for(const m of ['crash-impact-01.mp3','crash-impact-02.mp3']){const r=ref(m);report('REF '+m,r.x,r.sr);}
}
if(mode==='squeal'){
 const o=ours('ours-squeal.wav');
 // steady window 1.5-3.5s
 const seg=o.x.subarray(Math.round(1.5*o.sr),Math.round(3.5*o.sr));
 console.log('\n## OURS squeal (ours-squeal.wav, 1.5-3.5s)');
 console.log(' peaks 300-8000:',JSON.stringify(peaks(seg,o.sr,300,8000)));
  console.log(' peaks 500-8000:',JSON.stringify(peaks(seg,o.sr,500,8000)));
 console.log(' band share:',JSON.stringify(bandShare(seg,o.sr)));
 for(const [m,sk] of [['tire-screech-01.mp3',0.5],['tire-screech-02.mp3',1.0]]){
  const r=ref(m);const s=r.x.subarray(Math.round(sk*r.sr),Math.round((sk+2)*r.sr));
  console.log(`\n## REF ${m} (${sk}-${sk+2}s)`);
  console.log(' peaks 300-8000:',JSON.stringify(peaks(s,r.sr,300,8000)));
  console.log(' peaks 500-8000:',JSON.stringify(peaks(s,r.sr,500,8000)));
  console.log(' band share:',JSON.stringify(bandShare(s,r.sr)));}
}
if(mode==='engine'){
 for(const f of ['ours-idle.wav','ours-engine-high.wav']){const o=ours(f);
  const seg=o.x.subarray(Math.round(2*o.sr),Math.round(4*o.sr));
  const {mag,binHz}=spec(seg,o.sr);
  // harmonic comb strength: best f0 by harmonic-sum, then HNR
  let best={f0:0,sc:0};
  for(let f0=15;f0<=200;f0+=0.25){let sc=0;for(let h=1;h<=30;h++){const k=Math.round(h*f0/binHz);if(k<mag.length)sc+=mag[k];}
   if(sc>best.sc)best={f0,sc};}
  let hE=0,tE=0;
  for(let k=1;k<Math.round(6000/binHz);k++){tE+=mag[k]*mag[k];}
  for(let h=1;h<=40;h++){const kc=h*best.f0/binHz;for(let k=Math.round(kc-2);k<=Math.round(kc+2);k++)if(k>0&&k<mag.length)hE+=mag[k]*mag[k];}
  console.log(`\n## ${f}: f0=${best.f0.toFixed(2)} Hz  harmonic/total(0-6k)=${(hE/tE).toFixed(3)}`);
  console.log('  first 12 partials dB:',Array.from({length:12},(_,i)=>{const k=Math.round((i+1)*best.f0/binHz);return (20*Math.log10(mag[k]+1e-12)).toFixed(1);}).join(' '));
  console.log('  band share:',JSON.stringify(bandShare(seg,o.sr)));}
 for(const [m,sk] of [['engine-idle-02.mp3',1.0],['engine-loop-01.mp3',4.0]]){
  const r=ref(m);const seg=r.x.subarray(Math.round(sk*r.sr),Math.round((sk+2)*r.sr));
  const {mag,binHz}=spec(seg,r.sr);
  let best={f0:0,sc:0};
  for(let f0=15;f0<=200;f0+=0.25){let sc=0;for(let h=1;h<=30;h++){const k=Math.round(h*f0/binHz);if(k<mag.length)sc+=mag[k];}
   if(sc>best.sc)best={f0,sc};}
  let hE=0,tE=0;for(let k=1;k<Math.round(6000/binHz);k++)tE+=mag[k]*mag[k];
  for(let h=1;h<=40;h++){const kc=h*best.f0/binHz;for(let k=Math.round(kc-2);k<=Math.round(kc+2);k++)if(k>0&&k<mag.length)hE+=mag[k]*mag[k];}
  console.log(`\n## REF ${m}: f0=${best.f0.toFixed(2)} Hz  harmonic/total(0-6k)=${(hE/tE).toFixed(3)}`);
  console.log('  first 12 partials dB:',Array.from({length:12},(_,i)=>{const k=Math.round((i+1)*best.f0/binHz);return (20*Math.log10(mag[k]+1e-12)).toFixed(1);}).join(' '));
  console.log('  band share:',JSON.stringify(bandShare(seg,r.sr)));}
}
if(mode==='boost'){
 const o=ours('ours-boost-solo.wav');
 // onset at 1.0s. envelope + band centroid trajectory
 const sr=o.sr;const w=Math.round(sr*0.01);const env=[];
 for(let i=0;i+w<=o.x.length;i+=w){let s=0;for(let j=0;j<w;j++)s+=o.x[i+j]**2;env.push(Math.sqrt(s/w));}
 const pk=Math.max(...env),pi=env.indexOf(pk);
 console.log('\n## OURS boost (isolated): peakAt=%s s  onset(10%%->peak)=%s ms',(pi*0.01).toFixed(2),
  (()=>{for(let i=pi;i>=0;i--)if(env[i]<0.1*pk)return ((pi-i)*10).toFixed(0);return '?';})());
 for(const [a,b] of [[1.0,1.15],[1.15,1.5],[1.5,2.5]]){
  const s=o.x.subarray(Math.round(a*sr),Math.round(b*sr));
  const{mag,binHz}=spec(s,sr,8192);let sm=0,ws=0;for(let k=1;k<mag.length;k++){sm+=mag[k];ws+=mag[k]*k*binHz;}
  console.log(`  ${a}-${b}s centroid=${Math.round(ws/sm)} Hz  bands=${JSON.stringify(bandShare(s,sr))}`);}
 for(const m of ['boost-whoosh-01.mp3','boost-whoosh-02.mp3']){
  const r=ref(m);const on=onsetOf(r.x,r.sr);
  const w2=Math.round(r.sr*0.01);const e2=[];
  for(let i=0;i+w2<=r.x.length;i+=w2){let s=0;for(let j=0;j<w2;j++)s+=r.x[i+j]**2;e2.push(Math.sqrt(s/w2));}
  const p2=Math.max(...e2),q2=e2.indexOf(p2);
  console.log(`\n## REF ${m}: onsetSample=${(on/r.sr).toFixed(2)}s peakAt=${(q2*0.01).toFixed(2)}s onset=${(()=>{for(let i=q2;i>=0;i--)if(e2[i]<0.1*p2)return ((q2-i)*10).toFixed(0);return '?';})()} ms`);
  const t0=on/r.sr;
  for(const [a,b] of [[t0,t0+0.15],[t0+0.15,t0+0.5],[t0+0.5,t0+1.5]]){
   const s=r.x.subarray(Math.round(a*r.sr),Math.min(r.x.length,Math.round(b*r.sr)));
   if(s.length<8192)continue;
   const{mag,binHz}=spec(s,r.sr,8192);let sm=0,ws=0;for(let k=1;k<mag.length;k++){sm+=mag[k];ws+=mag[k]*k*binHz;}
   console.log(`  ${a.toFixed(2)}-${b.toFixed(2)}s centroid=${Math.round(ws/sm)} Hz bands=${JSON.stringify(bandShare(s,r.sr))}`);}}
}
if(mode==='sweep'){
 const o=ours('ours-gears.wav');const sr=o.sr;const W=8192;
 console.log('\n## ours-gears.wav f0 trajectory (firing freq via harmonic sum)');
 const rows=[];
 for(let t=0.25;t*sr+W<o.x.length;t+=0.25){
  const s=o.x.subarray(Math.round(t*sr),Math.round(t*sr)+W);
  const{mag,binHz}=spec(s,sr,W);
  let best={f:0,sc:0};
  for(let f=40;f<=340;f+=0.5){let sc=0;for(let h=1;h<=12;h++){const k=Math.round(h*f/binHz);if(k<mag.length)sc+=mag[k];}if(sc>best.sc)best={f,sc};}
  let sm=0,ws=0;for(let k=1;k<mag.length;k++){sm+=mag[k];ws+=mag[k]*k*binHz;}
  rows.push(`${t.toFixed(2)}s f0=${best.f.toFixed(1)} cen=${Math.round(ws/sm)}`);}
 console.log(rows.join('\n'));
}
