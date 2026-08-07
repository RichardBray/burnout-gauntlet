// S3c round-3 built-collision drive probe.
//
// WORLD assertions inspect only each AUTHORED graph-route corridor: chain connectivity, chunk-plane
// coverage, `surfaceAt`, and expanded `world.blocks`. DRIVER findings inspect only the DRIVEN
// trajectory: lateral departure, driven surface/block contacts, progress, bounds, and stuck time.
// These provenances are never merged, so leaving the route cannot accuse the world corridor.
//
// This probe does NOT assert ribbon/junction render-mesh contact or detect a missing ribbon/seam,
// because physics has no road-triangle ground-contact signal: game/physics.js:1973 forces
// `state.pos.y = 0`. That gap is real and belongs to a later piece; deleting the road render mesh
// cannot make this probe red.
//
// Baseline (must exit 0):       node tools/_s3c-drive.mjs
// Wall poison (must exit 1):   node tools/_s3c-drive.mjs --poison=wall
// Sever poison (must exit 1):  node tools/_s3c-drive.mjs --poison=sever
// Driver poison (must exit 1): node tools/_s3c-drive.mjs --poison=driver
//
// The browser is required: `world.blocks` must come from the WebGL-built graph world. There is no
// Node fallback. In a delegated sandbox the localhost listen may honestly fail with `listen EPERM`.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const CHUNK = 200;
const HERO_RADIUS = 1.0;
const FIXED_DT = 1 / 60;
const START_SPEED = 15;
const LOOKAHEAD = 20;
const END_RADIUS = 2;
const BOUNDARY_TOLERANCE = 18;
const STUCK_SPEED = 2;
const STUCK_SECONDS = 2;
const DRIVER_POISON_OFFSET = 120;

// Authored from paradise.json. `[edge id, entry node]`; every edge's declared district is checked
// before driving. Each connected chain traverses two graph junctions and at least two chunk planes.
const ROUTES = [
  { district: 'downtown', edges: [[602, 453], [904, 477], [903, 679]] },
  { district: 'harbor', edges: [[925, 602], [924, 686], [792, 608]] },
  { district: 'palmbay', edges: [[447, 339], [431, 338], [404, 323]] },
  { district: 'silverlake', edges: [[126, 111], [135, 104], [151, 116]] },
  { district: 'mountain', edges: [[806, 621], [813, 626], [832, 641]] },
];

const poisonArg = process.argv.find((s) => s.startsWith('--poison='));
const poison = poisonArg ? poisonArg.slice('--poison='.length) : null;
if (poison && poison !== 'wall' && poison !== 'sever' && poison !== 'driver') {
  console.error(`unknown poison ${JSON.stringify(poison)}; expected wall, sever, or driver`);
  process.exit(2);
}

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = join(gameRoot, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(gameRoot)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

let browser;
try {
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  const port = server.address().port;
  browser = await chromium.launch({ args: [
    '--use-gl=angle', '--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
  ] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/#map=graph&nomenu=1&res=1`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });

  const result = await page.evaluate(({ routes, poisonMode, constants }) => {
    const g = window.__game, world = g.world, physics = g.physics;
    g.setPaused(true);
    physics.clearPath();
    physics.setParkedBodies([]);
    physics.setTrafficBodies(() => []);

    const worldFailures = [];
    const driverFindings = [];
    const failWorld = (district, assertion, detail) => {
      worldFailures.push({ provenance: 'WORLD', district, assertion, detail });
    };
    const findDriver = (district, assertion, detail, fatal = false) => {
      driverFindings.push({ provenance: 'DRIVER', district, assertion, detail, fatal });
    };
    const docPromise = fetch('/map/paradise.json').then((r) => r.json());

    const makePath = (points) => {
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) {
        cumulative.push(cumulative[i - 1] + Math.hypot(
          points[i].x - points[i - 1].x, points[i].z - points[i - 1].z,
        ));
      }
      const length = cumulative[cumulative.length - 1];
      const atDistance = (distance) => {
        const d = Math.max(0, Math.min(length, distance));
        let lo = 0, hi = cumulative.length - 1;
        while (lo + 1 < hi) {
          const mid = (lo + hi) >> 1;
          if (cumulative[mid] <= d) lo = mid; else hi = mid;
        }
        const span = Math.max(1e-9, cumulative[lo + 1] - cumulative[lo]);
        const t = (d - cumulative[lo]) / span, a = points[lo], b = points[lo + 1];
        return { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t };
      };
      const samples = [];
      for (let d = 0; d < length; d += 4) samples.push({ ...atDistance(d), distance: d });
      samples.push({ ...atDistance(length), distance: length });
      return {
        points, samples, length, closed: false,
        at(u) { return atDistance(Math.max(0, Math.min(1, u)) * length); },
        tangentAt(u) {
          const d = Math.max(0, Math.min(length, u * length));
          const a = atDistance(Math.max(0, d - 0.25)), b = atDistance(Math.min(length, d + 0.25));
          const n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          return { x: (b.x - a.x) / n, y: 0, z: (b.z - a.z) / n, normalize() { return this; } };
        },
        nearest(v) {
          let best = points[0], bestD2 = Infinity, bestDistance = 0;
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
            const t = len2 > 0
              ? Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.z - a.z) * dz) / len2)) : 0;
            const point = { x: a.x + dx * t, y: 0, z: a.z + dz * t };
            const d2 = (point.x - v.x) ** 2 + (point.z - v.z) ** 2;
            if (d2 < bestD2) {
              best = point;
              bestD2 = d2;
              bestDistance = cumulative[i - 1] + Math.sqrt(len2) * t;
            }
          }
          return { u: bestDistance / length, point: best, dist: Math.sqrt(bestD2) };
        },
      };
    };

    const boundariesOf = (path) => {
      const out = [];
      let along = 0;
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        for (const axis of ['x', 'z']) {
          const lo = Math.min(a[axis], b[axis]), hi = Math.max(a[axis], b[axis]);
          for (let n = Math.ceil((lo + 1e-7) / constants.CHUNK);
            n <= Math.floor((hi - 1e-7) / constants.CHUNK); n++) {
            const value = n * constants.CHUNK;
            const t = (value - a[axis]) / (b[axis] - a[axis]);
            out.push({ axis, value, distance: along + t * segLen,
              x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
          }
        }
        along += segLen;
      }
      return out.sort((a, b) => a.distance - b.distance);
    };

    const segmentHitsAabb = (a, b, block) => {
      const minX = block.cx - block.w / 2 - constants.HERO_RADIUS;
      const maxX = block.cx + block.w / 2 + constants.HERO_RADIUS;
      const minZ = block.cz - block.d / 2 - constants.HERO_RADIUS;
      const maxZ = block.cz + block.d / 2 + constants.HERO_RADIUS;
      let t0 = 0, t1 = 1;
      for (const [p, q] of [
        [-(b.x - a.x), a.x - minX], [b.x - a.x, maxX - a.x],
        [-(b.z - a.z), a.z - minZ], [b.z - a.z, maxZ - a.z],
      ]) {
        if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); }
        else { if (r < t0) return false; t1 = Math.min(t1, r); }
      }
      return true;
    };

    const crossesBoundary = (a, b, boundary) => {
      const av = a[boundary.axis] - boundary.value, bv = b[boundary.axis] - boundary.value;
      if (av * bv > 0 || a[boundary.axis] === b[boundary.axis]) return false;
      const t = (boundary.value - a[boundary.axis]) / (b[boundary.axis] - a[boundary.axis]);
      if (t < 0 || t > 1) return false;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      return Math.hypot(x - boundary.x, z - boundary.z) <= constants.BOUNDARY_TOLERANCE;
    };

    return docPromise.then((doc) => {
      const node = new Map(doc.nodes.map((n) => [n.id, n.p]));
      const edge = new Map(doc.edges.map((e) => [e.id, e]));
      const authored = routes.map((route) => {
        const points = [];
        const junctionNodes = new Set();
        let previousExit = null;
        const specs = route.edges.map((pair) => pair.slice());
        if (poisonMode === 'sever' && route.district === 'downtown') specs.push([598, 450]);
        for (const [id, entry] of specs) {
          const e = edge.get(id);
          if (!e) {
            failWorld(route.district, 'authored route exists', `missing edge ${id}`);
            continue;
          }
          if (e.district !== route.district) {
            failWorld(route.district, 'authored edge district', `edge ${id} declares ${e.district}`);
          }
          if (entry !== e.a && entry !== e.b) {
            failWorld(route.district, 'authored route orientation',
              `edge ${id} does not touch entry node ${entry}`);
            continue;
          }
          if (previousExit !== null && entry !== previousExit) {
            failWorld(route.district, 'connected edge chain',
              `expected node ${previousExit}, got ${entry}`);
          } else if (previousExit !== null) {
            junctionNodes.add(entry);
          }
          const raw = [node.get(e.a), ...e.shape, node.get(e.b)];
          if (entry === e.b) raw.reverse();
          for (let i = points.length ? 1 : 0; i < raw.length; i++) {
            points.push({ x: raw[i][0], y: 0, z: raw[i][1] });
          }
          previousExit = entry === e.a ? e.b : e.a;
        }
        const path = points.length >= 2 ? makePath(points) : null;
        if (junctionNodes.size < 2) {
          failWorld(route.district, 'authored route traverses at least two graph junctions',
            `${junctionNodes.size}/2`);
        }
        return { ...route, specs, path, junctions: junctionNodes.size };
      });

      let poisonBlock = null;
      if (poisonMode === 'wall') {
        const target = authored.find((r) => r.district === 'downtown').path.at(0.52);
        poisonBlock = { cx: target.x, cz: target.z, w: 14, d: 14,
          bw: 0, bd: 0, district: 'poison', faceId: -1 };
        world.blocks.push(poisonBlock);
      }

      // WORLD preflight is complete for every authored route before the first physics step.
      const routeResults = [];
      for (const route of authored) {
        const path = route.path;
        if (!path) continue;
        const boundaries = boundariesOf(path), authoredBlocks = new Set();
        const authoredOffTarmac = path.samples.reduce((n, sample) =>
          n + (world.surfaceAt(sample.x, sample.z) === 'tarmac' ? 0 : 1), 0);
        for (let i = 1; i < path.samples.length; i++) for (let bi = 0; bi < world.blocks.length; bi++) {
          if (segmentHitsAabb(path.samples[i - 1], path.samples[i], world.blocks[bi])) {
            authoredBlocks.add(bi);
          }
        }
        if (boundaries.length < 2) failWorld(route.district,
          'authored route crosses at least two 200 m chunk boundaries', `${boundaries.length}/2`);
        if (authoredOffTarmac) failWorld(route.district, 'authored centreline remains tarmac',
          `${path.samples.length - authoredOffTarmac}/${path.samples.length} samples`);
        if (authoredBlocks.size) failWorld(route.district, 'world.blocks clears authored corridor',
          `block indices ${[...authoredBlocks].join(',')}`);
        routeResults.push({
          district: route.district,
          edgeIds: route.specs.map(([id]) => id),
          length: +path.length.toFixed(3),
          junctions: route.junctions,
          boundaries: boundaries.length,
          authoredTarmac: `${path.samples.length - authoredOffTarmac}/${path.samples.length}`,
          authoredBlockHits: authoredBlocks.size,
          driver: null,
        });
      }

      if (worldFailures.length) {
        if (poisonBlock) world.blocks.pop();
        return { poisonMode, routes: routeResults, worldFailures, driverFindings,
          probeFailures: [], page: world.chunkStats().map };
      }

      for (let ri = 0; ri < authored.length; ri++) {
        const route = authored[ri], path = route.path;
        const boundaries = boundariesOf(path), crossed = new Set(), drivenBlocks = new Set();
        physics.reset(path.at(0), Math.atan2(path.tangentAt(0).x, path.tangentAt(0).z), constants.START_SPEED);
        physics.followPath(path, constants.LOOKAHEAD);
        let prev = { x: physics.state.pos.x, z: physics.state.pos.z };
        let stuckFrames = 0, maxStuckFrames = 0, offTarmac = 0, outOfBounds = 0;
        let reachedEnd = false, steps = 0, maxLateralDeparture = 0, driverPoisonApplied = false;
        const maxSteps = Math.ceil((path.length / 6 + 12) / constants.FIXED_DT);
        for (; steps < maxSteps; steps++) {
          physics.step(constants.FIXED_DT);
          if (poisonMode === 'driver' && route.district === 'downtown' && steps === 30) {
            const near = path.nearest(physics.state.pos), tangent = path.tangentAt(near.u);
            physics.state.pos.x += tangent.z * constants.DRIVER_POISON_OFFSET;
            physics.state.pos.z -= tangent.x * constants.DRIVER_POISON_OFFSET;
            driverPoisonApplied = true;
          }
          const cur = { x: physics.state.pos.x, z: physics.state.pos.z };
          maxLateralDeparture = Math.max(maxLateralDeparture, path.nearest(cur).dist);
          boundaries.forEach((b, i) => { if (!crossed.has(i) && crossesBoundary(prev, cur, b)) crossed.add(i); });
          if (world.surfaceAt(cur.x, cur.z) !== 'tarmac') offTarmac++;
          if (Math.abs(cur.x) > world.bounds || Math.abs(cur.z) > world.bounds) outOfBounds++;
          for (let bi = 0; bi < world.blocks.length; bi++) {
            if (segmentHitsAabb(prev, cur, world.blocks[bi])) drivenBlocks.add(bi);
          }
          const end = path.at(1), endDistance = Math.hypot(cur.x - end.x, cur.z - end.z);
          if (endDistance <= constants.END_RADIUS && path.nearest(cur).u >= 0.9) {
            reachedEnd = true;
            prev = cur;
            break;
          }
          if (Math.abs(physics.state.speed) < constants.STUCK_SPEED) stuckFrames++;
          else stuckFrames = 0;
          maxStuckFrames = Math.max(maxStuckFrames, stuckFrames);
          prev = cur;
        }
        physics.clearPath();

        const end = path.at(1), endDistance = Math.hypot(prev.x - end.x, prev.z - end.z);
        const stuckLimit = Math.ceil(constants.STUCK_SECONDS / constants.FIXED_DT);
        if (!reachedEnd) findDriver(route.district, 'driver reaches route end',
          `${endDistance.toFixed(2)} m away`);
        if (maxStuckFrames >= stuckLimit) findDriver(route.district, 'driver never stopped/stuck',
          `${maxStuckFrames} low-speed frames`);
        if (outOfBounds) findDriver(route.district, 'driver stays inside bounds', `${outOfBounds} samples`);
        if (offTarmac) findDriver(route.district, 'driver surfaceAt remains tarmac', `${offTarmac} samples`);
        if (drivenBlocks.size) findDriver(route.district, 'driver trajectory clears world.blocks',
          `block indices ${[...drivenBlocks].join(',')}`);
        if (crossed.size !== boundaries.length) findDriver(route.district,
          'driver crosses every authored 200 m boundary', `${crossed.size}/${boundaries.length}`, true);
        if (maxLateralDeparture >= 25) findDriver(route.district, 'driver lateral excursion',
          `${maxLateralDeparture.toFixed(3)} m maximum`);
        if (driverPoisonApplied) findDriver(route.district, 'driver poison excursion',
          `${maxLateralDeparture.toFixed(3)} m maximum after ${constants.DRIVER_POISON_OFFSET} m shove`, true);
        routeResults[ri].driver = {
          crossed: crossed.size,
          reachedEnd, endDistance: +endDistance.toFixed(3), offTarmac, outOfBounds,
          maxLateralDeparture: +maxLateralDeparture.toFixed(3),
          maxStuckSeconds: +(maxStuckFrames * constants.FIXED_DT).toFixed(3),
          drivenBlockHits: drivenBlocks.size, steps,
        };
      }
      if (poisonBlock) world.blocks.pop();
      return { poisonMode, routes: routeResults, worldFailures, driverFindings,
        probeFailures: [], page: world.chunkStats().map };
    });
  }, {
    routes: ROUTES,
    poisonMode: poison,
    constants: {
      CHUNK, HERO_RADIUS, FIXED_DT, START_SPEED, LOOKAHEAD, END_RADIUS,
      BOUNDARY_TOLERANCE, STUCK_SPEED, STUCK_SECONDS, DRIVER_POISON_OFFSET,
    },
  });

  result.pageErrors = pageErrors;
  if (pageErrors.length) result.probeFailures.push({ provenance: 'PROBE', district: 'page',
    assertion: 'no page errors', detail: pageErrors });
  console.log(JSON.stringify(result, null, 2));
  const fatalDriverFindings = result.driverFindings.filter((finding) => finding.fatal);
  if (result.worldFailures.length || fatalDriverFindings.length || result.probeFailures.length) {
    console.error(`S3C_PROBE_RED WORLD=${result.worldFailures.length} `
      + `DRIVER=${fatalDriverFindings.length} PROBE=${result.probeFailures.length}`);
    process.exitCode = 1;
  } else if (result.driverFindings.length) {
    console.warn(`S3C_PROBE_GREEN DRIVER_FINDINGS=${result.driverFindings.length}`);
  } else {
    console.log('S3C_PROBE_GREEN');
  }
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise((ok) => server.close(ok));
}
