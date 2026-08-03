// _sparkboost.mjs — the boost x crash cross-piece harness (T3 of `verdicts/wave-q/boost-fx.md`).
//
// WHY THIS EXISTS. T3 is the only live cross-piece target between `boost.js` and `crash.js`, and
// the script that measured it (`/tmp/crashmeas-o.mjs`) was a throwaway that no longer exists, so
// the target was un-re-derivable. It is now a tool.
//
// WHAT IT DOES. ONE boot of `--scene crash-cam` (simTime 0.9, the slow-mo beat where
// `crash.shutter01` peaks), then FOUR beauty frames from the same simulated state:
//
//     BL-sparks   boost pass LIVE,   spark InstancedMesh visible
//     BL-nosparks boost pass LIVE,   spark InstancedMesh hidden
//     B0-sparks   uAmount forced 0,  spark InstancedMesh visible
//     B0-nosparks uAmount forced 0,  spark InstancedMesh hidden
//
// The ONLY readable column is visible-minus-hidden (`wave-q/boost-fx.md`, `wave-q/crash-cam.md`):
// with the spark mesh hidden, `_debrismeas` patch A still scores 17 of 21 blobs and 6.29 of 6.71
// fill, because patch A is road paint. Absolutes there are forbidden as targets.
//
// The spark mesh is located by SIGNATURE, not by name — `crash.js` exposes no handle for it. The
// signature is asserted, and the tool refuses to run if it does not match exactly one mesh, so a
// future `crash.js` edit produces a loud failure rather than a silently wrong control.
//
//   node tools/_sparkboost.mjs --tag r1
//   node tools/_debrismeas.mjs --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000 \
//     --patch 0.30,0.75,0.42,0.72:S shots/r/sb-r1-{BL,B0}-{sparks,nosparks}.png
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const tag = args.tag || 'x';
const outDir = resolve(args.dir || 'shots/r');
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#scene=crash-cam&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const res = await page.evaluate(async () => {
  const g = window.__game;
  const u = g.boost.pass.uniforms;
  // ---- locate the spark InstancedMesh by signature ----------------------------------------
  // crash.js:505-510: InstancedMesh, MeshBasicMaterial, AdditiveBlending, renderOrder 4.
  const cands = [];
  g.crash.group.traverse((o) => {
    if (o.isInstancedMesh && o.renderOrder === 4 && o.material && o.material.blending === 2) cands.push(o);
  });
  if (cands.length !== 1) {
    return { error: `spark-mesh signature matched ${cands.length} meshes, expected 1` };
  }
  const spark = cands[0];
  const state = {
    uAmount: u.uAmount.value, uSpeed01: u.uSpeed01.value,
    shutter01: g.crash.shutter01, crashActive: !!g.crash.active,
    sparkCount: spark.count, sparkRenderOrder: spark.renderOrder,
    boostPassEnabled: g.boost.pass.enabled,
  };
  const grab = () => { g.composer.render(); g.composer.render();
    return g.renderer.domElement.toDataURL('image/png'); };
  const frames = {};
  const live = u.uAmount.value;
  for (const [key, amt] of [['BL', live], ['B0', 0]]) {
    u.uAmount.value = amt;
    spark.visible = true;  frames[`${key}-sparks`] = grab();
    spark.visible = false; frames[`${key}-nosparks`] = grab();
    spark.visible = true;
  }
  u.uAmount.value = live;
  return { state, frames };
});
if (res.error) { console.error('FAIL:', res.error); await browser.close(); server.close(); process.exit(1); }
console.log(JSON.stringify(res.state, null, 1));
await mkdir(outDir, { recursive: true });
for (const [k, v] of Object.entries(res.frames)) {
  const f = join(outDir, `sb-${tag}-${k}.png`);
  await writeFile(f, Buffer.from(v.split(',')[1], 'base64'));
  console.log('wrote', f);
}
await browser.close(); server.close();
