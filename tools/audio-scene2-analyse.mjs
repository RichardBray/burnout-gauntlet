// Analyse tools/audio-scene2.mjs output: real RT60 per space, and the rival's
// isolated pan / distance / doppler trajectory.
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
    R[i] = data.readInt16LE((i * fmt.ch + 1) * 2) / 32768;
    M[i] = (L[i] + R[i]) / 2;
  }
  return { L, R, M, sr: fmt.sr, n };
}
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
function env(x, sr, w = 0.01) {
  const N = Math.round(sr * w), e = [];
  for (let i = 0; i + N <= x.length; i += N) {
    let s = 0; for (let j = 0; j < N; j++) s += x[i + j] * x[i + j];
    e.push(Math.sqrt(s / N));
  }
  return { e, dt: w };
}

console.log('#################### RT / late energy per space (isolated crash) ####################');
const rows = {};
for (const sp of ['open', 'city', 'tunnel']) {
  const w = readWav(join(dir, `ours-rev-${sp}.wav`));
  const { e, dt } = env(w.M, w.sr, 0.01);
  const pk = Math.max(...e), pi = e.indexOf(pk);
  const tAt = (frac) => {
    for (let i = pi; i < e.length; i++) if (e[i] < pk * frac) return (i - pi) * dt * 1000;
    return -1;
  };
  const t20 = tAt(Math.pow(10, -20 / 20)), t40 = tAt(Math.pow(10, -40 / 20)), t60 = tAt(Math.pow(10, -60 / 20));
  // late/early energy split at 80 ms after the peak (Clarity C80-style)
  let early = 0, late = 0;
  const split = pi + Math.round(0.08 / dt);
  for (let i = pi; i < e.length; i++) { const p = e[i] * e[i]; if (i < split) early += p; else late += p; }
  // inter-channel correlation of the tail only (last 2 s)
  const s0 = Math.round(w.sr * 2.0);
  let num = 0, dl = 0, dr = 0;
  for (let i = s0; i < w.n; i++) { num += w.L[i] * w.R[i]; dl += w.L[i] ** 2; dr += w.R[i] ** 2; }
  const corr = num / Math.sqrt(dl * dr + 1e-20);
  let tailRms = Math.sqrt(dl / (w.n - s0));
  rows[sp] = { t20, t40, t60, c80: 10 * Math.log10(early / (late + 1e-20)), corr, tail: db(tailRms) - db(pk) };
  console.log(`${sp.padEnd(7)} T-20dB ${t20.toFixed(0)} ms  T-40dB ${t40.toFixed(0)} ms  T-60dB ${t60 < 0 ? '>4000' : t60.toFixed(0)} ms` +
    `  C80 ${rows[sp].c80.toFixed(1)} dB  tail(2-4.5s) ${rows[sp].tail.toFixed(1)} dB below peak  tail L/R corr ${corr.toFixed(3)}`);
}
console.log(`\nspread across the three spaces:  ΔT-40dB ${(rows.tunnel.t40 - rows.open.t40).toFixed(0)} ms` +
  `   ΔC80 ${(rows.open.c80 - rows.tunnel.c80).toFixed(1)} dB   Δtail level ${(rows.tunnel.tail - rows.open.tail).toFixed(1)} dB` +
  `   Δtail corr ${(rows.tunnel.corr - rows.open.corr).toFixed(3)}`);
console.log('config says: send 0.06/0.17/0.42, IR 0.7 s / 1.7 s / 2.9 s, revLP 6000/4200/2600 Hz');

console.log('\n#################### isolated rival flyby ####################');
{
  const w = readWav(join(dir, 'ours-flyby-solo.wav'));
  const step = Math.round(w.sr * 0.05);
  const bal = [], lvl = [];
  for (let i = 0; i + step <= w.n; i += step) {
    let l = 0, r = 0;
    for (let j = 0; j < step; j++) { l += w.L[i + j] ** 2; r += w.R[i + j] ** 2; }
    l = Math.sqrt(l / step); r = Math.sqrt(r / step);
    bal.push(db(l) - db(r)); lvl.push(db(Math.sqrt((l * l + r * r) / 2)));
  }
  console.log('L-R balance (dB / 50 ms):', bal.map((v) => v.toFixed(1)).join(' '));
  console.log('level      (dB / 50 ms):', lvl.map((v) => v.toFixed(1)).join(' '));
  console.log(`pan swing ${(Math.max(...bal) - Math.min(...bal)).toFixed(1)} dB   distance-level swing ${(Math.max(...lvl) - Math.min(...lvl)).toFixed(1)} dB`);
  console.log('(pass is 4 m to the driver\'s right, from z=-60 to +60 at 55 m/s; equal-power hard-right = +inf/practically 15-25 dB, inverse rolloff refDistance 6 over 60->4 m = ~+20 dB)');

  // doppler via autocorrelation pitch track of the mono rival
  const N = 4096, hop = 2048;
  const f0s = [];
  for (let s = 0; s + N <= w.n; s += hop) {
    // lowpass-ish: use the mono signal, search lag for 40..400 Hz
    let best = 0, bl = 0;
    const lo = Math.floor(w.sr / 400), hi = Math.floor(w.sr / 40);
    let e0 = 0; for (let i = 0; i < N; i++) e0 += w.M[s + i] ** 2;
    for (let lag = lo; lag <= hi; lag++) {
      let c = 0;
      for (let i = 0; i + lag < N; i++) c += w.M[s + i] * w.M[s + i + lag];
      c /= (e0 + 1e-20);
      if (c > best) { best = c; bl = lag; }
    }
    f0s.push({ f: bl ? w.sr / bl : 0, conf: best });
  }
  console.log('rival f0 track (Hz):', f0s.map((x) => x.f.toFixed(1)).join(' '));
  console.log('confidence         :', f0s.map((x) => x.conf.toFixed(2)).join(' '));
  const good = f0s.filter((x) => x.conf > 0.3);
  const half = Math.floor(f0s.length / 2);
  const mean = (a) => a.reduce((x, y) => x + y.f, 0) / Math.max(1, a.length);
  const app = mean(f0s.slice(2, half - 2).filter((x) => x.conf > 0.3));
  const rec = mean(f0s.slice(half + 2).filter((x) => x.conf > 0.3));
  console.log(`approach f0 ${app.toFixed(1)} Hz -> recede f0 ${rec.toFixed(1)} Hz = ${(1200 * Math.log2(rec / app)).toFixed(0)} cents (textbook -560), usable frames ${good.length}/${f0s.length}`);
}
