// How long the game takes to load, on the path a player actually takes: index.html in a
// browser, no ?shot=1, timed from navigation start to `window.__ready`. Reports the
// per-stage breakdown main.js already logs under #bootlog, plus a cold/warm split.
//
//   node tools/_loadtime.mjs --runs 3
//
// Cold = a fresh browser context with no HTTP cache. Warm = a reload of the same context,
// which is what a player gets on their second visit.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const RUNS = +(args.runs || 3);
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

let bytes = 0, reqs = 0;
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    bytes += body.length; reqs++;
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html#bootlog=1`;

// The importmap points `three` at esm.sh, so a real first load also pays a CDN fetch this
// harness cannot see. Report local bytes and let the reader add their own network.
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });

async function timeOne(page) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  const wall = Date.now() - t0;
  const nav = await page.evaluate(`(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    return { domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
      readyMark: Math.round(performance.now()) };
  })()`);
  return { wall, ...nav };
}

const cold = [], warm = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const stages = [];
  page.on('console', (m) => { if (m.text().startsWith('boot ')) stages.push(m.text()); });
  cold.push(await timeOne(page));
  if (i === 0) console.log('per-stage (cold run 1):\n  ' + stages.join('\n  '));
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  const t0 = Date.now();
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  warm.push({ wall: Date.now() - t0 });
  await ctx.close();
}

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const fmt = (a) => `median ${med(a.map((r) => r.wall))} ms  (${a.map((r) => r.wall).join(', ')})`;
console.log(`\ncold  ${fmt(cold)}`);
console.log(`warm  ${fmt(warm)}`);
console.log(`served ${reqs} requests, ${(bytes / 1024 / 1024).toFixed(2)} MB from disk `
  + `(three itself comes from esm.sh and is NOT counted)`);
await browser.close();
server.close();
process.exit(0);
