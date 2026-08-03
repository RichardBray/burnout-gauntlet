// _heromask.mjs — dump the boost pass's hero-hole mask (uDebug=1) for any scene, plus
// a dump of what the silhouette prepass actually considers "the hero node".
//   node tools/_heromask.mjs --scene crash-cam --out shots/_mask.png
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const scene = args.scene || 'crash-cam';
const out = resolve(args.out || 'shots/_mask.png');
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
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const res = await page.evaluate(async () => {
  const g = window.__game;
  const u = g.boost.pass.uniforms;
  let sc = g.boost.group; while (sc.parent) sc = sc.parent;
  let node = g.car.group; while (node.parent && node.parent !== sc) node = node.parent;
  // what geometry is under the hero node at this instant, in screen space?
  const box = new g.THREE.Box3();
  let meshes = 0, tris = 0;
  node.updateWorldMatrix(true, true);
  node.traverse((o) => { if (o.isMesh && o.visible) { meshes++; box.expandByObject(o);
    tris += (o.geometry?.index?.count || o.geometry?.attributes?.position?.count || 0) / 3; } });
  const info = {
    nodeName: node.name || node.type, isSceneChild: node.parent === sc,
    childrenOfNode: node.children.map((c) => `${c.name || c.type}${c.visible ? '' : '(hidden)'}`),
    sceneChildren: sc.children.map((c) => `${c.name || c.type}${c.visible ? '' : '(hidden)'}`),
    heroMeshes: meshes, heroTris: Math.round(tris),
    heroBox: box.isEmpty() ? null : [box.min.toArray().map((v) => +v.toFixed(2)),
      box.max.toArray().map((v) => +v.toFixed(2))],
    carGroupPose: { pos: g.car.group.position.toArray().map((v) => +v.toFixed(3)),
      rot: g.car.group.rotation.toArray().slice(0, 3).map((v) => +(+v).toFixed(3)) },
    carRootPose: { pos: node.position.toArray().map((v) => +v.toFixed(3)),
      rot: node.rotation.toArray().slice(0, 3).map((v) => +(+v).toFixed(3)) },
    uAmount: u.uAmount.value, uDepthOn: u.uDepthOn.value, uCarR: u.uCarR.value,
    uCar: [u.uCar.value.x, u.uCar.value.y], uJet: [u.uJet.value.x, u.uJet.value.y],
    uFocus: [u.uFocus.value.x, u.uFocus.value.y], uHeroSoft: u.uHeroSoft.value,
    shutter01: g.crash.shutter01, crashActive: !!g.crash.active,
  };
  const grab = () => { g.composer.render(); g.composer.render();
    return g.renderer.domElement.toDataURL('image/png'); };
  // beauty frame with the radial smear on, and with the whole boost pass bypassed
  const withFx = grab();
  const wasOn = g.boost.pass.enabled;
  g.boost.pass.enabled = false;
  const noFx = grab();
  g.boost.pass.enabled = wasOn;
  // beauty frame with the flame impostors hidden, for background subtraction
  const flamesOn = g.boost.flames.visible;
  g.boost.flames.visible = false;
  const noFlame = grab();
  g.boost.flames.visible = flamesOn;
  info.jetLen = g.boost.flames.material.uniforms.uLen.value;
  info.jetWide = g.boost.flames.material.uniforms.uWide.value;
  const off = [];
  for (const p of g.composer.passes) {
    const n = p.constructor.name;
    if (p === g.boost.pass) continue;
    if (p.enabled && (n.includes('Output') || n.includes('Bloom') || n.includes('GammaCorrection'))) {
      p.enabled = false; off.push(n);
    }
  }
  u.uDebug.value = 1;
  const data = grab();
  u.uDebug.value = 0;
  return { info, off, data, withFx, noFx, noFlame };
});
console.log(JSON.stringify(res.info, null, 1));
console.log('disabled:', res.off.join(', '));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.from(res.data.split(',')[1], 'base64'));
await writeFile(out.replace(/\.png$/, '-fx.png'), Buffer.from(res.withFx.split(',')[1], 'base64'));
await writeFile(out.replace(/\.png$/, '-nofx.png'), Buffer.from(res.noFx.split(',')[1], 'base64'));
await writeFile(out.replace(/\.png$/, '-noflame.png'), Buffer.from(res.noFlame.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close(); server.close();
