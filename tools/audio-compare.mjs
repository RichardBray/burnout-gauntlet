// Blind numeric comparison of ours-*.wav against reference/audio/*.mp3.
// Pure-JS: decodes refs via ffmpeg to temp wav, then measures level, spectrum,
// harmonicity and envelope. No listening required.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const rootDir = resolve(here, '..');
const oursDir = join(rootDir, 'shots/audio');
const refDir = join(rootDir, 'reference/audio');
const tmp = mkdtempSync(join(tmpdir(), 'aud-'));
const SR = 48000;

// ---------- io ----------
function readWavMono(path) {
  const b = readFileSync(path);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + sz);
    off += 8 + sz + (sz & 1);
  }
  const n = Math.floor(data.length / 2 / fmt.ch);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
    out[i] = s / fmt.ch;
  }
  return { x: out, sr: fmt.sr };
}
function decodeRef(mp3) {
  const out = join(tmp, mp3.replace(/\W/g, '_') + '.wav');
  execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-i', join(refDir, mp3), '-ac', '1', '-ar', String(SR), out]);
  return readWavMono(out);
}

// ---------- dsp ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
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
const N = 8192;
function avgSpectrum(x, sr) {
  const hop = N / 2;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const mag = new Float64Array(N / 2);
  let frames = 0;
  for (let s = 0; s + N <= x.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  for (let k = 0; k < N / 2; k++) mag[k] /= Math.max(1, frames);
  return { mag, binHz: sr / N };
}
function centroidRolloff(mag, binHz) {
  let sum = 0, wsum = 0;
  for (let k = 1; k < mag.length; k++) { sum += mag[k]; wsum += mag[k] * k * binHz; }
  const cen = wsum / (sum || 1);
  let acc = 0, roll = 0;
  for (let k = 1; k < mag.length; k++) { acc += mag[k]; if (acc >= 0.85 * sum) { roll = k * binHz; break; } }
  return { cen, roll };
}
function bands32(mag, binHz) {
  const lo = 25, hi = 20000, out = [];
  for (let b = 0; b < 32; b++) {
    const f0 = lo * Math.pow(hi / lo, b / 32), f1 = lo * Math.pow(hi / lo, (b + 1) / 32);
    let s = 0, c = 0;
    for (let k = Math.max(1, Math.round(f0 / binHz)); k <= Math.min(mag.length - 1, Math.round(f1 / binHz)); k++) { s += mag[k] * mag[k]; c++; }
    out.push(c ? 10 * Math.log10(s / c + 1e-20) : -200);
  }
  const m = Math.max(...out);
  return out.map((v) => +(v - m).toFixed(1));
}
/** Spectral flatness (geometric/arithmetic mean of power) - 1=noise, ~0=tonal. */
function flatness(mag, binHz, fmin = 40, fmax = 16000) {
  let lg = 0, ar = 0, c = 0;
  for (let k = Math.round(fmin / binHz); k < Math.min(mag.length, Math.round(fmax / binHz)); k++) {
    const p = mag[k] * mag[k] + 1e-20;
    lg += Math.log(p); ar += p; c++;
  }
  return Math.exp(lg / c) / (ar / c);
}
/** Peak picking + integer-partial test -> f0, #harmonic peaks, harmonic energy fraction. */
function harmonics(mag, binHz) {
  const peaks = [];
  for (let k = 3; k < Math.min(mag.length - 3, Math.round(6000 / binHz)); k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
      let loc = 0;
      for (let j = k - 12; j <= k + 12; j++) if (j > 0 && j < mag.length) loc += mag[j];
      loc /= 25;
      if (mag[k] > 3 * loc) peaks.push({ f: k * binHz, m: mag[k], prom: mag[k] / loc });
    }
  }
  peaks.sort((a, b) => b.m - a.m);
  const top = peaks.slice(0, 40);
  let best = { f0: 0, count: 0, score: 0 };
  for (let f0 = 20; f0 <= 400; f0 += 0.5) {
    let count = 0, score = 0;
    for (const p of top) {
      const r = p.f / f0, nr = Math.round(r);
      if (nr >= 1 && nr <= 40 && Math.abs(r - nr) < 0.06) { count++; score += p.m; }
    }
    if (score > best.score) best = { f0, count, score };
  }
  let tot = 0;
  for (let k = 1; k < Math.min(mag.length, Math.round(6000 / binHz)); k++) tot += mag[k];
  // energy sitting in narrow prominent peaks vs the broadband bed
  let peakE = 0; for (const p of top) peakE += p.m * 25;
  return { f0: +best.f0.toFixed(1), harmonicPeaks: best.count, totalPeaks: peaks.length, peakEnergyFrac: +(peakE / (tot || 1)).toFixed(3) };
}
function envelope(x, sr) {
  const w = Math.round(sr * 0.005), env = [];
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0; for (let j = 0; j < w; j++) s += x[i + j] * x[i + j];
    env.push(Math.sqrt(s / w));
  }
  const pk = Math.max(...env), pi = env.indexOf(pk);
  let a = 0; for (let i = pi; i >= 0; i--) { if (env[i] < 0.1 * pk) { a = (pi - i) * 5; break; } }
  let d = -1; for (let i = pi; i < env.length; i++) if (env[i] < pk * 0.1) { d = (i - pi) * 5; break; }
  // envelope roughness: mean abs frame-to-frame dB change (smooth synth = tiny)
  let rough = 0, c = 0;
  for (let i = 1; i < env.length; i++) {
    if (env[i] > pk * 0.05 && env[i - 1] > pk * 0.05) { rough += Math.abs(20 * Math.log10(env[i] / env[i - 1])); c++; }
  }
  const sorted = [...env].sort((p, q) => p - q);
  return {
    attackMs: a, decayTo10pctMs: d,
    roughnessDbPerFrame: +(rough / Math.max(1, c)).toFixed(2),
    p05: sorted[Math.floor(sorted.length * 0.05)], median: sorted[Math.floor(sorted.length / 2)],
  };
}
function measure(x, sr, label) {
  let peak = 0, sum = 0;
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
  const rms = Math.sqrt(sum / x.length);
  const { mag, binHz } = avgSpectrum(x, sr);
  const { cen, roll } = centroidRolloff(mag, binHz);
  const e = envelope(x, sr);
  // low band energy share
  let lowE = 0, tot = 0;
  for (let k = 1; k < mag.length; k++) { const p = mag[k] * mag[k]; tot += p; if (k * binHz < 200) lowE += p; }
  return {
    label,
    rmsDb: +(20 * Math.log10(rms + 1e-12)).toFixed(2),
    peakDb: +(20 * Math.log10(peak + 1e-12)).toFixed(2),
    crestDb: +(20 * Math.log10(peak / (rms + 1e-12))).toFixed(2),
    centroidHz: Math.round(cen),
    rolloff85Hz: Math.round(roll),
    sub200Share: +(lowE / tot).toFixed(3),
    flatness: +flatness(mag, binHz).toFixed(4),
    ...harmonics(mag, binHz),
    noiseFloorDb: +(20 * Math.log10(e.p05 + 1e-12)).toFixed(1),
    floorBelowMedianDb: +(20 * Math.log10(e.median / (e.p05 + 1e-12))).toFixed(1),
    attackMs: e.attackMs, decayTo10pctMs: e.decayTo10pctMs,
    envRoughnessDb: e.roughnessDbPerFrame,
    bands32: bands32(mag, binHz),
  };
}

// ---------- pairs ----------
// Optional CLI override: node audio-compare.mjs ours-x.wav:ref-y.mp3:refSkipSec ...
const ARGV = process.argv.slice(2).map((a) => {
  const [o, r, s] = a.split(':');
  return [o, r, Number(s || 0)];
});
const PAIRS = ARGV.length ? ARGV : [
  ['ours-idle.wav', 'engine-idle-02.mp3', 1.0],
  ['ours-engine-high.wav', 'engine-loop-01.mp3', 4.0],
  ['ours-boost.wav', 'boost-whoosh-01.mp3', 0.0],
  ['ours-boost.wav', 'boost-whoosh-02.mp3', 0.0],
  ['ours-crash.wav', 'crash-impact-01.mp3', 0.0],
  ['ours-crash.wav', 'crash-impact-02.mp3', 0.0],
  ['ours-squeal.wav', 'tire-screech-01.mp3', 0.3],
  ['ours-squeal.wav', 'tire-screech-02.mp3', 1.0],
];
console.log('available ours:', readdirSync(oursDir).join(' '));
const results = [];
for (const [o, r, skip] of PAIRS) {
  const A = readWavMono(join(oursDir, o));
  const B = decodeRef(r);
  const s = Math.min(Math.floor(skip * B.sr), Math.max(0, B.x.length - B.sr));
  const seg = B.x.subarray(s, Math.min(B.x.length, s + 4 * B.sr));
  results.push({ pair: `${o} vs ${r}`, ours: measure(A.x, A.sr, o), ref: measure(seg, B.sr, r) });
}
for (const R of results) {
  console.log('\n=== ' + R.pair + ' ===');
  const keys = Object.keys(R.ours).filter((k) => k !== 'bands32' && k !== 'label');
  for (const k of keys) console.log(k.padEnd(22), String(R.ours[k]).padStart(10), '  |ref| ', String(R.ref[k]).padStart(10));
  console.log('bands ours', R.ours.bands32.join(','));
  console.log('bands ref ', R.ref.bands32.join(','));
  const d = R.ours.bands32.map((v, i) => Math.abs(v - R.ref.bands32[i]));
  console.log('band |Δ| mean', (d.reduce((a, b) => a + b, 0) / 32).toFixed(1), 'max', Math.max(...d).toFixed(1));
}
