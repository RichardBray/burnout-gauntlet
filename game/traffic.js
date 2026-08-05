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
//   t.drainEvents()               drain-on-read boost event queue (see the contract on it below)
//   t.setPool(n) / t.POOL / t.POOL_CAP      live population ceiling, movable at runtime
//   t.eventsTotal()               cumulative events since boot, for a harness
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
//    is the nearest of {any body that geometrically fouls my corridor, the stop bar at a red
//    junction, the hero if he is ahead in my lane}. All three are the same "gap + closing
//    speed" shape, so they are the same four lines of arithmetic evaluated three times and
//    the lowest acceleration wins. IDM rather than a hand-rolled brake curve because it
//    cannot telescope: the (sStar/gap)^2 term diverges as the gap closes, so the gap is a
//    barrier and not a hint. The first clause was a same-line/same-lane KEY MATCH in round 1
//    and is now geometric, which is what lets the junction signal be given a watchdog: a body
//    stalled across a box is an obstacle in its own right and not only a fact about the signal.

import * as THREE from 'three';
import { makeRng, rngRange, rngPick, clamp, damp, makeCanvas, canvasTexture } from './util.js';

// ---- population budget ------------------------------------------------------------------
// 30 LIVE VEHICLES. The number is a PLAYED decision, re-derived in
// `verdicts/wave-s/traffic-r2.md` section 10, and it replaces two earlier ones:
//
//   56  (round 1) reasoned from what one frame can SEE. That is the wrong quantity — it
//       counts vehicles behind the camera and vehicles the fog has already eaten, and at 56
//       the hero passed a car every 40 m of highway, which reads as a jam and not as traffic.
//   22  (inherited, uncommitted, unmeasured) was the user's "cut the count hard" applied by
//       eye. Direction right, and process rule 2 says an unmeasured inherited edit is
//       justified or reverted, never inherited silently.
//
// The quantity I set it by is the CORRIDOR AHEAD: live vehicles inside the hero's forward
// view cone within 200 m, and the near-miss rate per kilometre that follows from it, because
// that is what the boost economy is actually paid out of (`drainEvents` below).
//
// Measured with `tools/_traffic-r2.mjs`, which sweeps the ceiling inside ONE boot through
// `setPool()` so all four values share a machine and a code path. Cars in the corridor and
// near-miss events per kilometre, highway (n=2 at 22 and 30) then city:
//
//   POOL   highway ahead / ev-per-km      city ahead / ev-per-km
//    22        3.8  /  5.8                   2.5  /  3.0
//    30        5.7  /  9.5                   3.5  /  6.8
//    40        8.0  / 14.1                   4.3  /  5.4
//    56       12.3  / 20.3                   6.9  / 11.8
//
// 30 is the smallest value that keeps three or more moving cars in the corridor in BOTH
// scenes: 22 puts 2.5 downtown, which is the empty-city read this comment used to warn about,
// and 56 puts twelve on an open freeway, which reads as a jam. At 30 the hero earns a near
// miss every ~1.4 s of highway at 279 km/h and every ~3 s downtown. It is a 46% cut on 56.
const POOL_CAP = 64;      // instanced CAPACITY. POOL may be moved at runtime, never past this.
let POOL = 24;   // was 30; -20% live traffic on user request
const SPAWN_R = 300;      // half-length of the along-road window a spawn may land in
const SPAWN_MIN = 62;     // behind or beside the hero this is invisible, so it stays
// IN THE HERO'S VIEW CONE nothing may appear closer than this. `SPAWN_MIN` alone is a radius
// and a radius cannot tell "40 m behind the camera" from "63 m dead ahead on an unoccluded
// six-lane straight" — the traffic critic measured 26 cars materialising inside 120 m of
// clear view in 40 s of highway, nearest 62.9 m, and that is the whole of that defect.
const SPAWN_FWD_MIN = 240;
// cos of the half-angle counted as "in view". ZERO, i.e. the whole half-plane in front of the
// hero, and it has to be: the CHASE CAMERA sits ~20 m behind the car, so a point 70 m out at 60
// deg off the car's heading is only ~48 deg off the camera's and lands on screen. A 56 deg gate
// measured 10 spawns still visible inside 240 m; the half-plane measured none.
const SPAWN_CONE = 0.0;
const DESPAWN_R = 345;    // retire outside this; > SPAWN_R so a spawn is never instantly retired
// A LINE-END retire this close inside the view cone is DEFERRED rather than taken, because
// the second and third clauses of the retire test ignore the hero completely and the critic
// watched cars wink out 119-177 m dead ahead as the hero drove at the end of the highway.
const END_HIDE_R = 260;
const END_HOLD_MAX = 5.0; // s. Bounded, so a deferred retire can never become a car park.
const LINE_LAT_MAX = 210; // ignore road lines further sideways than this
const SPAWN_PER_FRAME = 4;

// ---- lateral behaviour ------------------------------------------------------------------
// TRAFFIC BARELY REACTS TO THE HERO, and that is a deliberate reversal. An earlier round
// measured max lane error 0.000 m with the whole population coming head-on, called the
// reaction non-existent, and the fix (SHY 1.2 m, EVADE 3.2 m at 7 m/s of lateral rate) put
// more than a lane width of dodge under the player - which reads on screen as the traffic
// swerving out of the way, i.e. the road parting for you. Playing it, that is worse than
// scenery: it removes the thing you were about to hit. These values keep a flinch that is
// visible up close and invisible at range; the 0.000 m finding is knowingly re-accepted.
const SHY_LAT = 0;        // m of shy when the hero comes past from behind - none, by choice
const EVADE_LAT = 0.8;    // m of shy when the hero comes at me head-on (clamped by the line)
const OVERTAKE_LAT = 2.6; // m of shy to get round a body that is not going to move
const OVERTAKE_STALL = 2.0; // s stopped behind that body before I go round it
const OVERTAKE_HOLD = 4.0;  // s the manoeuvre is held for once armed, so it cannot oscillate
const LAT_INNER = 1.7;    // m: never come closer than this to the centreline, so two vehicles
                          // travelling opposite ways can never be inside each other's corridor

// ---- boost event stream ------------------------------------------------------------------
const NEAR_MISS_R = 3.4;    // m of body-to-body clearance that opens a pass
const NEAR_MISS_OUT = 1.4;  // m of EXTRA clearance that closes it and fires the event
const EVENT_SPEED_MIN = 12; // m/s (43 km/h) hero speed floor: a crawl past a car is not an event
const EVENT_REL_MIN = 8;    // m/s relative speed floor, same reason
const HERO_HALF_W = 0.95;   // hero body half-width; a pass is a LATERAL event so this is the
                            // right inflation radius for a point-vs-box clearance
const CHECK_SHUNT = 2.6;    // m/s-ish lateral shove a traffic check puts on the vehicle
const EVENT_CAP = 96;       // queue ceiling, so an undrained queue cannot grow without bound

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
// s: a watchdog on the occupancy latch, and it is deliberately long. The latch is now armed by
// MOVING occupancy only (see the demand pass), and a vehicle crossing a 24.8 m box at the city's
// 12.5-16.5 m/s clears it in under 2 s, so a moving occupant is self-limiting and does not need a
// tight bound. A tight one is actively harmful: at 3.2 s the phase could be handed to the cross
// axis while a car was still crawling across the box, and two vehicles from perpendicular axes
// inside the box at once measured 2.17 m of body-on-body overlap in the parked-in-a-junction
// repro. What broke the deadlock was never the bound — it is that a STALLED body no longer arms
// the latch at all, and the geometric leader test is what stops anyone driving into it.
const OCC_HOLD_MAX = 8.0;

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
  // `latMax` is how far a vehicle may shy from its lane centre. It is NOT the road edge: on a
  // city street world.js stands its stopped kerbside queue at 7.4 m and parks at 10.5 m, and
  // those are baked bodies this module cannot see, so a shy of 2.8 m from the 2.5 m lane puts
  // the far flank at 6.2 m and keeps 0.4 m of daylight to the nearest baked car. The road-edge
  // clamp (`half - 1.0`) still applies on top and wins on the highway's outer lane.
  for (const c of G) {
    lines.push({ axis: 0, c, lo: -EX, hi: EX, lanes: cityLanes, junc: true, half, vLo: 12.5, vHi: 16.5, latMax: 2.8 });
    lines.push({ axis: 1, c, lo: -EX, hi: EX, lanes: cityLanes, junc: true, half, vLo: 12.5, vHi: 16.5, latMax: 2.8 });
  }
  // The highway crosses nothing — it lies at z = -700, clear of the grid's z = -480..480 —
  // so it carries no junction state and all three of its lanes per direction are live. It is
  // also the only road in the map where nothing is parked, so it gets the full width.
  // lo/hi were -1150/1150 and are now the road's REAL extent: world.js:1139 builds the highway
  // ribbon from -1200 to 1200, so 1150 put the line end 50 m short of the tarmac and left the
  // hero (whose own path runs to x = 1000, and who overshoots it past 1150 under boost) staring
  // at the place cars stop existing.
  lines.push({
    axis: 0, c: layout.highwayZ, lo: -1200, hi: 1200, lanes: [3, 9, 15],
    junc: false, half: layout.highwayW / 2, vLo: 25, vHi: 33, latMax: 3.0,
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
  // Allocated at POOL_CAP, DRAWN at POOL. `applyPool()` below moves every mesh's `count`, so a
  // smaller pool really is fewer instances submitted and not just more zero-scale matrices.
  const bodyMesh = inst(boxGeo, paintMat, POOL_CAP * 2, true);   // sill/slab + roof cap
  const cabMesh = inst(boxGeo, glassMat, POOL_CAP, true);        // glasshouse
  const trimMesh = inst(boxGeo, trimMat, POOL_CAP * 2, false);   // bumpers
  const wheelMesh = inst(wheelGeo, tyreMat, POOL_CAP * 4, false);
  bodyMesh.name = 'trafficBody';

  const padMat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: makePadTex(), transparent: true, opacity: 0.68,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const padGeo = new THREE.PlaneGeometry(1, 1);
  padGeo.rotateX(-Math.PI / 2);
  const padMesh = inst(padGeo, padMat, POOL_CAP, false);
  padMesh.renderOrder = 2;
  padMesh.receiveShadow = false;

  // Lamps are unlit basic boxes with toneMapped off so the bloom threshold picks them up as
  // sources rather than as bright paint. Night only: main.js hands us `tod === 'night'`.
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2d14, toneMapped: false });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d6, toneMapped: false });
  const tailMesh = inst(boxGeo, tailMat, POOL_CAP * 2, false);
  const headMesh = inst(boxGeo, headMat, POOL_CAP * 2, false);
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
  for (let k = 0; k < POOL_CAP; k++) {
    pool.push({
      k, live: false, line: null, dir: 1, lane: 0, s: 0, lat: 0, swerve: 0, hornT: 0,
      speed: 0, vDes: 0, van: false, halfLen: 2.4, halfWid: 0.91,
      pos: new THREE.Vector3(), yaw: 0, jIdx: -1, jDist: 1e9, jOk: false,
      endHold: 0,          // s this vehicle's line-end retire has been deferred for
      stallT: 0, otT: 0,   // s stopped behind a body that is not moving / overtake left to run
      shove: 0, shoveT: 0, // lateral impulse from a traffic check, and its remaining life
      // one open near-miss pass, per slot: min clearance, peak relative speed, whether it
      // turned into contact, whether the hero was travelling against my lane at the closest point
      nmOn: false, nmMin: 0, nmRel: 0, nmHit: false, nmOnc: false, ctOn: false,
    });
  }
  const vehicles = [];   // the live subset; same array object every frame, so no per-frame alloc

  // ---- junction state --------------------------------------------------------------------
  // One record per (gi, gj) crossing of the grid. `owner` is the axis (0 or 1) that currently
  // holds the green; -1 means nobody has asked for it yet.
  const NJ = G.length;
  const junc = [];
  for (let i = 0; i < NJ * NJ; i++) {
    junc.push({ owner: -1, heldT: 0, occT: 0, occ: 0, occStill: 0, occMove: 0, occAxis: -1, dem: [0, 0], imm: [0, 0] });
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
  // The hero's heading, kept here so both the spawn gate and the retire gate can ask the one
  // question that matters for pop-in: is this point somewhere the player is looking?
  // physics.js:381 defines forward as (sin yaw, 0, cos yaw); that is the convention here too.
  let hfx = 0, hfz = 1, hpx = 0, hpz = 0;
  // The cone gate is a POP-IN gate, and a whole-scene reset has no pop-in to hide: the entire
  // frame appears at once. It is also the one moment the hero's heading is not known (main.js
  // calls reset(pos) with no yaw), so gating there would leave the road ahead permanently
  // empty on every boot and every press of R.
  let spawnGate = true;
  let firstFill = true;    // see reset(): the view gate is only opened for a boot's first fill

  /**
   * Is (x, z) inside the hero's forward view cone AND within `r`? A radius on its own cannot
   * tell a spawn behind the camera from one dead ahead, which is why round 1's SPAWN_MIN could
   * not fix highway pop-in at any value that still kept the road populated.
   */
  function inHeroView(x, z, r) {
    const dx = x - hpx, dz = z - hpz;
    const d = Math.hypot(dx, dz);
    if (d > r) return false;
    if (d < 1e-3) return true;
    return (dx * hfx + dz * hfz) / d > SPAWN_CONE;
  }

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
    // NOT IN PLAIN SIGHT. Behind or beside the hero, SPAWN_MIN is enough; in the cone he is
    // looking down, nothing may appear closer than SPAWN_FWD_MIN.
    if (spawnGate && inHeroView(px, pz, SPAWN_FWD_MIN)) return false;
    for (const o of pool) {   // never land on top of another car in the same lane
      if (!o.live || o.line !== L || o.dir !== c.dir || o.lane !== c.lane) continue;
      if (Math.abs(o.s - s) < 26) return false;
    }
    const slot = pool.find((v) => !v.live && v.k < POOL);
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
    slot.endHold = 0; slot.stallT = 0; slot.shove = 0; slot.shoveT = 0;
    slot.nmOn = false; slot.ctOn = false;
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

  // ---- the boost event stream -------------------------------------------------------------
  // Round 1's traffic was scenery, so the boost economy was fake: `physics.boostEarnDanger`
  // filled the bar off nothing but held throttle and fourteen seconds of lane-kept highway
  // through traffic produced ZERO events. Paradise has no passive refill at all — every point
  // of boost is a near miss, an oncoming pass, a traffic check, air, a takedown or a barrel
  // roll. This queue is the traffic half of that, drain-on-read, and `amount` is deliberately
  // an INTENSITY and not a boost quantity: what a near miss is WORTH is physics.js's business.
  const events = [];
  let eventsTotal = 0;

  function emit(type, amount, x, z, meta) {
    if (events.length >= EVENT_CAP) events.shift();   // an undrained queue must not grow
    events.push({ type, amount: clamp(amount, 0, 1), at: { x, z }, meta });
    eventsTotal++;
  }

  /**
   * Close an open pass on `v` and fire its event if it earned one. A pass is scored at its
   * CLOSEST POINT rather than per frame, so one car passed once is one event however many
   * frames the hero spent beside it — the alternative pays sixty times for standing still
   * next to a bus, which is rule 3's failure mode in a boost economy.
   */
  function closePass(v) {
    if (!v.nmOn) return;
    v.nmOn = false;
    if (v.nmHit) return;                    // contact already fired a 'check'; not also a near miss
    if (v.nmRel < EVENT_REL_MIN) return;    // drove past at walking pace relative to it
    const close = clamp((NEAR_MISS_R - v.nmMin) / NEAR_MISS_R, 0, 1);
    const fast = clamp((v.nmRel - EVENT_REL_MIN) / 25, 0, 1);
    emit(v.nmOnc ? 'oncoming' : 'nearMiss', 0.6 * close + 0.4 * fast, v.pos.x, v.pos.z,
      { clearance: +v.nmMin.toFixed(2), relSpeed: +v.nmRel.toFixed(1) });
  }

  // ---- state -----------------------------------------------------------------------------
  let night = false;
  let onPass = null;        // fired at the OPENING of a near-miss pass; see the call site
  let onHorn = null;        // fired when an NPC leans on the horn at a head-on hero
  let statics = [];         // world.js's parked bodies, for pass audio only; see update()
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

  /** Move every mesh's drawn `count` to match POOL. Capacity stays at POOL_CAP. */
  function applyPool() {
    bodyMesh.count = POOL * 2;
    cabMesh.count = POOL;
    trimMesh.count = POOL * 2;
    wheelMesh.count = POOL * 4;
    padMesh.count = POOL;
    tailMesh.count = night ? POOL * 2 : 0;
    headMesh.count = night ? POOL * 2 : 0;
    api.POOL = POOL;
  }

  const api = {
    group,
    vehicles,
    count: 0,
    POOL,
    POOL_CAP,

    /**
     * Returns and CLEARS the events accrued since the last call. Never returns null.
     * Each event: { type, amount, at: {x, z}, meta }
     *   'nearMiss' | passed within NEAR_MISS_R of a vehicle body above a speed floor
     *   'oncoming' | ... while travelling against that vehicle's lane direction
     *   'check'    | hero contact that shunts a vehicle. Whether the hero SURVIVED it is
     *                physics.js's call, not this module's; a wreck vetoes the award there.
     * `amount` is a 0..1 INTENSITY (how close / how fast), NOT a boost quantity.
     *
     * THE JOIN IS PENDING. The wiring is one line in the FROZEN main.js —
     * `physics.setEventSource(() => traffic.drainEvents())` — and the session driver adds it
     * after both halves land. Until then this queue is written, capped and never read in the
     * shipped path, which is why EVENT_CAP exists.
     */
    drainEvents() {
      if (!events.length) return [];
      const out = events.slice();
      events.length = 0;
      return out;
    },

    /** Cumulative event count since boot. Observability only; drainEvents does not move it. */
    eventsTotal() { return eventsTotal; },

    /**
     * Called with `{ side, relSpeed, clearance }` the frame a near-miss pass OPENS - the
     * air-drag whoosh. Push, not pull, and separate from `drainEvents` because that queue is
     * drain-on-read with physics.js as its single owner; see the call site for both reasons.
     * Optional: left unset, traffic is silent on passes and nothing else changes.
     */
    setPassListener(fn) { onPass = typeof fn === 'function' ? fn : null; },
    setHornListener(fn) { onHorn = typeof fn === 'function' ? fn : null; },

    /**
     * The STATIONARY bodies (world.parkedCars) that should also make a pass whoosh. Optional:
     * left unset, only the moving population is audible. Scanned linearly per frame with a
     * squared-distance reject, which is why no spatial index ships with it - at the shipped
     * density this is ~440 bodies and the reject discards nearly all of them.
     */
    setStaticBodies(list) { statics = Array.isArray(list) ? list : []; },

    /**
     * Move the live population ceiling at runtime, so the POOL decision can be A/B'd inside one
     * boot instead of being argued from a constant. Clamped to POOL_CAP because that is the
     * instanced capacity the meshes were allocated with.
     */
    setPool(n) {
      POOL = clamp(Math.round(n), 0, POOL_CAP);
      for (const v of pool) if (v.k >= POOL && v.live) { v.live = false; v.nmOn = false; }
      applyPool();
      return POOL;
    },

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
      applyPool();
    },

    reset(heroPos) {
      for (const v of pool) {
        v.live = false; v.nmOn = false; v.ctOn = false;
        v.endHold = 0; v.stallT = 0; v.otT = 0; v.shove = 0; v.shoveT = 0;
      }
      for (const j of junc) { j.owner = -1; j.heldT = 0; j.occT = 0; j.occ = 0; }
      events.length = 0;
      const hx = heroPos ? heroPos.x : 0, hz = heroPos ? heroPos.z : 0;
      hpx = hx; hpz = hz;
      // The view gate must be OFF for the first fill of a boot and ON for every later reset.
      // At boot there is no hero heading yet, so `inHeroView` would be testing against a
      // fabricated +Z and could reject most of the network; but `reset()` is also what R and
      // the START button call, and there the heading is real and known. Zeroing it there and
      // dropping the gate is what re-opened the pop-in defect: wave-s/traffic-critic-r2
      // measured a visible spawn at 9 m after an R. So keep the live heading across a reset
      // and only open the gate for the very first fill.
      if (firstFill) { hfx = 0; hfz = 1; }
      spawnGate = !firstFill;
      fill(hx, hz, POOL);
      spawnGate = true;
      firstFill = false;
      api.update(0, _hero.set(hx, 0, hz), 0, 0);
    },

    update(dt, heroPos, heroYaw = 0, heroSpeed = 0) {
      const hx = heroPos ? heroPos.x : 0, hz = heroPos ? heroPos.z : 0;
      _hero.set(hx, 0, hz);
      const heroFx = Math.sin(heroYaw), heroFz = Math.cos(heroYaw);
      const step = clamp(dt, 0, 0.05);
      hpx = hx; hpz = hz; hfx = heroFx; hfz = heroFz;

      // ---- is the hero in the oncoming lane? -----------------------------------------------
      // Right-hand traffic: your own lanes sit to the RIGHT of the centreline along your
      // heading, so a hero LEFT of the nearest road's centreline is driving against the flow.
      // Nearest line within its own half-width wins; off-road (junction aprons included, they
      // are inside some line's half) reports false. Consumed by the boost economy: speeding
      // only earns while it is actually dangerous.
      api.heroOncoming = false;
      {
        let bestD = 1e9, best = null;
        for (const L of lines) {
          const along = L.axis === 0 ? hx : hz, lat = L.axis === 0 ? hz - L.c : hx - L.c;
          if (along < L.lo || along > L.hi) continue;
          const d = Math.abs(lat);
          if (d <= L.half && d < bestD) { bestD = d; best = L; }
        }
        if (best) {
          const lat = best.axis === 0 ? hz - best.c : hx - best.c;
          const fwd = best.axis === 0 ? heroFx : heroFz;   // hero heading along the road axis
          // Own-side sign per place(): axis 0 puts a dir-positive car at lat > 0, axis 1 at
          // lat < 0. Deadband ~1 m about the crown, and require the hero to actually be
          // travelling along the road (|fwd| > 0.5), not sliding across it.
          const side = (best.axis === 0 ? lat : -lat) * Math.sign(fwd);
          if (Math.abs(fwd) > 0.5 && side < -0.9) api.heroOncoming = true;
        }
      }

      // ---- passes on the STATIONARY population ---------------------------------------------
      // The kerb ranks are world.js's, not this pool's, so none of the machinery below sees
      // them and a run down a parked street was silent. Same trigger and same radius as a
      // moving pass, so one kerb car and one moving car passed equally close sound alike.
      //
      // Deliberately whoosh-only: no 'check', no boost event, no IDM. These are scenery with
      // a sound, and paying boost for them would re-price the whole economy off a population
      // that is ~440 bodies dense along every kerb in the city.
      if (onPass && statics.length && Math.abs(heroSpeed) > EVENT_SPEED_MIN) {
        for (const b of statics) {
          const dx = b.x - hx, dz = b.z - hz;
          // Cheap reject first: everything here is static, so most of the population is
          // nowhere near the hero on any given frame and never needs the exact test.
          if (dx * dx + dz * dz > 400) { b.nmOn = false; continue; }
          // Exact point-to-rotated-box, in the body's own frame. Lateral axis is (fz, -fx),
          // matching how world.js places the wheels.
          const along = Math.abs(dx * b.fx + dz * b.fz) - b.halfLen;
          const lat = Math.abs(dx * b.fz - dz * b.fx) - b.halfWid;
          const clr = Math.hypot(Math.max(along, 0), Math.max(lat, 0)) - HERO_HALF_W;
          if (clr < NEAR_MISS_R) {
            if (!b.nmOn) {
              b.nmOn = true;
              // Stationary, so relative speed IS the hero's speed and the side is fixed.
              const side = Math.sign(dx * -heroFz + dz * heroFx) || 1;
              onPass({ side, relSpeed: Math.abs(heroSpeed), clearance: Math.max(clr, 0) });
            }
          } else if (clr > NEAR_MISS_R + NEAR_MISS_OUT) b.nmOn = false;
        }
      }

      // ---- retire ------------------------------------------------------------------------
      for (const v of pool) {
        if (!v.live) continue;
        place(v, _p);
        if (_p.distanceTo(_hero) > DESPAWN_R) { closePass(v); v.live = false; v.endHold = 0; continue; }
        // THE LINE-END RETIRE IS NOT A DISTANCE TEST AND WAS NEVER GATED ON THE HERO. Round 1
        // retired on `v.s > v.line.hi - 4` alone, so driving toward either end of the highway
        // you watched cars wink out 119-177 m dead ahead of you. Now a line-end retire in
        // plain sight is DEFERRED — the vehicle simply keeps driving, off the end of the ribbon
        // if it comes to that — and taken as soon as the player is not looking at it, or after
        // END_HOLD_MAX either way, so a deferral can never turn into a permanently parked car.
        // I tried BRAKING for the road end instead, so a deferred vehicle stopped on the last of
        // the tarmac. It measured worse on the thing that matters: the leader behind it stops
        // 6.2 m short, which is not `atEnd`, so it is never retired at all, and 40 s of highway
        // went from 0.00% stationary to 7.76% with a 13.9 s standstill and a queue of five cars
        // parked at x = 1180. A car that drives on for a few seconds past the last white line
        // 200 m away in the fog is a much smaller lie than a car park at the end of the map.
        if (v.s >= v.line.lo + 4 && v.s <= v.line.hi - 4) { v.endHold = 0; continue; }
        if (v.endHold < END_HOLD_MAX && inHeroView(_p.x, _p.z, END_HIDE_R)) {
          v.endHold += step;
          continue;
        }
        closePass(v); v.live = false; v.endHold = 0;
      }
      // ---- replenish ---------------------------------------------------------------------
      // At most four spawns a frame: sixteen cars appearing in one tick is visible as a pop
      // even at 300 m, and the ring has ~3 s of slack at boost speed to refill in.
      const missing = POOL - countLive();
      if (missing > 0) fill(hx, hz, Math.min(SPAWN_PER_FRAME, missing));

      // ---- junction demand ---------------------------------------------------------------
      for (const j of junc) {
        j.occ = 0; j.occAxis = -1; j.dem[0] = 0; j.dem[1] = 0; j.imm[0] = 0; j.imm[1] = 0;
        j.occStill = 0; j.occMove = 0;
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
        if (bestD <= BOX_HALF) {
          j.occ++;
          // MOVING occupancy and STALLED occupancy are two different facts and round 1 conflated
          // them. A moving body in the box will be out of it in under two seconds, so it can own
          // the phase outright; a stalled body will not, so it must not.
          if (v.speed < 1.0) j.occStill++;
          else { j.occMove++; j.occAxis = L.axis; }
          continue;
        }
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
        // THE LATCH IS NOW BOUNDED. Round 1 read `if (j.occ > 0) { j.owner = j.occAxis; ... }`
        // with no watchdog, so whoever was in the box kept the green for as long as they were
        // in it — and a body STOPPED in the box is a body in the box. Park the hero in a
        // junction and one car stops behind him inside the box, latches the phase, and the
        // crossing axis never gets a green again: measured, 30 s of sitting in the box at
        // (0, 0) held owner = 1 for the entire window and froze 15 of 56 vehicles solid. That
        // is this piece's original defect regenerating locally under an input players perform
        // constantly. The hold is now capped at OCC_HOLD_MAX, and it is safe to cap because
        // the drive block below no longer relies on the signal to keep bodies apart: it takes
        // the nearest body that geometrically fouls its own corridor, whatever axis that body
        // is on, so a cross-axis car released across a stalled one brakes for it and then goes
        // round it rather than through it.
        if (j.occMove > 0) j.occT += step; else j.occT = 0;
        if (j.occMove > 0 && j.occT < OCC_HOLD_MAX) {
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
      const hvx = heroFx * heroSpeed, hvz = heroFz * heroSpeed;
      const heroFast = Math.abs(heroSpeed) > EVENT_SPEED_MIN;
      const heroTravel = Math.sign(heroSpeed) || 1;
      vehicles.length = 0;
      for (const v of pool) {
        if (!v.live) continue;
        if (v.hornT > 0) v.hornT -= step;
        const L = v.line;
        const a0 = L.axis === 0;
        const p = progOf(v);
        let a = idm(v.speed, v.vDes, 1e5, v.vDes);

        // (1) THE NEAREST BODY THAT FOULS MY CORRIDOR, whatever line, lane or axis it is on.
        //
        // Round 1 compared only same-line/same-dir/same-lane pairs, so a car stalled ACROSS a
        // junction box was not an obstacle to anybody and the ONLY thing keeping the crossing
        // safe was the signal — which is exactly why the signal's occupancy latch could not be
        // given a watchdog without cars driving through each other. This is the geometric
        // version: project every other body into my (along, lateral) frame and take the nearest
        // one whose lateral extent actually overlaps mine. It subsumes the old same-lane case,
        // it makes a perpendicular body in a junction box a real obstacle, and it makes a
        // shy or a shunt into an adjacent lane something the car in that lane can see.
        //
        // Still O(POOL^2) with an early reject, ~900 comparisons a frame at POOL 30.
        const myLatW = a0 ? v.pos.z : v.pos.x;
        let gap = 1e5, vLead = v.vDes, blocker = null;
        for (const o of pool) {
          if (o === v || !o.live) continue;
          const same = o.line.axis === L.axis;
          const oLatW = a0 ? o.pos.z : o.pos.x;
          const oHalfLat = same ? o.halfWid : o.halfLen;
          if (Math.abs(oLatW - myLatW) > v.halfWid + oHalfLat + 0.30) continue;
          const oAlong = v.dir * (a0 ? o.pos.x : o.pos.z);
          const g = (oAlong - p) - (v.halfLen + (same ? o.halfLen : o.halfWid));
          if (g > -1 && g < gap) {
            gap = g;
            // Only a body travelling my way is a moving leader; a crossing body is a wall.
            vLead = same && o.dir === v.dir ? o.speed : 0;
            blocker = o;
          }
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
        const myLat = a0
          ? L.c + v.dir * (v.lane + v.lat)
          : L.c - v.dir * (v.lane + v.lat);
        const heroLat = a0 ? hz : hx;
        const heroP = v.dir * (a0 ? hx : hz);
        const heroAlong = heroSpeed * (v.dir * (a0 ? heroFx : heroFz));
        // d(world lateral)/d(v.lat). Round 1 wrote the shy as `sign(myLat - heroLat) * 1.2`
        // WITHOUT this factor, and `place()` maps a positive `lat` to +z only for axis 0 dir +1
        // — so on the other three of the four (axis, dir) combinations the "shy away from the
        // hero" moved the car TOWARD him. That is half the network and both highway
        // carriageways minus one.
        const latSign = a0 ? v.dir : -v.dir;
        const away = (Math.sign(myLat - heroLat) || 1) * latSign;
        let swerve = 0;
        let heroWall = false;
        if (Math.abs(heroLat - myLat) < 3.6) {
          const hg = (heroP - p) - (v.halfLen + 2.4);
          if (hg > -1 && hg < 24 && Math.abs(heroSpeed) < 2) heroWall = true;
          if (hg > -1 && hg < 90) {
            // A hero coming the other way is a closing wall, not a slow leader, and IDM already
            // says so: a negative vLead blows sStar up and the (sStar/gap)^2 term with it.
            a = Math.min(a, idm(v.speed, v.vDes, hg, Math.max(heroAlong, -12)));
            // ONCOMING. The wrong-way hero closes at 60-70 m/s, so there is no gap to brake
            // into and the only real reaction is to leave the lane. TIME to contact, not a
            // distance band: round 1's 90 m band is 1.3 s at a 250 km/h closing speed, which is
            // why the critic measured max lane error 0.000 m with the whole population coming
            // at the hero head-on and called the reaction non-existent.
            const closing = v.speed - heroAlong;
            if (heroAlong < -3 && closing > 1 && hg / closing < 3.0) {
              swerve = away * EVADE_LAT;
              // The driver being run at leans on the horn, same trigger as the evade so the
              // honk and the swerve are one reaction. Per-vehicle cooldown: one honk per
              // encounter, not one per frame. Same plain-callback channel as onPass and for
              // the same reason - drainEvents' income is physics.js's, sound is not.
              if (onHorn && v.hornT <= 0) {
                v.hornT = 5 + Math.random() * 3;
                const side = Math.sign((v.pos.x - hx) * -heroFz + (v.pos.z - hz) * heroFx) || 1;
                onHorn({ side, closing, dist: Math.max(hg, 0), urgency: clamp(1.2 - (hg / closing) / 3, 0.3, 1) });
              }
            }
          } else if (hg > -36 && heroAlong - v.speed > 8) {
            swerve = away * SHY_LAT;         // he is coming past me from behind
          }
        }
        // (4) GO ROUND WHAT IS NOT GOING TO MOVE. Round 1 had no way to do this at all, so a
        // single immovable body froze everything behind it for as long as the player left it
        // there, and that is the car park this whole module exists to delete. THE HERO COUNTS AS
        // A BLOCKER, and he is the important one: he is not in the pool, so the head of a queue
        // stopped by clause (3) has no `blocker` at all and would queue behind him forever —
        // measured, parking in a junction box still froze 12 of 30 vehicles once the signal
        // latch was bounded, because the fan of cars stopped by the HERO simply replaced the
        // fan stopped by the signal. Not applied to a vehicle waiting at a red it can still
        // stop for: queue-jumping a stop bar is worse than waiting, and not applied over an
        // evasion, which is already a lateral move with a better reason.
        // THE MANOEUVRE IS LATCHED FOR A FIXED TIME and is not re-decided per frame. Recomputing
        // it every frame oscillates and gets nowhere: the shy that clears the blockage is the
        // same shy that makes the blockage stop registering, so `stallT` resets, the car damps
        // back into the lane, and the whole thing repeats. Measured mid-oscillation with
        // `_traffic-r2.mjs --sit`: nine cars stopped round a parked hero with `lat` 0.00-0.23
        // and `stallT` cycling at 0.5-1.8 s, i.e. never once reaching the 2.0 s trigger.
        const stalled = v.speed < 8
          && (heroWall || (blocker && blocker.speed < 2.0 && gap < 24));
        if (stalled) v.stallT += step; else v.stallT = 0;
        const atRed = v.jIdx >= 0 && v.jDist > BOX_HALF && !v.jOk;
        if (v.otT > 0) {
          v.otT -= step;
          if (swerve === 0) swerve = OVERTAKE_LAT;
        } else if (v.stallT > OVERTAKE_STALL && !atRed) {
          v.otT = OVERTAKE_HOLD; v.stallT = 0;
          if (swerve === 0) swerve = OVERTAKE_LAT;
        }

        // a traffic check outranks everything: it is not a decision, it is being hit
        if (v.shoveT > 0) { v.shoveT -= step; swerve = v.shove; }
        v.swerve = swerve;

        v.speed = Math.max(0, v.speed + clamp(a, -IDM_BRAKE_MAX, IDM_A) * step);
        v.s += v.dir * v.speed * step;
        // An evasion has to happen inside the second it has; a shy is a lean.
        const latRate = Math.abs(v.swerve) > 2 ? 7.0 : 3.0;
        let want = damp(v.lat, clamp(v.swerve, -EVADE_LAT, EVADE_LAT), latRate, step);
        // Keep the body on the carriageway whatever the shy asked for, and keep it out of the
        // baked population's lanes: `latMax` (buildNetwork) is the shy ceiling, the road edge
        // wins over it on the highway's outer lane, and LAT_INNER is the floor — two vehicles
        // travelling opposite ways must never be able to enter each other's corridor, which
        // with the geometric leader test above would lock them nose to nose.
        want = clamp(want,
          Math.max(-L.latMax, LAT_INNER - v.lane),
          Math.min(L.latMax, L.half - 1.0 - v.lane));
        // LATERAL NON-INTERPENETRATION. The leader test above only sees bodies AHEAD (g > -1),
        // so it cannot stop a shy that moves sideways INTO a body already alongside — and this
        // module's hardest-won invariant is 0.000 m of body-on-body overlap over nine million
        // pair tests. The first version of the overtake broke it: 1.776 m of overlap in 23
        // frames of the parked-in-a-junction repro, cars shying across each other inside the
        // box. So a lateral move that would reduce an already-too-small separation is simply
        // not taken. It never LOCKS, because it only refuses moves that make things worse.
        if (want !== v.lat) {
          const latBase = a0 ? L.c + v.dir * v.lane : L.c - v.dir * v.lane;
          const newLatW = latBase + latSign * want;
          for (const o of pool) {
            if (o === v || !o.live) continue;
            const same = o.line.axis === L.axis;
            const oAlong = v.dir * (a0 ? o.pos.x : o.pos.z);
            if (Math.abs(oAlong - p) > v.halfLen + (same ? o.halfLen : o.halfWid) + 0.2) continue;
            const oLatW = a0 ? o.pos.z : o.pos.x;
            const minSep = v.halfWid + (same ? o.halfWid : o.halfLen) + 0.2;
            const newSep = Math.abs(newLatW - oLatW);
            if (newSep < minSep && newSep < Math.abs(myLatW - oLatW)) { want = v.lat; break; }
          }
        }
        v.lat = want;

        place(v, v.pos);
        v.yaw = yawOf(v);

        // ---- events ----------------------------------------------------------------------
        // Clearance from the hero's body to this one, 2-D. Every traffic yaw is a multiple of
        // 90 deg so this box is axis-aligned and the point-to-box part is exact; the hero is
        // taken as a disc of his own half-width, which is the right inflation for a pass
        // because a pass is a LATERAL event.
        const ex = a0 ? v.halfLen : v.halfWid;
        const ez = a0 ? v.halfWid : v.halfLen;
        const cdx = Math.max(0, Math.abs(hx - v.pos.x) - ex);
        const cdz = Math.max(0, Math.abs(hz - v.pos.z) - ez);
        const clr = Math.hypot(cdx, cdz) - HERO_HALF_W;
        const vvx = a0 ? v.dir * v.speed : 0;
        const vvz = a0 ? 0 : v.dir * v.speed;
        const rel = Math.hypot(hvx - vvx, hvz - vvz);
        if (clr < NEAR_MISS_R && heroFast) {
          if (!v.nmOn) {
            v.nmOn = true; v.nmMin = clr; v.nmRel = rel; v.nmHit = false; v.nmOnc = false;
            // THE WHOOSH FIRES HERE, at the OPENING of the pass, and deliberately not from
            // the event queue below. `closePass` is gated on clearance re-opening past
            // NEAR_MISS_R + NEAR_MISS_OUT, which measures 127 ms late at the median and 225
            // at p90 - audibly attached to the wrong car. From here the sound's own attack
            // covers the approach and peaks about where the car actually is.
            //
            // This is a plain callback and NOT a second event type on purpose: `drainEvents`
            // is drain-on-read and physics.js owns the only drain (main.js), so anything
            // pushed there to make a noise would be silently spent as boost income instead.
            if (onPass) {
              // +1 = going by on the driver's right. right = forward x up = (-fz, 0, fx).
              const side = Math.sign((v.pos.x - hx) * -heroFz + (v.pos.z - hz) * heroFx) || 1;
              onPass({ side, relSpeed: rel, clearance: clr });
            }
          }
          if (clr <= v.nmMin) {
            v.nmMin = clr;
            // against my lane direction at the closest point = an oncoming pass
            v.nmOnc = heroTravel * (a0 ? heroFx : heroFz) * v.dir < -0.4;
          }
          if (rel > v.nmRel) v.nmRel = rel;
        }
        if (v.nmOn) {
          if (clr <= 0) {
            if (!v.ctOn) {
              v.ctOn = true; v.nmHit = true;
              emit('check', 0.2 + 0.8 * clamp((rel - 5) / 28, 0, 1), v.pos.x, v.pos.z,
                { relSpeed: +rel.toFixed(1) });
              // and it SHUNTS. physics.js does not collide with traffic yet (routed, round 1),
              // so this is one-sided until it does, but a car that is hit has to move: it is
              // knocked toward the hero's own speed and shoved out of his line.
              v.speed = Math.max(0, v.speed * 0.55 + Math.max(0, heroAlong) * 0.45);
              v.shove = away * CHECK_SHUNT; v.shoveT = 0.7;
            }
          } else if (clr > 0.6) v.ctOn = false;
          if (clr > NEAR_MISS_R + NEAR_MISS_OUT) closePass(v);
        }
        vehicles.push(v);
      }
      api.count = vehicles.length;
      writeMatrices();
    },
  };

  api.setNight(false);
  return api;
}
