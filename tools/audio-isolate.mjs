// Isolated capture of the non-engine SFX (boost / crash / tyre).
//
// game/audio.js uses a seeded PRNG (makeRandom(0x5eed17)) and OfflineAudioContext
// renders deterministically, so rendering the same scenario twice - once with the
// event, once without - and subtracting sample-wise cancels the engine/wind bed and
// leaves the event on its own. That removes the confound in audio-capture.mjs, where
// ours-crash.wav / ours-boost.wav / ours-squeal.wav all contain a full-throttle V8
// underneath and therefore can't be compared to the isolated reference one-shots.
//
// Writes shots/audio/ours-<clip>-solo.wav (the difference signal).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../game');
const outDir = resolve(here, '../shots/audio');
await mkdir(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/cap.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>cap</title>'); return; }
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => { if (!/cannot resume an offline context/.test(String(e))) console.error('pageerror', String(e)); });
await page.goto(`http://127.0.0.1:${port}/cap.html`);

const SR = 48000, DUR = 5, EVENT_AT = 1.0;
// --only=<clip>  render just one clip. Same convention as audio-scene.mjs:58-60.
// Each clip already does a full page.reload() between its bed and event renders, so the
// per-clip render is independent of which other clips ran; skipping clips cannot change a
// rendered clip's output. VERIFIED, wave R: `--only=boost` reproduces the full run's
// `ours-boost-solo.wav` peak and every `_ignmeas` figure to the digit (verdicts/wave-r/audio.md).
// Paired A/Bs on one clip cost ~4 min instead of ~13.
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const CLIPS = ['crash', 'boost', 'squeal'].filter((c) => !ONLY || c === ONLY);

async function render(clip, withEvent) {
  return page.evaluate(async ({ clip, withEvent, SR, DUR, EVENT_AT }) => {
    const mod = await import('/audio.js');
    const off = new OfflineAudioContext(2, SR * DUR, SR);
    const realAC = window.AudioContext;
    window.AudioContext = function () { return off; };
    window.webkitAudioContext = undefined;
    const a = mod.createAudio({ enabled: true, volume: 0.62, space: 'city' });
    a.start();
    window.AudioContext = realAC;
    await Promise.race([a.ready, new Promise((r) => setTimeout(r, 20000))]);

    const on = (t) => withEvent && t > EVENT_AT;
    const frame = (t) => {
      if (clip === 'crash') return { rpm01: 0.5, throttle: 1, load: 0.7, speed: 0, gear: 3 };
      if (clip === 'boost') {
        return { rpm01: 0.85, throttle: 1, load: 1, speed: 0, gear: 5, boost: on(t) ? 1 : 0, boosting: on(t) };
      }
      // squeal
      return { rpm01: 0.3, throttle: 0, brake: 1, slip: on(t) ? 0.95 : 0, speed: 30, gear: 2, wet: 0 };
    };

    const step = 1 / 60;
    for (let i = 1; i * step < DUR - step; i++) {
      const t = i * step;
      off.suspend(t).then(() => {
        a.update(step, frame(t));
        if (withEvent && clip === 'crash' && Math.abs(t - EVENT_AT) < step / 2) a.crash(1.2);
        off.resume();
      });
    }
    a.update(step, frame(0));
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const out = new Float32Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = Rr[i]; }
    return Array.from(new Uint8Array(out.buffer));
  }, { clip, withEvent, SR, DUR, EVENT_AT });
}

for (const clip of CLIPS) {
  const bed = new Float32Array(new Uint8Array(await render(clip, false)).buffer);
  await page.reload();
  const evt = new Float32Array(new Uint8Array(await render(clip, true)).buffer);
  await page.reload();

  // sanity: the two renders must be bit-identical before the event, else the PRNG
  // path diverged and the subtraction is meaningless.
  const preN = Math.floor(SR * (EVENT_AT - 0.05)) * 2;
  let preDiff = 0;
  for (let i = 0; i < preN; i++) preDiff = Math.max(preDiff, Math.abs(evt[i] - bed[i]));

  // difference, trimmed to start 20 ms before the event so attack time is measurable
  const start = Math.floor(SR * (EVENT_AT - 0.02)) * 2;
  const d = new Float32Array(evt.length - start);
  for (let i = 0; i < d.length; i++) d[i] = evt[start + i] - bed[start + i];
  let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));

  await writeFile(join(outDir, `ours-${clip}-solo.wav`), wav(d, SR, 2));
  console.log(`ours-${clip}-solo.wav  peak=${pk.toFixed(4)}  pre-event residual=${preDiff.toExponential(2)} (must be ~0)`);
}

await browser.close();
server.close();

function wav(f32, sr, ch) {
  const n = f32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}
