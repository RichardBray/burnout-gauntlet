// Offline WAV capture of game/audio.js for critique.
// Swaps window.AudioContext for an OfflineAudioContext so createAudio() builds its
// whole graph into a renderer we can drive deterministically with ctx.suspend().
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
    if (p === '/cap.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>cap</title>');
      return;
    }
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
page.on('pageerror', (e) => console.error('pageerror', String(e)));
await page.goto(`http://127.0.0.1:${port}/cap.html`);

const CLIPS = ['idle', 'engine-high', 'boost', 'crash', 'squeal'];
const SR = 48000, DUR = 4;

for (const clip of CLIPS) {
  const pcm = await page.evaluate(async ({ port, clip, SR, DUR }) => {
    const mod = await import('/audio.js');
    const off = new OfflineAudioContext(2, SR * DUR, SR);
    const realAC = window.AudioContext;
    window.AudioContext = function () { return off; };
    window.webkitAudioContext = undefined;
    const a = mod.createAudio({ enabled: true, volume: 0.62, space: 'city' });
    a.start();
    window.AudioContext = realAC;
    await Promise.race([a.ready, new Promise((r) => setTimeout(r, 20000))]);

    // per-frame state for each capture scenario
    const frame = (t) => {
      if (clip === 'idle') return { rpm01: 0.02, throttle: 0, load: 0.05, speed: 0, gear: 1 };
      if (clip === 'engine-high') return { rpm01: 0.92, throttle: 1, load: 1, speed: 0, gear: 4 };
      if (clip === 'boost') {
        return { rpm01: 0.85, throttle: 1, load: 1, speed: 0, gear: 5, boost: t > 0.25 ? 1 : 0, boosting: t > 0.25 };
      }
      if (clip === 'crash') return { rpm01: 0.5, throttle: 1, load: 0.7, speed: 0, gear: 3 };
      if (clip === 'squeal') {
        return { rpm01: 0.3, throttle: 0, brake: 1, slip: 0.95, speed: 30, gear: 2, wet: 0 };
      }
      return {};
    };

    const step = 1 / 60;
    for (let i = 1; i * step < DUR - step; i++) {
      const t = i * step;
      off.suspend(t).then(() => {
        a.update(step, frame(t));
        if (clip === 'crash' && Math.abs(t - 0.5) < step / 2) a.crash(1.2);
        off.resume();
      });
    }
    a.update(step, frame(0));
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const out = new Float32Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = Rr[i]; }
    return Array.from(new Uint8Array(out.buffer));
  }, { port, clip, SR, DUR });

  const f32 = new Float32Array(new Uint8Array(pcm).buffer);
  await writeFile(join(outDir, `ours-${clip}.wav`), wav(f32, SR, 2));
  let pk = 0; for (const v of f32) pk = Math.max(pk, Math.abs(v));
  console.log(`ours-${clip}.wav  peak=${pk.toFixed(4)}`);
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
