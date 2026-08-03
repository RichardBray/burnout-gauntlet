// traffic.js — LIVE traffic. Vehicles that drive, in lanes, spawned around the hero and
// retired behind it. This module owns every MOVING vehicle in the world; `world.js` keeps
// only the genuinely stationary ones (kerb parking and the stopped kerbside queues).
//
// WHY THIS FILE EXISTS. `world.js` used to bake 2667 vehicles into sealed InstancedMeshes,
// both carriageways included, and every one of them was standing still. Density won a
// screenshot metric; a still frame cannot tell a parked car from a moving one, so the loop
// optimised toward a car park. A handful of moving cars beats thousands of parked ones.
//
// API (this is the contract main.js is written against — keep it):
//   createTraffic(scene, { rng, layout, blocks, roadKit }) -> t
//   t.group                       THREE.Group, already added to `scene`
//   t.update(dt, heroPos, heroYaw, heroSpeed)
//   t.setNight(bool)              headlights / tail lights
//   t.count                       live vehicle count (read-only, for the HUD and the harness)
//   t.vehicles                    array of {pos, yaw, speed, halfLen, halfWid} for collision
//   t.reset(heroPos)              respawn the whole population around a new hero position
//   t.signalPhase(gx, gz)         -> 0 (E-W green) | 1 (N-S green) | -1 (idle), for the lights
//
// ---------------------------------------------------------------------------------------
// THE FOUR MECHANISMS, and why each one is the simple version rather than the clever one.
//
// 1. NETWORK. Every road in this city is axis-aligned and traffic never needs to turn a
//    corner (a car that leaves the ring around the hero is retired, not routed), so a "road"
//    here is one axis-aligned LINE with a set of lane offsets, and a vehicle is
//    (line, direction, lane, distance along). No graph, no spline, no path following.
//    Lane geometry is world.js's and road.js's, not re-derived: road.js builds the city tile
//    as widthM 20 / lanes 4, so its lane centres are 2.5 and 7.5 m either side of the
//    centreline, and the highway tile as widthM 36 / lanes 6, so 3 / 9 / 15. Kerb face is at
//    13 m and world.js parks at 10.5.
//
// 2. RING. Spawn in an annulus around the hero, retire outside it. This is the whole reason
//    the count can be a constant: POOL is a hard ceiling on live vehicles no matter how far
//    the player drives, where the baked population scaled with the size of the map.
//
// 3. JUNCTIONS. Because nobody turns, the ONLY conflict at a crossroads is two vehicles on
//    perpendicular axes wanting the same box, and ONE piece of state per junction settles it:
//    which axis currently owns the box. That makes the rule a demand-actuated two-phase
//    signal, which is also what the junction already looks like (world.js stands traffic
//    lights there). A vehicle whose axis does not own the box stops at the box edge. No slot
//    reservation table, no per-pair conflict test, no deadlock to unwind.
//
// 4. FOLLOWING. IDM (Treiber's intelligent-driver model) against ONE leader, where "leader"
//    is the nearest of {car ahead in my lane, the stop bar at a red junction, the hero if he
//    is ahead in my lane}. All three are the same "gap + closing speed" shape, so they are
//    the same four lines of arithmetic evaluated three times and the lowest acceleration
//    wins. IDM rather than a hand-rolled brake curve because it cannot telescope: the
//    (sStar/gap)^2 term diverges as the gap closes, so the gap is a barrier and not a hint.

import * as THREE from 'three';
import { makeRng, rngRange, rngPick, clamp, damp, makeCanvas, canvasTexture } from './util.js';

// ---- population budget ------------------------------------------------------------------
// 56 LIVE VEHICLES, against 2667 baked ones. The number is set by what one frame can
// actually see, not by what fits: down a city street the fog and the next junction close the
// view at roughly 300 m, and 56 spread over the ~8 road lines that pass within 200 m of the
// hero, weighted toward the line he is on, puts 20-30 of them in the corridor ahead — about
// one every 60-80 m of lane, which is denser than Burnout Paradise's own traffic in a typical
// downtown shot. Raising it buys vehicles behind the camera.
const POOL = 56;
const SPAWN_R = 300;      // half-length of the along-road window a spawn may land in
const SPAWN_MIN = 62;     // never pop a car into existence inside this radius of the hero
const DESPAWN_R = 345;    // retire outside this; > SPAWN_R so a spawn is never instantly retired
const LINE_LAT_MAX = 210; // ignore road lines further sideways than this
const SPAWN_PER_FRAME = 4;

// ---- IDM (Treiber) ----------------------------------------------------------------------
const IDM_A = 2.6;        // m/s^2 comfortable acceleration
const IDM_B = 4.2;        // m/s^2 comfortable deceleration
const IDM_S0 = 6.2;       // m standstill gap
const IDM_T = 1.35;       // s desired time headway
const IDM_BRAKE_MAX = 9;  // m/s^2 hard floor, so a red light 12 m away is still survivable

// ---- junction signal --------------------------------------------------------------------
const BOX_HALF = 12.4;    // half-width of the junction box: road half-width 10 + a car nose
const APPROACH = 62;      // register demand for the box from this far back
const COMMIT = 6.0;       // inside BOX_HALF + this, a vehicle is past the point of stopping
const GREEN_MIN = 7.0;    // s minimum green before cross demand may take the box

/**
 * Build the axis-aligned road network out of world.js's LAYOUT.
 *
 * `axis` 0 means travel runs along +/-x and the road sits at z = c; axis 1 means travel runs
 * along +/-z and the road sits at x = c. `lanes` are offsets from the centreline toward the
 * DRIVER'S RIGHT of the direction of travel, i.e. right-hand traffic: for direction (ax, az)
 * the right-hand normal is (-az, ax), which is the same convention world.js's parked ranks
 * and kerbside queues already use.
 */
function buildNetwork(layout) {
  const G = layout.grid, EX = layout.extent;
  const lines = [];
  // CITY LIVE TRAFFIC USES THE INNER LANE ONLY (2.5), and that is a deliberate separation of
  // the two populations, not a shortcut. world.js still parks at the kerb (10.5) and still
  // stands a stopped queue in the kerbside lane (7.4). A live car and a baked stationary car
  // in the SAME lane is a permanent immovable blockage — the car park again, only now with a
  // live car stuck behind it forever — so the two get different lanes rather than different
  // excuses. It also reads correctly: kerbside lane stopped and loading, inside lane flowing.
  const cityLanes = [2.5];
  const half = layout.roadW / 2;
  for (const c of G) {
    lines.push({ axis: 0, c, lo: -EX, hi: EX, lanes: cityLanes, junc: true, half, vLo: 12.5, vHi: 16.5 });
    lines.push({ axis: 1, c, lo: -EX, hi: EX, lanes: cityLanes, junc: true, half, vLo: 12.5, vHi: 16.5 });
  }
  // The highway crosses nothing — it lies at z = -700, clear of the grid's z = -480..480 —
  // so it carries no junction state and all three of its lanes per direction are live. It is
  // also the only road in the map where nothing is parked, so it gets the full width.
  lines.push({
    axis: 0, c: layout.highwayZ, lo: -1150, hi: 1150, lanes: [3, 9, 15],
    junc: false, half: layout.highwayW / 2, vLo: 25, vHi: 33,
  });
  return lines;
}

/** Soft round alpha pad for the fake contact shadow, the same idea as world.js's. */
function makePadTex() {
  const { c, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0.0, '#ffffff');
  g.addColorStop(0.55, '#c0c0c0');
  g.addColorStop(1.0, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(c, { srgb: false, wrap: THREE.ClampToEdgeWrapping });
}

export function createTraffic(scene, { rng, layout, blocks = [], roadKit } = {}) {
  const group = new THREE.Group();
  group.name = 'traffic';
  scene.add(group);

  const R = rng || makeRng(0x7AFF1C);
  const LAY = layout || { grid: [0], extent: 560, roadW: 20, highwayZ: -700, highwayW: 36 };
  const lines = buildNetwork(LAY);
  const G = LAY.grid;

  // ---- meshes ----------------------------------------------------------------------------
  // Seven InstancedMeshes, so seven draw calls for the whole live population (five in
  // daylight: the two lamp meshes drop to count 0). The body form is world.js's parked-car
  // form part for part, because a live car and a parked car twenty metres apart have to be
  // the same kind of object. The MATERIALS are world.js's own, handed over as
  // `LAYOUT.carKit`, so the atmosphere/canyon-fill shader patch that every other prop in the
  // scene carries applies here too; without it a traffic car 200 m down the street sits in
  // FRONT of the fog instead of inside it, which is the single most obvious way for a new
  // object to look pasted on. The fallbacks below are only for a caller that has no world.
  const kit = LAY.carKit || null;
  const boxGeo = (kit && kit.boxGeo) || new THREE.BoxGeometry(1, 1, 1);
  const wheelGeo = (kit && kit.wheelGeo) || new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
  const paintMat = (kit && kit.carPaint) || new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.3,
  });
  const glassMat = (kit && kit.carGlass) || new THREE.MeshStandardMaterial({
    color: 0x14181f, roughness: 0.12, metalness: 0.5, envMapIntensity: 1.6,
  });
  const trimMat = (kit && kit.darkMat) || new THREE.MeshStandardMaterial({
    color: 0x2b2e34, roughness: 0.8, metalness: 0.25,
  });
  const tyreMat = (kit && kit.tyreMat) || new THREE.MeshStandardMaterial({
    color: 0x121316, roughness: 0.95, metalness: 0,
  });
  const COLORS = (kit && kit.carColors) || [0x8e1f1f, 0x1d3f7a, 0xb8b4ab, 0x2b2e33];
  const CAR_Y = (kit && kit.CAR_Y !== undefined) ? kit.CAR_Y : 0.03;

  function inst(geo, mat, cap, cast) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.castShadow = !!cast; m.receiveShadow = true;
    m.frustumCulled = false;   // one mesh spans the whole ring, so three's box test is useless
    m.count = cap;
    group.add(m);
    return m;
  }
  const bodyMesh = inst(boxGeo, paintMat, POOL * 2, true);   // sill/slab + roof cap
  const cabMesh = inst(boxGeo, glassMat, POOL, true);        // glasshouse
  const trimMesh = inst(boxGeo, trimMat, POOL * 2, false);   // bumpers
  const wheelMesh = inst(wheelGeo, tyreMat, POOL * 4, false);
  bodyMesh.name = 'trafficBody';

  const padMat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: makePadTex(), transparent: true, opacity: 0.68,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const padGeo = new THREE.PlaneGeometry(1, 1);
  padGeo.rotateX(-Math.PI / 2);
  const padMesh = inst(padGeo, padMat, POOL, false);
  padMesh.renderOrder = 2;
  padMesh.receiveShadow = false;

  // Lamps are unlit basic boxes with toneMapped off so the bloom threshold picks them up as
  // sources rather than as bright paint. Night only: main.js hands us `tod === 'night'`.
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2d14, toneMapped: false });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d6, toneMapped: false });
  const tailMesh = inst(boxGeo, tailMat, POOL * 2, false);
  const headMesh = inst(boxGeo, headMat, POOL * 2, false);
  tailMesh.receiveShadow = false; headMesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YZX';
  const tmpC = new THREE.Color();
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---- vehicle pool ----------------------------------------------------------------------
  // Slot k in the pool owns slot k (or 2k / 4k) in every mesh for the whole run, so a colour
  // is written once at spawn and a retired vehicle becomes a zero-scale matrix rather than a
  // repack. Packing the live ones densely would mean rewriting every instanceColor whenever
  // any single vehicle died, which is the more expensive of the two by a wide margin.
  const pool = [];
  for (let k = 0; k < POOL; k++) {
    pool.push({
      k, live: false, line: null, dir: 1, lane: 0, s: 0, lat: 0, swerve: 0,
      speed: 0, vDes: 0, van: false, halfLen: 2.4, halfWid: 0.91,
      pos: new THREE.Vector3(), yaw: 0, jIdx: -1, jDist: 1e9, jOk: false,
    });
  }
  const vehicles = [];   // the live subset; same array object every frame, so no per-frame alloc

  // ---- junction state --------------------------------------------------------------------
  // One record per (gi, gj) crossing of the grid. `owner` is the axis (0 or 1) that currently
  // holds the green; -1 means nobody has asked for it yet.
  const NJ = G.length;
  const junc = [];
  for (let i = 0; i < NJ * NJ; i++) {
    junc.push({ owner: -1, heldT: 0, occ: 0, occAxis: -1, dem: [0, 0], imm: [0, 0] });
  }

  function progOf(v) { return v.dir * v.s; }

  /** World position of (line, dir, lane offset + lateral shy) at along-coordinate s. */
  function place(v, out) {
    const L = v.line, off = v.lane + v.lat;
    if (L.axis === 0) out.set(v.s, 0, L.c + v.dir * off);
    else out.set(L.c - v.dir * off, 0, v.s);
    return out;
  }
  /** world.js's yaw convention: forward = (cos ry, -sin ry). +x -> 0, -x -> PI, +z -> -PI/2. */
  function yawOf(v) {
    return v.line.axis === 0
      ? (v.dir > 0 ? 0 : Math.PI)
      : (v.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  }

  // ---- spawn -----------------------------------------------------------------------------
  const _p = new THREE.Vector3();
  const cand = [];

  function collectCandidates(hx, hz) {
    cand.length = 0;
    let total = 0;
    for (const L of lines) {
      const lat = Math.abs((L.axis === 0 ? hz : hx) - L.c);
      if (lat > LINE_LAT_MAX) continue;
      // Weight by closeness so most of the budget lands on the road the hero is actually on.
      // Spread the pool evenly across every line in range instead and each line gets three
      // or four cars — one per 150 m of lane — which reads as an empty city whatever the
      // total says.
      const w = 1 / (1 + lat / 45);
      for (const dir of [1, -1]) {
        for (const lane of L.lanes) { cand.push({ L, dir, lane, w }); total += w; }
      }
    }
    return total;
  }

  function nearJunction(L, s) {
    if (!L.junc) return false;
    for (const g of G) if (Math.abs(s - g) < BOX_HALF + 10) return true;
    return false;
  }

  function trySpawn(hx, hz, total) {
    if (!cand.length) return false;
    let pick = R() * total;
    let c = cand[cand.length - 1];
    for (const q of cand) { pick -= q.w; if (pick <= 0) { c = q; break; } }
    const L = c.L;
    const along = L.axis === 0 ? hx : hz;
    const s = along + rngRange(R, -SPAWN_R, SPAWN_R);
    if (s < L.lo + 12 || s > L.hi - 12) return false;
    if (nearJunction(L, s)) return false;
    const px = L.axis === 0 ? s : L.c - c.dir * c.lane;
    const pz = L.axis === 0 ? L.c + c.dir * c.lane : s;
    const d = Math.hypot(px - hx, pz - hz);
    if (d < SPAWN_MIN || d > SPAWN_R) return false;
    for (const o of pool) {   // never land on top of another car in the same lane
      if (!o.live || o.line !== L || o.dir !== c.dir || o.lane !== c.lane) continue;
      if (Math.abs(o.s - s) < 26) return false;
    }
    const slot = pool.find((v) => !v.live);
    if (!slot) return false;
    slot.live = true;
    slot.line = L; slot.dir = c.dir; slot.lane = c.lane; slot.s = s;
    slot.lat = 0; slot.swerve = 0;
    slot.vDes = rngRange(R, L.vLo, L.vHi);
    slot.speed = slot.vDes * rngRange(R, 0.8, 1.0);
    slot.van = R() < 0.16;
    slot.halfLen = slot.van ? 2.55 : 2.40;
    slot.halfWid = slot.van ? 0.96 : 0.91;
    slot.jIdx = -1; slot.jDist = 1e9;
    slot.pos.set(px, 0, pz);
    slot.yaw = yawOf(slot);
    const col = rngPick(R, COLORS);
    bodyMesh.setColorAt(slot.k * 2, tmpC.setHex(col, THREE.SRGBColorSpace));
    bodyMesh.setColorAt(slot.k * 2 + 1, tmpC.setHex(col, THREE.SRGBColorSpace));
    bodyMesh.instanceColor.needsUpdate = true;
    return true;
  }

  function countLive() { let n = 0; for (const v of pool) if (v.live) n++; return n; }

  function fill(hx, hz, budget) {
    const total = collectCandidates(hx, hz);
    if (total <= 0) return;
    let n = 0;
    for (let a = 0; a < budget * 10 && n < budget; a++) {
      if (countLive() >= POOL) break;
      if (trySpawn(hx, hz, total)) n++;
    }
  }

  // ---- IDM -------------------------------------------------------------------------------
  /**
   * Acceleration for closing a clear `gap` on something moving at `vLead`.
   * The (sStar/gap)^2 term is what makes the gap a barrier rather than a suggestion, and it
   * is the reason nothing telescopes on a straight even at a 20 m/s closing speed.
   */
  const SQ = 2 * Math.sqrt(IDM_A * IDM_B);
  function idm(v, vDes, gap, vLead) {
    const dv = v - vLead;
    const sStar = IDM_S0 + Math.max(0, v * IDM_T + (v * dv) / SQ);
    const g = Math.max(gap, 0.5);
    return IDM_A * (1 - (v / vDes) ** 4 - (sStar / g) ** 2);
  }

  // ---- state -----------------------------------------------------------------------------
  let night = false;
  const _hero = new THREE.Vector3();

  function writeMatrices() {
    for (const v of pool) {
      const k = v.k;
      if (!v.live) {
        bodyMesh.setMatrixAt(k * 2, HIDE); bodyMesh.setMatrixAt(k * 2 + 1, HIDE);
        cabMesh.setMatrixAt(k, HIDE);
        trimMesh.setMatrixAt(k * 2, HIDE); trimMesh.setMatrixAt(k * 2 + 1, HIDE);
        for (let w = 0; w < 4; w++) wheelMesh.setMatrixAt(k * 4 + w, HIDE);
        padMesh.setMatrixAt(k, HIDE);
        tailMesh.setMatrixAt(k * 2, HIDE); tailMesh.setMatrixAt(k * 2 + 1, HIDE);
        headMesh.setMatrixAt(k * 2, HIDE); headMesh.setMatrixAt(k * 2 + 1, HIDE);
        continue;
      }
      const ry = v.yaw;
      const fx = Math.cos(ry), fz = -Math.sin(ry);   // world.js's forward for this yaw
      const gx = v.pos.x, gz = v.pos.z;
      // `d` runs along the body, `side` across it; both in metres, exactly the offsets
      // world.js's parkedCar() uses so the two populations are the same shape.
      const set = (m, idx, d, side, y, sx, sy, sz) => {
        dummy.position.set(gx + fx * d - fz * side, CAR_Y + y, gz + fz * d + fx * side);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        m.setMatrixAt(idx, dummy.matrix);
      };
      if (v.van) {
        set(bodyMesh, k * 2, 0.00, 0, 0.86, 4.90, 1.12, 1.92);
        set(cabMesh, k, 0.45, 0, 1.30, 3.50, 0.44, 1.80);
        set(bodyMesh, k * 2 + 1, -0.10, 0, 1.47, 4.60, 0.10, 1.84);
        set(trimMesh, k * 2, 2.40, 0, 0.44, 0.28, 0.28, 1.90);
        set(trimMesh, k * 2 + 1, -2.40, 0, 0.44, 0.28, 0.28, 1.90);
      } else {
        set(bodyMesh, k * 2, 0.00, 0, 0.58, 4.40, 0.56, 1.82);
        set(cabMesh, k, -0.22, 0, 1.06, 2.45, 0.40, 1.68);
        set(bodyMesh, k * 2 + 1, -0.22, 0, 1.31, 2.25, 0.10, 1.72);
        set(trimMesh, k * 2, 2.14, 0, 0.42, 0.26, 0.26, 1.84);
        set(trimMesh, k * 2 + 1, -2.14, 0, 0.42, 0.26, 0.26, 1.84);
      }
      // Wheels: YZX order, so the matrix is Ry*Rz*Rx and Rz takes the cylinder's local +Y to
      // -X, which Ry(ry + 90 deg) then swings onto the car's LATERAL axis. Getting this wrong
      // mounts every wheel sideways — the same note is on world.js's parkedCar, which had
      // exactly that bug for four waves.
      let w = 0;
      for (const dx of [-1.42, 1.46]) {
        for (const dz of [-0.86, 0.86]) {
          dummy.position.set(gx + fx * dx - fz * dz, CAR_Y + 0.34, gz + fz * dx + fx * dz);
          dummy.rotation.set(0, ry + Math.PI / 2, Math.PI / 2);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          wheelMesh.setMatrixAt(k * 4 + w, dummy.matrix);
          w++;
        }
      }
      // contact pad: the body footprint plus a ~30 cm penumbra, yawed with the car. It is
      // centred rather than slid down the anti-sun vector the way world.js's baked pads are;
      // at street level under a car the difference is under 20 cm and the pad is moving.
      dummy.position.set(gx, CAR_Y + 0.03, gz);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(5.0, 1, 2.1);
      dummy.updateMatrix();
      padMesh.setMatrixAt(k, dummy.matrix);

      if (night) {
        const hl = v.halfLen;
        set(tailMesh, k * 2, -hl + 0.02, 0.62, 0.62, 0.10, 0.16, 0.34);
        set(tailMesh, k * 2 + 1, -hl + 0.02, -0.62, 0.62, 0.10, 0.16, 0.34);
        set(headMesh, k * 2, hl - 0.02, 0.66, 0.60, 0.10, 0.14, 0.30);
        set(headMesh, k * 2 + 1, hl - 0.02, -0.66, 0.60, 0.10, 0.14, 0.30);
      }
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    cabMesh.instanceMatrix.needsUpdate = true;
    trimMesh.instanceMatrix.needsUpdate = true;
    wheelMesh.instanceMatrix.needsUpdate = true;
    padMesh.instanceMatrix.needsUpdate = true;
    if (night) {
      tailMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
    }
  }

  const api = {
    group,
    vehicles,
    count: 0,
    POOL,

    /**
     * Live junction phase, so a later piece can drive world.js's traffic-light props from the
     * same state the cars obey. 0 = the E-W axis has the green, 1 = N-S, -1 = idle.
     * ROUTED: world.js's trafficLight() props are static geometry and still show one aspect.
     */
    signalPhase(gx, gz) {
      const i = G.indexOf(gx), j = G.indexOf(gz);
      if (i < 0 || j < 0) return -1;
      return junc[i * NJ + j].owner;
    },

    setNight(v) {
      night = !!v;
      tailMesh.count = night ? POOL * 2 : 0;
      headMesh.count = night ? POOL * 2 : 0;
    },

    reset(heroPos) {
      for (const v of pool) v.live = false;
      for (const j of junc) { j.owner = -1; j.heldT = 0; j.occ = 0; }
      const hx = heroPos ? heroPos.x : 0, hz = heroPos ? heroPos.z : 0;
      fill(hx, hz, POOL);
      api.update(0, _hero.set(hx, 0, hz), 0, 0);
    },

    update(dt, heroPos, heroYaw = 0, heroSpeed = 0) {
      const hx = heroPos ? heroPos.x : 0, hz = heroPos ? heroPos.z : 0;
      _hero.set(hx, 0, hz);
      const heroFx = Math.sin(heroYaw), heroFz = Math.cos(heroYaw);
      const step = clamp(dt, 0, 0.05);

      // ---- retire ------------------------------------------------------------------------
      for (const v of pool) {
        if (!v.live) continue;
        place(v, _p);
        if (_p.distanceTo(_hero) > DESPAWN_R || v.s < v.line.lo + 4 || v.s > v.line.hi - 4) {
          v.live = false;
        }
      }
      // ---- replenish ---------------------------------------------------------------------
      // At most four spawns a frame: sixteen cars appearing in one tick is visible as a pop
      // even at 300 m, and the ring has ~3 s of slack at boost speed to refill in.
      const missing = POOL - countLive();
      if (missing > 0) fill(hx, hz, Math.min(SPAWN_PER_FRAME, missing));

      // ---- junction demand ---------------------------------------------------------------
      for (const j of junc) {
        j.occ = 0; j.occAxis = -1; j.dem[0] = 0; j.dem[1] = 0; j.imm[0] = 0; j.imm[1] = 0;
      }
      for (const v of pool) {
        const prevIdx = v.jIdx;
        v.jIdx = -1; v.jDist = 1e9;
        if (!v.live || !v.line.junc) { v.jOk = false; continue; }
        const L = v.line, p = progOf(v);
        const other = G.indexOf(L.c);
        if (other < 0) continue;
        // nearest crossing at or ahead of me, in travel order
        let best = -1, bestD = 1e9;
        for (let g = 0; g < G.length; g++) {
          const d = v.dir * G[g] - p;
          if (d > -BOX_HALF - 2 && d < bestD) { bestD = d; best = g; }
        }
        if (best < 0) continue;
        const idx = L.axis === 0 ? best * NJ + other : other * NJ + best;
        const j = junc[idx];
        v.jIdx = idx; v.jDist = bestD;
        if (idx !== prevIdx) v.jOk = false;   // a new junction ahead: permission is not inherited
        if (bestD <= BOX_HALF) { j.occ++; j.occAxis = L.axis; continue; }
        if (bestD < APPROACH) {
          j.dem[L.axis]++;
          // "imminent" is a BRAKING FACT, not a distance band: this vehicle can no longer be
          // asked to stop before the box, so the phase must not flip out from under it. The
          // first version of this used a fixed 26 m band, and a car STOPPED at the bar sat
          // permanently inside that band, which blocked the flip it was itself waiting for and
          // deadlocked the junction. 11.8% of vehicle-frames were stationary as a result.
          if (v.speed * v.speed / (2 * IDM_BRAKE_MAX) > bestD - BOX_HALF) j.imm[L.axis]++;
        }
      }
      // ---- junction phase ----------------------------------------------------------------
      for (const j of junc) {
        if (j.occ > 0) {
          // Whoever is in the box keeps it. Nothing is ever granted across a moving car, and
          // that single line is what makes "cars do not drive through each other" true rather
          // than likely.
          j.owner = j.occAxis; j.heldT += step;
          continue;
        }
        j.heldT += step;
        if (j.owner < 0) {
          if (j.dem[0] || j.dem[1]) { j.owner = j.dem[0] >= j.dem[1] ? 0 : 1; j.heldT = 0; }
          continue;
        }
        const o = 1 - j.owner;
        // Flip only when the box is clear AND no owner-axis car is already too close to stop,
        // so a phase change never asks anyone for a deceleration it cannot make.
        if (j.dem[o] > 0 && j.imm[j.owner] === 0
            && (j.dem[j.owner] === 0 || j.heldT > GREEN_MIN)) {
          j.owner = o; j.heldT = 0;
        }
      }

      // ---- drive -------------------------------------------------------------------------
      vehicles.length = 0;
      for (const v of pool) {
        if (!v.live) continue;
        const L = v.line;
        const p = progOf(v);
        let a = idm(v.speed, v.vDes, 1e5, v.vDes);

        // (1) car ahead in my lane. O(POOL^2) with an early key reject; at 56 vehicles that
        // is ~3 k cheap comparisons a frame, far below the cost of maintaining a sorted
        // per-lane index and a great deal harder to get wrong.
        let gap = 1e5, vLead = v.vDes;
        for (const o of pool) {
          if (o === v || !o.live || o.line !== L || o.dir !== v.dir || o.lane !== v.lane) continue;
          const g = (progOf(o) - p) - (v.halfLen + o.halfLen);
          if (g > -1 && g < gap) { gap = g; vLead = o.speed; }
        }
        if (gap < 1e4) a = Math.min(a, idm(v.speed, v.vDes, gap, vLead));

        // (2) the stop bar of a junction my axis does not own.
        //
        // Permission is LATCHED, not re-derived from the distance. The first version let any
        // vehicle inside BOX_HALF + COMMIT proceed regardless of the owner, on the theory that
        // it was past the point of stopping — but a vehicle that had never been given the
        // green could satisfy that test simply by having arrived, so cars drove into occupied
        // boxes: measured 3.24 m of body-on-body overlap inside the junction at (160, -160).
        // `jOk` is set only by actually holding the green, cleared by a red we can still stop
        // for, and cleared outright when the junction ahead of us changes.
        if (v.jIdx >= 0 && v.jDist > BOX_HALF) {
          const j = junc[v.jIdx];
          if (j.owner === L.axis) v.jOk = true;
          else if (v.jDist > BOX_HALF + COMMIT) v.jOk = false;
          if (!v.jOk) a = Math.min(a, idm(v.speed, v.vDes, v.jDist - BOX_HALF, 0));
        }

        // (3) the hero. This is the "not a wall" clause: traffic that never reacts to the
        // player is scenery, and traffic that dodges perfectly is not Burnout. Braking for
        // him when he is ahead, and shying away from his line when he is closing from
        // behind, is the honest middle — you can still put him through the back of it.
        const myLat = L.axis === 0
          ? L.c + v.dir * (v.lane + v.lat)
          : L.c - v.dir * (v.lane + v.lat);
        const heroLat = L.axis === 0 ? hz : hx;
        const heroP = v.dir * (L.axis === 0 ? hx : hz);
        const heroAlong = heroSpeed * (v.dir * (L.axis === 0 ? heroFx : heroFz));
        let swerve = 0;
        if (Math.abs(heroLat - myLat) < 3.4) {
          const hg = (heroP - p) - (v.halfLen + 2.4);
          if (hg > -1 && hg < 90) a = Math.min(a, idm(v.speed, v.vDes, hg, Math.max(0, heroAlong)));
          if (hg < -1 && hg > -36 && heroAlong - v.speed > 8) {
            swerve = (Math.sign(myLat - heroLat) || 1) * 1.2;
          }
        }
        v.swerve = swerve;

        v.speed = Math.max(0, v.speed + clamp(a, -IDM_BRAKE_MAX, IDM_A) * step);
        v.s += v.dir * v.speed * step;
        v.lat = damp(v.lat, clamp(v.swerve, -1.3, 1.3), 3.0, step);
        // keep the body on the carriageway whatever the shy asked for: 1.0 m clear of the
        // centreline on the inside, 1.0 m clear of the road edge on the outside
        v.lat = clamp(v.lat, 1.0 - v.lane, L.half - 1.0 - v.lane);

        place(v, v.pos);
        v.yaw = yawOf(v);
        vehicles.push(v);
      }
      api.count = vehicles.length;
      writeMatrices();
    },
  };

  api.setNight(false);
  return api;
}
