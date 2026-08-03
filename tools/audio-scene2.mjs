// Round-3 follow-up probes. Two fairer tests than audio-scene.mjs could give:
//
//  A) reverb-with-a-transient: a steady engine hides a tail, so instead fire a crash
//     into silence (engine muted via rpm/load 0 is still audible, so we use the same
//     seeded A/B subtraction as audio-isolate.mjs) in each of the three spaces and
//     measure the actual RT / late energy. Writes ours-rev-<space>.wav.
//
//  B) rival-isolated flyby: render the pass with and without the rival and subtract,
//     so the panning trajectory and doppler pitch track are measured on the rival
//     alone instead of buried under a centred player bed. Writes ours-flyby-solo.wav.
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

const SR = 48000;

async function render(scene, space, dur, withEvent) {
  return page.evaluate(async ({ scene, space, SR, dur, withEvent }) => {
    const mod = await import('/audio.js');
    const off = new OfflineAudioContext(2, Math.round(SR * dur), SR);
    const realAC = window.AudioContext;
    window.AudioContext = function () { return off; };
    window.webkitAudioContext = undefined;
    const a = mod.createAudio({ enabled: true, volume: 0.62, space });
    a.start();
    window.AudioContext = realAC;
    await Promise.race([a.ready, new Promise((r) => setTimeout(r, 20000))]);
    if (scene === 'flyby' && withEvent) a.addRival('r1', {});

    const frame = () => (scene === 'rev'
      ? { rpm01: 0.02, throttle: 0, load: 0.05, speed: 0, gear: 1 }
      : { rpm01: 0.55, throttle: 0.8, load: 0.7, speed: 30, gear: 3 });

    const step = 1 / 60;
    for (let i = 1; i * step < dur - step; i++) {
      const t = i * step;
      off.suspend(t).then(() => {
        a.update(step, frame());
        if (scene === 'rev' && withEvent && Math.abs(t - 0.5) < step / 2) a.crash(1.2);
        if (scene === 'flyby') {
          a.setListener([0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 0, 0]);
          if (withEvent) {
            const z = -60 + 55 * t;
            a.updateRival('r1', { pos: [4, 0, z], vel: [0, 0, 55], rpm01: 0.8, load: 0.9, gain: 1 });
          }
        }
        off.resume();
      });
    }
    a.update(step, frame());
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const out = new Float32Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = Rr[i]; }
    return Array.from(new Uint8Array(out.buffer));
  }, { scene, space, SR, dur, withEvent });
}

async function isolate(scene, space, dur, name, startS) {
  const bed = new Float32Array(new Uint8Array(await render(scene, space, dur, false)).buffer);
  await page.reload();
  const evt = new Float32Array(new Uint8Array(await render(scene, space, dur, true)).buffer);
  await page.reload();
  const preN = Math.floor(SR * Math.max(0, startS - 0.05)) * 2;
  let pre = 0;
  for (let i = 0; i < preN; i++) pre = Math.max(pre, Math.abs(evt[i] - bed[i]));
  const s = Math.floor(SR * startS) * 2;
  const d = new Float32Array(evt.length - s);
  for (let i = 0; i < d.length; i++) d[i] = evt[s + i] - bed[s + i];
  let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
  await writeFile(join(outDir, name), wav(d, SR, 2));
  console.log(`${name}  peak=${pk.toFixed(4)}  pre-event residual=${pre.toExponential(2)}`);
}

for (const sp of ['open', 'city', 'tunnel']) await isolate('rev', sp, 5.0, `ours-rev-${sp}.wav`, 0.48);
await isolate('flyby', 'city', 2.2, 'ours-flyby-solo.wav', 0.0);

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
