// Round-3 probe: the things a band-spectrum comparison of static one-shots misses.
//
// Renders four extra scenarios through the same OfflineAudioContext harness that
// tools/audio-capture.mjs uses, and writes them to shots/audio/ for analysis by
// tools/audio-scene-analyse.mjs:
//
//   gears     8 s full-throttle pull through gears 1..5 with real shift points.
//             Lets us ask whether a shift is audible at all, and whether the
//             engine's *timbre* (pitch-normalised spectrum) differs gear to gear
//             or is a pure transposition of one static voice.
//   space-*   the identical 4 s scenario rendered in 'open' / 'city' / 'tunnel'.
//             Difference between them = how much the room actually does.
//   flyby     a rival driving past a stationary listener: tests panning, distance
//             attenuation and doppler.
//   busy      engine + boost + tyre + crash + 3 rivals at once: bus balance and
//             how hard the glue/limiter squash the dynamic range.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../game');
const outDir = resolve(here, '../shots/audio');
await mkdir(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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

const SR = 48000;

// --noboost   render the `busy` scene on the SAME timeline but with boost never
//             pressed, to shots/audio/ours-busy-noboost.wav. This exists because
//             the only valid baseline for "does engaging boost make the mix
//             louder" is the same window of a boost-off render of the same seed.
//             Baselining the boost window against an EARLIER window of the same
//             file (what audio-scene-analyse.mjs:227 does) measures the render's
//             own fade-in: those two windows differ by +0.95 LU with boost never
//             pressed at all, which is where r11's bogus "+boost is louder"
//             claim came from. Never baseline on an earlier window.
// --only=<scene>  render just one job (paired A/Bs are otherwise ~40 s each).
const NOBOOST = process.argv.includes('--noboost');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

async function render(scene, space, dur, noboost) {
  return page.evaluate(async ({ scene, space, SR, dur, noboost }) => {
    const mod = await import('/audio.js');
    const off = new OfflineAudioContext(2, Math.round(SR * dur), SR);
    const realAC = window.AudioContext;
    window.AudioContext = function () { return off; };
    window.webkitAudioContext = undefined;
    const a = mod.createAudio({ enabled: true, volume: 0.62, space });
    a.start();
    window.AudioContext = realAC;
    await Promise.race([a.ready, new Promise((r) => setTimeout(r, 20000))]);

    if (scene === 'flyby' || scene === 'busy') {
      a.addRival('r1', {});
      if (scene === 'busy') { a.addRival('r2', {}); a.addRival('r3', {}); }
    }

    // gears: 1.4 s per gear, rpm 0.28 -> 0.97, then drop on the shift.
    const GEAR_T = 1.4;
    const gearsFrame = (t) => {
      const g = Math.min(5, 1 + Math.floor(t / GEAR_T));
      const u = (t - (g - 1) * GEAR_T) / GEAR_T;
      return { rpm01: 0.28 + 0.69 * Math.min(1, u), throttle: 1, load: 1, speed: 12 + g * 16, gear: g };
    };

    const frame = (t) => {
      if (scene === 'gears') return gearsFrame(t);
      if (scene === 'busy') {
        const bo = noboost ? false : t > 1.0;
        return {
          rpm01: 0.80, throttle: 1, load: 1, speed: 62, gear: 4,
          boost: bo ? 1 : 0, boosting: bo,
          slip: t > 1.6 ? 0.85 : 0, brake: t > 1.6 ? 0.6 : 0,
        };
      }
      // flyby / space: steady mid-throttle player so the bed is identical
      return { rpm01: 0.55, throttle: 0.8, load: 0.7, speed: 30, gear: 3 };
    };

    const step = 1 / 60;
    for (let i = 1; i * step < dur - step; i++) {
      const t = i * step;
      off.suspend(t).then(() => {
        a.update(step, frame(t));
        if (scene === 'busy') {
          if (Math.abs(t - 2.4) < step / 2) a.crash(1.2);
          for (let k = 1; k <= 3; k++) {
            a.updateRival(`r${k}`, {
              pos: [(k - 2) * 9, 0, 6 + k * 4], vel: [0, 0, -8],
              rpm01: 0.7, load: 0.8, gain: 0.8,
            });
          }
        }
        if (scene === 'flyby') {
          // rival runs -60 m -> +60 m along z at 55 m/s, 4 m to the driver's right,
          // listener stationary at origin looking down +z
          const z = -60 + 55 * t;
          a.setListener([0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 0, 0]);
          a.updateRival('r1', { pos: [4, 0, z], vel: [0, 0, 55], rpm01: 0.8, load: 0.9, gain: 1 });
        }
        off.resume();
      });
    }
    a.update(step, frame(0));
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const out = new Float32Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = Rr[i]; }
    return Array.from(new Uint8Array(out.buffer));
  }, { scene, space, SR, dur, noboost });
}

let JOBS = [
  ['gears', 'city', 7.2, 'ours-gears.wav'],
  ['space', 'open', 4.0, 'ours-space-open.wav'],
  ['space', 'city', 4.0, 'ours-space-city.wav'],
  ['space', 'tunnel', 4.0, 'ours-space-tunnel.wav'],
  ['flyby', 'city', 2.2, 'ours-flyby.wav'],
  ['busy', 'city', 4.0, 'ours-busy.wav'],
];

if (NOBOOST) JOBS = [['busy', 'city', 4.0, 'ours-busy-noboost.wav']];
else if (ONLY) JOBS = JOBS.filter((j) => j[0] === ONLY);

for (const [scene, space, dur, name] of JOBS) {
  const f32 = new Float32Array(new Uint8Array(await render(scene, space, dur, NOBOOST)).buffer);
  await writeFile(join(outDir, name), wav(f32, SR, 2));
  let pk = 0; for (const v of f32) pk = Math.max(pk, Math.abs(v));
  console.log(`${name}  peak=${pk.toFixed(4)}`);
  await page.reload();
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
