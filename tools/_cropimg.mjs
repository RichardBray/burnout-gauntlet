// Crop + scale to a PNG for visual reading, with a labelled grid.
// node tools/_cropimg.mjs in.jpg out.png x0 x1 y0 y1 [scale] [gridpx]
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const [f, o, X0, X1, Y0, Y1, S = '2', G = '50'] = process.argv.slice(2);
const browser = await chromium.launch(); const page = await browser.newPage();
const b64 = (await readFile(f)).toString('base64');
const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
const dataUrl = await page.evaluate(async ([data, mimeType, a, b, c, d, s, g]) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:${mimeType};base64,${data}`; });
  const x0 = Math.round(+a), x1 = Math.round(+b), y0 = Math.round(+c), y1 = Math.round(+d), S = +s, G = +g;
  const cv = document.createElement('canvas');
  cv.width = (x1 - x0) * S; cv.height = (y1 - y0) * S;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
  ctx.font = '14px monospace'; ctx.lineWidth = 1;
  for (let y = Math.ceil(y0 / G) * G; y < y1; y += G) {
    const py = (y - y0) * S + 0.5;
    ctx.strokeStyle = 'rgba(255,0,0,0.8)'; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(cv.width, py); ctx.stroke();
    ctx.fillStyle = 'red'; ctx.fillText(String(y), 2, py - 3);
  }
  for (let x = Math.ceil(x0 / G) * G; x < x1; x += G) {
    const px = (x - x0) * S + 0.5;
    ctx.strokeStyle = 'rgba(0,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, cv.height); ctx.stroke();
    ctx.fillStyle = 'cyan'; ctx.fillText(String(x), px + 2, 14);
  }
  return cv.toDataURL('image/png');
}, [b64, mime, X0, X1, Y0, Y1, S, G]);
await writeFile(o, Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', o);
