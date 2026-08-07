// Write a raw RGBA blob (as produced by `_mapdump.mjs`, or by any tracing pass) back out as a PNG
// so a human or a vision model can LOOK at it.
//
// This exists because of the rule this project keeps paying for: a graph extracted from an image
// can satisfy every numeric check while bearing no resemblance to the image. The only honest test
// is to draw the result and look at it, so every pass in the tracing chain dumps a preview through
// here.
//
//   node tools/_mappng.mjs <prefix> <out.png>     # reads <prefix>.rgba + <prefix>.json
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const [prefix, out] = process.argv.slice(2);
if (!prefix || !out) {
  console.error('usage: node tools/_mappng.mjs <rgba-prefix> <out.png>');
  process.exit(2);
}
const { w, h } = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const buf = readFileSync(`${prefix}.rgba`);
if (buf.length !== w * h * 4) throw new Error(`size mismatch: ${buf.length} vs ${w * h * 4}`);

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(async ({ w, h, data }) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const bin = atob(data);
  const arr = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  ctx.putImageData(new ImageData(arr, w, h), 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}, { w, h, data: buf.toString('base64') });
await browser.close();

writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`${prefix}.rgba -> ${out}  ${w}x${h}`);
