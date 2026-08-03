// Analyse the round-3 scene captures written by tools/audio-scene.mjs.
// Everything here is measurable-only - no listening required.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const dir = resolve(here, '../shots/audio');

function readWav(path) {
  const b = readFileSync(path);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + sz);
    off += 8 + sz + (sz & 1);
  }
  const n = Math.floor(data.length / 2 / fmt.ch);
  const L = new Float32Array(n), R = new Float32Array(n), M = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = data.readInt16LE(i * fmt.ch * 2) / 32768;
    R[i] = fmt.ch > 1 ? data.readInt16LE((i * fmt.ch + 1) * 2) / 32768 : L[i];
    M[i] = (L[i] + R[i]) / 2;
  }
  return { L, R, M, sr: fmt.sr, n };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
function specFrames(x, sr, N = 2048, hop = 512) {
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const out = [];
  for (let s = 0; s + N <= x.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    const m = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) m[k] = Math.hypot(re[k], im[k]);
    out.push(m);
  }
  return { frames: out, binHz: sr / N, hopS: hop / sr };
}
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
function rmsEnv(x, sr, winS = 0.02) {
  const w = Math.round(sr * winS), e = [];
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0; for (let j = 0; j < w; j++) s += x[i + j] * x[i + j];
    e.push(Math.sqrt(s / w));
  }
  return { e, dt: winS };
}
function centroid(m, binHz) {
  let s = 0, w = 0;
  for (let k = 1; k < m.length; k++) { s += m[k]; w += m[k] * k * binHz; }
  return w / (s || 1);
}
/** log-magnitude spectral envelope, normalised, for shape comparison */
function shape(m, binHz, fmin = 60, fmax = 12000, nb = 40) {
  const out = [];
  for (let b = 0; b < nb; b++) {
    const f0 = fmin * Math.pow(fmax / fmin, b / nb), f1 = fmin * Math.pow(fmax / fmin, (b + 1) / nb);
    let s = 0, c = 0;
    for (let k = Math.max(1, Math.round(f0 / binHz)); k <= Math.min(m.length - 1, Math.round(f1 / binHz)); k++) { s += m[k] * m[k]; c++; }
    out.push(c ? 10 * Math.log10(s / c + 1e-20) : -200);
  }
  const mx = Math.max(...out);
  return out.map((v) => v - mx);
}

console.log('#################### 1. GEAR SHIFTS ####################');
{
  const g = readWav(join(dir, 'ours-gears.wav'));
  const { e, dt } = rmsEnv(g.M, g.sr, 0.01);
  const { frames, binHz, hopS } = specFrames(g.M, g.sr);
  // spectral flux per frame
  const flux = [];
  for (let i = 1; i < frames.length; i++) {
    let s = 0;
    for (let k = 1; k < frames[i].length; k++) { const d = frames[i][k] - frames[i - 1][k]; if (d > 0) s += d * d; }
    flux.push(Math.sqrt(s));
  }
  const fluxMed = [...flux].sort((a, b) => a - b)[Math.floor(flux.length / 2)];
  console.log('median spectral flux', fluxMed.toFixed(3));
  for (const t of [1.4, 2.8, 4.2, 5.6]) {
    const i = Math.round(t / dt);
    const pre = Math.max(...e.slice(i - 20, i));                 // 200 ms before
    const dip = Math.min(...e.slice(i, i + 30));                 // 300 ms window
    const back = Math.max(...e.slice(i + 20, i + 50));
    let recov = -1;
    for (let k = i; k < i + 60 && k < e.length; k++) if (e[k] >= pre * 0.9) { recov = (k - i) * dt * 1000; break; }
    const fi = Math.round(t / hopS);
    const fpk = Math.max(...flux.slice(Math.max(0, fi - 2), fi + 6));
    console.log(`shift @${t.toFixed(1)}s  duckDepth ${(db(dip) - db(pre)).toFixed(1)} dB` +
      `  recover ${recov < 0 ? '>600' : recov.toFixed(0)} ms  fluxPeak/median ${(fpk / fluxMed).toFixed(1)}x` +
      `  post/pre ${(db(back) - db(pre)).toFixed(1)} dB`);
  }
  // pitch-normalised timbre per gear, sampled at matched rpm (u = 0.85 of each pull)
  const shapes = [];
  for (let gear = 1; gear <= 5; gear++) {
    const t = (gear - 1) * 1.4 + 1.4 * 0.85;
    const fi = Math.round(t / hopS);
    let acc = new Float64Array(frames[fi].length);
    for (let k = fi - 3; k <= fi + 3; k++) for (let b = 0; b < acc.length; b++) acc[b] += frames[k][b];
    shapes.push({ gear, cen: centroid(acc, binHz), sh: shape(acc, binHz) });
  }
  console.log('\nsame-rpm point in each gear (rpm01=0.87 in all five):');
  for (const s of shapes) console.log(`  gear ${s.gear}  centroid ${Math.round(s.cen)} Hz`);
  console.log('pairwise mean |Δ| of the 40-band pitch-agnostic envelope, gear vs gear 1:');
  for (let i = 1; i < shapes.length; i++) {
    const d = shapes[i].sh.map((v, k) => Math.abs(v - shapes[0].sh[k]));
    console.log(`  gear ${shapes[i].gear} vs 1: mean ${(d.reduce((a, b) => a + b) / d.length).toFixed(2)} dB  max ${Math.max(...d).toFixed(1)} dB`);
  }
  // within-gear variation for scale: start vs end of gear 3's pull
  const a = Math.round((2 * 1.4 + 0.15) / hopS), b = Math.round((2 * 1.4 + 1.25) / hopS);
  const sa = shape(frames[a], binHz), sb = shape(frames[b], binHz);
  const dd = sa.map((v, k) => Math.abs(v - sb[k]));
  console.log(`  (scale ref) gear 3 low-rpm vs high-rpm: mean ${(dd.reduce((x, y) => x + y) / dd.length).toFixed(2)} dB  max ${Math.max(...dd).toFixed(1)} dB`);
}

console.log('\n#################### 2. SPACES (open/city/tunnel) ####################');
{
  const S = {};
  for (const id of ['open', 'city', 'tunnel']) S[id] = readWav(join(dir, `ours-space-${id}.wav`));
  const stats = {};
  for (const id of Object.keys(S)) {
    const w = S[id];
    let num = 0, dl = 0, dr = 0, pk = 0, sum = 0;
    for (let i = 0; i < w.n; i++) {
      num += w.L[i] * w.R[i]; dl += w.L[i] * w.L[i]; dr += w.R[i] * w.R[i];
      const a = Math.abs(w.M[i]); if (a > pk) pk = a; sum += w.M[i] * w.M[i];
    }
    const corr = num / Math.sqrt(dl * dr);
    const rms = Math.sqrt(sum / w.n);
    const { frames, binHz } = specFrames(w.M, w.sr);
    let acc = new Float64Array(frames[0].length);
    for (const f of frames) for (let k = 0; k < acc.length; k++) acc[k] += f[k];
    stats[id] = { corr, rmsDb: db(rms), crest: db(pk) - db(rms), cen: centroid(acc, binHz), sh: shape(acc, binHz) };
    console.log(`${id.padEnd(7)} rms ${stats[id].rmsDb.toFixed(2)} dB  crest ${stats[id].crest.toFixed(2)} dB` +
      `  L/R corr ${corr.toFixed(4)}  centroid ${Math.round(stats[id].cen)} Hz`);
  }
  const pairs = [['open', 'city'], ['city', 'tunnel'], ['open', 'tunnel']];
  for (const [a, b] of pairs) {
    const d = stats[a].sh.map((v, k) => Math.abs(v - stats[b].sh[k]));
    // sample-domain difference energy relative to the source (same seed => valid)
    const A = S[a], B = S[b];
    let dn = 0, an = 0;
    for (let i = 0; i < A.n; i++) { const x = A.M[i] - B.M[i]; dn += x * x; an += A.M[i] * A.M[i]; }
    console.log(`${a} vs ${b}: spectral mean|Δ| ${(d.reduce((x, y) => x + y) / d.length).toFixed(2)} dB  max ${Math.max(...d).toFixed(1)} dB` +
      `  |difference| ${(10 * Math.log10(dn / an)).toFixed(1)} dB rel source  ΔL/R-corr ${(stats[b].corr - stats[a].corr).toFixed(4)}`);
  }
  // reverb tail test: energy decay after the render's own onset is hard here, so use
  // late-to-early energy via the autocorrelation of the envelope instead.
  for (const id of Object.keys(S)) {
    const { e } = rmsEnv(S[id].M, S[id].sr, 0.005);
    const sorted = [...e].sort((a, b) => a - b);
    console.log(`${id.padEnd(7)} env p05 ${db(sorted[Math.floor(sorted.length * 0.05)]).toFixed(1)} dB  p50 ${db(sorted[Math.floor(sorted.length * 0.5)]).toFixed(1)} dB  p95 ${db(sorted[Math.floor(sorted.length * 0.95)]).toFixed(1)} dB`);
  }
}

console.log('\n#################### 3. FLYBY (pan / distance / doppler) ####################');
{
  const w = readWav(join(dir, 'ours-flyby.wav'));
  const step = Math.round(w.sr * 0.05);
  const rows = [];
  for (let i = 0; i + step <= w.n; i += step) {
    let l = 0, r = 0, s = 0;
    for (let j = 0; j < step; j++) { l += w.L[i + j] ** 2; r += w.R[i + j] ** 2; s += (w.L[i + j] - w.R[i + j]) ** 2; }
    rows.push({ t: i / w.sr, bal: db(Math.sqrt(l / step)) - db(Math.sqrt(r / step)), side: db(Math.sqrt(s / step)) });
  }
  const bals = rows.map((r) => r.bal), sides = rows.map((r) => r.side);
  console.log('L-R balance over the pass (dB, every 50 ms):');
  console.log(rows.map((r) => r.bal.toFixed(1)).join(' '));
  console.log(`balance swing ${(Math.max(...bals) - Math.min(...bals)).toFixed(1)} dB   side-channel swing ${(Math.max(...sides) - Math.min(...sides)).toFixed(1)} dB`);
  // doppler: track the side-signal (mostly the panned rival) spectral centroid
  const side = new Float32Array(w.n);
  for (let i = 0; i < w.n; i++) side[i] = w.L[i] - w.R[i];
  const { frames, binHz, hopS } = specFrames(side, w.sr, 4096, 2048);
  const cens = frames.map((f) => centroid(f, binHz));
  console.log('side-channel centroid Hz over the pass:', cens.map((c) => Math.round(c)).join(' '));
  const half = Math.floor(cens.length / 2);
  const before = cens.slice(1, half).reduce((a, b) => a + b, 0) / (half - 1);
  const after = cens.slice(half).reduce((a, b) => a + b, 0) / (cens.length - half);
  console.log(`approach mean ${Math.round(before)} Hz -> recede mean ${Math.round(after)} Hz  = ${(1200 * Math.log2(after / before)).toFixed(0)} cents`);
  console.log(`(rival 55 m/s head-on/tail-on: textbook doppler = ${(1200 * Math.log2(((343 - 55) / (343 + 55)))).toFixed(0)} cents)`);
}

console.log('\n#################### 4. BUSY MIX (dynamics / masking) ####################');
{
  const w = readWav(join(dir, 'ours-busy.wav'));
  const { e, dt } = rmsEnv(w.M, w.sr, 0.02);
  const sorted = [...e].sort((a, b) => a - b);
  const p = (q) => db(sorted[Math.floor(sorted.length * q)]);
  let pk = 0, sum = 0;
  for (let i = 0; i < w.n; i++) { const a = Math.abs(w.M[i]); if (a > pk) pk = a; sum += w.M[i] * w.M[i]; }
  const rms = db(Math.sqrt(sum / w.n));
  console.log(`peak ${db(pk).toFixed(2)} dB  rms ${rms.toFixed(2)} dB  crest ${(db(pk) - rms).toFixed(2)} dB`);
  console.log(`short-term envelope p10 ${p(0.10).toFixed(1)}  p50 ${p(0.5).toFixed(1)}  p90 ${p(0.9).toFixed(1)}  p99 ${p(0.99).toFixed(1)} dB`);
  console.log(`loudness range p90-p10 = ${(p(0.9) - p(0.1)).toFixed(1)} dB`);
  const seg = (a, b) => {
    let s = 0, c = 0, mx = 0;
    for (let i = Math.round(a / dt); i < Math.round(b / dt) && i < e.length; i++) { s += e[i] * e[i]; c++; mx = Math.max(mx, e[i]); }
    return { rms: db(Math.sqrt(s / c)), pk: db(mx) };
  };
  const before = seg(0.3, 0.95), boost = seg(1.1, 1.55), tyre = seg(1.7, 2.35), crash = seg(2.4, 2.9), tail = seg(3.2, 3.9);
  console.log(`engine-only  rms ${before.rms.toFixed(2)}  peak ${before.pk.toFixed(2)}`);
  console.log(`+boost       rms ${boost.rms.toFixed(2)}  peak ${boost.pk.toFixed(2)}   (Δrms ${(boost.rms - before.rms).toFixed(2)} dB)`);
  console.log(`+tyre        rms ${tyre.rms.toFixed(2)}  peak ${tyre.pk.toFixed(2)}   (Δrms ${(tyre.rms - before.rms).toFixed(2)} dB)`);
  console.log(`+crash       rms ${crash.rms.toFixed(2)}  peak ${crash.pk.toFixed(2)}   (crash peak above bed ${(crash.pk - tyre.rms).toFixed(2)} dB)`);
  console.log(`tail         rms ${tail.rms.toFixed(2)}  peak ${tail.pk.toFixed(2)}`);
  // how much of the render is within 3 dB of the loudest 20 ms frame
  const top = sorted[sorted.length - 1];
  let near = 0; for (const v of e) if (db(v) > db(top) - 3) near++;
  console.log(`frames within 3 dB of loudest: ${(100 * near / e.length).toFixed(1)}%`);
}
