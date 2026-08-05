// _passlevel.mjs — how loud is a pass whoosh against a crash, in dB, at the master output?
//
// The target is a clearly audible event that stays well under an impact. Guessing at the
// peak constant is how the whoosh ended up inaudible the first time (the number was fine;
// the BUS was 13 dB down), so this renders both through the real graph and measures.
//
// Rendered in the page's own AudioContext with a MediaStreamDestination tap, because the
// module builds its graph against a live ctx and an OfflineAudioContext would need a second
// code path - measuring a different graph than the one that ships proves nothing.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const p = join(root, rel === '/' ? 'index.html' : rel);
    let buf = await readFile(p);
    if (rel === '/audio.js') {
      // Tap the LAST node before the speakers, so what is measured is what is heard:
      // through the glue bus, the limiter and the clipper, exactly as it ships.
      const anchor = 'clip.connect(ctx.destination);';
      const t = buf.toString();
      if (!t.includes(anchor)) throw new Error('output anchor missing');
      buf = Buffer.from(t.replace(anchor,
        'clip.connect(ctx.destination); window.__tap = clip;'));
    }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({ args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.locator('#bgmenu button.go').click();
await page.waitForTimeout(2000);

const out = await page.evaluate(async () => {
  const a = window.__audio || (window.game && window.game.audio);
  if (!a || !a.ctx) return { err: 'no audio handle on window' };
  if (!window.__tap) return { err: 'output tap was not injected' };
  const ctx = a.ctx;
  // Tap the true output by re-recording ctx.destination is not possible, so tap an analyser
  // fed from the same node the graph ends on. The module exposes nothing, so measure via a
  // ScriptProcessor-free approach: an AnalyserNode on destination's upstream is unavailable
  // too, so fall back to sampling the analyser the module already installs if present.
  const rec = (fire, ms) => new Promise((done) => {
    const dst = ctx.createMediaStreamDestination();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    // Route: we cannot re-tap destination, so measure the analyser on the master if exposed.
    const tap = window.__tap || null;
    if (!tap) { done(null); return; }
    tap.connect(an);
    fire();
    const t0 = performance.now();
    const step = () => {
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      if (performance.now() - t0 < ms) requestAnimationFrame(step);
      else { try { tap.disconnect(an); } catch (e) { /* noop */ } done(peak); }
    };
    step();
  });
  // BASELINE FIRST. The engine bed is running (the game is started), so a peak measured
  // while it idles is the ENGINE, not the effect - which is exactly how a 1.71x gain rise
  // showed up as +0.7 dB and nearly passed for a real reading.
  const basePk = await rec(() => {}, 700);
  await new Promise((r) => setTimeout(r, 400));
  const passPk = await rec(() => a.pass(1, { side: 1, relSpeed: 50 }), 700);
  await new Promise((r) => setTimeout(r, 900));
  const crashPk = await rec(() => a.crash(1), 1400);
  return { basePk, passPk, crashPk };
});
if (out.err) { console.log('ERROR:', out.err); }
else {
  const db = (x) => (20 * Math.log10(Math.max(x, 1e-6))).toFixed(1);
  console.log(`bed   peak ${out.basePk.toFixed(4)}  (${db(out.basePk)} dBFS)   <- engine floor, nothing fired`);
  console.log(`pass  peak ${out.passPk.toFixed(4)}  (${db(out.passPk)} dBFS)`);
  console.log(`crash peak ${out.crashPk.toFixed(4)}  (${db(out.crashPk)} dBFS)`);
  console.log(`pass is ${(20 * Math.log10(out.passPk / out.crashPk)).toFixed(1)} dB relative to crash  [target -10 to -12]`);
  if (out.passPk < out.basePk * 1.6) {
    console.log('\nWARNING: pass peak is not clearly above the engine floor - this reading is');
    console.log('measuring the bed, not the whoosh, and cannot be used to set the level.');
  }
}
await browser.close();
server.close();
