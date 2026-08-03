// Ignition-envelope measure (wave-m audio brief, targets 1 & 2).
//
// Metrics, all anchored to a DETECTED onset (never a hardcoded time - the wave-m
// critic retired the 0.02 s assumption; ours-boost-solo.wav actually starts at
// 0.0531 s because audio-isolate.mjs steps the gate at 1/60):
//   onset      = first sample with |x| > THRESH (default 1e-4)
//   steady     = rms over [onset+1.3, onset+1.7] s
//   e20/e50    = rms of [onset, onset+20ms] / [onset, onset+50ms], in dB re steady
//   over20     = max of a 20 ms sliding rms within 400 ms of onset, dB re steady,
//                and the time of that maximum relative to onset
//   hold3      = total ms within 400 ms of onset for which the 10 ms sliding rms
//                stays >= +3 dB over steady ("sustained-overshoot duration")
//   absPeak    = max |x| in the first 400 ms, in dBFS (level sanity - a ratio that
//                scores well at -50 dBFS is inaudible; pair the metric with the ear)
//
// Usage: node tools/_ignmeas.mjs shots/audio/ours-boost-solo.wav [reference/audio/x.mp3 ...]
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, extname } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'ign-'));
const SR = 48000;
const THRESH = Number(process.env.IGN_THRESH || 1e-4);

function readWavMono(p) {
  const b = readFileSync(p); let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + sz);
    off += 8 + sz + (sz & 1);
  }
  const n = Math.floor(data.length / 2 / fmt.ch), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
    out[i] = s / fmt.ch;
  }
  return { x: out, sr: fmt.sr };
}

function load(p) {
  const abs = resolve(root, p);
  if (extname(abs) === '.wav') return readWavMono(abs);
  const o = join(tmp, Math.random().toString(36).slice(2) + '.wav');
  execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-i', abs, '-ac', '1', '-ar', String(SR), o]);
  return readWavMono(o);
}

const rms = (x, a, b) => {
  a = Math.max(0, a); b = Math.min(x.length, b);
  let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const dB = (v, ref) => 20 * Math.log10((v + 1e-30) / (ref + 1e-30));

function measure(p) {
  const { x, sr } = load(p);
  // Onset is DETECTED, never assumed. For our renders the file is digitally silent
  // before the event so an absolute 1e-4 gate is exact. Decoded mp3 references carry
  // codec noise from sample 0, so they need a peak-relative gate (IGN_REL).
  let on = 0;
  let gpk = 0; for (let i = 0; i < x.length; i++) gpk = Math.max(gpk, Math.abs(x[i]));
  const rel = Number(process.env.IGN_REL || 0);
  const th = rel > 0 ? rel * gpk : THRESH;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > th) { on = i; break; }
  const steady = rms(x, on + Math.round(1.3 * sr), on + Math.round(1.7 * sr));
  const w10 = Math.round(0.010 * sr), w20 = Math.round(0.020 * sr);
  const win400 = Math.round(0.400 * sr);

  const e20 = dB(rms(x, on, on + w20), steady);
  const e50 = dB(rms(x, on, on + Math.round(0.050 * sr)), steady);

  let over = -Infinity, overAt = 0;
  for (let i = on; i < on + win400 && i + w20 < x.length; i += Math.round(0.001 * sr)) {
    const v = dB(rms(x, i, i + w20), steady);
    if (v > over) { over = v; overAt = (i - on) / sr * 1000; }
  }
  let hold = 0, run = 0, broke = false;
  const stepMs = 1, step = Math.round(0.001 * sr);
  for (let i = on; i < on + win400 && i + w10 < x.length; i += step) {
    const ok = dB(rms(x, i, i + w10), steady) >= 3;
    if (ok) hold += stepMs;
    if (ok && !broke) run += stepMs; else if (!ok) broke = true;
  }
  // The wave-m critic's headline "sustained-overshoot duration" is the contiguous
  // run measured on a 10 ms HOP (its published envelopes are 10 ms rms frames).
  // Reproduced exactly: ref-01 -> 110 ms, ref-02 -> >310 ms with IGN_REL=0.1.
  let hop10 = 0;
  for (let i = on; i < on + win400 && i + w10 < x.length; i += w10) {
    if (dB(rms(x, i, i + w10), steady) >= 3) hop10 += 10; else break;
  }
  let pk = 0; for (let i = on; i < Math.min(x.length, on + win400); i++) pk = Math.max(pk, Math.abs(x[i]));

  console.log(`${p}
  onset        ${(on / sr).toFixed(4)} s   steady rms ${steady.toExponential(3)} (${dB(steady, 1).toFixed(1)} dBFS)
  0-20 ms      ${e20.toFixed(1)} dB
  0-50 ms      ${e50.toFixed(1)} dB
  over20       ${over.toFixed(1)} dB @ +${overAt.toFixed(0)} ms
  hold>=+3dB   HEADLINE(10ms hop, contiguous) ${hop10} ms | 1ms-hop contiguous ${run} ms | total ${hold} ms
  absPeak      ${dB(pk, 1).toFixed(1)} dBFS`);
  if (process.env.IGN_ENV) {
    const seq = [];
    for (let k = 0; k < 40; k++) {
      const i = on + k * w10;
      if (i + w10 >= x.length) break;
      seq.push(dB(rms(x, i, i + w10), steady).toFixed(1));
    }
    console.log('  env(10ms) ' + seq.join(' '));
  }
}

// --lu A.wav B.wav t0 t1 : BS.1770 K-weighted loudness of each over [t0,t1] and the
// delta in LU. This is the wave-m "same-timeline busy delta" guard (>= +3 LU at
// 1.02-1.30 s); it must be run on the boost/noboost PAIR, never on one file, because
// the render's own fade-in will otherwise be reported as the boost.
function kfilt(x, sr) {
  // BS.1770-4 stage 1 (high shelf) + stage 2 (RLB high-pass), 48 kHz coefficients.
  const s1b = [1.53512485958697, -2.69169618940638, 1.19839281085285];
  const s1a = [1, -1.69065929318241, 0.73248077421585];
  const s2b = [1.0, -2.0, 1.0];
  const s2a = [1, -1.99004745483398, 0.99007225036621];
  const run = (v, b, a) => {
    const o = new Float64Array(v.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < v.length; i++) {
      const y = b[0] * v[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = v[i]; y2 = y1; y1 = y; o[i] = y;
    }
    return o;
  };
  if (sr !== 48000) console.error('  (warning: K-weighting coefficients assume 48 kHz)');
  return run(run(x, s1b, s1a), s2b, s2a);
}
function lufs(p, t0, t1) {
  const { x, sr } = load(p);
  const y = kfilt(x, sr);
  const a = Math.round(t0 * sr), b = Math.min(y.length, Math.round(t1 * sr));
  let s = 0; for (let i = a; i < b; i++) s += y[i] * y[i];
  return -0.691 + 10 * Math.log10(s / Math.max(1, b - a) + 1e-30);
}

// --cent file t0 t1 [t2 t3 ...] : ONSET-RELATIVE spectral centroid, Hann-windowed
// 8192-pt FFT, magnitude-weighted, 60 Hz - 12 kHz. Windows are offsets from the
// DETECTED onset (see above); _r8audio.mjs:144 uses absolute windows and is void.
function fftr(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
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
function centroid(p, wins) {
  const { x, sr } = load(p);
  let gpk = 0; for (let i = 0; i < x.length; i++) gpk = Math.max(gpk, Math.abs(x[i]));
  const rel = Number(process.env.IGN_REL || 0);
  const th = rel > 0 ? rel * gpk : THRESH;
  let on = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > th) { on = i; break; }
  const N = 8192, out = [];
  for (const [t0, t1] of wins) {
    const a = on + Math.round(t0 * sr), b = on + Math.round(t1 * sr);
    let num = 0, den = 0, frames = 0;
    for (let s = a; s + N <= b; s += N / 2) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
      fftr(re, im);
      for (let k = Math.ceil(60 * N / sr); k < Math.floor(12000 * N / sr); k++) {
        const m = Math.hypot(re[k], im[k]); num += m * k * sr / N; den += m;
      }
      frames++;
    }
    out.push(frames ? `${t0}-${t1}s ${(num / den).toFixed(0)} Hz` : `${t0}-${t1}s SHORT(<${(N / sr).toFixed(3)}s)`);
  }
  console.log(`${p} onset ${(on / sr).toFixed(4)}s  centroid  ` + out.join('  |  '));
}

const args = process.argv.slice(2);
if (args[0] === '--cent') {
  const f = args[1], nums = args.slice(2).map(Number), wins = [];
  for (let i = 0; i + 1 < nums.length; i += 2) wins.push([nums[i], nums[i + 1]]);
  centroid(f, wins);
} else if (args[0] === '--lu') {
  const [, A, B, t0, t1] = args;
  const la = lufs(A, Number(t0), Number(t1)), lb = lufs(B, Number(t0), Number(t1));
  console.log(`LU ${t0}-${t1}s  ${A} ${la.toFixed(2)}  ${B} ${lb.toFixed(2)}  delta ${(la - lb).toFixed(2)} LU`);
} else {
  if (!args.length) { console.error('usage: node tools/_ignmeas.mjs <file> [file...] | --lu A B t0 t1'); process.exit(1); }
  for (const a of args) measure(a);
}
