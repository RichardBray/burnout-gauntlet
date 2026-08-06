// T16 real-page acceptance and economy/performance probe. Usage: node tools/_t16-check.mjs [--baseline]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const baseline = process.argv.includes('--baseline');
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__game?.traffic, null, { timeout: 120000 });
await page.waitForTimeout(700);

const failures = [];
const check = (pass, message) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${message}`);
  if (!pass && !baseline) failures.push(message);
};
check(errors.length === 0, `zero console errors at boot${errors.length ? `: ${errors.join(' | ')}` : ''}`);

// Same normal city line for before and after: shipped pool, own-side lane, held throttle, and
// repeat the 1.04 km straight if necessary. Boost remains banked across each lap reset.
const fill = await page.evaluate(async () => {
  const g = window.__game;
  g.traffic.setPool(24);
  const start = () => {
    const bank = g.physics.state.boost;
    g.physics.reset({ x: -520, y: 0, z: 6 }, Math.PI / 2, 28);
    g.physics.state.boost = bank;
    g.traffic.reset(g.physics.state.pos);
    if (g.crash?.reset) g.crash.reset();
  };
  g.physics.state.boost = 0;
  start();
  const t0 = performance.now();
  let laps = 0, peak = 0;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  while (performance.now() - t0 < 60000 && g.physics.state.boost < 0.999) {
    await new Promise(requestAnimationFrame);
    peak = Math.max(peak, g.physics.state.boost);
    if (g.physics.state.pos.x > 520 || g.physics.state.crashed) { laps++; start(); }
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  return { seconds: (performance.now() - t0) / 1000, filled: g.physics.state.boost >= 0.999,
    boost: g.physics.state.boost, laps, peak };
});
console.log(`FILL normal city line: ${fill.filled ? fill.seconds.toFixed(2) + 's' : '>' + fill.seconds.toFixed(2) + 's'} boost=${fill.boost.toFixed(3)} laps=${fill.laps}`);
check(fill.filled, 'empty boost bar fills within the 60 s normal-city measurement window');

// Static scan cost: pool zero makes the paired difference the static pass detector alone.
const perf = await page.evaluate(() => {
  const g = window.__game, bodies = g.world.parkedCars, p = { x: bodies[0].x, y: 0, z: bodies[0].z };
  g.traffic.setPool(0);
  const run = (list) => {
    g.traffic.setStaticBodies(list);
    for (let i = 0; i < 30; i++) g.traffic.update(1 / 60, p, 0, 25);
    const t0 = performance.now();
    for (let i = 0; i < 1200; i++) g.traffic.update(1 / 60, p, 0, 25);
    return (performance.now() - t0) / 1200;
  };
  const deltas = [];
  for (let i = 0; i < 7; i++) deltas.push(run(bodies) - run([]));
  deltas.sort((a, b) => a - b);
  g.traffic.setStaticBodies(bodies);
  g.traffic.update(1 / 60, p, 0, 25);
  return { ms: deltas[3], total: bodies.length,
    stats: typeof g.traffic.staticPassStats === 'function' ? g.traffic.staticPassStats() : null };
});
console.log(`PERF static detector: ${perf.ms.toFixed(4)} ms/frame, bodies=${perf.total}, stats=${JSON.stringify(perf.stats)}`);

// Capture the actual static event drain, chain feed and canvas text while driving four synthetic
// passes through traffic.update. Physics remains the only queue consumer.
const passes = await page.evaluate(async () => {
  const g = window.__game, T = g.traffic;
  g.physics.reset({ x: 9000, y: 0, z: 9000 }, 0, 0);
  T.setPool(0); T.reset(g.physics.state.pos);
  const drained = [], feed = [], text = [];
  const innerDrain = T.drainEvents.bind(T);
  T.drainEvents = () => { const out = innerDrain(); drained.push(...out); return out; };
  let whooshes = 0;
  T.setPassListener(() => { whooshes++; });
  const arrayPush = Array.prototype.push;
  Array.prototype.push = function (...items) {
    for (const item of items) {
      if (typeof item?.text === 'string' && item.text.startsWith('NEAR MISS')) {
        arrayPush.call(text, item.text);
      }
    }
    return arrayPush.apply(this, items);
  };
  const seenFeeds = new Set();
  let sampling = true;
  const sample = () => {
    for (const e of g.physics.state.earnFeed || []) {
      if (e.type === 'nearMiss') {
        const key = `${e.mult}:${e.earn}`;
        if (!seenFeeds.has(key)) { seenFeeds.add(key); feed.push({ ...e }); }
      }
    }
    if (sampling) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);

  const body = g.world.parkedCars.find((b) => !b.gone);
  T.setStaticBodies([body]);
  const pass = (b) => {
    const lx = b.fz, lz = -b.fx;
    const off = b.halfWid + 0.95 + 0.8;
    const yaw = Math.atan2(b.fx, b.fz);
    for (const along of [-12, -6, -2, 0, 2, 6, 12]) {
      T.update(1 / 60, { x: b.x + b.fx * along + lx * off, y: 0,
        z: b.z + b.fz * along + lz * off }, yaw, 25);
    }
  };
  for (let i = 0; i < 4; i++) pass(body);
  await new Promise((done) => setTimeout(done, 250));
  const first = { events: drained.filter((e) => e.type === 'nearMiss').length, whooshes,
    mults: feed.map((e) => e.mult), texts: [...new Set(text)] };

  // More than the shared 3 s window of quiet, then one more pass must restart at x1.
  await new Promise((done) => setTimeout(done, 3300));
  pass(body);
  await new Promise((done) => setTimeout(done, 250));
  first.afterQuietMult = g.physics.state.earnMult;
  first.totalWhooshes = whooshes;

  const goneEvents0 = drained.length, goneWhooshes0 = whooshes;
  body.gone = true;
  pass(body);
  await new Promise((done) => setTimeout(done, 100));
  first.goneEvents = drained.length - goneEvents0;
  first.goneWhooshes = whooshes - goneWhooshes0;
  body.gone = false;

  sampling = false;
  T.setStaticBodies(g.world.parkedCars);
  Array.prototype.push = arrayPush;
  T.drainEvents = innerDrain;
  return first;
});
console.log(`PASSES events=${passes.events} whooshes=${passes.whooshes} totalWhooshes=${passes.totalWhooshes} mults=${passes.mults.join(',')} afterQuiet=${passes.afterQuietMult} gone=${passes.goneEvents}/${passes.goneWhooshes} texts=${JSON.stringify(passes.texts)}`);
check(passes.events === 4, `four parked-car passes drain exactly four nearMiss events (${passes.events})`);
check(passes.whooshes === passes.events,
  `one opening whoosh per scored pass (${passes.events} events, ${passes.whooshes} whooshes)`);
check(passes.mults.includes(2) && passes.mults.includes(4), 'shared chain reaches x2 and x4');
check(passes.afterQuietMult === 1, 'chain decays to x1 after more than 3 s quiet');
check(passes.goneEvents === 0 && passes.goneWhooshes === 0, 'gone static body emits neither event nor whoosh');
check(passes.texts.some((s) => s === 'NEAR MISS X2') && passes.texts.every((s) => !s.includes('%')),
  `near-miss popup uses multiplier without percentage (${JSON.stringify(passes.texts)})`);
check(perf.stats === null || (perf.stats.candidates < perf.total && perf.stats.active <= perf.stats.candidates),
  'static detector candidate scan is proximity-bounded');

// Physics' existing shared multiplier, explicitly mixed across all three event types.
const shared = await page.evaluate(async () => {
  const g = window.__game, queue = [], seen = [];
  await new Promise((done) => setTimeout(done, 3100));
  g.physics.setEventSource(() => queue.splice(0));
  for (const type of ['nearMiss', 'oncoming', 'check']) {
    queue.push({ type, amount: 0.5 });
    await new Promise(requestAnimationFrame);
    for (const e of g.physics.state.earnFeed || []) if (e.type === type) seen.push([type, e.mult]);
  }
  g.physics.setEventSource(() => g.traffic.drainEvents());
  return seen;
});
console.log(`SHARED chain: ${shared.map(([type, mult]) => `${type}:x${mult}`).join(' ')}`);
check(shared.some(([t, m]) => t === 'nearMiss' && m === 1)
  && shared.some(([t, m]) => t === 'oncoming' && m === 2)
  && shared.some(([t, m]) => t === 'check' && m === 3), 'chain escalates across event types');
check(errors.length === 0, `zero console/page errors across probe${errors.length ? `: ${errors.join(' | ')}` : ''}`);

await browser.close(); server.close();
console.log(failures.length ? `${failures.length} FAILED` : baseline ? 'baseline recorded' : 'all checks passed');
process.exit(failures.length ? 1 : 0);
