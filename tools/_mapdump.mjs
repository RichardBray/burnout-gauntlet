// Decode a reference map JPEG to raw RGBA on disk, so every later tracing pass is plain node
// with no image-decoding dependency and no browser in the loop.
//
// There is no image library in this project and there is not going to be one for a job that runs
// twice: `playwright` is already a dependency for every harness in `tools/`, and a browser canvas
// is a perfectly good JPEG decoder. This writes `<out>.rgba` (width*height*4 bytes) plus a
// `<out>.json` sidecar carrying the dimensions, because a headerless blob nobody can size is how
// you lose an afternoon.
//
//   node tools/_mapdump.mjs reference/map/ign-map.jpg /tmp/ign
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tools/_mapdump.mjs <image> <out-prefix>');
  process.exit(2);
}

const mime = extname(src).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const dataUrl = `data:${mime};base64,${readFileSync(resolve(src)).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const { w, h, b64 } = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  // Chunked so a 2 Mpx image does not blow the argument limit of String.fromCharCode.
  let s = '';
  for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode(...d.subarray(i, i + 32768));
  return { w: c.width, h: c.height, b64: btoa(s) };
}, dataUrl);
await browser.close();

const buf = Buffer.from(b64, 'base64');
if (buf.length !== w * h * 4) throw new Error(`decode size mismatch: ${buf.length} vs ${w * h * 4}`);
writeFileSync(`${out}.rgba`, buf);
writeFileSync(`${out}.json`, JSON.stringify({ src, w, h }, null, 2));
console.log(`${src} -> ${out}.rgba  ${w}x${h}  ${(buf.length / 1e6).toFixed(1)} MB`);
