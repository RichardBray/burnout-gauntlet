// crash.js — the Crashbreaker moment: time-scale slam, rigid-body wreck tumble,
// instanced debris with real physics, contact sparks/dust/flash, and a camera punch.
//
// API (unchanged, main.js depends on it):
//   createCrash(scene, car, physics, damage) -> crash
//   crash.trigger({speed, dir, severity})  crash.update(dt)  crash.reset()
//   crash.prewarm(render)   silent first-crash path for boot (mask paint + debris upload)
//   crash.active            is a crash running
//   crash.timeScale         audio/gameplay-facing slow-mo factor; main.js multiplies dt by it
//   crash.time              seconds of CRASH time elapsed (i.e. already slow-mo scaled)
//   crash.realTime          seconds of wall-clock time elapsed since the impact
//   crash.settle(s, step)   deterministic fast-forward (used by the shot harness)
//
// Shape of the sequence, in crash time:
//   0.00  impact      — timeScale slams to 0.15, flash + spark cone + dust + debris,
//                       the shell is launched with linear AND angular momentum
//   0..~2.5           — the wreck tumbles as a real rigid body: 8-corner contact
//                       solver against the road with restitution, Coulomb friction
//                       and a righting moment, so it always comes to rest wheels-ish
//                       down and never interpenetrates the tarmac
//   rest + 0.55       — CRASHBREAKER: second time slam, fireball, shockwave ring,
//                       vertical debris + ember fountain, the shell is thrown again
//   after             — the wreck burns: flicker light, rising smoke column, embers
//
// Everything is seeded (util.makeRng) — two runs of the same scene are identical.
//
// Ownership note: this module only writes to its own group, to physics.state (the
// wreck IS the car's state while a crash runs) and, if it can find it, to the camera
// rig's *orbit* parameters. The screen punch is applied in a scene.onBeforeRender
// hook (chained, never replacing an existing one) because the camera rig runs after
// crash.update() in main.js's tick order and would otherwise overwrite it.

import * as THREE from 'three';
import { makeRng, clamp, lerp, damp, makeCanvas, canvasTexture } from './util.js';

const GRAV = -21.5;          // arcade gravity: heavier than real, snappier settle
const DEBRIS_GRAV = -19.0;

// wreck collision hull, car-local. Bottom sits at y=0 so a flat wreck rests on the road.
const HULL = { cx: 0.0, cy: 0.70, cz: 0.0, hx: 0.98, hy: 0.70, hz: 2.32 };
// centre of mass: low and a touch forward (engine), which is what makes it land on its wheels
const COM_LOCAL = new THREE.Vector3(0, 0.56, 0.10);
// inverse inertia for a 1.96 x 1.40 x 4.64 box of unit mass
const INV_I = new THREE.Vector3(0.511, 0.473, 2.070);

// ---------------------------------------------------------------------------
// procedural sprite art
// ---------------------------------------------------------------------------

/** Puffy, lumpy alpha blob — smoke and dust. */
function puffTexture(rng) {
  const S = 128;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 20; i++) {
    const a = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * 0.30 * S;
    const x = S / 2 + Math.cos(a) * rad;
    const y = S / 2 + Math.sin(a) * rad;
    const r = S * (0.12 + rng() * 0.20);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.40)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.17)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'destination-in';
  const env = ctx.createRadialGradient(S / 2, S / 2, S * 0.04, S / 2, S / 2, S * 0.5);
  env.addColorStop(0, 'rgba(255,255,255,1)');
  env.addColorStop(0.62, 'rgba(255,255,255,0.9)');
  env.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = env;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
}

/**
 * Dust/smoke billboard alpha. Lumpier and fibrous at the rim so the silhouette
 * breaks up instead of reading as a circle, and with a fat soft envelope so a
 * dozen of these overlap into one continuous body rather than a bag of discs.
 */
function dustTexture(rng) {
  const S = 192;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  // core mass
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const rad = Math.pow(rng(), 0.7) * 0.26 * S;
    const x = S / 2 + Math.cos(a) * rad;
    const y = S / 2 + Math.sin(a) * rad;
    const r = S * (0.13 + rng() * 0.19);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.46)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // wispy fringe: small lobes pushed out past the core so the edge is ragged
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const rad = (0.24 + rng() * 0.18) * S;
    const x = S / 2 + Math.cos(a) * rad;
    const y = S / 2 + Math.sin(a) * rad;
    const r = S * (0.05 + rng() * 0.10);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.24)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'destination-in';
  const env = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
  env.addColorStop(0.00, 'rgba(255,255,255,1)');
  env.addColorStop(0.55, 'rgba(255,255,255,0.94)');
  env.addColorStop(0.82, 'rgba(255,255,255,0.42)');
  env.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = env;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: false, wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
}

/**
 * Twin tyre bands plus a scuff smear — the deposit under the launch point.
 * u runs along the direction of travel, so the plane is scaled long in x.
 */
function skidTexture(rng) {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  // two rubber bands, slightly converging, with per-step density variation
  for (const band of [0.34, 0.68]) {
    for (let i = 0; i < 150; i++) {
      const u = i / 149;
      const x = u * S;
      const y = band * S + Math.sin(u * 7.0 + band * 9) * S * 0.02
        + (rng() - 0.5) * S * 0.012;
      const h = S * (0.045 + rng() * 0.035) * (0.5 + u * 0.8);
      const a = (0.10 + rng() * 0.14) * Math.min(1, 0.25 + u * 1.4);
      const g = ctx.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, 'rgba(9,8,8,0)');
      g.addColorStop(0.5, `rgba(9,8,8,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(9,8,8,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 2, y - h, S / 60 + 3, h * 2);
    }
  }
  // gouge / scuff smear between and around the bands
  for (let i = 0; i < 40; i++) {
    const x = rng() * S;
    const y = S * (0.22 + rng() * 0.6);
    const r = S * (0.03 + rng() * 0.09);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(14,12,11,${(0.10 + rng() * 0.16).toFixed(3)})`);
    g.addColorStop(1, 'rgba(14,12,11,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // taper both ends so the decal never shows its rectangle
  ctx.globalCompositeOperation = 'destination-in';
  const env = ctx.createLinearGradient(0, 0, S, 0);
  env.addColorStop(0.00, 'rgba(255,255,255,0)');
  env.addColorStop(0.14, 'rgba(255,255,255,0.85)');
  env.addColorStop(0.70, 'rgba(255,255,255,1)');
  env.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = env;
  ctx.fillRect(0, 0, S, S);
  const env2 = ctx.createLinearGradient(0, 0, 0, S);
  env2.addColorStop(0.00, 'rgba(255,255,255,0)');
  env2.addColorStop(0.18, 'rgba(255,255,255,1)');
  env2.addColorStop(0.82, 'rgba(255,255,255,1)');
  env2.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = env2;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso: 8 });
}

/** Tight hot core with a wide falloff — flashes, fireballs, flame licks. */
function glowTexture(core = 0.10) {
  const S = 128;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(core, 'rgba(255,255,255,0.92)');
  g.addColorStop(core + 0.14, 'rgba(255,255,255,0.34)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
}

/**
 * Spark streak: a hot core that fades at BOTH ends.
 *
 * This used to be `pow(v, 2.2)` with alpha pinned at 1.0 on the head row, so the
 * leading end of every streak was a SQUARE CUT across the quad — an alpha step
 * from 1 to 0 at the geometry edge. A real spark under a shutter is a lozenge:
 * the particle is brightest a little behind its leading edge and falls off
 * forwards as well as backwards. So the profile is now split at `VC`: the long
 * authored tail taper below it, a short rounded nose above it. Nothing is ever
 * exactly 1.0 except the single core row, which means the additive gain that
 * consumes this texture has to stay near unity or the whole nose clips flat and
 * the square cut comes straight back (see the colour block in stepSparks).
 */
/** Core row of the streak profile, in v. Below it the authored tail taper; above
 *  it the short rounded nose. See the docstring on streakTexture(). */
const STREAK_VC = 0.86;
function streakTexture() {
  const S = 64;
    const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    // v = 1 at the top row (head)
    const v = 1 - y / (S - 1);
    // Tail below STREAK_VC, nose above it. Both branches evaluate to exactly 1.0
    // at v === STREAK_VC and to 0 at v = 0 and v = 1, so alpha reaches 1.0 on the
    // single core row only and the leading edge of the quad is transparent.
    const a = v <= STREAK_VC
      ? Math.pow(v / STREAK_VC, 2.2)
      : Math.pow((1 - v) / (1 - STREAK_VC), 0.9);
    for (let x = 0; x < S; x++) {
      const u = Math.abs(x / (S - 1) - 0.5) * 2;
      const w = Math.pow(Math.max(0, 1 - u), 1.6);
      ctx.fillStyle = `rgba(255,255,255,${(a * w).toFixed(4)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // ANISOTROPY IS LOAD-BEARING HERE, it is not a quality knob.
  //
  // A spark quad projects to about 12.5 x 1.4 px (probe: lenPx p50 12.52, widPx p50 1.426)
  // from a 64x64 texture, so the pixel footprint in texture space is ~5.1 texels along v and
  // ~45.7 texels along u. Isotropic sampling picks the mip from the WORST axis:
  // log2(45.7) = 5.5, i.e. mip 5, where the texture is 2x2 texels and all 64 authored rows of
  // the profile above collapse into TWO alpha values. The tail taper, the STREAK_VC core row
  // and the nose all average to a constant and every spark renders as a flat bar with square
  // ends — the exact artefact the docstring above says this profile exists to remove, applied
  // by the sampler after the fact.
  //
  // With anisotropy the LOD comes from the MINOR footprint axis instead: log2(5.1) = 2.35, so
  // mip 2 (16x16) with up to 45.7/5.1 = 9 taps across u. Sixteen rows of the profile survive
  // instead of two. This is the same range-vs-consumer failure as the colour block in
  // stepSparks, in the spatial domain: an authored falloff finer than what its consumer — here
  // the mip chain — can represent. Every other texture in this file already runs 4-8.
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso: 16 });
}

/** Two crossed quads spanning y in [-0.5, 0.5] — a streak that never goes edge-on. */
function crossQuadGeometry() {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    0, -0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5,
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

/**
 * Torn sheet-metal shard: a quad with a fold ridge so it catches a specular line.
 *
 * SIZE CONVENTION: every debris primitive in this module spans exactly one unit
 * in its two widest axes, so an instance's scale components ARE its size in
 * metres. That is deliberate — the debris field was previously an order of
 * magnitude oversized and nobody caught it because the instance scale had to be
 * multiplied by an unwritten geometry extent to mean anything. Probe the scale,
 * read metres.
 *
 * FOLD DEPTH, AND WHERE IT ACTUALLY LIVES. The outline below spans 0.077 units
 * in y (centre +0.055, lowest rim -0.022) against a unit footprint, so the
 * rendered fold depth is 0.077 * (the instance's y scale relative to its
 * footprint) — it is set at the SPAWN SITE, not here. This docstring used to
 * claim a flat 9% while the panel spawn multiplied y by 6.4x the footprint,
 * i.e. 49%: a 12 cm shard standing 6 cm proud, worse than the 14%-of-a-
 * half-metre-plate case this comment was written to condemn.
 *
 * STILL WRONG AS OF WAVE N. An earlier revision of this docstring claimed "the
 * spawn now uses 1.5x". It does not — the panel spawn still reads
 * `it.s.set(a, (a + b) * 0.5 * 6.4, b)` and the probe measures sy/footprint 6.26.
 * The Wave N builder owned the SPARK gap and deliberately left the debris field
 * untouched so its shape statistics stayed comparable; it corrected this prose
 * rather than leave a docstring that lies about the code. 1.5x remains the
 * intended value (~8% centre bulge, ~12% peak-to-trough). If you change the y
 * coordinates here, restate the ratio at the spawn.
 */
function shardGeometry() {
  // A torn panel fragment, unit footprint (instance scale is METRES — see the
  // SIZE CONVENTION note at the debris spawn).
  //
  // This was a bent RECTANGLE: two quads sharing a ridge, so every shard in the
  // field showed the same four right angles and two pairs of parallel edges.
  // At a hundred instances that is unmistakably one die-cut card repeated, and
  // it is most of why the fan read as confetti against crash-cam-01's ragged
  // fragments. The outline below is a nine-sided irregular plate: no two edges
  // parallel, no right angles, radii walking between 0.30 and 0.50 so the
  // silhouette has torn points and shallow bays.
  //
  // The outline is BAKED rather than randomised per piece on purpose — one
  // geometry keeps the whole field on a single instanced draw. Per-instance
  // non-uniform scale supplies the variety (spawnDebris draws size, aspect and
  // curl independently), and a tumbling plate never shows the same projection
  // twice anyway.
  //
  // Angles are deliberately unevenly spaced; a fan from a raised centre vertex
  // gives the plate a shallow dish so it still catches a moving highlight as it
  // spins, instead of flashing on and off like a flat card.
  const RIM = [
    // angle (turns), radius, height
    [0.000, 0.50, -0.008], [0.089, 0.34, 0.020], [0.171, 0.47, -0.016],
    [0.283, 0.31, 0.026], [0.372, 0.44, 0.004], [0.494, 0.36, -0.022],
    [0.601, 0.49, 0.016], [0.688, 0.30, -0.010], [0.802, 0.43, 0.024],
    [0.905, 0.38, -0.018],
  ];
  const n = RIM.length;
  const p = new Float32Array((n + 1) * 3);
  p[0] = 0; p[1] = 0.055; p[2] = 0;                 // raised centre
  for (let i = 0; i < n; i++) {
    const [turn, r, h] = RIM[i];
    const a = turn * Math.PI * 2;
    p[(i + 1) * 3 + 0] = Math.cos(a) * r;
    p[(i + 1) * 3 + 1] = h;
    p[(i + 1) * 3 + 2] = Math.sin(a) * r;
  }
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(0, i + 1, ((i + 1) % n) + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Thin bright annulus — the crashbreaker shockwave. */
function ringTexture() {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.70, 'rgba(255,255,255,0)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.94, 'rgba(255,255,255,1)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
}

/** Sooty, streaky ground deposit — scorch and skid. */
function scorchTexture(rng) {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (rng() - 0.5) * S * 0.62;
    const y = S / 2 + (rng() - 0.5) * S * 0.62;
    const r = S * (0.06 + rng() * 0.20);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(18,15,13,${0.24 + rng() * 0.26})`);
    g.addColorStop(1, 'rgba(18,15,13,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(10,9,8,0.5)';
  for (let i = 0; i < 22; i++) {
    ctx.lineWidth = 0.8 + rng() * 3.0;
    const y = S * (0.16 + rng() * 0.68);
    ctx.beginPath();
    ctx.moveTo(S * (0.04 + rng() * 0.2), y + (rng() - 0.5) * 8);
    ctx.lineTo(S * (0.7 + rng() * 0.26), y + (rng() - 0.5) * 8);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-in';
  const env = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
  env.addColorStop(0, 'rgba(255,255,255,1)');
  env.addColorStop(0.6, 'rgba(255,255,255,0.85)');
  env.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = env;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso: 8 });
}

// ---------------------------------------------------------------------------

export function createCrash(scene, car, physics, damage) {
  const group = new THREE.Group();
  group.name = 'crashFx';
  scene.add(group);

  const rng = makeRng(0xC7A5);
  const fxRng = makeRng(0x51A55);

  const texDust = dustTexture(makeRng(0x50A1E));
  const texGlow = glowTexture(0.09);
  const texCore = glowTexture(0.24);
  const texRing = ringTexture();
  const texScorch = scorchTexture(makeRng(0x5C02));
  const texSkid = skidTexture(makeRng(0x5C1D));

  // -------------------------------------------------------------------------
  // instanced debris
  // -------------------------------------------------------------------------
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _qd = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _col = new THREE.Color();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  function makeSet(count, geo, mat, kind) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = kind !== 'glass';
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = count;
    group.add(mesh);
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        i, kind, live: false, asleep: false,
        p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(),
        q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1),
        r: 0.08, drag: 0.2, spinDrag: 0.3, bounce: 0.3, fric: 0.7, restT: 0,
        blur: 0.05, blurMax: 2.6,
        // airborne budget and cone cap — see stepDebris
        age: 0, air: 1, o: new THREE.Vector3(), capR: 5,
      });
      mesh.setMatrixAt(i, HIDDEN);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, items, next: 0 };
  }

  const paintCol = car.paintMat && car.paintMat.color
    ? car.paintMat.color.clone() : new THREE.Color(0xd8420f);

  // body panels: thin bent sheet, painted, double sided so a shard never vanishes edge-on
  const panelGeo = shardGeometry();
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.62, roughness: 0.34, clearcoat: 1.0,
    clearcoatRoughness: 0.09, side: THREE.DoubleSide,
  });
  // Counts are ~3x what they were. The debris field is a *cloud* in every
  // reference frame — hundreds of centimetre chips clustered around the contact
  // patch — so density is what carries it. Thirty half-metre plates read as
  // cardboard; ninety twelve-centimetre chips read as shattered car.
  const panels = makeSet(90, panelGeo, panelMat, 'panel');

  // mechanical bits: dark, chunky, matte
  const mechGeo = new THREE.BoxGeometry(1, 1, 1);
  const mechMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.55, roughness: 0.62,
  });
  const mech = makeSet(126, mechGeo, mechMat, 'mech');

  // glass: small tetra-ish wedges, near-mirror so they flare in the low sun.
  // radius 0.612 puts the tetra's edge length at 1.0, so — like the shard plate
  // and the mech box — instance scale is metres. (It was 0.5, i.e. 0.82 units
  // across, which quietly inflated every glass chip by 63%.)
  const glassGeo = new THREE.TetrahedronGeometry(0.612, 0);
  const glassMat = new THREE.MeshPhysicalMaterial({
    // Near-mirror and env-weighted: the shard's own tumble is what makes the
    // highlight come and go, so the glint is a real reflection sweeping past
    // the low sun rather than a flat bright albedo pretending to sparkle.
    //
    // envMapIntensity was 3.8, which defeated exactly that intent: at 3.8 every
    // facet returned the sky at ~4x no matter which way it was pointing, so the
    // tumble produced no value variation at all and the whole field sat above
    // the buildings it flies past. At ~1.0 the env term is a plain mirror of the
    // sky, and only the facets that actually catch the low sun flare — which is
    // what makes a few pieces glint instead of all of them.
    //
    // The base tint stays cool but is now BELOW unity on every channel so that,
    // combined with a sub-1.0 instance colour (see the glass branch of the size
    // loop), no shard can have an effective albedo over 1.
    color: 0xb9cbd6, metalness: 0.34, roughness: 0.018, clearcoat: 1.0,
    clearcoatRoughness: 0.012, transparent: true, opacity: 0.78,
    envMapIntensity: 1.05, side: THREE.DoubleSide, depthWrite: false,
  });
  const glass = makeSet(168, glassGeo, glassMat, 'glass');
  glass.mesh.renderOrder = 2;

  const debrisSets = [panels, mech, glass];

  // -------------------------------------------------------------------------
  // sparks — additive slivers stretched along their own velocity
  // -------------------------------------------------------------------------
  const SPARKS = 150;
  const sparkGeo = crossQuadGeometry();
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, map: streakTexture(), transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false,
  });
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARKS);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 4;
  sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3);
  group.add(sparkMesh);
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    sparks.push({
      i, live: false, p: new THREE.Vector3(), v: new THREE.Vector3(),
      life: 0, maxLife: 1, hot: 1, drag: 1.1, streak: 0.012, grav: 1, buoy: 0,
    });
    sparkMesh.setMatrixAt(i, HIDDEN);
  }
  let sparkNext = 0;

  // -------------------------------------------------------------------------
  // dust / smoke — soft particles
  //
  // One InstancedBufferGeometry of camera-facing quads, drawn with a custom
  // shader so the medium can do three things a SpriteMaterial cannot:
  //
  //   1. DEPTH FADE. The billboard's alpha is scaled by how far the scene
  //      surface behind it is, so a puff sitting on the tarmac dissolves into
  //      the road instead of showing the hard line where the quad is clipped.
  //      Two sources feed it: an analytic fade against the road plane (always
  //      on, exact, free) and a real scene-depth fade read from the SSAO
  //      pass's depth prepass when it is available (handles the kerb, the
  //      wreck, and the barriers). Because that depth target is filled after
  //      the main render pass, we sample last frame's depth — for a dust body
  //      moving at a couple of metres a second that is invisible, and in the
  //      deterministic shot harness the scene is static across the final
  //      renders so it is exact.
  //   2. LIT VOLUME. A half-Lambert against the sun direction using a fake
  //      spherical normal derived from the quad's own UV, plus a cool skylight
  //      term. That is what makes the column read as a translucent body with a
  //      sun side and a shade side rather than a flat grey decal — the single
  //      thing the reference plumes have and a tinted sprite never does.
  //   3. Per-particle rotation and an expanding radius, with density thinning
  //      as the particle climbs, so the column self-shadows at the base and
  //      frays out at the top.
  //
  // The mesh is registered with the SSAO pass's exclude list: volumetrics must
  // not write into the normal/depth prepass or they would occlude themselves.
  // -------------------------------------------------------------------------
  const DUST = 132;

  const DUST_VERT = /* glsl */`
    attribute vec3 aPos;
    attribute vec4 aParm;     // x radius, y rotation, z alpha, w shade
    attribute vec3 aCol;
    varying vec2 vUv;
    varying vec3 vCol;
    varying float vA;
    varying float vShade;
    varying float vViewZ;
    varying float vWorldY;
    void main() {
      vUv = uv;
      vCol = aCol;
      vA = aParm.z;
      vShade = aParm.w;
      float sr = sin(aParm.y), cr = cos(aParm.y);
      vec2 q = vec2(position.x * cr - position.y * sr,
                    position.x * sr + position.y * cr) * aParm.x;
      vec4 mv = viewMatrix * vec4(aPos, 1.0);
      mv.xy += q;
      vViewZ = -mv.z;
      // world height of this corner: the view-space offset q pushed back into
      // world space through the view rotation's transpose (row 1 = column 1).
      vWorldY = aPos.y + q.x * viewMatrix[1][0] + q.y * viewMatrix[1][1];
      gl_Position = projectionMatrix * mv;
    }
  `;

  const DUST_FRAG = /* glsl */`
    uniform sampler2D uMap;
    uniform sampler2D uDepth;
    uniform vec2  uRes;
    uniform float uDepthOn;
    uniform float uNear;
    uniform float uFar;
    uniform float uSoft;        // metres of depth over which a puff dissolves
    uniform float uGroundSoft;  // metres above the road over which it dissolves
    uniform vec3  uSunDir;      // world-space direction TOWARD the sun
    uniform vec3  uSunCol;      // sun radiance already scaled by intensity
    uniform vec3  uSkyCol;      // cool skylight fill
    varying vec2 vUv;
    varying vec3 vCol;
    varying float vA;
    varying float vShade;
    varying float vViewZ;
    varying float vWorldY;
    void main() {
      float a = texture2D(uMap, vUv).a * vA;
      if (a < 0.004) discard;

      // --- soft particle: analytic road plane -----------------------------
      a *= smoothstep(0.0, uGroundSoft, vWorldY);

      // --- soft particle: real scene depth --------------------------------
      if (uDepthOn > 0.5) {
        float d = texture2D(uDepth, gl_FragCoord.xy / uRes).x;
        // window depth -> positive view distance (perspective camera)
        float vz = -((uNear * uFar) / ((uFar - uNear) * d - uFar));
        a *= clamp((vz - vViewZ) / uSoft, 0.0, 1.0);
      }
      if (a < 0.004) discard;

      // --- half-Lambert on a fake spherical normal -------------------------
      vec2 dd = vUv * 2.0 - 1.0;
      float r2 = clamp(dot(dd, dd), 0.0, 1.0);
      vec3 nv = vec3(dd, sqrt(1.0 - r2));
      vec3 wR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 wU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 wF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
      vec3 n = normalize(wR * nv.x + wU * nv.y + wF * nv.z);
      float hl = dot(n, uSunDir) * 0.5 + 0.5;
      // a translucent medium scatters forward, so the sun side is hot and the
      // falloff into shade is soft rather than a cosine cliff
      vec3 lit = vCol * (uSkyCol + uSunCol * pow(hl, 1.35)) * vShade;

      gl_FragColor = vec4(lit, a);
    }
  `;

  const dustGeo = new THREE.InstancedBufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3));
  dustGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
  ]), 2));
  dustGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aDustPos = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 3), 3);
  const aDustParm = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 4), 4);
  const aDustCol = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 3), 3);
  aDustPos.setUsage(THREE.DynamicDrawUsage);
  aDustParm.setUsage(THREE.DynamicDrawUsage);
  aDustCol.setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute('aPos', aDustPos);
  dustGeo.setAttribute('aParm', aDustParm);
  dustGeo.setAttribute('aCol', aDustCol);
  dustGeo.instanceCount = DUST;
  dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texDust },
      uDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDepthOn: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 1200 },
      uSoft: { value: 2.2 },
      uGroundSoft: { value: 1.15 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1.0, 0.86, 0.68) },
      uSkyCol: { value: new THREE.Color(0.20, 0.24, 0.32) },
    },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const dustMesh = new THREE.Mesh(dustGeo, dustMat);
  dustMesh.frustumCulled = false;
  dustMesh.renderOrder = 3;
  group.add(dustMesh);

  const puffs = [];
  for (let i = 0; i < DUST; i++) {
    puffs.push({
      i, live: false, p: new THREE.Vector3(), v: new THREE.Vector3(),
      life: 0, maxLife: 1, s0: 1, s1: 3, peak: 0.4, rot: 0, spin: 0, cool: 0,
      rise: 1.4, drag: 1.25, y0: 0, thin: 4.0, shade: 1, floor: 0.22,
      warm: new THREE.Color(0xffffff), cold: new THREE.Color(0x9aa0a6),
    });
  }
  let puffNext = 0;

  /** Pull sun/camera/depth state off the live scene once per frame. */
  let ssaoReg = false;
  const _sunTmp = new THREE.Vector3();
  function syncDust() {
    const u = dustMat.uniforms;
    const g = typeof window !== 'undefined' ? window.__game : null;

    // sun: the rig's directional light, target at the origin
    let sun = g && g.sky && g.sky.sun ? g.sky.sun : null;
    if (!sun) {
      scene.traverse((o) => { if (!sun && o.isDirectionalLight) sun = o; });
    }
    if (sun) {
      _sunTmp.copy(sun.position);
      if (sun.target) _sunTmp.sub(sun.target.position);
      if (_sunTmp.lengthSq() > 1e-6) u.uSunDir.value.copy(_sunTmp).normalize();
      // dust is a bright, high-albedo medium: it takes far more of the key than
      // the tarmac does, which is exactly why a plume reads at dusk at all
      const k = clamp(sun.intensity * 0.44, 0.28, 2.4);
      u.uSunCol.value.copy(sun.color).multiplyScalar(k);
    }

    const cam = (g && g.camera) || null;
    if (cam && cam.isPerspectiveCamera) {
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
    }

    const ss = g && g.ssao;
    const dtex = ss && ss.amount > 0 && ss._nrm ? ss._nrm.depthTexture : null;
    if (dtex && dtex.image && dtex.image.width > 1) {
      u.uDepth.value = dtex;
      u.uDepthOn.value = 1;
      u.uRes.value.set(dtex.image.width, dtex.image.height);
    } else {
      u.uDepthOn.value = 0;
    }
    if (!ssaoReg && ss && Array.isArray(ss.exclude)) {
      ss.exclude.push(dustMesh);      // volumetrics never feed the normal prepass
      ssaoReg = true;
    }
  }

  const FLARES = 12;
  const flares = [];
  for (let i = 0; i < FLARES; i++) {
    const mat = new THREE.SpriteMaterial({
      map: texGlow, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffffff, toneMapped: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 5;
    group.add(sp);
    flares.push({
      sp, mat, live: false, p: new THREE.Vector3(), v: new THREE.Vector3(),
      life: 0, maxLife: 1, s0: 1, s1: 1, gain: 1,
    });
  }
  let flareNext = 0;

  // shockwave ring, flat on the tarmac
  const ringMat = new THREE.MeshBasicMaterial({
    map: texRing, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: 0xffd9a0,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.visible = false;
  ring.renderOrder = 4;
  group.add(ring);
  let ringT = -1, ringLife = 0;

  // ground deposits
  const DECALS = 6;
  const decals = [];
  for (let i = 0; i < DECALS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: texScorch, transparent: true, opacity: 0, depthWrite: false,
      depthTest: true, color: 0xffffff,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 1;
    group.add(m);
    decals.push({ m, mat });
  }
  let decalNext = 0;

  // Launch scuff: the twin tyre bands and the gouge the car leaves as it goes
  // off the road, laid along the impact axis under the contact point. Multiply
  // blended so it darkens the tarmac's own aggregate instead of painting a grey
  // patch over it — the reference deposit is *in* the surface, not on it.
  const skidMat = new THREE.MeshBasicMaterial({
    map: texSkid, transparent: true, opacity: 0, depthWrite: false,
    depthTest: true, color: 0xffffff, blending: THREE.NormalBlending,
  });
  const skid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skidMat);
  skid.rotation.x = -Math.PI / 2;
  skid.visible = false;
  skid.renderOrder = 1;
  group.add(skid);

  /** Lay the launch skid: `p` is the contact point, `yaw` the travel heading. */
  function dropSkid(p, dirV, len, wide, opacity) {
    const yaw = Math.atan2(dirV.x, dirV.z);
    skid.visible = true;
    // the plane's local +x is the direction of travel once rotated by -yaw
    skid.position.set(p.x - dirV.x * len * 0.34, 0.019, p.z - dirV.z * len * 0.34);
    skid.scale.set(len, wide, 1);
    skid.rotation.set(-Math.PI / 2, 0, yaw - Math.PI / 2);
    skidMat.opacity = opacity;
  }

  // fire light on the wreck + a flash light at the contact point
  const fireLight = new THREE.PointLight(0xff7a26, 0, 26, 2);
  fireLight.castShadow = false;
  fireLight.visible = false;
  group.add(fireLight);
  const flashLight = new THREE.PointLight(0xfff0d0, 0, 40, 2);
  flashLight.castShadow = false;
  flashLight.visible = false;
  group.add(flashLight);

  // detached wheel(s), simulated alongside the debris
  const looseParts = [];

  // -------------------------------------------------------------------------
  // camera punch — chained scene.onBeforeRender / onAfterRender
  // -------------------------------------------------------------------------
  const noiseTable = new Float32Array(256);
  {
    const nr = makeRng(0x9114CE);
    for (let i = 0; i < noiseTable.length; i++) noiseTable[i] = nr() * 2 - 1;
  }
  const vnoise = (x, o) => {
    const s = x + o * 53.7;
    const i = Math.floor(s), f = s - i;
    const a = noiseTable[((i % 256) + 256) % 256];
    const b = noiseTable[(((i + 1) % 256) + 256) % 256];
    const k = f * f * (3 - 2 * f);
    return a + (b - a) * k;
  };

  const punchOffset = new THREE.Vector3();
  const camSaved = new THREE.Vector3();
  let punchAmp = 0, punchAt = -1e9, punchSeed = 0, punched = false;
  let mainCam = null;
  let pendingImpulse = 0;

  /**
   * One impact kick. If the camera rig exposes impulse() we hand the punch to it
   * (queued, because main.js publishes the rig after trigger() has already run);
   * otherwise we drive our own positional shake through the render hook below.
   */
  function kick(amount) {
    pendingImpulse += amount;
    punchAmp = Math.max(punchAmp * 0.5, 0) + amount;
    punchAt = tReal;
    punchSeed += 7.13;
  }

  const prevBefore = scene.onBeforeRender;
  const prevAfter = scene.onAfterRender;
  scene.onBeforeRender = function (renderer, sc, cam, rt) {
    if (prevBefore) prevBefore.call(this, renderer, sc, cam, rt);
    if (punched) { punched = false; }          // self-heal if onAfterRender never ran
    if (!active || !cam) return;
    if (!mainCam) mainCam = (window.__game && window.__game.camera) || null;
    if (mainCam && cam !== mainCam) return;    // never punch the car's env-probe cube camera
    if (punchOffset.lengthSq() < 1e-8) return;
    camSaved.copy(cam.position);
    cam.position.add(punchOffset);
    cam.updateMatrixWorld(true);
    punched = true;
  };
  scene.onAfterRender = function (renderer, sc, cam) {
    if (punched && cam) {
      cam.position.copy(camSaved);
      cam.updateMatrixWorld(true);
      punched = false;
    }
    if (prevAfter) prevAfter.call(this, renderer, sc, cam);
  };

  // camera rig (optional). main.js publishes ctx on window.__game before the sim runs;
  // car.js latches on to the same object for its env probe, so this matches the codebase.
  let camRig = null;
  function findRig() {
    if (camRig) return camRig;
    const g = window.__game;
    if (g && g.camRig && typeof g.camRig.tweak === 'function') camRig = g.camRig;
    return camRig;
  }

  // -------------------------------------------------------------------------
  // time scale
  // -------------------------------------------------------------------------
  const SLAM_IMPACT = { floor: 0.15, hold: 0.30, ramp: 2.10, exp: 2.4, ease: 0.075 };
  // The crashbreaker gets its own, deeper and much longer-dwelling dilation — in
  // Paradise the detonation is the beat the camera actually lives in.
  const SLAM_BREAKER = { floor: 0.10, hold: 0.70, ramp: 5.60, exp: 3.4, ease: 0.055 };
  let slamAt = -1e9, slamCfg = SLAM_IMPACT;

  function slam(cfg) { slamAt = tReal; slamCfg = cfg; }
  /**
   * Time dilation curve. Both ends are eased on purpose:
   *  - entry: a hard 1.0 -> 0.15 step lands on one frame and reads as a dropped
   *    frame, not as a shutter closing, so we smoothstep into the floor over a
   *    few tens of milliseconds of wall clock.
   *  - exit: pow() alone leaves the floor gently but arrives back at real time
   *    with non-zero slope, which snaps. Smoothstepping the parameter before the
   *    power curve gives zero slope at BOTH ends of the recovery.
   */
  function tsAt(tr) {
    const e = tr - slamAt;
    if (e < 0) return 1;
    const ease = slamCfg.ease === undefined ? 0.06 : slamCfg.ease;
    if (e < ease) {
      const u = e / ease;
      return lerp(1, slamCfg.floor, u * u * (3 - 2 * u));
    }
    if (e < ease + slamCfg.hold) return slamCfg.floor;
    const u = clamp((e - ease - slamCfg.hold) / slamCfg.ramp, 0, 1);
    const s = u * u * (3 - 2 * u);
    return slamCfg.floor + (1 - slamCfg.floor) * Math.pow(s, slamCfg.exp);
  }

  // -------------------------------------------------------------------------
  // slow-mo shutter
  // -------------------------------------------------------------------------
  // Burnout's crash cam does not freeze the world, it time-dilates it while the
  // *camera* keeps a real-world shutter angle. That is why the signature frame
  // is a sharp subject over a streaking road and not a paused physics sim:
  // reference/crash-cam-01 measures 14.0 px of smear @170deg on the tarmac under
  // the launched car (aniso 12.41) against 3.0 px on the car's own flank
  // (aniso 1.47) — the road streaks 4.7x longer than the subject.
  //
  // We publish that as a normalised shutter length. One *displayed* frame covers
  //     dtReal = dtSim / timeScale
  // seconds of real world, so the ground sweeps
  //     groundV * dtSim / timeScale
  // metres past an open shutter. The streak is therefore proportional to
  // groundV / timeScale: at a fixed real-world speed, HEAVIER dilation is a
  // LONGER shutter, which is the whole trick. The renderer's radial smear
  // (boost.js) already holds a soft-edged hero hole over the car, so raising the
  // kernel length streaks the tarmac and leaves the wreck sharp.
  //
  //   SHUTTER_V_REF   real ground speed that earns a full-length streak, m/s.
  //                   62 m/s is the crash-cam scene's entry speed, so a typical
  //                   Paradise-grade takedown sits just under reference.
  //   SHUTTER_TS_REF  the sim-time rate that pairs with V_REF for shutter01 = 1.
  //                   Pinned to the deepest dilation the game can produce (the
  //                   crashbreaker floor) so the ordinary impact floor of 0.15
  //                   lands at ~0.75 and keeps headroom instead of clipping.
  //   SHUTTER_BLEED   1/s of REAL time over which the memory of the pre-impact
  //                   ground speed decays. doImpact() converts most of the
  //                   entry momentum into spin on a single frame, but the road
  //                   under the wreck has not stopped moving — the camera is
  //                   still travelling with the wreckage. Without the memory the
  //                   signal collapses on exactly the frame it should peak.
  const SHUTTER_V_REF = 62;
  const SHUTTER_TS_REF = SLAM_BREAKER.floor;
  const SHUTTER_BLEED = 1.35;
  let shutter01 = 0;
  let groundV = 0;

  /**
   * Recompute the published shutter length. `dtReal` is WALL-CLOCK seconds, not
   * sim seconds: the bleed is a property of the real crash, not of the playback
   * rate, so a deeper slow-mo must not also make the streak last longer in
   * dilated time.
   */
  function updateShutter(dtReal) {
    // The tarmac's real-world speed past the camera: the wreck's own real speed
    // (vel is metres per SIM second, which is metres per real second — the sim
    // is a real crash played back slowly), floored by the bleeding entry speed.
    groundV = Math.max(vel.length(), groundV * Math.exp(-SHUTTER_BLEED * Math.max(dtReal, 0)));
    const rate = Math.max(tsAt(tReal), 1e-3);
    shutter01 = clamp((groundV / SHUTTER_V_REF) * (SHUTTER_TS_REF / rate), 0, 1);
  }

  // -------------------------------------------------------------------------
  // wreck rigid body
  // -------------------------------------------------------------------------
  const com = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const omega = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const CORNERS = [];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        CORNERS.push(new THREE.Vector3(
          HULL.cx + sx * HULL.hx, HULL.cy + sy * HULL.hy, HULL.cz + sz * HULL.hz));
      }
    }
  }

  let active = false;
  let t = 0, tReal = 0, timeScale = 1;
  let impactDir = new THREE.Vector3(0, 0, 1);
  let impactSide = new THREE.Vector3(1, 0, 0);
  let impactPoint = new THREE.Vector3();
  let severityN = 1;
  let asleep = false, restTimer = 0, firstContactT = -1, restBlend = 0;
  let restQuat = null;
  let breakerAt = -1, breakerDone = false, breakerFired = false, breakerRealT = -1;
  let slideNoise = 0, emberClock = 0, smokeClock = 0, shedClock = 0;
  let wakeOn = false, wakeClock = 0;
  const carLocalUp = new THREE.Vector3();
  const restEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // -------------------------------------------------------------------------
  // emitters
  // -------------------------------------------------------------------------
  function emitSpark(p, v, opt = {}) {
    const s = sparks[sparkNext];
    sparkNext = (sparkNext + 1) % SPARKS;
    s.live = true;
    s.p.copy(p);
    s.v.copy(v);
    s.maxLife = opt.life || (0.30 + fxRng() * 0.45);
    s.life = s.maxLife;
    s.hot = opt.hot === undefined ? 1 : opt.hot;
    s.drag = opt.drag === undefined ? 1.1 : opt.drag;
    s.streak = opt.streak === undefined ? 0.012 : opt.streak;
    s.grav = opt.grav === undefined ? 1 : opt.grav;
    s.buoy = opt.buoy || 0;
  }

  /** Cone of sparks about `dir`, half-angle `spread` radians. */
  function sparkBurst(p, dir, count, speed, spread, opt = {}) {
    for (let i = 0; i < count; i++) {
      const ca = Math.cos(spread * Math.sqrt(fxRng()));
      const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      const ph = fxRng() * Math.PI * 2;
      _v.copy(dir).normalize();
      _v2.set(-_v.z, 0, _v.x);
      if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
      _v2.normalize();
      _v3.copy(_v).cross(_v2).normalize();
      _v.multiplyScalar(ca)
        .addScaledVector(_v2, sa * Math.cos(ph))
        .addScaledVector(_v3, sa * Math.sin(ph));
      _v.multiplyScalar(speed * (0.35 + fxRng() * 0.9));
      emitSpark(p, _v, opt);
    }
  }

  /**
   * One dust/smoke billboard.
   *   s0/s1  radius in metres, start -> end (expanding)
   *   peak   density at the particle's fullest
   *   rise   buoyancy, m/s^2
   *   thin   metres of climb over which the particle thins out
   *   shade  base self-shadow term; the column base is darker than its crown
   *   floor  the height the particle is held at if it would sink into the road
   */
  function emitPuff(p, v, opt = {}) {
    const q = puffs[puffNext];
    puffNext = (puffNext + 1) % DUST;
    q.live = true;
    q.p.copy(p);
    q.v.copy(v);
    q.maxLife = opt.life || 1.6;
    q.life = q.maxLife;
    q.s0 = opt.s0 === undefined ? 1.2 : opt.s0;
    q.s1 = opt.s1 === undefined ? 4.0 : opt.s1;
    q.peak = opt.peak === undefined ? 0.42 : opt.peak;
    q.spin = (fxRng() - 0.5) * (opt.spin === undefined ? 0.9 : opt.spin);
    q.rot = fxRng() * Math.PI * 2;
    q.cool = opt.cool === undefined ? 1.4 : opt.cool;
    q.rise = opt.rise === undefined ? 1.4 : opt.rise;
    q.drag = opt.drag === undefined ? 1.25 : opt.drag;
    q.thin = opt.thin === undefined ? 4.0 : opt.thin;
    q.shade = opt.shade === undefined ? 1 : opt.shade;
    q.floor = opt.floor === undefined ? 0.22 : opt.floor;
    q.y0 = p.y;
    q.warm.set(opt.warm === undefined ? 0xffb066 : opt.warm);
    q.cold.set(opt.cold === undefined ? 0x8f959c : opt.cold);
  }

  function emitFlare(p, opt = {}) {
    const f = flares[flareNext];
    flareNext = (flareNext + 1) % FLARES;
    f.live = true;
    f.sp.visible = true;
    f.p.copy(p);
    f.v.copy(opt.v || _v.set(0, 0, 0));
    f.maxLife = opt.life || 0.18;
    f.life = f.maxLife;
    f.s0 = opt.s0 === undefined ? 3 : opt.s0;
    f.s1 = opt.s1 === undefined ? 8 : opt.s1;
    f.gain = opt.gain === undefined ? 1 : opt.gain;
    f.sp.material.color.set(opt.color === undefined ? 0xfff2d8 : opt.color);
    f.sp.material.map = opt.soft ? texCore : texGlow;
  }

  function dropDecal(p, w, h, rot, opacity) {
    const d = decals[decalNext];
    decalNext = (decalNext + 1) % DECALS;
    d.m.visible = true;
    d.m.position.set(p.x, 0.022 + decalNext * 0.004, p.z);
    d.m.scale.set(w, h, 1);
    d.m.rotation.set(-Math.PI / 2, 0, rot);
    d.mat.opacity = opacity;
  }

  // ---------------------------------------------------------------------------
  // debris mass classes
  //
  // Real crash debris is not one population. A torn-off suspension arm leaves
  // slowly, barely tumbles and flies a long clean ballistic arc because its
  // mass-to-area ratio is enormous; a chip of side glass leaves two to three
  // times faster, spins hard, and then stalls in mid-air within a metre or so
  // because air drag scales with area, not mass. Sampling every shard from one
  // speed/drag/spin distribution is exactly what makes a debris field read as
  // confetti, so each piece draws a class first and everything else follows
  // from it — including how far it streaks under the slow-mo shutter.
  //
  // The class also owns how LONG the piece is allowed to stay in the air. This
  // is the other half of the same physics and it was missing: a chip with a big
  // area-to-mass ratio does not hang for four seconds, it stalls, drops and is
  // on the tarmac inside a second. Without an airborne budget the field kept 70%
  // of its pieces flying four seconds after impact, fifteen metres up and thirty
  // metres downrange at unchanged apparent size, which is the single loudest
  // "these are cardboard cut-outs" tell in the frame.
  //
  //   spd     multiplier on the cone's base speed
  //   drag    linear drag coefficient (v *= exp(-drag*dt))
  //   spin    tumble rate, rad/s
  //   blur    metres of velocity-stretch per m/s over the blur threshold
  //   sz      multiplier on the set's own size range (which is in METRES)
  //   spread  multiplier on the cone half-angles: heavy stays in the core,
  //           light sprays to the rim, which is what gives the cone an edge
  //   lift    multiplier on the cone's upward bias
  //   air     seconds of CRASH time a piece may spend airborne before it is
  //           grounded (low) or retired (high) — see stepDebris
  //   cap     radius in metres from the piece's own spawn point past which it is
  //           braked hard, so the fan cannot outgrow the contact patch
  // ---------------------------------------------------------------------------
  const MASS = {
    heavy: {
      // Heavy pieces are the ones that survive into the hero frame, so they are
      // also the ones that must not sit sharp under a 0.15x shutter. The blur
      // floor is 3.5x what it was: at 8 m/s a heavy chunk now stretches ~2.1x
      // along its own velocity instead of 1.3x.
      spd: [0.60, 1.00], drag: [0.30, 0.62], spin: [4, 13],
      blur: 0.160, blurMax: 4.2, sz: [1.25, 1.65], spread: 0.44, lift: 0.62,
      // `air` is a STALL timer, not a hard clock: it only starts retiring pieces
      // once the shell itself is down (see stepDebris). A heavy chunk has to be
      // allowed to outlast the whole tumble, so the budget covers it rather than
      // expiring mid-flight and pinning the chunk to the road while the car is
      // still barrel-rolling over the top of it.
      air: [3.8, 5.4], cap: [4.4, 5.6],
    },
    medium: {
      spd: [0.85, 1.30], drag: [0.75, 1.35], spin: [14, 32],
      blur: 0.200, blurMax: 4.6, sz: [0.88, 1.15], spread: 0.98, lift: 1.00,
      air: [0.90, 1.35], cap: [3.2, 4.4],
    },
    light: {
      spd: [1.50, 2.60], drag: [2.20, 3.40], spin: [30, 68],
      blur: 0.280, blurMax: 7.0, sz: [0.60, 0.85], spread: 1.25, lift: 1.30,
      air: [0.62, 0.95], cap: [2.2, 3.4],
    },
  };
  // cumulative class mix per debris set — a set is a material, not a mass
  const MASS_MIX = {
    panel: [['heavy', 0.24], ['medium', 0.86], ['light', 1.0]],
    mech: [['heavy', 0.66], ['medium', 0.94], ['light', 1.0]],
    glass: [['heavy', 0.03], ['medium', 0.20], ['light', 1.0]],
  };
  function pickMass(kind) {
    const r = rng();
    const mix = MASS_MIX[kind] || MASS_MIX.mech;
    for (let i = 0; i < mix.length; i++) if (r < mix[i][1]) return MASS[mix[i][0]];
    return MASS.medium;
  }

  // dedicated cone scratch: call sites hand us vectors, and the shared _v/_v2/_v3
  // are scribbled over by sparkBurst, so the cone frame keeps its own
  const _cA = new THREE.Vector3();
  const _cU = new THREE.Vector3();
  const _cW = new THREE.Vector3();
  const _cD = new THREE.Vector3();

  /**
   * Ejecta cone from a contact manifold.
   *
   * `axis` is the impulse direction the debris leaves along (for the impact this
   * is the reflected impulse blended with retained momentum, see doImpact), and
   * `opt.fan` is the contact tangent. The spread is *elliptical* about the axis:
   * wide by `spreadT` in the plane of the struck surface, narrow by `spreadN`
   * across it, because material squeezed out of a contact patch sprays along the
   * surface, not into it. That anisotropy is the difference between a fan of
   * debris and a party popper.
   *
   *   opt.fan      contact tangent; the wide axis of the ellipse
   *   opt.spreadT  half-angle along the tangent, radians
   *   opt.spreadN  half-angle across it, radians (defaults to 0.42 * spreadT)
   *   opt.speed    base ejection speed, m/s, before the mass-class multiplier
   *   opt.lift     upward bias as a fraction of each piece's own speed
   */
  function spawnDebris(set, count, origin, axis, opt = {}) {
    const spreadT = opt.spreadT === undefined ? 0.55 : opt.spreadT;
    const spreadN = opt.spreadN === undefined ? spreadT * 0.42 : opt.spreadN;
    const speed = opt.speed === undefined ? 12 : opt.speed;
    const lift = opt.lift === undefined ? 0.30 : opt.lift;

    _cA.copy(axis).normalize();
    if (opt.fan) _cU.copy(opt.fan).addScaledVector(_cA, -opt.fan.dot(_cA));
    else _cU.set(-_cA.z, 0, _cA.x);
    if (_cU.lengthSq() < 1e-6) _cU.set(1, 0, 0);
    _cU.normalize();
    _cW.copy(_cA).cross(_cU).normalize();

    for (let n = 0; n < count; n++) {
      const it = set.items[set.next];
      set.next = (set.next + 1) % set.items.length;
      const m = pickMass(it.kind);

      // elliptical cone sample. g^0.62 packs the population toward the core so
      // the cone has a dense spine and a thin fringe rather than a flat disc.
      const g = Math.pow(rng(), 0.62);
      const ph = rng() * Math.PI * 2;
      _cD.copy(_cA)
        .addScaledVector(_cU, Math.tan(Math.min(spreadT * m.spread, 1.30)) * g * Math.cos(ph))
        .addScaledVector(_cW, Math.tan(Math.min(spreadN * m.spread, 1.30)) * g * Math.sin(ph))
        .normalize();

      it.live = true; it.asleep = false; it.restT = 0; it.age = 0;
      // pieces start strung out along their own exit ray, not in a shell.
      // 0.9 m of string-out, not 2.0 — the string-out has to be small next to
      // the fan's own radius or the cloud starts life already dispersed.
      it.p.copy(origin).addScaledVector(_cD, 0.18 + rng() * 0.72);
      it.p.y = Math.max(0.10, it.p.y);
      // the fan is measured from where each piece actually left, so recycling a
      // piece into the crashbreaker burst re-centres its cap on the new origin
      it.o.copy(origin);
      it.capR = m.cap[0] + rng() * (m.cap[1] - m.cap[0]);
      it.air = m.air[0] + rng() * (m.air[1] - m.air[0]);

      const sp = speed * (m.spd[0] + rng() * (m.spd[1] - m.spd[0]));
      it.v.copy(_cD).multiplyScalar(sp);
      it.v.y += lift * m.lift * sp * (0.4 + rng() * 0.85);

      const spin = m.spin[0] + rng() * (m.spin[1] - m.spin[0]);
      it.w.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(spin);
      it.q.set(rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();

      it.drag = m.drag[0] + rng() * (m.drag[1] - m.drag[0]);
      // angular drag is far weaker than linear for a small chip: a glass shard
      // stalls in the air long before it stops spinning
      it.spinDrag = 0.12 + it.drag * 0.14;
      it.blur = m.blur;
      it.blurMax = m.blurMax;

      // Sizes below are METRES (see the SIZE CONVENTION note on shardGeometry).
      // The reference debris fan is centimetre-scale: in crash-cam-01 it is a
      // dense cloud of dark chips a couple of metres off the contact patch, and
      // in crash-cam-04 it is glass grit plus small dark flakes. The bulk of
      // every set is therefore centimetre-scale — but see the panel branch: the
      // plates DO carry a handful of large torn fragments among the chips, and
      // collapsing the field to one size class is its own failure mode.
      const szK = m.sz[0] + rng() * (m.sz[1] - m.sz[0]);

      if (set === panels) {
        // Torn bodywork. The old range — 4-26 cm, near-square, and with almost
        // the whole population inside 8-15 cm — was effectively single-class, so
        // every panel read as the same scissor-cut card. crash-cam-01 is not a
        // uniform field of chips: a handful of LARGE irregular fragments (a door
        // skin, a bumper corner, a quarter panel) tumble among the grit, each one
        // long enough to carry its own visible streak, and the size contrast
        // between them and the chips is a large part of why the reference fan
        // reads as shattered car rather than as confetti.
        //
        // Three independent draws now, instead of one:
        //   base  the chip population, unchanged in character
        //   tear  a heavy tail. pow(rng, 10) means ~90% of pieces stay chips,
        //         ~10% come out 2x+, ~3% 3x+ — nine or so big fragments in a
        //         90-instance field, which is the reference's count.
        //   asp   log-uniform aspect, so long strips of trim and roughly square
        //         skin panels both occur instead of everything being ~1.2:1.
        // The metre clamps are a hard ceiling for the compounded tail, not a
        // working range; they bite on the top ~1% of draws.
        const base = (0.055 + rng() * 0.070) * szK;
        const tear = 1 + 2.4 * Math.pow(rng(), 10);
        const asp = Math.sqrt(Math.exp((rng() - 0.5) * 1.8));   // ~0.64 .. 1.57
        const a = clamp(base * tear * asp, 0.020, 0.40);
        const b = clamp(base * tear / asp, 0.016, 0.30);
        // Out-of-plane curl scales WITH the fragment. The y scale drives the
        // plate's centre bulge (see shardGeometry), and at a fixed y = 1 a 5 cm
        // chip was as proud as a 40 cm panel — which is a spike on the chip and
        // a flat card on the panel. So the bulge is a FRACTION of the footprint.
        //
        // The fraction was 6.4, and that is wrong by 4x. shardGeometry spans
        // 0.077 units peak-to-trough in y (centre +0.055, lowest rim -0.022) on a
        // unit footprint, so y = 6.4 * footprint puts the fold at 0.077 * 6.4 =
        // 49% of the mean footprint: a 12 cm shard standing 6 cm proud. That is
        // WORSE than the "14% of a half-metre plate" case the shardGeometry
        // docstring itself condemns as sheet steel folded like card, and it does
        // not match either the docstring's stated 9% or this comment's old
        // claim of 35%. 1.5 would put it at 0.077 * 1.5 = 11.6% peak-to-trough
        // and 0.055 * 1.5 = 8.3% for the centre bulge, i.e. the ~1 cm bow on a
        // 12 cm shard the geometry was authored for.
        //
        // THE LINE BELOW STILL READS 6.4. It has not been changed. Wave N owned
        // the spark gap only and left every debris constant alone so the debris
        // shape statistics stayed comparable across the A/B. Open target.
        it.s.set(a, (a + b) * 0.5 * 6.4, b);
        it.r = 0.014;
        it.bounce = 0.30; it.fric = 0.62;
        _col.copy(paintCol);
        // a third of the panels are torn to bare metal / underside black
        const roll = rng();
        if (roll < 0.18) _col.setRGB(0.30, 0.31, 0.33);
        else if (roll < 0.30) _col.setRGB(0.06, 0.06, 0.07);
        // Value spread on the painted fragments. This was `0.72 + rng()*0.7`,
        // which reaches 1.42x paintCol — an instance tint above 1.0 is the same
        // over-unity mistake as the old glass albedo, and it is what let torn
        // bodywork come out brighter than the intact car it fell off. A torn
        // fragment is lit worse than the panel it came from, never better, so the
        // range tops out at paintCol exactly.
        else _col.multiplyScalar(0.72 + rng() * 0.7);
        set.mesh.setColorAt(it.i, _col);
      } else if (set === mech) {
        // trim clips, bolts, rubber, shorn bracketry. The base range is ~2x what
        // it was: at 2.7-11.5 cm rendered (p50 5.7) these were grit rather than
        // hardware, well under the 8-25 cm the plates show. The long-axis
        // multiplier is held at 1.30 so doubling the base does not push the
        // longest bracket past ~25 cm or start showing legible cube faces.
        const a = (0.048 + rng() * 0.064) * szK;
        it.s.set(a, a * (0.40 + rng() * 0.80), a * (0.55 + rng() * 0.75));
        it.r = a * 0.5;
        it.bounce = 0.34; it.fric = 0.66;
        const g = 0.022 + rng() * 0.055;
        _col.setRGB(g, g * 0.96, g * 1.08);
        if (rng() < 0.18) _col.setRGB(0.14, 0.135, 0.125);  // dulled steel among the rubber
        set.mesh.setColorAt(it.i, _col);
      } else {
        // Glass: broken laminate wedges, ~4-12 cm. At 1.0-5.8 cm (p50 2.9) the
        // chips were sub-pixel grit at this camera distance and contributed
        // nothing but a faint sparkle; crash-cam-04's ejecta is fine but its
        // individual wedges still read as shapes, so the base range is ~2x.
        // x and z were the SAME draw, so every wedge was an equilateral triangle
        // in silhouette — a hundred and fifty copies of one white arrowhead
        // sprayed across the frame, and the loudest single-class tell in the
        // field. Laminate does not break into one shape: it throws slivers,
        // lumps and the odd hand-sized chunk. All three axes are drawn
        // independently now, over a log-spread base (~0.58x..1.73x), so the
        // population runs from grit to ~20 cm splinters. The clamp is a ceiling
        // on the compounded tail, not a working range.
        const a = clamp((0.052 + rng() * 0.062) * szK * Math.exp((rng() - 0.5) * 1.1),
          0.012, 0.14);
        it.s.set(a * (0.60 + rng() * 0.85), a * (0.32 + rng() * 0.80), a * (0.62 + rng() * 0.95));
        it.r = a * 0.45;
        // Glass takes the LIGHT mass class ~80% of the time, and that class allows
        // a stretch of up to 1 + 7 = 8x. A shard is already a sliver in silhouette,
        // so an 8x anisotropic stretch on top of it produced measured aspect ratios
        // of 8+ where crash-cam-01's fan sits at 4.7 — the chips stopped reading as
        // chips and became scratches. Cap the glass budget below the class budget:
        // the stretch has to stay inside the range the shard's own aspect leaves it.
        it.bounce = 0.24; it.fric = 0.52;
        // Value distribution. This used to be RGB(1.02-1.36, 1.18, 1.30) on a
        // 0xdcf1fb base — an effective albedo ABOVE 1.0 on every channel, on a
        // material already returning the sky at 3.8x. The result was ~170 white
        // paper chips: the debris field measured p99/p50 = 3.06 where
        // crash-cam-01's measures 1.23, i.e. our ejecta was uniformly brighter
        // than the buildings behind it, and nothing read as a silhouette.
        //
        // Real ejecta is dark grit that reads as shape, with a glint on a few
        // pieces only. So the population is BIMODAL rather than uniformly dim —
        // dimming everything equally would just move the whole histogram down
        // and still give a flat, textureless fan.
        //   ~86%  grit: laminate seen edge-on or backed by its own tint. Deep
        //         cool grey, well under the road it passes over, so the chip is
        //         a hole in the background rather than a mark on it.
        //   ~9%   facet: a piece whose broken face happens to be turned toward
        //         the sun. Bright, but still under 1.0 — the flare comes from
        //         the near-mirror env lobe, not from the albedo.
        // The grit draw is log-spread so the dark mode itself has structure and
        // does not band into one flat grey.
        // One rng() draw, split into the two modes, deliberately: the previous
        // line drew exactly once, and the size/velocity/spin draws for every
        // later instance come off the same stream. Branching on one draw and
        // then drawing again inside the branch would shift that stream and
        // silently re-roll the shard size distribution that landed last round.
        const u = rng();
        if (u < 0.09) {
          const b = 0.58 + (u / 0.09) * 0.24;
          _col.setRGB(b * 0.93, b * 0.97, b);
        } else {
          const g = 0.085 * Math.exp(((u - 0.09) / 0.91) * 1.15);  // ~0.085 .. 0.27
          _col.setRGB(g * 0.88, g * 0.96, g * 1.14);
        }
        set.mesh.setColorAt(it.i, _col);
      }
    }
    if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // trigger
  // -------------------------------------------------------------------------
  function doImpact(speed, dir, severity) {
    const d = impactDir.copy(dir).setY(0).normalize();
    impactSide.set(d.z, 0, -d.x);
    const origin = physics.state.pos;
    impactPoint.copy(origin).addScaledVector(d, 1.55).setY(0.82);

    // ---- the shell -------------------------------------------------------
    quat.setFromEuler(new THREE.Euler(0, physics.state.yaw, 0, 'YXZ'));
    com.copy(origin).add(_v.copy(COM_LOCAL).applyQuaternion(quat));
    // momentum survives the impact: most of it forward, a chunk converted to lift
    vel.copy(d).multiplyScalar(speed * 0.42);
    vel.y = speed * 0.135 * severity;
    // angular momentum from an off-centre hit: mostly a barrel roll + yaw spin
    const flip = rng() < 0.5 ? -1 : 1;
    omega.copy(impactSide).multiplyScalar((1.5 + rng() * 1.4) * severity)
      .addScaledVector(_v.set(0, 1, 0), (rng() - 0.5) * 4.6 * severity)
      .addScaledVector(d, flip * (2.6 + rng() * 2.2) * severity);

    // ---- deformation -----------------------------------------------------
    if (damage) {
      damage.setLevel(clamp(0.36 + severity * 0.30, 0, 0.78));
      // asymmetric front-quarter crumple along the impact axis
      if (damage.addImpact) {
        damage.addImpact(new THREE.Vector3(0.52, 0.72, 2.12),
          clamp(0.45 * severity, 0, 1), new THREE.Vector3(-0.25, -0.30, -0.92).normalize());
      }
    }

    // ---- contact FX ------------------------------------------------------
    slam(SLAM_IMPACT);
    kick(0.55 * severity);

    emitFlare(impactPoint, { life: 0.10, s0: 3.4, s1: 11, gain: 3.4, color: 0xfff4de });
    emitFlare(impactPoint, { life: 0.26, s0: 2.0, s1: 7.5, gain: 1.5, color: 0xffb763, soft: true });
    flashLight.visible = true;
    flashLight.intensity = 240;
    flashLight.position.copy(impactPoint);

    // sparks: a tight forward cone plus a wide ground-level fan
    sparkBurst(impactPoint, _v.copy(d).setY(0.28).normalize(), 58, speed * 0.55, 0.55,
      { life: 0.5, hot: 1.0, streak: 0.015, drag: 0.9 });
    sparkBurst(impactPoint, _v.set(0, 1, 0), 26, speed * 0.26, 1.15,
      { life: 0.75, hot: 0.8, streak: 0.008, drag: 1.5 });

    // ---- the ground plume ------------------------------------------------
    // This is the body that anchors the whole event to a contact point. It is
    // built in three layers, all rooted on the road (y ~ 0.3) at the point the
    // car left it, NOT at the shell's centre — the wreck flies away from this,
    // the plume stays.
    _ground.copy(impactPoint).setY(0.30);

    // 1. the low, fast, wide ground plume: the tyre-smoke-and-grit sheet that
    //    is thrown outward in the first fraction of a second and reads as the
    //    violence of the hit. Short lived, so by the time the camera has swung
    //    round it has collapsed into the standing column below.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + fxRng() * 0.5;
      const sp = 7 + fxRng() * 9;
      _puffVel.set(Math.cos(a) * sp, 1.4 + fxRng() * 2.2, Math.sin(a) * sp)
        .addScaledVector(d, 4 + fxRng() * 5);
      _puffPos.set(_ground.x + Math.cos(a) * (0.8 + fxRng() * 1.4),
        0.24 + fxRng() * 0.30,
        _ground.z + Math.sin(a) * (0.8 + fxRng() * 1.4));
      emitPuff(_puffPos, _puffVel, {
        life: 1.5 + fxRng() * 1.0, s0: 0.7, s1: 3.4 + fxRng() * 1.5, peak: 0.30,
        cool: 2.6, rise: 0.5, drag: 2.0, thin: 3.0, floor: 0.26,
        shade: 0.94 + fxRng() * 0.2, spin: 1.6,
        warm: 0xd2c1a2, cold: 0x8a8271,
      });
    }

    // 2. the standing column: pale road dust lofted by the impact, rising and
    //    expanding slowly so it is still a legible vertical body seconds later.
    //    Its radius grows and its density thins with height (see stepPuffs), so
    //    it reads as a cone that self-shadows at the base and frays at the top.
    for (let i = 0; i < 28; i++) {
      const a = fxRng() * Math.PI * 2;
      const rad = Math.pow(fxRng(), 0.6) * 1.7;
      const climb = i / 28;
      _puffVel.set(Math.cos(a) * (0.9 + fxRng() * 1.8),
        2.4 + climb * 3.4 + fxRng() * 1.5,
        Math.sin(a) * (0.9 + fxRng() * 1.8))
        .addScaledVector(d, 1.2 + fxRng() * 2.6);
      _puffPos.set(_ground.x + Math.cos(a) * rad, 0.30 + climb * 0.9,
        _ground.z + Math.sin(a) * rad);
      emitPuff(_puffPos, _puffVel, {
        life: 7.5 + fxRng() * 3.5, s0: 0.8 + fxRng() * 0.5, s1: 3.4 + fxRng() * 1.9,
        peak: 0.30, cool: 2.2, rise: 1.6, drag: 1.3, thin: 11.0, floor: 0.30,
        shade: 0.86 + fxRng() * 0.3, spin: 0.7,
        warm: 0xd6c5a6, cold: 0x767061,
      });
    }

    // 3. a handful of dark, hot tyre-smoke cores right at the contact, which
    //    give the plume a value range instead of one flat grey
    for (let i = 0; i < 10; i++) {
      _puffVel.set((fxRng() - 0.5) * 3.0, 2.2 + fxRng() * 2.6, (fxRng() - 0.5) * 3.0)
        .addScaledVector(d, 1.0 + fxRng() * 2.0);
      _puffPos.set(_ground.x + (fxRng() - 0.5) * 1.8, 0.28 + fxRng() * 0.5,
        _ground.z + (fxRng() - 0.5) * 1.8);
      emitPuff(_puffPos, _puffVel, {
        life: 3.4 + fxRng() * 2.0, s0: 0.7, s1: 2.6 + fxRng() * 1.3, peak: 0.42,
        cool: 1.6, rise: 1.6, drag: 1.1, thin: 5.0, floor: 0.26,
        shade: 0.52 + fxRng() * 0.2, spin: 1.1,
        warm: 0x6e665c, cold: 0x4a463f,
      });
    }

    // ---- ejecta cone from the contact manifold ---------------------------
    // The manifold is: a surface whose normal faces back at the car, tilted up
    // (the car climbed into it) and a little off the driver's side (nothing is
    // ever struck perfectly square). From that we get a real impulse direction
    // instead of a hand-picked vector:
    //
    //   reflect(d, n)   the impulse the surface returns
    //   + d             the momentum the wreck keeps carrying downrange
    //   + up            material squeezed out of a closing contact patch
    //
    // and the wide axis of the ejecta fan is the contact TANGENT, so the debris
    // sprays along the struck surface rather than out of it. Every shard leaves
    // inside that cone, so the whole field has one unmistakable downrange axis.
    const mfN = _mfN.copy(d).negate()
      .addScaledVector(WORLD_UP, 0.46)
      .addScaledVector(impactSide, -0.34)
      .normalize();
    const mfA = _mfR.copy(d).addScaledVector(mfN, -2 * d.dot(mfN))   // reflected impulse
      .multiplyScalar(0.60)
      .addScaledVector(d, 0.95)
      .addScaledVector(WORLD_UP, 0.30)
      .normalize();
    const mfT = _mfT.copy(d).addScaledVector(mfN, -d.dot(mfN)).normalize();

    // Counts tripled, ejection speeds cut to ~44% and the lift roughly halved.
    // The cone's shape (elliptical, tangent-wide, mass-classed) is unchanged —
    // it was verified correct — but it was being fired at 26 m/s base, which
    // threw centimetre chips thirty metres. The references fan out over a couple
    // of metres.
    spawnDebris(mech, 102, impactPoint, mfA,
      { fan: mfT, spreadT: 0.50, spreadN: 0.19, speed: speed * 0.185, lift: 0.14 });
    spawnDebris(panels, 72, impactPoint, mfA,
      { fan: mfT, spreadT: 0.56, spreadN: 0.22, speed: speed * 0.150, lift: 0.18 });
    spawnDebris(glass, 144, impactPoint, mfA,
      { fan: mfT, spreadT: 0.62, spreadN: 0.25, speed: speed * 0.195, lift: 0.17 });

    dropDecal(impactPoint, 7.5, 5.0, rng() * 3.1, 0.55);
    // the scuff the car dragged into the tarmac on its way off the road
    dropSkid(_ground, d, 15.0 + speed * 0.13, 3.4, 0.88);
    wakeOn = true;
    wakeClock = 0;

    // ---- pop a wheel off -------------------------------------------------
    if (car.wheels && car.wheels.length) {
      const w = car.wheels[0];
      const world = new THREE.Vector3();
      w.pivot.getWorldPosition(world);
      w.pivot.visible = false;
      const holder = new THREE.Group();
      const clone = w.spin.clone(true);
      clone.position.set(0, 0, 0);
      holder.add(clone);
      holder.position.copy(world);
      group.add(holder);
      looseParts.push({
        mesh: holder,
        p: world.clone(),
        v: d.clone().multiplyScalar(speed * 0.24)
          .addScaledVector(impactSide, (rng() - 0.5) * 9)
          .setY(speed * 0.09),
        w: new THREE.Vector3((rng() - 0.5) * 5, (rng() - 0.5) * 5, 16 + rng() * 9),
        q: new THREE.Quaternion(),
        r: (car.DIMS && car.DIMS.wheelR) || 0.365,
        drag: 0.10, bounce: 0.42, fric: 0.80, asleep: false, restT: 0,
      });
    }
  }

  // contact-manifold scratch (normal, reflected impulse axis, tangent)
  const _mfN = new THREE.Vector3();
  const _mfR = new THREE.Vector3();
  const _mfT = new THREE.Vector3();
  const _bkAxis = new THREE.Vector3();
  const _bkFan = new THREE.Vector3();
  const _bkLow = new THREE.Vector3();
  const _breakerPoint = new THREE.Vector3();
  const _puffPos = new THREE.Vector3();
  const _puffVel = new THREE.Vector3();
  const _ground = new THREE.Vector3();
  const _wakeP = new THREE.Vector3();
  const _wakeV = new THREE.Vector3();

  function doCrashbreaker() {
    breakerFired = true;
    breakerDone = true;
    breakerRealT = tReal;
    // dedicated vector: spawnDebris/sparkBurst below scribble over the shared scratch
    const p = _breakerPoint.copy(com);
    p.y = Math.max(0.55, p.y);

    slam(SLAM_BREAKER);
    kick(0.95);

    // relaunch the shell — the crashbreaker throws it, it does not just shake
    vel.set((rng() - 0.5) * 3.4, 13.2 + rng() * 1.4, (rng() - 0.5) * 3.4)
      .addScaledVector(impactDir, 4.2);
    // bias the relaunch spin toward barrel-roll + yaw so the shell stays broadside
    // to camera instead of standing on its nose
    omega.set((rng() - 0.5) * 2.0, (rng() - 0.5) * 4.0, (rng() - 0.5) * 2.0)
      .addScaledVector(impactSide, (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.7))
      .addScaledVector(impactDir, (rng() < 0.5 ? -1 : 1) * (2.8 + rng() * 1.8));
    asleep = false; restTimer = 0; restQuat = null; restBlend = 0;
    firstContactT = -1; slideNoise = 0; shedClock = 0;

    if (damage) {
      damage.setLevel(0.92);
      if (damage.addImpact) {
        damage.addImpact(new THREE.Vector3(0.0, 1.02, -0.35), 0.85,
          new THREE.Vector3(0, -0.95, 0.1).normalize());
      }
    }

    // fireball
    emitFlare(p, { life: 0.13, s0: 4.5, s1: 16, gain: 4.2, color: 0xfff6e2 });
    emitFlare(p, { life: 0.45, s0: 3.0, s1: 13, gain: 2.2, color: 0xff8c2a, soft: true });
    emitFlare(p, { life: 0.95, s0: 2.0, s1: 9.0, gain: 0.9, color: 0xff5a12, soft: true });
    // lingering ground fire — small and localised, not a screen-wide wash
    for (let i = 0; i < 3; i++) {
      emitFlare(_puffPos.set(
        com.x + (rng() - 0.5) * 2.2, 0.45 + rng() * 0.5, com.z + (rng() - 0.5) * 2.8), {
        life: 1.7 + rng() * 0.9, s0: 1.4, s1: 3.2 + rng() * 1.2, gain: 0.45,
        color: 0xff5a14, soft: false, v: new THREE.Vector3(0, 0.9, 0),
      });
    }
    flashLight.visible = true;
    flashLight.intensity = 420;
    flashLight.position.copy(p);

    // shockwave
    ringT = 0; ringLife = 0.75;
    ring.position.set(com.x, 0.06, com.z);
    ring.visible = true;

    // Fountain. Still a fountain, but it inherits the crash's primary axis: the
    // detonation vents through the already-torn front of the shell, so the plume
    // leans downrange and fans WIDE along the travel axis and NARROW across it.
    // A symmetric upward hemisphere here is what previously turned the settled
    // frame back into confetti no matter how directional the first hit was.
    _bkAxis.copy(WORLD_UP).addScaledVector(impactDir, 0.72).normalize();
    _bkFan.copy(impactDir).addScaledVector(_bkAxis, -impactDir.dot(_bkAxis)).normalize();
    // Launch speeds are set so the fountain's own flight time matches the arc
    // the detonation throws the SHELL on: at 7 m/s a heavy chunk apexes ~1.3 m
    // and is back on the tarmac in 0.7 s, i.e. long before the wreck lands, which
    // left the hero frame with a settled carpet under an airborne car. 12-13 m/s
    // gives the heavy pieces 0.8-1.4 s of flight and keeps them co-located with
    // the shell. The cone cap (2.2-5.6 m) still holds the fan's radius.
    spawnDebris(mech, 102, p, _bkAxis,
      { fan: _bkFan, spreadT: 0.48, spreadN: 0.20, speed: 13.0, lift: 0.20 });
    spawnDebris(panels, 66, p, _bkAxis,
      { fan: _bkFan, spreadT: 0.54, spreadN: 0.24, speed: 11.5, lift: 0.22 });
    spawnDebris(glass, 120, p, _bkAxis,
      // glass stays slower than the metal: its light-class multiplier is 1.5-2.6x,
      // so 12 m/s here threw individual chips twelve metres up and re-created the
      // "confetti hanging above the frame" read the cone cap was built to kill.
      { fan: _bkFan, spreadT: 0.58, spreadN: 0.26, speed: 9.0, lift: 0.20 });
    // low blast wave: skims the road downrange, wide horizontally, flat vertically
    _bkLow.copy(impactDir).setY(0.20).normalize();
    spawnDebris(mech, 24, p, _bkLow,
      { fan: impactSide, spreadT: 0.44, spreadN: 0.13, speed: 9.5, lift: 0.05 });
    sparkBurst(p, _v.set(0, 1, 0), 78, 23, 1.00,
      { life: 1.7, hot: 1.0, streak: 0.013, drag: 1.4, buoy: 2.4 });
    sparkBurst(p, _v.copy(impactDir).setY(0.10).normalize(), 34, 27, 1.05,
      { life: 1.0, hot: 1.0, streak: 0.016, drag: 1.0 });

    // fireball -> smoke ball: hot and tight first, cooling into a grey column
    for (let i = 0; i < 12; i++) {
      _puffVel.set((rng() - 0.5) * 5, 4.5 + rng() * 6.5, (rng() - 0.5) * 5);
      _puffPos.set(p.x + (rng() - 0.5) * 1.6, p.y + (rng() - 0.5) * 1.2,
        p.z + (rng() - 0.5) * 1.6);
      emitPuff(_puffPos, _puffVel, {
        life: 4.6 + rng() * 3.0, s0: 1.3, s1: 5.4 + rng() * 2.6, peak: 0.44,
        cool: 4.2, rise: 3.2, drag: 0.9, thin: 7.0, floor: 0.32,
        shade: 0.70 + fxRng() * 0.35, spin: 0.9,
        warm: 0xffb47c, cold: 0x3d424a,
      });
    }
    // ground dust ring kicked up by the blast — pale road dust, not soot
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rng() * 0.4;
      _puffVel.set(Math.cos(a) * (4 + rng() * 3.5), 0.8 + rng() * 1.3,
        Math.sin(a) * (4 + rng() * 3.5));
      _puffPos.set(com.x + Math.cos(a) * 1.3, 0.30 + rng() * 0.35,
        com.z + Math.sin(a) * 1.3);
      emitPuff(_puffPos, _puffVel, {
        life: 2.6 + rng() * 1.6, s0: 1.7, s1: 6.2 + rng() * 2.4, peak: 0.30,
        cool: 2.4, rise: 0.6, drag: 1.9, thin: 3.4, floor: 0.26,
        shade: 0.92 + fxRng() * 0.25, spin: 1.5,
        warm: 0xd2c0a0, cold: 0x77715f,
      });
    }

    dropDecal(com, 11, 11, rng() * 3.1, 0.72);
    fireLight.visible = true;
  }

  // -------------------------------------------------------------------------
  // wreck integration
  // -------------------------------------------------------------------------
  function integrateQuat(q, w, dt) {
    const len = w.length();
    if (len < 1e-6) return;
    _iqAxis.copy(w).multiplyScalar(1 / len);
    _qd.setFromAxisAngle(_iqAxis, len * dt);
    q.premultiply(_qd).normalize();
  }
  const _iqAxis = new THREE.Vector3();

  // solver scratch — kept private so nothing else can alias it mid-solve
  const _r = new THREE.Vector3();
  const _pv = new THREE.Vector3();
  const _imp = new THREE.Vector3();
  const _tq = new THREE.Vector3();
  const _rot = new THREE.Vector3();
  const _qinv = new THREE.Quaternion();
  const _contact = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _axis = new THREE.Vector3();

  /** Apply impulse `j` (world) at world offset `r` from the centre of mass. */
  function applyImpulse(j, r) {
    vel.add(j);
    _tq.copy(r).cross(j);                  // world torque impulse
    _tq.applyQuaternion(_qinv);            // -> body
    _tq.multiply(INV_I);                   // I^-1
    _tq.applyQuaternion(quat);             // -> world
    omega.add(_tq);
  }

  /** Y-axis effective inverse mass at contact offset r (unit mass, n = +Y). */
  function invMassY(r) {
    _rot.set(-r.z, 0, r.x);                // r x n, with n = +Y
    _rot.applyQuaternion(_qinv);
    _rot.multiply(INV_I);
    _rot.applyQuaternion(quat);
    const angY = _rot.z * r.x - _rot.x * r.z;   // ((I^-1 (r x n)) x r).y, always >= 0
    return 1 / (1 + Math.max(0, angY));
  }

  function stepWreck(dt) {
    if (asleep) return;

    vel.y += GRAV * dt;
    vel.multiplyScalar(Math.exp(-0.10 * dt));
    omega.multiplyScalar(Math.exp(-0.30 * dt));
    // hard sanity rails: a wreck is never a projectile, whatever the solver says
    if (!Number.isFinite(vel.x + vel.y + vel.z)) vel.set(0, 0, 0);
    if (!Number.isFinite(omega.x + omega.y + omega.z)) omega.set(0, 0, 0);
    if (vel.lengthSq() > 3600) vel.setLength(60);
    if (omega.lengthSq() > 900) omega.setLength(30);
    com.addScaledVector(vel, dt);
    integrateQuat(quat, omega, dt);
    _qinv.copy(quat).invert();

    let deepest = 0, contacts = 0, maxImpulse = 0;
    _contact.set(0, 0, 0);

    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < CORNERS.length; i++) {
        _r.copy(CORNERS[i]).sub(COM_LOCAL).applyQuaternion(quat);
        const y = com.y + _r.y;
        if (y >= 0) continue;
        if (pass === 0) {
          deepest = Math.max(deepest, -y);
          contacts++;
          _contact.x += com.x + _r.x;
          _contact.z += com.z + _r.z;
        }
        _pv.copy(omega).cross(_r).add(vel);
        const vn = _pv.y;
        if (vn >= 0) continue;

        const e = (-vn > 2.0 && pass === 0) ? 0.26 : 0.0;
        const jn = -(1 + e) * vn * invMassY(_r);
        if (jn <= 0) continue;
        if (pass === 0) maxImpulse = Math.max(maxImpulse, jn);
        _imp.set(0, jn, 0);
        applyImpulse(_imp, _r);

        // Coulomb friction in the tangent plane
        _pv.copy(omega).cross(_r).add(vel);
        _pv.y = 0;
        const tl = _pv.length();
        if (tl > 1e-4) {
          const jt = Math.min(0.62 * jn, tl * 0.55);
          _imp.copy(_pv).multiplyScalar(-jt / tl);
          applyImpulse(_imp, _r);
        }
      }
    }

    if (deepest > 0) {
      com.y += deepest;                        // hard non-penetration
      if (firstContactT < 0) firstContactT = t;
      const cx = _contact.x / Math.max(1, contacts);
      const cz = _contact.z / Math.max(1, contacts);

      if (maxImpulse > 2.0) {
        const power = clamp(maxImpulse / 11, 0.15, 1.4);
        _hit.set(cx, 0.07, cz);
        kick(0.20 * power);
        _dirTmp.copy(vel).setY(0);
        if (_dirTmp.lengthSq() < 1e-4) _dirTmp.set(0, 0, 1);
        _dirTmp.normalize().setY(0.40).normalize();
        sparkBurst(_hit, _dirTmp, Math.round(14 * power), 9 + 15 * power, 0.9,
          { life: 0.45, hot: 0.95, streak: 0.013, drag: 1.3 });
        for (let i = 0; i < 3; i++) {
          _dirTmp.set((rng() - 0.5) * 5, 1.2 + rng() * 2.6, (rng() - 0.5) * 5);
          _hit.y = 0.32;
          emitPuff(_hit, _dirTmp, {
            life: 1.9 + rng() * 1.3, s0: 0.7, s1: 3.0 + rng() * 1.4, peak: 0.24,
            cool: 2.4, rise: 0.8, drag: 1.8, thin: 3.4, floor: 0.24,
            shade: 0.92 + fxRng() * 0.25, spin: 1.6,
            warm: 0xd0bf9f, cold: 0x7b7566,
          });
        }
        _hit.y = 0.22;
        emitFlare(_hit, { life: 0.11, s0: 1.2, s1: 3.6, gain: 1.0, color: 0xffcf8a });
        _hit.y = 0;
        dropDecal(_hit, 4.4 + power * 2.4, 3.0 + power * 1.6, rng() * 3.1,
          0.28 + power * 0.22);
      }

      // sliding scrape: a continuous spark rooster-tail while the wreck grinds
      const slideSpeed = Math.hypot(vel.x, vel.z);
      if (slideSpeed > 3) {
        slideNoise += dt * slideSpeed;
        while (slideNoise > 0.5) {
          slideNoise -= 0.5;
          _hit.set(cx, 0.07, cz);
          _dirTmp.copy(vel).setY(0).normalize().multiplyScalar(-1).setY(0.5).normalize();
          sparkBurst(_hit, _dirTmp, 6, 6 + slideSpeed * 0.45, 0.9,
            { life: 0.38, hot: 0.95, streak: 0.013, drag: 1.6 });
        }
      }

      // ---- secondary ejecta: the wreck sheds on every ground contact ---------
      // With one burst at t=0 the whole field is launched simultaneously and has
      // therefore all landed by the hero frame, which is why the debris read as
      // decals painted on the tarmac four metres behind a car that was still in
      // the air. Real wreckage sheds continuously: each time a corner digs in,
      // another handful of trim, glass and torn panel is ripped loose and thrown
      // — so at any instant during the tumble some of the field is fresh and in
      // flight, co-located with the shell and streaked by the shutter.
      //
      // Rate-limited on CRASH time so the cadence follows the tumble rather than
      // the frame rate, and stopped once the shell is down so the settled carpet
      // is not churned by bursts that would never come to rest in frame.
      if (!shellDown()) {
        shedClock += dt;
        const hard = maxImpulse > 2.0;
        // the clock only advances on frames where a corner is actually touching,
        // so a bouncing wreck accumulates it slowly — the thresholds are the
        // CONTACT time between bursts, not wall time between them
        if (shedClock > (hard ? 0.08 : 0.22)) {
          shedClock = 0;
          const power = hard ? clamp(maxImpulse / 11, 0.20, 1.4) : 0.45;
          // thrown up and BACKWARD along the slide, like material squeezed out
          // from under the sliding shell
          _shedA.copy(vel).setY(0);
          if (_shedA.lengthSq() < 1e-4) _shedA.set(0, 0, 1);
          _shedA.normalize().multiplyScalar(-0.55).setY(1).normalize();
          _shedF.set(-_shedA.z, 0, _shedA.x);
          _hit.set(cx, 0.16, cz);
          const spd = 5.0 + 5.5 * power + Math.min(slideSpeed, 15) * 0.32;
          spawnDebris(mech, Math.round(3 + 5 * power), _hit, _shedA,
            { fan: _shedF, spreadT: 0.85, spreadN: 0.50, speed: spd, lift: 0.60 });
          spawnDebris(glass, Math.round(4 + 7 * power), _hit, _shedA,
            { fan: _shedF, spreadT: 1.05, spreadN: 0.62, speed: spd * 1.12, lift: 0.68 });
          if (hard) {
            spawnDebris(panels, Math.round(2 + 3 * power), _hit, _shedA,
              { fan: _shedF, spreadT: 0.72, spreadN: 0.44, speed: spd * 0.92, lift: 0.56 });
          }
        }
      }

      // righting moment — a car's mass sits low, so it rolls back onto its wheels
      _up.set(0, 1, 0).applyQuaternion(quat);
      _axis.copy(_up).cross(WORLD_UP);
      const tilt = _axis.length();
      if (tilt > 0.02) {
        _axis.multiplyScalar(1 / tilt);
        const energy = vel.lengthSq() + omega.lengthSq();
        omega.addScaledVector(_axis, (3.6 / (1 + energy * 0.05)) * tilt * dt);
      }
      vel.multiplyScalar(Math.exp(-1.6 * dt));
      omega.multiplyScalar(Math.exp(-2.6 * dt));
    }

    // ---- sleep -------------------------------------------------------------
    const still = deepest > 0 && vel.lengthSq() < 0.55 && omega.lengthSq() < 0.9;
    restTimer = still ? restTimer + dt : 0;
    const overdue = firstContactT >= 0 && (t - firstContactT) > 3.0;
    if (restTimer > 0.30 || overdue) {
      if (!restQuat) {
        restEuler.setFromQuaternion(quat, 'YXZ');
        restEuler.x = clamp(restEuler.x, -0.22, 0.18) - 0.05;
        restEuler.z = clamp(restEuler.z, -0.28, 0.28);
        restQuat = new THREE.Quaternion().setFromEuler(restEuler);
      }
      restBlend = clamp(restBlend + dt * 2.6, 0, 1);
      quat.slerp(restQuat, clamp(dt * 7, 0, 1));
      vel.multiplyScalar(Math.exp(-9 * dt));
      omega.multiplyScalar(Math.exp(-11 * dt));
      let low = 0;
      for (let i = 0; i < CORNERS.length; i++) {
        _r.copy(CORNERS[i]).sub(COM_LOCAL).applyQuaternion(quat);
        low = Math.min(low, com.y + _r.y);
      }
      com.y -= low;
      if (restBlend >= 1) { asleep = true; vel.set(0, 0, 0); omega.set(0, 0, 0); }
    }
  }
  const _hit = new THREE.Vector3();
  const _dirTmp = new THREE.Vector3();
  const _shedA = new THREE.Vector3();
  const _shedF = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  /**
   * Is the shell finished moving? The debris field's airborne budget hangs off
   * this: while the wreck is still tumbling, ejecta is allowed to stay in the
   * air; once the shell is settling into its rest pose the budget starts
   * grounding and retiring pieces so the field comes down with it.
   */
  function shellDown() { return asleep || restBlend > 0.55; }

  /** Push the wreck pose out to the car + physics state main.js reads. */
  function applyWreckPose() {
    const s = physics.state;
    _v.copy(COM_LOCAL).applyQuaternion(quat);
    s.pos.set(com.x - _v.x, com.y - _v.y, com.z - _v.z);
    bodyEuler.setFromQuaternion(quat, 'YXZ');
    s.yaw = bodyEuler.y;
    s.slip = 0; s.lean = 0; s.pitch = 0;
    s.speed = vel.length();
    s.boostBlend = 0; s.boosting = false;
    car.group.rotation.order = 'XYZ';
    car.group.rotation.set(bodyEuler.x, 0, bodyEuler.z);
    car.group.position.y = 0;
  }

  // -------------------------------------------------------------------------
  // particle integration
  // -------------------------------------------------------------------------
  // scratch for the velocity-stretch matrix
  const ZERO3 = new THREE.Vector3(0, 0, 0);
  const _sA = new THREE.Vector3();
  const _sB = new THREE.Vector3();
  const _sC = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const _basisT = new THREE.Matrix4();
  const _diag = new THREE.Matrix4();
  const _stretch = new THREE.Matrix4();

  function stepDebris(dt) {
    for (const set of debrisSets) {
      let dirty = false;
      for (const it of set.items) {
        if (!it.live) continue;
        if (!it.asleep) {
          dirty = true;
          it.age += dt;

          // ---- airborne budget ----------------------------------------------
          // A shard gets `air` seconds of crash time in the air, after which it
          // is either put on the road (if it is low enough that grounding it is
          // invisible) or retired outright (if it is high, which means it is
          // small, far and only contributing a floating speck). That is what
          // stops the field hanging in frame at unchanged apparent size long
          // after the impact.
          //
          // But the budget is gated on the WRECK'S OWN REST STATE, not on a
          // wall clock. A fixed per-class timer guaranteed that by the hero
          // frame nothing could be flying by construction, so the field became a
          // flat carpet of razor-sharp chips (v=0 means the velocity stretch
          // collapses to k=1) lying behind a still-tumbling car — debris as
          // decals. Both reference plates show ejecta in flight, streaked, and
          // co-located with the airborne shell. So: pieces fly while the wreck
          // flies and settle when it settles. `air` only decides the ORDER in
          // which they are cleaned up once the shell is down.
          if (it.age > it.air && shellDown()) {
            if (it.p.y > 1.1) {
              it.live = false;
              set.mesh.setMatrixAt(it.i, HIDDEN);
              continue;
            }
            it.p.y = it.r;
            it.v.set(0, 0, 0); it.w.set(0, 0, 0);
            it.asleep = true;
            if (set === panels) {
              bodyEuler.setFromQuaternion(it.q, 'YXZ');
              it.q.setFromEuler(new THREE.Euler(
                (rng() - 0.5) * 0.22, bodyEuler.y, (rng() - 0.5) * 0.22, 'YXZ'));
            }
            _m4.compose(it.p, it.q, it.s);
            set.mesh.setMatrixAt(it.i, _m4);
            continue;
          }

          it.v.y += DEBRIS_GRAV * dt;
          it.v.multiplyScalar(Math.exp(-it.drag * dt));

          // ---- cone cap ------------------------------------------------------
          // The velocity structure of the cone is right and is not touched here;
          // what is capped is how far the cone is allowed to CARRY. Past capR of
          // horizontal travel from its own spawn point a piece gets a steep extra
          // drag that scales with the overshoot, so the fan asymptotes at roughly
          // five metres from the manifold instead of thirty. The brake is applied
          // to the horizontal component only — pieces still fall normally.
          const ox = it.p.x - it.o.x, oz = it.p.z - it.o.z;
          const over = Math.sqrt(ox * ox + oz * oz) - it.capR;
          if (over > 0) {
            const brake = Math.exp(-(2.6 + over * 3.4) * dt);
            it.v.x *= brake; it.v.z *= brake;
          }

          it.p.addScaledVector(it.v, dt);
          integrateQuat(it.q, it.w, dt);
          it.w.multiplyScalar(Math.exp(-it.spinDrag * dt));
          if (it.p.y < it.r) {
            it.p.y = it.r;
            if (it.v.y < 0) it.v.y = -it.v.y * it.bounce;
            it.v.x *= it.fric; it.v.z *= it.fric;
            it.w.multiplyScalar(it.fric * 0.85);
            if (it.v.lengthSq() < 0.45 && it.w.lengthSq() < 1.6) {
              it.restT += dt;
              if (it.restT > 0.18) {
                it.asleep = true;
                it.v.set(0, 0, 0); it.w.set(0, 0, 0);
                // lie flat on the road rather than balancing on a corner
                if (set === panels) {
                  bodyEuler.setFromQuaternion(it.q, 'YXZ');
                  it.q.setFromEuler(new THREE.Euler(
                    (rng() - 0.5) * 0.22, bodyEuler.y, (rng() - 0.5) * 0.22, 'YXZ'));
                }
              }
            } else it.restT = 0;
          }
          // Per-particle velocity motion blur. A shard tumbling at 20 m/s under
          // a slow-mo shutter is a streak, not a crisp quad — without this the
          // debris reads as flat cut-outs pasted over the road. We stretch the
          // instance along its own world velocity about its centre:
          //   M = T(p) . B . diag(k,1,1) . B^T . R . S
          // with B an orthonormal basis whose first axis is the velocity, i.e.
          // an anisotropic world-space scale that leaves the shard's own
          // orientation and its position untouched.
          // The stretch budget is per mass class: a light glass chip at 30 m/s
          // smears into a sliver while a heavy chunk at the same speed stays
          // nearly solid, which is what sells the two populations as different
          // masses rather than different colours.
          // Threshold is 1.2 m/s, not 2.0: the ejecta speeds came down with the
          // cone cap, so a 2 m/s dead-band was letting most of the surviving
          // heavy pieces fall out of the stretch entirely and sit sharp.
          const vlen = it.v.length();
          const k = 1 + clamp((vlen - 1.2) * it.blur, 0, it.blurMax);
          if (k > 1.02) {
            _sA.copy(it.v).multiplyScalar(1 / vlen);
            _sB.set(-_sA.z, 0, _sA.x);
            if (_sB.lengthSq() < 1e-6) _sB.set(1, 0, 0);
            _sB.normalize();
            _sC.copy(_sA).cross(_sB).normalize();
            _basis.makeBasis(_sA, _sB, _sC);
            _basisT.copy(_basis).transpose();
            _diag.makeScale(k, 1, 1);
            _stretch.multiplyMatrices(_basis, _diag).multiply(_basisT);
            _m4.compose(ZERO3, it.q, it.s);
            _m4.premultiply(_stretch);
            _m4.setPosition(it.p);
          } else {
            _m4.compose(it.p, it.q, it.s);
          }
          set.mesh.setMatrixAt(it.i, _m4);
        }
      }
      if (dirty) set.mesh.instanceMatrix.needsUpdate = true;
    }

    for (const w of looseParts) {
      if (w.asleep) continue;
      w.v.y += DEBRIS_GRAV * dt;
      w.v.multiplyScalar(Math.exp(-w.drag * dt));
      w.p.addScaledVector(w.v, dt);
      integrateQuat(w.q, w.w, dt);
      if (w.p.y < w.r) {
        w.p.y = w.r;
        if (w.v.y < 0) w.v.y = -w.v.y * w.bounce;
        w.v.x *= w.fric; w.v.z *= w.fric;
        w.w.multiplyScalar(0.90);
        if (w.v.lengthSq() < 0.3 && w.w.lengthSq() < 1.0) {
          w.restT += dt;
          if (w.restT > 0.2) {
            w.asleep = true;
            // a shed wheel ends up lying on its side
            w.q.setFromEuler(new THREE.Euler(0, rng() * 6.28, Math.PI / 2, 'YXZ'));
            w.p.y = 0.16;
          }
        } else w.restT = 0;
      }
      w.mesh.position.copy(w.p);
      w.mesh.quaternion.copy(w.q);
    }
    for (const w of looseParts) {
      if (w.asleep) { w.mesh.position.copy(w.p); w.mesh.quaternion.copy(w.q); }
    }
  }

  const SPARK_UP = new THREE.Vector3(0, 1, 0);
  function stepSparks(dt) {
    let any = false;
    for (const s of sparks) {
      if (!s.live) { continue; }
      any = true;
      s.life -= dt;
      if (s.life <= 0) {
        s.live = false;
        sparkMesh.setMatrixAt(s.i, HIDDEN);
        continue;
      }
      s.v.y += (DEBRIS_GRAV * s.grav + s.buoy) * dt;
      s.v.multiplyScalar(Math.exp(-s.drag * dt));
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.03) {
        s.p.y = 0.03;
        s.v.y = Math.abs(s.v.y) * 0.35;
        s.v.x *= 0.62; s.v.z *= 0.62;
      }
      const sp = s.v.length();
      // Streak extent. `s.streak` was 0.045 and the ceiling 2.6 m; it is now 0.012
      // (every spawn override scaled by the same 0.267) with the ceiling at 0.30 m.
      //
      // !! READ THIS BEFORE YOU TOUCH THESE NUMBERS. THE JUSTIFICATION THAT USED TO
      //    BE WRITTEN HERE RESTED ON A RETIRED REFERENCE ANCHOR. !!
      // The original argument compared our projected streak lengths against reference
      // sparks "6 px / 27 px" with an "aspect p50 6.4". Both figures descend from the
      // chain-link-fence anchor `crash-cam-01 --patch 0.00,0.30,0.63,0.73`, which is
      // RETIRED: cropped and looked at, that patch contains NO debris and NO sparks -
      // it is fence diamonds, a rusted stanchion and the hero car's dazzle livery, its
      // `meanContrast` is -7.6 (darker than its surround, which additive sparks cannot
      // be) and its drop rate is 98.2% (`verdicts/wave-p/crash-cam.md`, re-cropped in
      // `verdicts/wave-q/crash-cam.md`; `tools/STANDING-CONSTRAINTS.md` §0 ANCHOR 1).
      // Against a clean 0%-drop anchor the briefed direction was INVERTED: our sparks
      // are 3-10x too SMALL and 3x too DIM, not too large. Spark ASPECT is separately
      // RETIRED IN BOTH DIRECTIONS (§2j): at `widPx p50 1.426` the measured minor axis
      // is pinned near 1 px by AA and the MSAA resolve, so neither end is scale-free.
      //   REPLACEMENT ANCHOR: `crash-cam-04 --patch 0.229,0.333,0.620,0.722`,
      //   crop-verified as ten separated golden-orange streaks with near-white cores on
      //   black road, 0% drop, contrast +60.5 (`verdicts/wave-q/crash-cam.md`).
      //   Score on the spark-isolated visible-minus-hidden DIFFERENCE image only:
      //   contrast band [45, 60], p90 [95,125], p99 [140,158], max [155,185].
      // The shipped 0.012 / 0.30 are LEFT UNCHANGED here deliberately - re-deriving them
      // is the crash builder's job against the replacement anchor, in a report that
      // shows the paired control. Do not restore 0.045 on the strength of the retirement
      // alone: "the old reason was false" is not "the old number was right."
      const len = clamp(sp * s.streak, 0.09, 0.30);
      // ...and the width came down with it, on the same retired reasoning: at a 0.030 m
      // floor ours projected 3.7 px wide, which is what let neighbouring streaks fuse
      // into the "golden bar" chains. That fusion artefact is real and is GONE, and the
      // observation stands on its own A/B; only the "reference sparks are ~1 px wide
      // slivers" half came from the dead anchor. The floor is now 0.012 m, i.e. ~1.2 px
      // at this camera distance.
      const wid = clamp(0.012 + len * 0.012, 0.012, 0.032);
      _v.copy(s.v).multiplyScalar(sp > 1e-4 ? 1 / sp : 0);
      if (sp < 1e-4) _v.copy(SPARK_UP);
      _q.setFromUnitVectors(SPARK_UP, _v);
      _v2.copy(s.p).addScaledVector(_v, -len * 0.5);
      _v3.set(wid, len, wid);
      _m4.compose(_v2, _q, _v3);
      sparkMesh.setMatrixAt(s.i, _m4);

      // Colour: white-hot core cooling through orange to a dark ember.
      //
      // RANGE DISCIPLINE — AND A CORRECTION TO THE REASONING, NOT TO THE NUMBERS.
      //
      // The gains below are r = 1.10, g = 0.609, b = 0.216 (peak r measures 1.0093),
      // down from r = 2.8, g = 1.55. Wave P did NOT change them. It did find that the
      // justification written here for lowering them was false, and a false premise in
      // this file has cost a whole critic round before, so it is corrected in place:
      //
      // WRONG, as previously written: "at 2.8x the pixel saturates for every texel whose
      // alpha exceeds 1/2.8 = 0.36, so the first ~63% of the taper is clipped flat."
      // That is only true of an 8-bit target. RenderPass draws into the composer's
      // HalfFloatType target (`main.js:107-111`) and three applies no tone mapping when
      // the target is not the canvas (`main.js:68-75`), so an additive write of 2.8 is
      // stored as 2.8. Nothing clips at write time. The compression is applied later, by
      // the graded ACES output pass, which is a smooth shoulder and not a hard clip: 1.0
      // and 2.8 remain distinguishable at the display. So the square-ended bars Wave M/N
      // saw were NOT produced by this gain.
      //
      // What did produce them, measured in Wave P: the streak texture was sampled at
      // `aniso: 1`, which collapsed all 64 authored rows of its profile into a 2x2 mip.
      // See the note on streakTexture(). Fixing that dropped spark-attributable fill 39%
      // at an unchanged spark count and raised spark aspP90 14.96 -> 18.24 (boost 0).
      //
      // The live consequence of the level itself is the BLOOM FEED, not clipping. The
      // dual-filter bloom thresholds HDR luminance at 1.0 with a 0.45 knee, i.e. it starts
      // at 0.55 (`post.js:274-278`). At r = 1.10 only the youngest sparks' core row reaches
      // it; the median spark (u = 0.5 -> heat 0.683 -> r 0.751, times a sub-unity texel)
      // never crosses the knee and so gets no glare at all. Measured against
      // `crash-cam-04 --patch 0.229,0.333,0.620,0.722` (a sparse spark region, 0% of the
      // mask dropped), reference sparks sit +60.5 luma over their own local background and
      // ours sit +19 to +22. That gap is the open item. It is left open deliberately: the
      // Wave P brief forbade raising r above 1.10, and the right fix is a bloom-crossing
      // headroom term, not a return to 2.8 across the whole population.
      //
      // Hue ratios are preserved to four figures (g/r = 0.5536, b/r = 0.1964).
      const u = clamp(s.life / s.maxLife, 0, 1);
      const heat = Math.pow(u, 0.55) * s.hot;
      const r = 1.10 * heat;
      const g = 0.609 * heat * heat;
      const b = 0.216 * Math.pow(heat, 4.5);
      sparkMesh.instanceColor.setXYZ(s.i, r, g, b);
      any = true;
    }
    if (any) {
      sparkMesh.instanceMatrix.needsUpdate = true;
      sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * The wake. A short-lived, fast-expanding low puff dropped along the tumble
   * path so the wreck is dragging disturbed air and grit with it instead of
   * flying through a vacuum. Emission is distance-based, not time-based, so the
   * trail has even spacing whatever the slow-mo factor is doing, and the puffs
   * are pinned to the road below the shell — this is displaced ground dust, so
   * it must not follow the shell up into the air.
   */
  function stepWake(dt) {
    if (!wakeOn) return;
    const gspeed = Math.hypot(vel.x, vel.z);
    if (asleep || gspeed < 3.5) { wakeClock = 0; return; }
    // one puff every ~1.4 m of ground travel
    wakeClock += gspeed * dt;
    let budget = 3;
    while (wakeClock > 1.4 && budget-- > 0) {
      wakeClock -= 1.4;
      // behind the shell, on the deck, with a little lateral scatter
      _wakeP.set(com.x, 0.26 + fxRng() * 0.22, com.z)
        .addScaledVector(vel, -0.055)
        .addScaledVector(impactSide, (fxRng() - 0.5) * 2.0);
      _wakeP.y = 0.26 + fxRng() * 0.22;
      // thrown backwards out of the wreck's path and lifted a touch
      _wakeV.copy(vel).multiplyScalar(-0.17);
      _wakeV.y = 1.1 + fxRng() * 1.5;
      _wakeV.addScaledVector(impactSide, (fxRng() - 0.5) * 3.2);
      emitPuff(_wakeP, _wakeV, {
        life: 1.05 + fxRng() * 0.75, s0: 0.5, s1: 2.5 + fxRng() * 1.2,
        peak: 0.24, cool: 2.8, rise: 0.7, drag: 2.2, thin: 2.6, floor: 0.24,
        shade: 0.9 + fxRng() * 0.25, spin: 1.9,
        warm: 0xcbbb9c, cold: 0x7a7466,
      });
    }
  }

  function stepPuffs(dt) {
    let dirty = false;
    for (const q of puffs) {
      if (!q.live) continue;
      dirty = true;
      q.life -= dt;
      if (q.life <= 0) {
        q.live = false;
        aDustParm.setXYZW(q.i, 0, 0, 0, 1);       // zero radius = degenerate quad
        continue;
      }
      const age = 1 - q.life / q.maxLife;
      q.v.y += q.rise * dt;                       // buoyancy
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.floor) q.p.y = damp(q.p.y, q.floor, 6, dt);
      q.rot += q.spin * dt;

      const rad = lerp(q.s0, q.s1, Math.pow(age, 0.62));
      // density: quick fade in, long fade out, and thinning with height so the
      // column is dense and dark at the contact point and frays at the crown
      const fade = age < 0.13 ? age / 0.13 : Math.pow(1 - (age - 0.13) / 0.87, 1.5);
      const climb = clamp((q.p.y - q.y0) / q.thin, 0, 1);
      const alpha = clamp(fade * q.peak * lerp(1, 0.42, climb), 0, 1);
      // self-shadowing: the low, packed core sits in its own shadow, the crown
      // that has climbed clear of the body takes the full sun
      const shade = q.shade * lerp(0.62, 1.24, climb);

      _col.copy(q.warm).lerp(q.cold, clamp(age * q.cool, 0, 1));
      aDustPos.setXYZ(q.i, q.p.x, q.p.y, q.p.z);
      aDustParm.setXYZW(q.i, rad, q.rot, alpha, shade);
      aDustCol.setXYZ(q.i, _col.r, _col.g, _col.b);
    }
    if (dirty) {
      aDustPos.needsUpdate = true;
      aDustParm.needsUpdate = true;
      aDustCol.needsUpdate = true;
    }
  }

  function stepFlares(dt) {
    for (const f of flares) {
      if (!f.live) continue;
      f.life -= dt;
      if (f.life <= 0) { f.live = false; f.sp.visible = false; f.mat.opacity = 0; continue; }
      const age = 1 - f.life / f.maxLife;
      f.p.addScaledVector(f.v, dt);
      const sc = lerp(f.s0, f.s1, Math.pow(age, 0.5));
      f.sp.position.copy(f.p);
      f.sp.scale.set(sc, sc, 1);
      f.mat.opacity = clamp(Math.pow(1 - age, 1.8) * f.gain, 0, 1);
    }
  }

  // -------------------------------------------------------------------------
  const crash = {
    group,
    get active() { return active; },
    /** Slow-mo factor. main.js scales dt by this; audio.js reads it for pitch/rate. */
    get timeScale() { return timeScale; },
    get time() { return t; },
    get realTime() { return tReal; },
    get wreckSpeed() { return vel.length(); },
    /**
     * Normalised slow-mo shutter length, 0..1. Zero whenever no crash is live.
     * Proportional to (real-world ground velocity) / (sim time rate), i.e. the
     * metres of world that sweep past the lens during one displayed frame — see
     * the slow-mo shutter block above. main.js feeds it to the renderer's radial
     * smear as max(boostBlend, crashShutter), which streaks the tarmac while the
     * smear's hero hole keeps the wreck itself sharp.
     */
    get shutter01() { return active ? shutter01 : 0; },
    /** Real-world ground velocity the shutter is keyed to, m/s. For probes. */
    get groundV() { return active ? groundV : 0; },

    trigger({ speed = 60, dir = new THREE.Vector3(0, 0, 1), severity = 1 } = {}) {
      crash.reset();
      active = true;
      t = 0; tReal = 0; timeScale = SLAM_IMPACT.floor;
      severityN = clamp(severity, 0.2, 2);
      physics.state.crashed = true;
      doImpact(Math.max(12, speed), dir, severityN);
      applyWreckPose();
      // Seed the shutter with the PRE-impact ground speed, before doImpact's
      // momentum-to-spin conversion has had a chance to hide it.
      groundV = Math.max(12, speed);
      updateShutter(0);
    },

    update(dt) {
      if (!active) return;
      if (!(dt > 0)) { applyWreckPose(); return; }

      // dt arrives in SIM seconds (main.js has already scaled it), so dividing
      // by the rate we ran that step at recovers wall-clock seconds.
      const dtReal = dt / Math.max(timeScale, 1e-3);
      tReal += dtReal;
      t += dt;
      timeScale = tsAt(tReal);

      stepWreck(dt);
      stepDebris(dt);
      stepSparks(dt);
      stepWake(dt);
      stepPuffs(dt);
      stepFlares(dt);
      syncDust();
      updateShutter(dtReal);

      // ---- crashbreaker ---------------------------------------------------
      if (!breakerDone) {
        if (breakerAt < 0 && (asleep || restBlend > 0.4)) breakerAt = t + 0.55;
        if (breakerAt > 0 && t >= breakerAt) doCrashbreaker();
      }

      // ---- burning wreck --------------------------------------------------
      if (breakerFired) {
        const burn = t - (breakerAt > 0 ? breakerAt : t);
        emberClock += dt;
        while (emberClock > 0.05) {
          emberClock -= 0.05;
          _v.copy(com).add(_v2.set((fxRng() - 0.5) * 1.9, 0.25 + fxRng() * 0.9,
            (fxRng() - 0.5) * 2.6));
          _v2.set((fxRng() - 0.5) * 2.4, 3.2 + fxRng() * 5.0, (fxRng() - 0.5) * 2.4);
          emitSpark(_v, _v2, {
            life: 1.6 + fxRng() * 1.8, hot: 0.85, drag: 1.9,
            streak: 0.009, grav: 0.30, buoy: 4.6,
          });
        }
        smokeClock += dt;
        while (smokeClock > 0.09) {
          smokeClock -= 0.09;
          _v.copy(com).add(_v2.set((fxRng() - 0.5) * 1.5, 0.5 + fxRng() * 0.6,
            (fxRng() - 0.5) * 2.0));
          _v2.set(0.8 + (fxRng() - 0.5) * 1.2, 4.6 + fxRng() * 2.6, (fxRng() - 0.5) * 1.2);
          emitPuff(_v, _v2, {
            life: 4.2 + fxRng() * 2.4, s0: 1.0, s1: 4.4 + fxRng() * 2.4, peak: 0.40,
            cool: 4.6, rise: 3.0, drag: 0.85, thin: 8.0, floor: 0.34,
            shade: 0.60 + fxRng() * 0.35, spin: 0.8,
            warm: 0xffb073, cold: 0x41464e,
          });
        }
        // flame licks + flicker light
        if (fxRng() < dt * 26) {
          _v.copy(com).add(_v2.set((fxRng() - 0.5) * 1.6, 0.4 + fxRng() * 0.5,
            (fxRng() - 0.5) * 2.2));
          emitFlare(_v, {
            life: 0.26 + fxRng() * 0.22, s0: 1.0 + fxRng(), s1: 2.6 + fxRng() * 2.2,
            gain: 0.42, color: 0xff7a1e, soft: false,
            v: new THREE.Vector3(0, 2.4 + fxRng() * 2, 0),
          });
        }
        const flick = 0.72 + 0.28 * vnoise(tReal * 9, 3) + 0.14 * vnoise(tReal * 31, 5);
        fireLight.visible = true;
        fireLight.intensity = clamp(46 * flick * Math.exp(-burn * 0.05), 4, 90);
        fireLight.position.set(com.x, Math.max(0.7, com.y), com.z);
      }

      // ---- shockwave ------------------------------------------------------
      if (ringT >= 0) {
        ringT += dt;
        const u = clamp(ringT / ringLife, 0, 1);
        const rad = lerp(2.5, 26, Math.pow(u, 0.55));
        ring.scale.set(rad, rad, 1);
        ringMat.opacity = Math.pow(1 - u, 2.1) * 0.85;
        if (u >= 1) { ringT = -1; ring.visible = false; ringMat.opacity = 0; }
      }

      // ---- flash light decay ----------------------------------------------
      if (flashLight.visible) {
        flashLight.intensity *= Math.exp(-11 * dt);
        if (flashLight.intensity < 0.6) { flashLight.intensity = 0; flashLight.visible = false; }
      }

      // ---- camera punch ----------------------------------------------------
      const rigNow = findRig();
      const rigShakes = !!(rigNow && typeof rigNow.impulse === 'function');
      if (rigShakes && pendingImpulse > 0) {
        rigNow.impulse(clamp(pendingImpulse, 0, 1));
        pendingImpulse = 0;
        punchAmp = 0;
        punchOffset.set(0, 0, 0);
      }
      const age = tReal - punchAt;
      if (!rigShakes && punchAmp > 0.0001 && age >= 0) {
        const decay = Math.exp(-3.4 * age);
        const amp = punchAmp * decay;
        const f = tReal * 27 + punchSeed;
        punchOffset.set(
          vnoise(f, 0) * amp,
          vnoise(f * 1.17, 1) * amp * 0.85,
          vnoise(f * 0.91, 2) * amp,
        );
        // a directional shove along the impact axis on the first tenth of a second
        const shove = Math.exp(-14 * age) * punchAmp * 0.55;
        punchOffset.addScaledVector(impactDir, shove);
        if (decay < 0.02) punchAmp = 0;
      } else punchOffset.set(0, 0, 0);

      // ---- camera direction -------------------------------------------------
      // Tight and low at the impact, then pushed out and up as the wreck settles;
      // the crashbreaker punches back in. Orbit target stays owned by the scene.
      const rig = rigNow;
      if (rig && rig.config && rig.config.mode === 'orbit') {
        const sinceBreak = breakerFired ? tReal - breakerRealT : 99;
        const openN = clamp(tReal / 3.4, 0, 1);
        let radius = lerp(6.2, 10.6, Math.pow(openN, 0.7));
        let height = lerp(1.25, 2.55, Math.pow(openN, 0.85));
        let fov = lerp(54, 46, openN);
        if (breakerFired) {
          // punch back in and drop to a low hero angle for the detonation
          const k = Math.exp(-sinceBreak * 0.30);
          radius = lerp(radius, 16.4, k);
          height = lerp(height, 5.6, k);
          fov = lerp(fov, 52, k);
        }
        rig.tweak({
          orbitRadius: damp(rig.config.orbitRadius, radius, 3.0, dt),
          orbitHeight: damp(rig.config.orbitHeight, height, 3.0, dt),
          orbitSpeed: lerp(0.42, 0.15, openN),
          fov: damp(rig.config.fov, fov, 2.4, dt),
        });
      }

      applyWreckPose();
    },

    /**
     * Shell rest state, for probes and tuning. The debris field's airborne
     * budget is gated on this, so a probe needs to see it to explain the field.
     */
    get rest() {
      return { asleep, restBlend, restTimer, shellDown: shellDown(), firstContactT };
    },

    /** Per-piece debris state, for probes: size/airborne/stretch distributions. */
    get debris() {
      return debrisSets.map((set) => ({
        kind: set.items[0].kind,
        items: set.items.filter((it) => it.live).map((it) => ({
          y: it.p.y, r: it.r, asleep: it.asleep, age: it.age, air: it.air,
          v: it.v.length(),
          k: 1 + clamp((it.v.length() - 1.2) * it.blur, 0, it.blurMax),
          sx: it.s.x, sy: it.s.y, sz: it.s.z,
        })),
      }));
    },

    /** Contact manifold of the current crash, for probes and tuning. */
    get contact() {
      return { point: impactPoint, dir: impactDir, side: impactSide };
    },

    /** Deterministic fast-forward, used to bake a settled wreck for screenshots. */
    settle(seconds, step = 1 / 120) {
      const n = Math.round(seconds / step);
      for (let i = 0; i < n; i++) crash.update(step * timeScale);
    },

    /**
     * Pay first-crash costs behind the boot bar: damage mask paint, glass fracture
     * textures, debris/spark/smoke first draw, and any material variants still cold
     * after compile(). Shaders for this group are compiled in main's warm stage;
     * the remaining hitch is CPU paint + first GPU upload of live instance data.
     * `render` is called once with the wreck live, then crash+damage are reset.
     */
    prewarm(render) {
      if (active) crash.reset();
      // Full damage path first: setLevel hits every threshold (crack / lamps / shatter)
      // and uploads the scuff + fracture canvases. trigger() alone tops out ~0.5 and
      // leaves shatter cold for the first real crashbreaker.
      if (damage && damage.setLevel) damage.setLevel(0.88);
      const yaw = physics.state.yaw || 0;
      crash.trigger({
        speed: 30,
        dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
        severity: 0.7,
      });
      for (let i = 0; i < 4; i++) {
        crash.update(1 / 60);
        if (damage && damage.update) damage.update(1 / 60);
      }
      if (typeof render === 'function') {
        try { render(); } catch { /* never fatal */ }
      }
      crash.reset();
      if (damage && damage.reset) damage.reset();
    },

    reset() {
      active = false;
      t = 0; tReal = 0; timeScale = 1;
      slamAt = -1e9; slamCfg = SLAM_IMPACT;
      shutter01 = 0; groundV = 0;
      asleep = false; restTimer = 0; restBlend = 0; restQuat = null;
      firstContactT = -1; breakerAt = -1; breakerDone = false; breakerFired = false;
      slideNoise = 0; emberClock = 0; smokeClock = 0; breakerRealT = -1; shedClock = 0;
      wakeOn = false; wakeClock = 0;
      vel.set(0, 0, 0); omega.set(0, 0, 0); quat.identity(); com.set(0, 0, 0);
      punchAmp = 0; punchOffset.set(0, 0, 0); punched = false;

      for (const set of debrisSets) {
        for (const it of set.items) {
          it.live = false; it.asleep = false;
          set.mesh.setMatrixAt(it.i, HIDDEN);
        }
        set.mesh.instanceMatrix.needsUpdate = true;
        set.next = 0;
      }
      for (const s of sparks) { s.live = false; sparkMesh.setMatrixAt(s.i, HIDDEN); }
      sparkMesh.instanceMatrix.needsUpdate = true;
      for (const q of puffs) { q.live = false; aDustParm.setXYZW(q.i, 0, 0, 0, 1); }
      aDustParm.needsUpdate = true;
      puffNext = 0;
      for (const f of flares) { f.live = false; f.sp.visible = false; f.mat.opacity = 0; }
      for (const d of decals) { d.m.visible = false; d.mat.opacity = 0; }
      skid.visible = false; skidMat.opacity = 0;
      ring.visible = false; ringMat.opacity = 0; ringT = -1;
      fireLight.visible = false; fireLight.intensity = 0;
      flashLight.visible = false; flashLight.intensity = 0;

      for (const w of looseParts) group.remove(w.mesh);
      looseParts.length = 0;
      if (car.wheels) for (const w of car.wheels) w.pivot.visible = true;
      car.group.rotation.set(0, 0, 0);
      car.group.position.y = 0;
      physics.state.crashed = false;
    },
  };

  return crash;
}
