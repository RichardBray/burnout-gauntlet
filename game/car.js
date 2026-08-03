// car.js — procedural coupe body (curve-driven loft with a hard shoulder crease),
// metallic-flake clearcoat paint, livery decals under the clearcoat, layered glass,
// chrome/alloy wheels with an anisotropic ring highlight, reflector headlights.
//
// The car carries its own specular IBL: a cube camera parked at the car's origin is
// re-rendered every few frames and PMREM-filtered into a real prefiltered radiance
// probe, then bound as `envMap` on every car material, and every reflected ray is
// BOX-PROJECTED against a local box whose floor sits on the road surface (see section
// 3a) so the reflection has real parallax against the body. That local probe — not the
// scene's sky-only environment — is what produces the bright sky band along the upper
// flank flipping to a dark ground band at the rocker across the body's reflection
// horizon, the Fresnel rim on the raking panels, the razor shoulder-crease highlight,
// and mirror-finish rims and glass. car.js owns the probe end to end (create, refresh,
// dispose) and never touches another module's materials.
//
// API: createCar(rng, {paint}) -> car. car.group (THREE.Group, +Z is forward, origin at road level)
//   car.setPaint(hex) car.setLights(on) car.setBrake(0..1) car.setBoostGlow(0..1)
//   car.update(dt, {speed, steer, lean, pitch}) spins/steers wheels, rolls the body and
//     services the environment probe.
//   car.attachEnv({renderer, scene}) binds the probe explicitly; otherwise it latches on
//     to window.__game the first time update() runs. car.dispose() frees the probe.
//   Exposed for other modules: car.paintMat, car.bodyMesh, car.wheels[], car.DIMS.
//
// Everything here is generated in code — no external textures, no network, no Math.random.

import * as THREE from 'three';
import { valueNoise2D, clamp, lerp, makeCanvas, canvasTexture } from './util.js';

const L = 2.375;                     // body half-length
export const DIMS = {
  length: L * 2, width: 2.0, height: 1.40,
  wheelR: 0.365, wheelW: 0.30, track: 0.86,
  frontZ: 1.50, rearZ: -1.52,
};

// ===========================================================================
// 1. silhouette curves
// ===========================================================================

/**
 * Monotone cubic Hermite (Fritsch–Carlson) through [z, value] keys. Unlike a plain
 * Catmull-Rom this cannot overshoot, so a roofline never grows a bubble between
 * control points and a width curve never goes negative at the nose.
 */
function curve(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const m = new Array(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return function evalAt(x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
         + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Underbody floor height (the flat pan you never see, plus the nose/tail overhang lift).
const yFloor = curve([
  [-2.375, 0.50], [-2.28, 0.36], [-2.05, 0.275], [-1.20, 0.235],
  [0.00, 0.230], [1.20, 0.238], [2.05, 0.285], [2.28, 0.38], [2.375, 0.52],
]);

// Shoulder crease: the hard character line that runs nose-to-tail. Its height above the
// rocker is what gives the flank its bright-band / dark-band split.
const yShoulder = curve([
  [-2.375, 0.855], [-2.20, 0.935], [-1.85, 0.965], [-1.52, 0.975], [-0.90, 0.972],
  [0.00, 0.958], [0.80, 0.938], [1.35, 0.912], [1.85, 0.872], [2.20, 0.822], [2.375, 0.775],
]);

// Roofline / crown: hood -> cowl -> raked screen -> roof -> fastback -> deck -> tail.
const yTop = curve([
  [-2.375, 0.845], [-2.26, 0.930], [-2.05, 0.995], [-1.80, 1.035], [-1.55, 1.070],
  [-1.30, 1.135], [-1.05, 1.238], [-0.80, 1.335], [-0.45, 1.388], [-0.05, 1.398],
  [0.32, 1.362], [0.60, 1.268], [0.80, 1.152], [0.95, 1.038], [1.12, 0.992],
  [1.45, 0.972], [1.80, 0.950], [2.05, 0.918], [2.26, 0.862], [2.375, 0.795],
]);

// Half-width at the shoulder — the widest point of the body. Peaks over each arch,
// which is the flare; pinches at the doors and tapers hard into the overhangs.
const hwShoulder = curve([
  [-2.375, 0.30], [-2.28, 0.60], [-2.12, 0.80], [-1.85, 0.930], [-1.52, 0.995],
  [-1.20, 0.945], [-0.55, 0.905], [0.30, 0.900], [0.95, 0.918], [1.50, 0.995],
  [1.82, 0.930], [2.12, 0.80], [2.28, 0.58], [2.375, 0.24],
]);

// Tumblehome: how far the greenhouse pulls in above the beltline (fraction of hw).
const tumble = curve([
  [-2.375, 0.90], [-1.95, 0.90], [-1.50, 0.855], [-1.05, 0.805], [-0.30, 0.790],
  [0.35, 0.795], [0.85, 0.845], [1.30, 0.915], [1.90, 0.935], [2.375, 0.92],
]);

// Wheel-arch openings, cut straight into the bottom edge of the body loft.
const ARCH_R = 0.455, ARCH_CY = 0.335;
function archY(z) {
  let best = -1;
  for (const zc of [DIMS.frontZ, DIMS.rearZ]) {
    const dz = z - zc;
    if (Math.abs(dz) >= ARCH_R) continue;
    best = Math.max(best, ARCH_CY + Math.sqrt(ARCH_R * ARCH_R - dz * dz));
  }
  return best;
}

// ---------------------------------------------------------------------------
// 1b. shutlines
// ---------------------------------------------------------------------------
// A pressed panel is bounded by a gap, and the gap is what the clearcoat catches on:
// the lip either side of it flips the reflected environment twice within ~3 cm, so the
// single wide highlight blob breaks and reforms per panel. These are real inset
// channels in the loft, not a normal map — the loft plants extra stations exactly at
// the channel's wall and lip so the bevel has its own normals and survives at any
// screen size.
const SEAM_HALF = 0.0145;      // half channel width -> 2.9 cm door gap incl. bevels
const SEAM_DEPTH = 0.0115;     // how far the channel floor sits under the skin

/** Channel cross-profile: flat floor, steep wall, then a short near-vertical lip. */
function seamProfile(d) {
  const a = Math.abs(d);
  if (a >= SEAM_HALF) return 0;
  if (a <= 0.0045) return 1;
  if (a <= 0.0125) return 1 - 0.75 * ((a - 0.0045) / 0.0080);
  return 0.25 * (1 - (a - 0.0125) / 0.0020);
}
// station offsets that resolve that profile exactly
const SEAM_OFFS = [0, 0.0045, 0.0125, 0.0145];

/** Transverse cuts: constant z, spanning a range of the folded section parameter. */
const SEAM_Z = [
  { z: 2.030, u0: 0.030, u1: 0.500 },   // front bumper / clip split
  { z: 1.120, u0: 0.330, u1: 0.500 },   // hood trailing edge at the cowl
  { z: 0.800, u0: 0.058, u1: 0.300 },   // door leading edge
  { z: -0.340, u0: 0.058, u1: 0.300 },  // door trailing edge at the B-pillar
  { z: -1.720, u0: 0.300, u1: 0.500 },  // hatch lower edge under the backlight
  { z: -2.060, u0: 0.030, u1: 0.500 },  // rear bumper split
];

/** Longitudinal cuts: constant position along the crown arc, over a z range. */
const SEAM_T = 0.600, SEAM_T_HALF = 0.018;
const SEAM_L = [
  { z0: 1.180, z1: 2.020 },             // hood shut against the front fenders
  { z0: -2.020, z1: -1.780 },           // rear deck shut against the quarters
];

const smooth01 = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** How deep the skin is pushed in at one lofted vertex, 0..1. */
function seamAmount(z, u, at, band) {
  let a = 0;
  const uh = Math.min(u, 1 - u);
  for (const s of SEAM_Z) {
    const w = seamProfile(z - s.z);
    if (w <= 0) continue;
    const end = Math.min(smooth01(s.u0 - 0.014, s.u0 + 0.003, uh),
                         1 - smooth01(s.u1 - 0.003, s.u1 + 0.014, uh));
    if (end > 0) a = Math.max(a, w * end);
  }
  if (band === TAG.ROOF && at !== undefined) {
    const w = seamProfile(((at - SEAM_T) / SEAM_T_HALF) * SEAM_HALF);
    if (w > 0) {
      for (const s of SEAM_L) {
        const end = Math.min(smooth01(s.z0 - 0.045, s.z0 + 0.020, z),
                             1 - smooth01(s.z1 - 0.020, s.z1 + 0.045, z));
        if (end > 0) a = Math.max(a, w * end);
      }
    }
  }
  return a;
}

// ===========================================================================
// 2. cross-section + loft
// ===========================================================================
// Fixed u allocation per segment so a decal drawn at u = 0.24 lands on the same body
// feature at every station regardless of how the section changes shape.
const U_UNDER = 0.000, U_SILL = 0.048, U_FLANK = 0.090,
      U_CREASE = 0.216, U_BELT = 0.292, U_RAIL = 0.352, U_TOP = 0.500;

const TAG = { UNDER: 0, WELL: 1, FLANK: 2, UPPER: 3, GREEN: 4, ROOF: 5 };

/** Sample n points along [a,b] inclusive of a, exclusive of b. */
function arc(out, n, u0, u1, tag, fn) {
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const [x, y] = fn(t);
    out.push({ x, y, u: lerp(u0, u1, t), band: tag, at: t });
  }
}

/**
 * Sample parameters for the crown arc: a uniform sweep with a tight cluster planted
 * at the hood/deck shutline so that channel has real wall and lip vertices instead of
 * being averaged away by the surrounding tessellation.
 */
const ROOF_TS = (() => {
  const ts = [];
  for (let i = 0; i < 20; i++) ts.push(i / 20);
  for (const o of SEAM_OFFS) {
    const dt = (o / SEAM_HALF) * SEAM_T_HALF;
    ts.push(SEAM_T - dt, SEAM_T + dt);
  }
  ts.sort((a, b) => a - b);
  const out = [];
  for (const t of ts) if (t >= 0 && t < 1 && (!out.length || t - out[out.length - 1] > 0.0015)) out.push(t);
  return out;
})();

/** Right half of the cross-section at z: bottom centre -> shoulder crease -> roof centre. */
function halfSection(z) {
  const p = [];
  const yf = yFloor(z);
  const hwS = Math.max(0.045, hwShoulder(z));
  const ySh = yShoulder(z);
  const yt = yTop(z);

  const aY = archY(z);
  const inArch = aY > 0;
  const rockerY = yf + 0.052;
  const ySill = inArch ? Math.max(rockerY, Math.min(aY, ySh - 0.10)) : rockerY;
  // The arch lip is nearly as wide as the shoulder; between the arches the rocker tucks in.
  const archT = inArch ? clamp((ySill - rockerY) / 0.30, 0, 1) : 0;
  const hwR = Math.max(0.03, hwS - 0.078 + 0.062 * archT);

  const tum = tumble(z);
  const hwB = hwS * 0.985;
  const hwT = Math.min(hwB - 0.006, hwS * tum);
  const yTopSide = yt - Math.min(0.10, 0.055 + 0.05 * (hwT / Math.max(hwS, 1e-3)));
  const yBelt = clamp(ySh + 0.135, ySh + 0.02, yTopSide - 0.014);

  // --- underbody pan: centre out to the inner edge of the sill
  arc(p, 3, U_UNDER, U_SILL, TAG.UNDER, (t) => [hwR * 0.90 * t, yf + 0.014 * t * t]);
  // --- sill / inner wheel-arch wall: near vertical, tall inside the arches
  arc(p, inArch ? 5 : 2, U_SILL, U_FLANK - 0.0008, TAG.WELL,
    (t) => [hwR * (0.90 + 0.10 * Math.sin(t * Math.PI * 0.5)), lerp(yf + 0.014, ySill, Math.pow(t, 0.75))]);
  // --- HARD SEAM: the rocker line. The body's lower reflection horizon lives here —
  //     above it the flank sees sky, below it the sill sees tarmac — so it needs the
  //     same discontinuity treatment as the shoulder to resolve as a second thin line.
  p.push({ x: hwR, y: ySill, u: U_FLANK, band: -1 });
  // --- lower flank: convex, bulging out to the crease, PLUS a real pressed crown.
  //
  // The base arc above is monotonic: x rises once from the rocker to the shoulder, so the
  // outward normal rotates once, in one direction, over the whole panel. Under a
  // near-mirror clearcoat that returns ONE reflection direction for the entire flank, and
  // the measured consequence was a flank whose 10th-to-90th percentile spanned 6 L against
  // 21-23 L in both side-view references — a uniform red plate with sandpaper noise on it.
  // The references are not doing that with a material: `car-paint-closeup-03`'s vertical
  // column runs 85 -> 60 -> 100 -> 61 -> 48, which is NON-MONOTONIC. No BRDF produces that
  // from a flat plate. It is the reflection vector sweeping up across the environment
  // horizon and back down again, which requires the panel's normal to turn more than once.
  //
  // So the crown is real geometry, one full cycle of it across the flank:
  //
  //   d(t) = A sin(2 pi t)     t = 0 at the rocker seam, 1 at the shoulder crease
  //
  // Zero at both ends, so the rocker line and the shoulder crease stay exactly where the
  // hard-seam columns and the livery's u allocation expect them; a bulge through the lower
  // half and an undercut through the upper half, which is also just what a pressed door
  // skin does (the tuck below the character line is what makes the crease catch). The
  // resulting normal history bottom-to-top is: tilted down (rocker sees tarmac), level,
  // tilted UP (mid-flank sees sky), level, tilted down again (undercut goes dark under the
  // crease) — five bands, matching the reference's five inflections. Measured, the flank
  // column now runs 91 -> 60 -> 46 -> 42 -> 46 -> 64 -> 103 instead of the old monotonic
  // 54 -> 42 slide.
  //
  // Amplitude. The flank arc is ~0.68 m at the doors, so one cycle at A gives a slope
  // amplitude of 2 pi A / 0.68. A first pass used A = 12 mm, which is what a real stamping
  // carries: 0.111 slope, +-6.3 deg of surface tilt, +-12.6 deg of reflected-ray swing. It
  // measured almost nothing (p90-p50 2.2). The reason is the probe: it is a prefiltered
  // cube chain, so the environment it returns has no hard horizon left in it — a 25 deg
  // sweep lands entirely inside one smoothly-varying mip and comes back as very nearly the
  // same colour. It takes A = 31 mm (0.286 slope, +-16 deg of tilt, a ~64 deg reflected
  // sweep) before the swing is wide enough to leave the sky band and reach the ground band
  // of a *blurred* probe. So this number is honest about what it is: geometric compensation
  // for a probe with no high frequencies, tuned against the measurement, not a claim that
  // real doors have 31 mm of crown. It is still only 3.4% of the 900 mm half-width, so the
  // silhouette reads as a hip rather than a bulge; verified in the closeup and at distance
  // in dusk-highway-chase and daytime-downtown.
  //
  // If the probe ever gains resolution (a sharper prefilter, or a real-time cube face) this
  // should come back DOWN towards 12 mm, because the same L modulation will then arrive
  // from a much smaller sweep.
  //
  // A is modulated along z on a 1.55 m wavelength — roughly one door — so the bright band
  // is not a dead-straight extruded stripe down the whole car but breaks and reforms per
  // panel, the way the shutlines already break the highlight.
  //
  // The sample count goes 10 -> 20 because computeVertexNormals is the only thing that
  // sees this: at 10 samples a full sine cycle is 10 vertices and the crown's own curvature
  // would be faceted into the same terracing this file has fought elsewhere.
  const crownA = 0.031 * (0.82 + 0.18 * Math.cos((2 * Math.PI * z) / 1.55));
  arc(p, 20, U_FLANK + 0.0008, U_CREASE, TAG.FLANK, (t) => [
    hwR + (hwS - hwR) * Math.pow(Math.sin(t * Math.PI * 0.5), 0.62)
        + crownA * Math.sin(2 * Math.PI * t),
    ySill + (ySh - ySill) * Math.pow(t, 1.22),
  ]);
  // --- HARD SEAM: the shoulder crease. Two coincident columns with no band between them,
  //     so computeVertexNormals cannot average across it and the clearcoat gets a
  //     razor-thin specular line instead of a soft gradient.
  p.push({ x: hwS, y: ySh, u: U_CREASE, band: -1 });
  // --- upper flank: rolls over from the crease to the beltline
  //     Note it starts EXACTLY on the crease point: any offset there leaves a real slot
  //     through the skin, and a slot reads as a dark line where the reference has a
  //     near-clipping bright one. Coincident means a degenerate quad and a hard normal.
  arc(p, 6, U_CREASE + 0.0008, U_BELT, TAG.UPPER, (t) => [
    hwS + (hwB - hwS) * Math.pow(t, 1.35),
    ySh + (yBelt - ySh) * Math.sin(t * Math.PI * 0.5),
  ]);
  // --- beltline seam (paint meets glass)
  p.push({ x: hwB, y: yBelt, u: U_BELT, band: -1 });
  // --- greenhouse: tumblehome pulling the glass in as it rises
  arc(p, 5, U_BELT + 0.0008, U_RAIL, TAG.GREEN, (t) => [
    hwB + (hwT - hwB) * Math.pow(Math.sin(t * Math.PI * 0.5), 0.85),
    yBelt + (yTopSide - yBelt) * Math.pow(t, 1.25),
  ]);
  // --- drip-rail seam
  p.push({ x: hwT, y: yTopSide, u: U_RAIL, band: -1 });
  // --- roof / hood / deck: flat-topped superellipse quarter, sampled on ROOF_TS so the
  //     longitudinal hood shutline lands on real vertices
  const e = 2 / 4.2;
  for (const t of ROOF_TS) {
    const a = t * Math.PI * 0.5;
    p.push({
      x: hwT * Math.pow(Math.cos(a), e),
      y: yTopSide + (yt - yTopSide) * Math.pow(Math.sin(a), e),
      u: lerp(U_RAIL + 0.0008, U_TOP, t), band: TAG.ROOF, at: t,
    });
  }
  p.push({ x: 0, y: yt, u: U_TOP, band: null });
  return p;
}

/** Mirror a half section into a closed ring; band tags follow the mirrored segment. */
function ringFrom(half) {
  const n = half.length - 1;
  const ring = half.map((q) => ({ ...q }));
  ring[n].band = half[n - 1].band;
  for (let k = n - 1; k >= 1; k--) {
    ring.push({ x: -half[k].x, y: half[k].y, u: 1 - half[k].u, band: half[k - 1].band, at: half[k].at });
  }
  return ring;
}

/** Longitudinal station list: uniform through the middle, dense into the overhangs. */
function stationZs() {
  const zs = [];
  const N = 74;
  for (let i = 0; i <= N; i++) zs.push(-L + (2 * L * i) / N);
  for (const extra of [2.34, 2.30, 2.24, -2.24, -2.30, -2.34]) zs.push(extra);
  // Cabin band gets double density: the rubber aperture seal is one face wide, so the
  // station pitch here IS the seal width. At the base pitch it would be a 6 cm strip of
  // gaffer tape around the screen; halved, it is a believable 3 cm gasket.
  for (let z = -1.86; z <= 1.22; z += 0.0305) zs.push(z);
  zs.sort((a, b) => a - b);
  const out = [zs[0]];
  for (let i = 1; i < zs.length; i++) if (zs[i] - out[out.length - 1] > 0.004) out.push(zs[i]);

  // Shutline stations go in after the dedupe pass, because the whole point of them is to
  // sit 2 mm apart: a channel lip only reads as a lip if the mesh actually turns there.
  const seam = [];
  for (const s of SEAM_Z) for (const o of SEAM_OFFS) { seam.push(s.z - o); if (o) seam.push(s.z + o); }
  for (const s of SEAM_L) for (const o of [-0.045, -0.02, 0.02, 0.045]) { seam.push(s.z0 + o); seam.push(s.z1 + o); }
  const all = out.concat(seam.filter((z) => z > -L && z < L)).sort((a, b) => a - b);
  const fin = [all[0]];
  for (let i = 1; i < all.length; i++) if (all[i] - fin[fin.length - 1] > 0.0012) fin.push(all[i]);
  return fin;
}

/** Which of the three body materials a band belongs to. 0 paint, 1 glass, 2 dark. */
function bandMaterial(band, z, slope) {
  if (band === TAG.UNDER || band === TAG.WELL) return 2;
  if (band === TAG.GREEN) {
    // side glass, minus the A / B / C pillars
    if (z > 0.74 || z < -1.30) return 0;
    if (z > -0.32 && z < -0.14) return 0;      // B-pillar
    return 1;
  }
  if (band === TAG.ROOF) {
    // any steeply raked top surface inside the cabin is screen glass
    if (z < 1.02 && z > -1.62 && Math.abs(slope) > 0.30 && yTop(z) > 1.02) return 1;
    return 0;
  }
  return 0;
}

function buildBody() {
  const zs = stationZs();
  const rings = zs.map((z) => ringFrom(halfSection(z)));
  const N = rings[0].length;
  const S = zs.length;

  const pos = new Float32Array(S * N * 3);
  const uv = new Float32Array(S * N * 2);
  for (let i = 0; i < S; i++) {
    const v = (zs[i] + L) / (2 * L);
    for (let j = 0; j < N; j++) {
      const q = rings[i][j], k = i * N + j;
      pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = zs[i];
      uv[k * 2] = q.u; uv[k * 2 + 1] = v;
    }
  }

  // Face classification, then a one-cell erosion of the glass regions. The eroded core
  // becomes a separate, recessed glass mesh; the ring of faces the erosion removed stays
  // on the body as the black rubber aperture seal, so every pane sits in a gasket
  // instead of melting into the roof.
  const fmat = new Int8Array((S - 1) * N).fill(-1);
  for (let i = 0; i < S - 1; i++) {
    const zc = (zs[i] + zs[i + 1]) / 2;
    const h = 0.05;
    const slope = (yTop(zc + h) - yTop(zc - h)) / (2 * h);
    for (let j = 0; j < N; j++) {
      const band = rings[i][j].band;
      if (band === -1 || band === null) continue;     // hard seam: no band, hard normals
      fmat[i * N + j] = bandMaterial(band, zc, slope);
    }
  }
  const fm = (i, j) => (i < 0 || i >= S - 1 ? -1 : fmat[i * N + ((j % N) + N) % N]);

  const idx = [[], [], []];       // 0 paint, 1 rubber seal, 2 dark
  const gidx = [];                // recessed glass
  const V = (i, j) => i * N + (j % N);
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < N; j++) {
      const m = fmat[i * N + j];
      if (m < 0) continue;
      const a = V(i, j), b = V(i, j + 1), c = V(i + 1, j), d = V(i + 1, j + 1);
      if (m === 1) {
        const core = fm(i - 1, j) === 1 && fm(i + 1, j) === 1 && fm(i, j - 1) === 1 && fm(i, j + 1) === 1;
        (core ? gidx : idx[1]).push(a, b, c, b, d, c);
      } else {
        idx[m].push(a, b, c, b, d, c);
      }
    }
  }

  // end caps, fanned to the section centroid (nose bumper face and tail panel)
  const capPos = [], capUv = [];
  const capBase = S * N;
  const addCap = (i, front) => {
    const ring = rings[i];
    let cy = 0;
    for (const q of ring) cy += q.y;
    cy /= ring.length;
    const c = capBase + capPos.length / 3;
    capPos.push(0, cy, zs[i]); capUv.push(0.5, front ? 1 : 0);
    for (let j = 0; j < N; j++) {
      const a = V(i, j), b = V(i, j + 1);
      if (front) idx[0].push(c, a, b); else idx[0].push(c, b, a);
    }
  };
  addCap(0, false);
  addCap(S - 1, true);

  const allPos = new Float32Array(pos.length + capPos.length);
  allPos.set(pos); allPos.set(capPos, pos.length);
  const allUv = new Float32Array(uv.length + capUv.length);
  allUv.set(uv); allUv.set(capUv, uv.length);

  const fixNormals = (geo) => {
    // a hard seam leaves no face touching a duplicated column on one side only — guard NaNs
    const nr = geo.attributes.normal.array;
    for (let i = 0; i < nr.length; i += 3) {
      if (!Number.isFinite(nr[i]) || (nr[i] === 0 && nr[i + 1] === 0 && nr[i + 2] === 0)) {
        nr[i] = 0; nr[i + 1] = 1; nr[i + 2] = 0;
      }
    }
    geo.attributes.normal.needsUpdate = true;
  };

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(allUv, 2));

  // pass 1: the un-cut skin, purely to get a clean surface normal to sink the channels along
  g.setIndex([...idx[0], ...idx[1], ...idx[2], ...gidx]);
  g.computeVertexNormals();
  const skinN = g.attributes.normal.array;
  // Cavity mask, one scalar per vertex, written at the same moment the channel is cut so
  // it can never drift out of register with the geometry: 1 on the channel floor, ~0.25
  // on the wall, 0 on the raised lip and on undisturbed skin. The paint shader multiplies
  // this into every light path, which is the whole difference between a shutline that
  // occludes and one that glows — see applyPaintShader.
  const seamAttr = new Float32Array(allPos.length / 3);
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < N; j++) {
      const q = rings[i][j], k = i * N + j;
      const a = seamAmount(zs[i], q.u, q.at, q.band);
      if (a <= 0) continue;
      seamAttr[k] = a;
      const d = a * SEAM_DEPTH;
      allPos[k * 3] -= skinN[k * 3] * d;
      allPos[k * 3 + 1] -= skinN[k * 3 + 1] * d;
      allPos[k * 3 + 2] -= skinN[k * 3 + 2] * d;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.setAttribute('seam', new THREE.BufferAttribute(seamAttr, 1));

  // pass 2: the real body — paint, rubber seal, dark — with the channels in place
  g.setIndex([...idx[0], ...idx[1], ...idx[2]]);
  g.addGroup(0, idx[0].length, 0);
  g.addGroup(idx[0].length, idx[1].length, 1);
  g.addGroup(idx[0].length + idx[1].length, idx[2].length, 2);
  g.computeVertexNormals();
  fixNormals(g);
  g.computeBoundingSphere();

  // Glass: its own mesh, its own geometry, pushed 11 mm under the skin so the seal ring
  // above stands proud of it and the pane reads as glazing set into an aperture.
  const gg = new THREE.BufferGeometry();
  const gPos = allPos.slice();
  gg.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gg.setAttribute('uv', new THREE.BufferAttribute(allUv.slice(), 2));
  gg.setIndex(gidx.slice());
  gg.computeVertexNormals();
  const gn = gg.attributes.normal.array;
  const GLASS_INSET = 0.011;
  for (let k = 0; k < gPos.length; k += 3) {
    const nx = gn[k], ny = gn[k + 1], nz = gn[k + 2];
    if (!Number.isFinite(nx) || (nx === 0 && ny === 0 && nz === 0)) continue;
    gPos[k] -= nx * GLASS_INSET; gPos[k + 1] -= ny * GLASS_INSET; gPos[k + 2] -= nz * GLASS_INSET;
  }
  gg.attributes.position.needsUpdate = true;
  gg.computeVertexNormals();
  fixNormals(gg);
  gg.computeBoundingSphere();

  return { body: g, glass: gg };
}

// ===========================================================================
// 3. procedural textures
// ===========================================================================

/**
 * Metallic flake, as the TWO textures a flake basecoat actually needs.
 *
 * Automotive basecoat is not a metal. It is a PIGMENTED DIELECTRIC BINDER loaded with
 * aluminium flake: roughly half the projected area is a mirror-smooth metal facet at some
 * random tilt, and the rest is coloured resin that scatters diffusely. Modelling the whole
 * layer as one `metalness: 0.90` surface — which is what r6 did — zeroes the diffuse lobe,
 * and with it the only light path that does not have to come back out of a narrow specular
 * cone. That is why our mid-flank collapsed to L 9.5 between the shoulder highlight and the
 * rocker while reference `car-paint-closeup-03`'s equivalent column never drops below ~64:
 * the reference is showing binder scatter, and we had deleted the binder.
 *
 * So the flake is now a two-population field, and both populations come out of ONE cell
 * loop so the maps are in exact register (a facet that is tilted is the same facet that is
 * metal and smooth — they cannot drift apart):
 *
 *   normal — per-cell facet tilt. Only flake cells tilt; binder cells stay near flat, so
 *            the perturbation is now sparse sparkle rather than a wobble over the whole
 *            panel.
 *   matx   — G = roughness multiplier, B = metalness multiplier. three.js reads
 *            `roughnessMap.g` and `metalnessMap.b`, so a single texture bound to both
 *            slots drives both channels with no extra sampler and no shader edit.
 *            Flake cells go metal-and-smooth, binder cells go dielectric-and-matte.
 *
 * The material's scalar `metalness`/`roughness` are therefore the FLAKE's values, and the
 * area average the panel actually shows is much lower — see the paintMat comment.
 *
 * Deliberately faceted (nearest-cell, no interpolation) — smooth noise reads as orange
 * peel, not as flake. Mipmaps are still generated: at distance the map averages to the
 * area-mean metalness and roughness, which is exactly the correct far-field answer.
 */
// Per-cell flake loading, 0 = pure binder .. 1 = solid aluminium facet. CONTINUOUS, and
// deliberately low-amplitude. A hard binary metal/binder split was tried first and is
// wrong for two reasons: a flake cell is 4 texels, the body UV magnifies the map on the
// door, so the split lands at ~6 screen px; and a metal facet at dusk reflects dark tarmac
// rather than a highlight, so the "sparkle" came out as dark speckle over bright binder —
// red glitter, not paint. The sparkle is the NORMAL map's job (it rides the flakeGate,
// which is keyed to the radiance actually there); the material map's job is only to say
// that the layer is mostly dielectric with a metallic component, and to keep that mix
// varying so the panel is never one flat BRDF.
//
// FLAKE_RGH went 0.70 -> 0.22 for r9. At 0.70 a flake cell sat at roughness 0.43*0.70 =
// 0.30, which is not a facet, it is slightly-glossier binder: its lobe was wide enough that
// tilting its normal barely changed the radiance it collected, so the flake normal map had
// nothing to modulate and the measured "flake grain" on the flank was pure per-pixel dither
// (autocorrelation period 1.5 px, i.e. one pixel wide — flake cells are ~8 screen px at the
// closeup, so whatever was being measured was not the flake). At 0.22 -> roughness 0.095 the
// cell is an actual near-mirror aluminium facet, its tilt genuinely re-aims a narrow lobe,
// and the grain becomes real structure instead of noise.
const FLAKE_SKEW = 1.8;                       // E[cov] = 1/(1+FLAKE_SKEW)
const FLAKE_MET = 1.00, BINDER_MET = 0.58;    // multipliers on material.metalness
const FLAKE_RGH = 0.22, BINDER_RGH = 1.00;    // multipliers on material.roughness

function flakeMaps(rng, size = 512, cell = 3) {
  const cells = Math.ceil(size / cell);
  const n = cells * cells;
  const tilt = new Float32Array(n * 2);
  const cov = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.pow(rng(), FLAKE_SKEW);
    const a = rng() * Math.PI * 2;
    // most flakes lie nearly flat, a few catch the light hard; pure binder is near planar
    const r = Math.pow(rng(), 2.2) * (0.10 + 0.85 * c);
    cov[i] = c;
    tilt[i * 2] = Math.cos(a) * r;
    tilt[i * 2 + 1] = Math.sin(a) * r;
  }
  const nData = new Uint8Array(size * size * 4);
  const mData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ci = Math.min(cells - 1, (y / cell) | 0) * cells + Math.min(cells - 1, (x / cell) | 0);
      const nx = tilt[ci * 2], ny = tilt[ci * 2 + 1];
      const nz = Math.sqrt(Math.max(1e-4, 1 - nx * nx - ny * ny));
      const i = (y * size + x) * 4;
      nData[i] = (nx * 0.5 + 0.5) * 255;
      nData[i + 1] = (ny * 0.5 + 0.5) * 255;
      nData[i + 2] = nz * 255;
      nData[i + 3] = 255;
      const c = cov[ci];
      mData[i] = 255;                                                            // unused (R)
      mData[i + 1] = (BINDER_RGH + (FLAKE_RGH - BINDER_RGH) * c) * 255;          // roughnessMap.g
      mData[i + 2] = (BINDER_MET + (FLAKE_MET - BINDER_MET) * c) * 255;          // metalnessMap.b
      mData[i + 3] = 255;
    }
  }
  const mk = (data) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  // matx is a material-property field, never a colour: it must stay linear.
  const matx = mk(mData);
  matx.colorSpace = THREE.NoColorSpace;
  return { normal: mk(nData), matx };
}

/**
 * Broad, low-frequency clearcoat undulation ("orange peel") — kills the CG-perfect mirror.
 *
 * THIS IS THE POSTERIZATION FIX. The shared `normalFromHeight` helper returns a
 * `DataTexture`, and three.js defaults a DataTexture to NearestFilter with no mipmaps.
 * Point-sampling a 128 px normal map stretched over a whole door under a roughness-0.03
 * clearcoat quantises the reflected environment into flat-shaded texel blocks — that is
 * the stair-stepped banding across the flank, and it is a sampling bug, not a lighting
 * one. Here the field is built at 512 px, the 8-bit encode is triangular-dithered so no
 * two adjacent quantisation levels ever form a clean terrace, and the texture is
 * trilinear + anisotropic with mipmaps so it band-limits with distance.
 */
function encodeNormalMap(rng, size, dxdy, opts = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [dx, dy] = dxdy(x, y);
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      // triangular probability-density dither: two independent uniforms, so the
      // quantisation error is noise-shaped rather than a contour line
      const q = (v) => {
        const d = (rng() + rng() - 1.0) * 0.5;
        return clamp(Math.round((v * 0.5 + 0.5) * 255 + d), 0, 255);
      };
      data[i] = q(nx); data[i + 1] = q(ny); data[i + 2] = q(nz); data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = opts.aniso ?? 16;
  t.needsUpdate = true;
  return t;
}

function orangePeelMap(rng, size = 512) {
  const h = valueNoise2D(rng, size, 5);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  return encodeNormalMap(rng, size, (x, y) => [
    (at(x + 1, y) - at(x - 1, y)) * 1.1, (at(x, y + 1) - at(x, y - 1)) * 1.1,
  ]);
}

/**
 * Height field -> normal DataTexture from a generator function h(u,v) in 0..1.
 *
 * `opts.slopeLimit` is a SOFT ceiling on the encoded gradient magnitude, and it exists
 * because a height field authored in height units has no idea what slope its consumer can
 * represent. The encoded slope `g` becomes a surface tilt of `atan(normalScale * g)`, and
 * the reflected ray sweeps TWICE that. Past the point where that sweep exceeds the
 * material's own reflection blur kernel, the surface stops being a rippled mirror and
 * becomes a set of independent near-mirror facets, each returning a different part of the
 * probe: lamellae, i.e. brushed metal. This is the same range violation as an over-unity
 * additive colour clipping its own taper — the quantity is outside what its downstream can
 * carry, and no amount of retuning the frequency helps.
 *
 * The compression is `tanh`, not a clamp. A hard clamp flattens each crest into a plateau
 * with a slope discontinuity at its edge, and a slope discontinuity IS a facet edge — it
 * would manufacture exactly the lamella the limit is meant to remove. `tanh` is the
 * identity for |g| << L, asymptotes to L, and is C-infinity everywhere, so the crest
 * merely stops biting harder instead of being cut off.
 */
function normalFromFn(size, fn, strength, rng, opts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  const L = opts.slopeLimit || 0;
  return encodeNormalMap(rng, size, (x, y) => {
    let dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    let dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    if (L > 0) {
      const m = Math.hypot(dx, dy);
      if (m > 1e-9) {
        const s = (L * Math.tanh(m / L)) / m;
        dx *= s; dy *= s;
      }
    }
    return [dx, dy];
  }, opts);
}

/**
 * Livery. Drawn straight into the body's (u, v) parameter space: u is the fixed
 * cross-section allocation above, v is normalised z. Returns an RGBA canvas whose
 * alpha is the decal coverage — it is applied on a shell that shares the body
 * geometry and the body's clearcoat, so the specular sweep crosses every decal
 * boundary unbroken.
 */
function makeLivery() {
  const W = 2048, H = 1024;
  const { c, ctx: g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);

  const GRAPHITE = '#141821';
  const WHITE = '#eef2f7';
  const SMOKE = 'rgba(20,24,33,0.55)';

  // (v = along the car, 0 rear .. 1 front) (u = around the section)
  const X = (u) => u * W;
  const Y = (v) => (1 - v) * H;

  function side(mirror) {
    const M = (u) => (mirror ? 1 - u : u);
    const P = (v, u) => [X(M(u)), Y(v)];
    const path = (pts) => {
      g.beginPath();
      g.moveTo(...P(pts[0][0], pts[0][1]));
      for (let i = 1; i < pts.length; i++) g.lineTo(...P(pts[i][0], pts[i][1]));
      g.closePath();
    };

    // main graphic: a hard-edged wedge sweeping up from the rocker to the rear shoulder
    g.fillStyle = GRAPHITE;
    path([
      [-0.02, U_FLANK - 0.01], [-0.02, U_BELT + 0.02], [0.30, U_BELT + 0.01],
      [0.46, U_CREASE - 0.012], [0.60, U_FLANK + 0.052], [0.66, U_FLANK - 0.01],
    ]);
    g.fill();

    // white accent following the leading edge of the wedge
    g.strokeStyle = WHITE;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(...P(0.30, U_BELT + 0.012));
    g.lineTo(...P(0.46, U_CREASE - 0.010));
    g.lineTo(...P(0.605, U_FLANK + 0.054));
    g.lineTo(...P(0.665, U_FLANK - 0.01));
    g.stroke();

    // a second thinner spear ahead of it
    g.fillStyle = WHITE;
    path([
      [0.50, U_FLANK + 0.016], [0.74, U_CREASE - 0.030], [0.80, U_CREASE - 0.030],
      [0.60, U_FLANK + 0.014],
    ]);
    g.fill();

    // pinstripe riding just under the shoulder crease, full length
    g.strokeStyle = 'rgba(238,242,247,0.85)';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(...P(-0.02, U_CREASE - 0.006));
    g.lineTo(...P(1.02, U_CREASE - 0.006));
    g.stroke();

    // door number roundel
    const [cx, cy] = P(0.20, (U_FLANK + U_CREASE) * 0.5 + 0.012);
    g.save();
    g.translate(cx, cy);
    g.fillStyle = WHITE;
    g.beginPath(); g.ellipse(0, 0, 58, 82, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = GRAPHITE;
    g.font = 'bold 108px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.rotate(-Math.PI / 2); g.fillText('07', 0, 2); g.restore();
    g.restore();

    // sponsor text along the rocker
    g.save();
    const [tx, ty] = P(0.52, U_FLANK + 0.020);
    g.translate(tx, ty); g.rotate(-Math.PI / 2);
    g.fillStyle = 'rgba(238,242,247,0.92)';
    g.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('G A U N T L E T', 0, 0);
    g.restore();

    // smoked band along the rocker itself
    g.fillStyle = SMOKE;
    path([[-0.02, U_FLANK - 0.012], [1.02, U_FLANK - 0.012], [1.02, U_FLANK + 0.012], [-0.02, U_FLANK + 0.012]]);
    g.fill();
  }

  side(false);
  side(true);

  // twin stripes over hood -> roof -> deck (glass regions are simply not part of the
  // paint material group, so the stripe reappears on the far side of the screen)
  for (const u of [0.4655, 0.5345]) {
    g.fillStyle = GRAPHITE;
    g.fillRect(X(u) - 26, 0, 52, H);
    g.fillStyle = 'rgba(238,242,247,0.9)';
    g.fillRect(X(u) - 32, 0, 5, H);
    g.fillRect(X(u) + 27, 0, 5, H);
  }

  const t = canvasTexture(c, { srgb: true, aniso: 16, wrap: THREE.ClampToEdgeWrapping });
  return t;
}

/** Windscreen grime: fine wiper-arc streaks and a couple of smudges, as a roughness map. */
function makeGrime(rng) {
  const S = 512;
  const { c, ctx: g } = makeCanvas(S, S);
  g.fillStyle = '#0a0a0a';
  g.fillRect(0, 0, S, S);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S;
    const w = 1 + rng() * 2.5, h = 30 + rng() * 200;
    const v = 26 + Math.floor(rng() * 44);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save();
    g.translate(x, y);
    g.rotate((rng() - 0.5) * 0.55);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
  for (let i = 0; i < 14; i++) {
    const x = rng() * S, y = rng() * S, r = 20 + rng() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(70,70,70,0.5)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  return canvasTexture(c, { repeat: [1, 1], wrap: THREE.RepeatWrapping });
}

/**
 * Roller wave for the glazing.
 *
 * A perfectly flat pane is the reason our greenhouse read as one dead tint. A flat
 * quad only ever samples the few degrees of probe that its own normal points at, so
 * however hard the reflection is driven the whole pane moves together: brighter, but
 * still flat. Both references hold a dark interior AND a near-clipped sky band inside
 * a single pane, and that spread comes from the pane not being flat.
 *
 * Real tempered automotive glass is not flat either. It is bent lying on a roller
 * hearth and comes off with a shallow periodic ripple running across the travel
 * direction — roller wave, a few hundredths of a millimetre over ~250 mm. That is
 * nothing geometrically and everything optically: a fraction of a degree of normal
 * roll sweeps the reflected ray by twice that, repeatedly, so one pane picks up sky
 * band and ground band alternately. It is why a real side window shimmers in bands
 * and a game window looks like a sticker.
 *
 * ORIENTATION. The body's uv.x is the fixed cross-section allocation, so the side pane
 * lives in the 0.06-wide strip u = U_BELT..U_RAIL and uv.y runs along the car. The
 * dominant term is in u — a single crest across the pane (9 cycles over the full u
 * range is 0.54 of a cycle inside the pane), so the bright band sits high and the pane
 * goes dark below it, which is the reference read.
 *
 * r11 — THE r10 PANE WAS A REPEATING PATTERN AND THE METRIC IT SCORED ON WAS THE WRONG
 * ONE. r10 reported p05/p50/p99 and skipped p90, which is exactly where the defect was:
 * p90 137.5 against ref-03's 90.4 (52% hot) while p99 was 10% LOW, i.e. the wave's
 * bright phase was painting a tenth-plus of the pane where the reference has a thin
 * sliver. p90 is the honest handle on this material.
 *
 * Three things were wrong and all three are now fixed:
 *
 *  1. `+ at(u,v) * 0.30` inside the sine argument. PHASE modulation does not make a
 *     sine irregular — it makes it a chain of LOBES, because the crest line stops being
 *     a line and starts being a set of disconnected extrema. That is the "blobby
 *     oil-slick camo" this comment already recorded as rejected once. Amplitude
 *     modulation is what you want if you want irregularity; the crest stays one
 *     continuous line and only varies in how hard it bites.
 *  2. `at()` was a NEAREST (`Math.floor`) fetch of a 128-cell noise, and `normalFromFn`
 *     CENTRAL-DIFFERENCES its argument. Differentiating a step function puts a one-texel
 *     cliff at every noise-cell boundary, and that — not the sine — is where the
 *     hard-edged white blobs with dark bruise borders came from. All noise lookups here
 *     are bilinear now.
 *  3. Nothing decorrelated. The high-pass residual was still 0.09-correlated at lag 12 px
 *     where ref-03 is at -0.06 by lag 4, because every term varied slowly along the car,
 *     so each row of the pane was near-constant. The two fine lengthwise striation terms
 *     at the bottom of the stack are what fix that, and they are also the closest thing
 *     in this function to what ref-03's pane actually shows: soft vertical wisps over a
 *     quiet dark tint, not structure.
 *
 * MEASURED (`_paintmeas.mjs shots/car-paint-r11.png 0.547 0.677 0.352 0.417` against
 * ref-03 `0.359 0.463 0.616 0.667`): p90 139.3 -> 76.9 vs ref 90.4, p50 63.6 -> 45.8 vs
 * 51.8, specDiff 3.33 -> 4.50 vs 4.36, residual autocorrelation lag1/lag2 .444/.352 ->
 * .163/.012 vs ref .187/.041. On a GLASS-ONLY rect (`0.547 0.612 0.359 0.405` vs ref-03
 * `0.365 0.451 0.6204 0.6593`) the same move is p90 185.9 -> 82.5 against ref 84.4.
 *
 * p99 goes the other way — 211.8 -> 206 against ref-03's 226 — and that is DELIBERATE.
 * Inspecting the reference rect shows its 226 comes from the bright body edge inside the
 * crop, not from a blown sliver on the glass; ref-03's pane-only p99 is 94.4, and ours is
 * still more than twice that. Chasing p99 is what gamed r10.
 *
 * KNOWN COST, not fixed: at the near-grazing rear angle of `wet-night-asphalt` the u-band
 * crests foreshorten onto each other and the rear screen reads as bright horizontal blinds
 * — canopy pixels over L200 go 1.97% (r10) -> 6.2%, though fully-clipped pixels go DOWN
 * 0.027% -> 0.014% and `dusk-highway-chase` improves on both (4.75% -> 2.66% hot). Raising
 * the u frequency 9 -> 12 at matched slope only recovers 6.2% -> 5.7% and costs the closeup
 * (pane-only p90 82.5 -> 77.7 against ref-03's 84.4), so it was measured and rejected. The
 * real fix is probably a view-angle taper on normalScale, which is a next-round change.
 *
 * The knob that matters is frequency x amplitude x normalScale, i.e. the surface SLOPE,
 * not any one of the three — and it is NOT monotone in the measured brightness. Cutting
 * the band amplitude 1.414 -> 1.05 at one point made the pane BRIGHTER (p50 65 -> 87),
 * because a flatter pane parks every normal on the one direction the probe happens to be
 * bright in. Tune it by measurement, never by reasoning about "less slope = darker".
 */
// The pane's normalScale and the wave's slope ceiling are ONE knob and they must not be
// able to drift apart, so both live here and glassMat reads GLASS_NORMAL_SCALE.
//
// GLASS_SLOPE_LIMIT is the roughness coupling. The encoded gradient g becomes a tilt of
// atan(GLASS_NORMAL_SCALE * g) and the reflected ray sweeps twice that. The pane's clean
// roughness is 0.039 (grime base 10/255 against roughness 1.0), so its reflection blur is
// a small fraction of a degree — a literal "sweep < blur cone" bound would demand a dead
// flat pane, and r11 already measured that a flat pane goes BRIGHTER, not darker. The
// usable bound is the next kernel out: the probe's own content. The probe is a 512-px
// cube whose dominant feature is the horizon step, so the requirement is that the pane
// crosses that step ONCE, gradually, over the pane's on-screen extent rather than once
// per few pixels. 0.20 puts max tilt at atan(3.2*0.20) = 33 deg = 66 deg of ray sweep,
// which is one crossing across the closeup pane; the pre-limit maximum was |g| ~ 1.1,
// i.e. 74 deg of tilt and 148 deg of sweep repeating every 6.5 screen px, which is
// precisely the "brushed metal / venetian blinds" read.
const GLASS_NORMAL_SCALE = 3.2;
const GLASS_SLOPE_LIMIT = 0.10;

function makeGlassWave(rng) {
  const N = 128;
  const nA = valueNoise2D(rng, N, 2);
  const nF = valueNoise2D(rng, N, 4);
  // BILINEAR fetch, and this is the load-bearing detail. `normalFromFn` central-differences
  // whatever it is handed, and a `Math.floor` noise fetch is a STEP function: differentiating
  // it puts a one-texel cliff at every noise-cell boundary. That, not the sine, is what made
  // the r10 pane a chain of hard-edged white blobs with dark borders.
  const bil = (a) => (u, v) => {
    const x = u * N - 0.5, y = v * N - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const g = (xx, yy) => a[(((yy % N) + N) % N) * N + (((xx % N) + N) % N)];
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy)
      + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  };
  const amp = bil(nA), fine = bil(nF);
  return normalFromFn(512, (u, v) => (
    // Dominant roller band across the pane, AMPLITUDE-modulated. Modulating the PHASE
    // (the deleted `+ at(u,v) * 0.30`) does not make a sine irregular, it makes it a
    // string of lobes: the crest line stops being a line and becomes a chain of blobs.
    // Amplitude modulation keeps one continuous crest and only varies how hard it bites.
    Math.sin((u * 9.0 + v * 0.7
      + 0.06 * Math.sin(v * 9.0 * Math.PI * 2) + 0.04 * Math.sin(v * 21.0 * Math.PI * 2 + 1.7)
    ) * Math.PI * 2) * 2.200 * (0.45 + 0.55 * amp(u, v))
    // Slow lengthwise sag so the band is not a dead-straight extrusion down the greenhouse.
    + Math.sin((v * 3.1 + u * 4.0) * Math.PI * 2) * 0.30
    // Genuine lengthwise roller pitch (~250 mm of real glass, ~24 cycles over a 4.5 m car).
    // Secondary to the u band on purpose: run as the DOMINANT term it is the corduroy that
    // was rejected twice, but held under the band it is what breaks the crest line up.
    + Math.sin((v * 24.0 + u * 2.0) * Math.PI * 2) * 0.100 * (0.30 + 0.70 * amp(v, u))
    // Fine lengthwise striation, ~10 px on screen in the closeup. This is what makes the
    // high-pass residual DECORRELATE: with only the two low-frequency terms above, the
    // residual is still 0.09-correlated at lag 12 px (ref-03 is at -0.06 by lag 4), which
    // is the signature the r10 critic used to call the pane a repeating pattern.
    //
    // r12 — THESE TWO TERMS WERE THE LARGEST SLOPE IN THE FUNCTION, not the band. Slope
    // scales with amplitude x frequency, and at 128 cycles these carried
    // 0.128*2pi*128 = 103 height units per unit v = 0.40 of encoded gradient against the
    // band's 0.24. On screen that is a 100-deg reflected-ray sweep every 6.5 px, which is
    // the brushed-metal signature itself; in the map it is 4 texels per cycle, i.e. right
    // at the encode Nyquist, so mip filtering cannot carry it either. The frequency is
    // kept (it is what decorrelates the residual, see r11 note 3) and the amplitude is cut
    // ~9x so the striation is a wisp on the glass instead of a machined flute.
    + (Math.sin((v * 128.0 + u * 9.0) * Math.PI * 2) * 0.014
      + Math.sin((v * 83.0 - u * 5.0 + 2.1) * Math.PI * 2) * 0.011) * (0.20 + 0.80 * fine(u, v))
  ), 1.0, rng, { slopeLimit: GLASS_SLOPE_LIMIT });
}

// ===========================================================================
// 3a. box-projected local reflection probe
// ===========================================================================

/**
 * A cube map is sampled by DIRECTION alone, which is the same thing as saying every
 * texel of it is infinitely far away. That is fine for the sky and it is catastrophic
 * for the ground: a fragment on the rocker panel and a fragment on the roof both look
 * "down" along nearly the same direction, so they fetch the same texel and the tarmac
 * reflection becomes a flat wash with no horizon in it. Nothing in the paint shader can
 * fix that, because the parallax is missing before the BRDF ever runs — the reflected
 * IMAGE simply is not in the lookup.
 *
 * Box projection puts it back. We intersect the reflected ray against a coarse box that
 * stands in for the local world — floor on the road surface, walls and ceiling far
 * enough out that they only matter for the sky — and re-aim the cube lookup at the
 * point where the ray actually lands, measured from where the probe was captured. The
 * floor plane is what does the work here: it makes the reflected road slide correctly
 * across the door and the rocker as the camera moves, and it puts the body's own
 * reflection horizon (where the reflected ray stops hitting tarmac and starts hitting
 * sky) at the geometrically correct height on every panel instead of at one fixed
 * elevation. That horizon line is the whole point of the shot.
 *
 * It also does the job SSR would have done on the rocker: the probe already renders the
 * real road surface, lane paint and all, into the down face of the cube — box
 * projection is what maps it onto the actual ground plane beside the car rather than
 * onto a sphere at infinity, and unlike SSR it does not go blank when the reflected
 * road is off-screen or behind the car (which, side-on, it mostly is).
 */
const ENV_BOX = {
  uProbePos: { value: new THREE.Vector3() },
  uBoxCenter: { value: new THREE.Vector3() },
  uBoxHalf: { value: new THREE.Vector3(26, 16, 26) },
  // 0 = stock infinite cubemap, 1 = fully box-projected. Kept as a uniform so the
  // effect can be A/B'd at runtime without a recompile.
  uBoxAmount: { value: 1.0 },
};

const BOX_PROJECT_GLSL = /* glsl */`
uniform vec3 uProbePos;
uniform vec3 uBoxCenter;
uniform vec3 uBoxHalf;
uniform float uBoxAmount;
varying vec3 vBoxWorld;

vec3 boxProjectDir( vec3 dir ) {
	vec3 nd = normalize( dir );
	vec3 s = vec3( nd.x >= 0.0 ? 1.0 : -1.0, nd.y >= 0.0 ? 1.0 : -1.0, nd.z >= 0.0 ? 1.0 : -1.0 );
	// signed reciprocal with a floor on |nd| so an axis-parallel ray gives a huge
	// positive t rather than a division by zero
	vec3 denom = max( abs( nd ), vec3( 1e-4 ) ) * s;
	vec3 t = ( uBoxCenter + s * uBoxHalf - vBoxWorld ) / denom;
	float d = max( min( min( t.x, t.y ), t.z ), 0.0 );
	vec3 hit = vBoxWorld + nd * d;
	vec3 v = mix( nd, hit - uProbePos, uBoxAmount );
	float l = length( v );
	return l > 1e-4 ? v / l : nd;
}
`;

/**
 * Swap the box-projected direction into three's own getIBLRadiance(). The diffuse
 * lookup (getIBLIrradiance) is deliberately left alone — irradiance is a cosine-lobe
 * average over the whole hemisphere and has no parallax to correct.
 *
 * If a future three.js changes the chunk out from under us the needle simply will not
 * match and we fall back to the stock infinite-cubemap path rather than emitting
 * broken GLSL.
 */
const IBL_NEEDLE = 'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );';

function applyBoxProjection(shader) {
  const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment;
  if (!chunk || chunk.indexOf(IBL_NEEDLE) < 0) return false;
  const patched = chunk.replace(IBL_NEEDLE,
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * boxProjectDir( reflectVec ), roughness );');
  if (shader.fragmentShader.indexOf('#include <envmap_physical_pars_fragment>') < 0) return false;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <envmap_physical_pars_fragment>', `${BOX_PROJECT_GLSL}\n${patched}`);
  shader.vertexShader = `varying vec3 vBoxWorld;\n${shader.vertexShader}`.replace(
    '#include <project_vertex>',
    '#include <project_vertex>\n\tvBoxWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  Object.assign(shader.uniforms, ENV_BOX);
  return true;
}

/** Give a plain material the box-projected probe, preserving any existing hook. */
function boxProjected(mat, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    applyBoxProjection(shader);
  };
  // Must not delegate to the stock key here: Material.customProgramCacheKey reads
  // `this.onBeforeCompile`, and an unbound call would blow up on `this` being undefined.
  mat.customProgramCacheKey = () => `boxproj:${key}`;
  return mat;
}

// ===========================================================================
// 3b. two-lobe car paint shader
// ===========================================================================

/**
 * Real automotive paint is two stacked lobes, and MeshPhysicalMaterial already gives us
 * both: a tinted metallic basecoat (whose F0 *is* the paint colour, so it can only ever
 * reflect red light on a red car) and a thin dielectric clearcoat with a Schlick Fresnel
 * that starts at F0 = 0.04 head-on and climbs to 1.0 at grazing. The clearcoat lobe is
 * the achromatic one — it is what puts the bright sky band on the upper flank and the
 * dark ground band on the rocker, and it is what makes the rocker go dark while the
 * shoulder crease gets a razor specular line.
 *
 * What three.js does *not* do is tie the metallic flake to that reflection. Left alone,
 * the flake normal map perturbs the base lobe everywhere at equal strength, so it fires
 * off the punctual sun even on panels that are reflecting nothing, and it aliases into
 * per-pixel sensor noise at distance because a flake cell is far below a pixel.
 *
 * This patch fixes both:
 *   - the flake perturbation is scaled by the prefiltered radiance the clearcoat actually
 *     sees in its mirror direction, weighted by that same Schlick term, so sparkle only
 *     exists where there is a real reflection to sparkle *in*;
 *   - the flake fetch is mip-biased by view distance, so the cell grid resolves into a
 *     smooth sheen instead of boiling.
 *
 * Both are injected into `normal_fragment_maps`, which runs after `normal_fragment_begin`
 * has built `tbn` and before the lighting accumulates — the earliest point where the
 * perturbed normal is still ours to write and `getIBLRadiance()` is already declared.
 */
function applyPaintShader(mat, { flakeMip = 0.55, flakeFloor = 0.05, matxFloor = 0.0, matxLo = 1.2, matxHi = 3.2, normFloor = 1.0, gain = 6.0, ccGain = 1.0, scatter = 0.0 } = {}) {
  // clearcoat IBL gain lives in a uniform, not in the generated source, so it can be
  // rebalanced against the basecoat without a shader recompile
  mat.userData.ccGainU = { value: ccGain };
  mat.userData.scatterU = { value: scatter };
  mat.onBeforeCompile = (shader) => {
    // Parallax-correct the probe first, so every getIBLRadiance() below — including the
    // flake gate's own lookup — reads the box-projected environment.
    applyBoxProjection(shader);
    shader.uniforms.uCcGain = mat.userData.ccGainU;
    shader.uniforms.uFlakeScatter = mat.userData.scatterU;

    // ---- panel-gap cavity ------------------------------------------------
    // The `seam` attribute is the channel mask cut into the loft (1 = channel floor,
    // ~0.25 = wall, 0 = lip and open skin). Geometry alone does NOT make a gap read as a
    // gap: the channel walls tilt by ~40 deg, which under a prefiltered radiance probe
    // just points them at a *different* part of the sky, and a 2.9 cm slot is far too
    // narrow to self-shadow in a shadow map. So the trench came out brighter than the
    // panel either side of it — a decal stripe, not a pressing. What is missing is the
    // occlusion: a real 11 mm slot sees almost no sky and almost no sun, and its walls
    // are unpolished edge paint rather than clearcoat.
    shader.vertexShader = `attribute float seam;\nvarying float vSeam;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSeam = seam;');
    shader.fragmentShader = `varying float vSeam;\nuniform float uCcGain;\nuniform float uFlakeScatter;\n${shader.fragmentShader}`;

    // albedo: the trench floor drops to a third of the panel's albedo (~0.24 linear on the
    // stock red, inside the 0.2-0.35 an AO trench should sit at), and its metalness goes
    // with it, because the F0 of a metallic basecoat is what was making the slot reflect.
    // The lip band (vSeam below ~0.10) is deliberately untouched so the raised edge keeps
    // the thin specular sliver that says "two separate pressings".
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */`
#include <map_fragment>
	// ---- aluminium broadband backscatter -------------------------------------
	// The material colour is a pigment, and a pure one: 0xd8420f decodes to linear
	// (0.68, 0.056, 0.006),
	// i.e. B/R = 0.008. Nothing you can paint a car with is that spectrally pure. A metallic
	// basecoat is a two-constant Kubelka-Munk layer — the pigment ABSORBS selectively, but
	// the aluminium flake suspended in it SCATTERS achromatically, and light that bounces
	// off flake and back out without ever meeting a pigment particle leaves the layer white.
	// That neutral term is why a real red car's shadow side reads desaturated grey-red at
	// sat 0.4-0.6 rather than the sat 0.73 candy we were rendering, and it is a second,
	// view-independent floor under the diffuse lobe.
	//
	// It is added to the albedo, not to the radiance: this invents no light, it corrects a
	// reflectance. It also lands on the metal lobe's F0, which is correct and was wrong
	// before — three.js makes a metal's F0 the base colour, but the specular F0 of metallic
	// paint is ALUMINIUM's, which is neutral ~0.91, not the pigment's.
	diffuseColor.rgb += vec3( uFlakeScatter );

	float seamCav = smoothstep( 0.10, 0.64, clamp( vSeam, 0.0, 1.0 ) );
	diffuseColor.rgb *= mix( 1.0, 0.34, seamCav );
`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.92, seamCav );');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix( metalnessFactor, 0.04, seamCav );');
    // no clearcoat inside a gap — the lacquer breaks at the panel edge, and leaving a
    // near-mirror lobe down there is the single loudest source of the bright line
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      /* glsl */`
#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
	material.clearcoat = mix( material.clearcoat, 0.04, seamCav );
	material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.62, seamCav );
#endif
`);
    // and finally the cavity term itself, applied to every accumulated light path —
    // direct sun, IBL diffuse, IBL specular and both clearcoat lobes. Multiplicative and
    // never additive, so the seam channel can only ever subtract light.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      /* glsl */`
#include <aomap_fragment>
	{
		float seamAO = mix( 1.0, 0.14, seamCav );
		reflectedLight.directDiffuse *= seamAO;
		reflectedLight.directSpecular *= seamAO;
		reflectedLight.indirectDiffuse *= seamAO;
		reflectedLight.indirectSpecular *= seamAO;
		#ifdef USE_CLEARCOAT
			clearcoatSpecularDirect *= seamAO;
			clearcoatSpecularIndirect *= seamAO;
		#endif
	}
`);

    // The clearcoat is the only achromatic lobe on a saturated colour, so it alone decides
    // how much of the reflected horizon survives onto a red panel. envMapIntensity cannot
    // be used for that — it would drag the tinted basecoat up with it and blow the paint
    // out — so the clearcoat radiance gets its own gain.
    // `clearcoatRadiance` is zeroed in lights_fragment_begin and only lights_fragment_maps
    // ever adds to it, so scaling it straight after that include is exactly a gain on the
    // clearcoat's IBL lobe and nothing else.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_maps>',
      /* glsl */`
#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	// Ordered-plus-hash dither on the indirect specular. A near-mirror lobe over a smooth
	// panel produces a reflection that changes by well under one 8-bit code per pixel, and
	// any 8-bit stage downstream will then quantise it into visible terraces across the
	// door. A sub-LSB, zero-mean perturbation applied *before* those stages turns the
	// terrace edge into noise the eye integrates away.
	{
		vec2 dfc = gl_FragCoord.xy;
		float d0 = fract( sin( dot( dfc, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
		float d1 = fract( sin( dot( dfc + 17.0, vec2( 39.3468, 11.135 ) ) ) * 24634.6345 );
		float tri = ( d0 + d1 - 1.0 ) * 0.0075;
		radiance *= 1.0 + tri;
		#if defined( USE_CLEARCOAT )
			clearcoatRadiance *= uCcGain * ( 1.0 + tri );
		#endif
	}
#endif
`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      /* glsl */`
	#if defined( USE_NORMALMAP_TANGENTSPACE )

		vec3 paintV = normalize( vViewPosition );

		// distance mip bias — a flake cell is sub-pixel long before the car is far away
		float paintDist = length( vViewPosition );
		float flakeBias = clamp( log2( 1.0 + paintDist * ${flakeMip.toFixed(3)} ), 0.0, 7.0 );

		// gate: Schlick clearcoat Fresnel (0.04 -> 1.0 at grazing) times the prefiltered
		// radiance the near-mirror clearcoat lobe is reflecting at this fragment
		float flakeGate = 1.0;

		#ifdef ENVMAP_TYPE_CUBE_UV

			vec3 ccRadiance = getIBLRadiance( paintV, nonPerturbedNormal, 0.05 );
			float ccLum = dot( ccRadiance, vec3( 0.2126, 0.7152, 0.0722 ) );
			float ccFresnel = 0.04 + 0.96 * pow( clamp( 1.0 - dot( nonPerturbedNormal, paintV ), 0.0, 1.0 ), 5.0 );
			float ccLit = ccFresnel * ccLum * ${gain.toFixed(3)};
			// saturating response: a blown sky must not turn the flake into white noise
			flakeGate = mix( ${flakeFloor.toFixed(3)}, 1.0, ccLit / ( 1.0 + ccLit ) );

		#endif

		// Material-map gate. It exists because the two maps fail differently when they are
		// ungated. An ungated NORMAL map only re-aims a lobe: in a dim spot a tilted facet
		// collects almost the same dim radiance, so the error is small and a 0.50 floor is
		// safe. An ungated MATERIAL map changes the BRDF itself — a flake cell at roughness
		// 0.43 * 0.22 = 0.095 is a near-mirror whose radiance is set by whatever the env
		// happens to hold in one direction, so it goes bright where the env is bright and
		// DARK where it is not, with no reference to how lit the panel is. That is a
		// lighting-independent contrast amplifier, and it is what pinned the lit/shadow
		// flake-coupling ratio at 1.08 (ref-04 is 1.58) and made a shadowed rocker pepper
		// exactly as hard as a lit wheel arch.
		//
		// It does NOT ride ccResp. Measured: gating matx on ccResp INVERTS the ratio to
		// 0.73 (hi 4.72 -> 2.63, sh 4.31 -> 3.58 on the two brief regions). ccResp is
		// Schlick clearcoat Fresnel times probe radiance, and the Fresnel term dominates
		// it, so ccResp is really a grazing-angle field, not a lit field: the rocker is
		// seen edge-on and scores HIGH, the near-face-on wheel-arch highlight scores LOW.
		// It is the right gate for the normal map (a facet only sparkles through the
		// lacquer's Fresnel) and the wrong one for the BRDF swap.
		//
		// Nor does a pure IRRADIANCE gate work, and that one is worth writing down because
		// it looks right and is not. Measured: normalising getIBLIrradiance(N) against the
		// probe's brightest direction moved the ratio 1.100 -> 1.080, i.e. nothing, and the
		// 3x crop of the wheel arch is pixel-for-pixel unchanged. The reason is geometric:
		// the lit wheel-arch highlight and the shadowed rocker sit on the SAME door panel
		// with nearly the SAME normal. Irradiance is a function of the normal only, so it
		// cannot tell them apart at all. What separates them is where the panel is AIMED —
		// the arch mirrors a bright patch of sky, the rocker mirrors dark tarmac.
		//
		// So the driver is the reflected RADIANCE the near-mirror lobe is collecting,
		// ccLum, which is already computed above — it is only the ccFresnel factor beside
		// it that has to go. And it is normalised against this fragment's own hemispherical
		// mean radiance (irradiance / PI), so the gate asks a dimensionless question with
		// no tuned gain: "is the direction this facet mirrors brighter than average here?"
		// Above ~2x average -> full flake, below -> pure binder. That is also exactly the
		// asymmetry the reference shows: ref-04's fender has a few bright specks and NO
		// dark ones, because a flake facet aimed at something dark is not a dark facet, it
		// is simply indistinguishable from the binder around it.
		float matxGate = 1.0;

		#ifdef ENVMAP_TYPE_CUBE_UV

			float irrMean = dot( getIBLIrradiance( nonPerturbedNormal ), vec3( 0.2126, 0.7152, 0.0722 ) ) * RECIPROCAL_PI;
			// smoothstep, not a linear clamp. Measured with a step()-encoded debug render
			// (three thresholds packed into RGB so the output-pass grade cannot distort a
			// binary): of the paint pixels in the brief's two regions, the fraction with
			// mirror-radiance-over-hemisphere-mean above 2.5 is 64% in the lit wheel arch
			// and 20% in the shadowed rocker. The two populations OVERLAP — the separation
			// is in the fraction above threshold, not in a clean gap — so a linear ramp
			// normalised by one reference value cannot split them: at matxRef 2.0 both
			// patches sat on the clamp ceiling and the gate was identically 1.0 in each,
			// which is why that build measured 1.100 -> 1.080, i.e. nothing.
			float litResp = smoothstep( ${matxLo.toFixed(3)}, ${matxHi.toFixed(3)}, ccLum / max( irrMean, 1e-4 ) );
			matxGate = mix( ${matxFloor.toFixed(3)}, 1.0, litResp );

			// And the NORMAL map's gate takes the same coupling as a second factor. Gating
			// the material map alone drops both patches by about the same 20% (measured:
			// hi 4.74 -> 3.80, sh 4.42 -> 3.57, ratio 1.072 -> 1.064), because once the
			// BRDF swap is gated the residual grain is the flake NORMAL map's, and that
			// rides flakeGate, which is the same Fresnel-dominated grazing field. Sparkle
			// amplitude has to scale with the radiance a facet is actually re-aiming, not
			// only with the lacquer's Fresnel weight, so flakeGate is multiplied by the
			// same dimensionless term with its own (higher) floor.
			flakeGate *= mix( ${normFloor.toFixed(3)}, 1.0, litResp );

		#endif

		// Direct sun is the other thing flake sparkles in, and the IBL gate above cannot
		// see it: a panel can be square-on to a low sun and still be reflecting a dim
		// patch of environment, which is precisely the case in boost-blur-01 where the
		// orange metallic fires hard off the sun while the rest of the body is soft. So
		// widen the gate inside the sun's specular lobe only — a tight power so it is a
		// band across the panel, not a global brightening — and let it push past 1.0 so
		// the flake facets actually catch, which is what "sparkle" is.
		#if NUM_DIR_LIGHTS > 0
			vec3 sunH = normalize( directionalLights[ 0 ].direction + paintV );
			float sunLobe = pow( clamp( dot( sunH, nonPerturbedNormal ), 0.0, 1.0 ), 20.0 );
			float sunLum = dot( directionalLights[ 0 ].color, vec3( 0.2126, 0.7152, 0.0722 ) );
			// fade the extra sparkle out with distance on the same curve as the mip bias,
			// otherwise it aliases into sensor noise once a flake cell goes sub-pixel
			float sunGate = sunLobe * clamp( sunLum, 0.0, 2.0 ) * 0.55 * exp2( -flakeBias );
			flakeGate += sunGate;
			// The matx gate may NOT push past 1.0 the way the normal gate does. mix() past
			// its endpoint extrapolates, and the endpoints here are the physical limits of
			// the two consumers: metalness saturates at 1.0 and roughness at 0.0, so any
			// overshoot is a quantity outside the range metalnessmap/roughnessmap_fragment
			// can represent. Sun light therefore only lets a cell reach full flake sooner.
			matxGate = min( 1.0, matxGate + sunGate );
		#endif

		// Re-derive roughnessFactor / metalnessFactor with the gate folded in. Stock
		// three.js already multiplied them by this texture in <roughnessmap_fragment> and
		// <metalnessmap_fragment>, which run before this chunk; overwriting is the only
		// way to gate them without forking those two chunks. roughness / metalness are
		// the material's scalar uniforms and are the FLAKE's values, so mix()ing the
		// sampled multiplier back toward the binder multiplier is exactly "how much of a
		// flake is this cell allowed to be here". The mip stays auto-LOD, matching the
		// stock chunks, so this A/B isolates the gate and nothing else.
		// three.js reads roughnessMap.g and metalnessMap.b; both slots hold this texture.
		#if defined( USE_ROUGHNESSMAP ) && defined( USE_METALNESSMAP )
			vec3 matxTexel = texture2D( roughnessMap, vRoughnessMapUv ).rgb;
			roughnessFactor = roughness * mix( ${BINDER_RGH.toFixed(3)}, matxTexel.g, matxGate );
			metalnessFactor = metalness * mix( ${BINDER_MET.toFixed(3)}, matxTexel.b, matxGate );
		#endif

		vec3 mapN = texture2D( normalMap, vNormalMapUv, flakeBias ).xyz * 2.0 - 1.0;
		mapN.xy *= normalScale * flakeGate;
		// A flake texel whose encoded Z sits exactly on 0.5 decodes to a zero vector, and
		// once the XY has been scaled down normalize() of that is a NaN — which does not
		// stay local: it survives tone mapping and then smears across the whole bloom mip
		// pyramid as a black rectangle. Floor the Z so the perturbed normal can never
		// degenerate.
		mapN.z = max( mapN.z, 1e-3 );

		normal = normalize( tbn * mapN );

	#else

		#include <normal_fragment_maps>

	#endif
`);

    // ---- clearcoat orange peel, grazing only -----------------------------
    // Orange peel is a long-wavelength ripple frozen into the lacquer. Head-on you do not
    // see it, because the ripple slope is a couple of degrees and the reflection it
    // distorts is only 4% of what you are looking at. At a grazing angle you see nothing
    // BUT the reflection, the same slope now sweeps the mirror direction across many
    // degrees of environment, and the highlight visibly ripples — that is why every real
    // car shows peel down the flank and none across the bonnet you are standing over.
    // A flat clearcoatNormalScale cannot express that, so ramp it on the view angle.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clearcoat_normal_fragment_maps>',
      /* glsl */`
#ifdef USE_CLEARCOAT_NORMALMAP

	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	float ccGraze = 1.0 + 5.0 * pow( clamp( 1.0 - dot( nonPerturbedNormal, normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
	clearcoatMapN.xy *= clearcoatNormalScale * ccGraze;
	clearcoatMapN.z = max( clearcoatMapN.z, 1e-3 );
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );

#endif
`);
  };
  // materials that compile to different programs must not share a cache key
  mat.customProgramCacheKey = () => `carpaint:${flakeMip}:${flakeFloor}:${matxFloor}:${matxLo}:${matxHi}:${normFloor}:${gain}:${ccGain}`;
  return mat;
}

// ===========================================================================
// 4. wheels
// ===========================================================================

/**
 * Give a geometry a flat zero `seam` attribute. The paint shader reads `seam` per vertex,
 * and while an unbound attribute would default to 0 anyway, doing it explicitly keeps the
 * bookkeeping honest for the small paint-coloured parts (roof rail, ducktail, mirror caps)
 * that have no shutlines of their own.
 */
function noSeam(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute('seam', new THREE.BufferAttribute(new Float32Array(n), 1));
  return geo;
}

/** Lathe a profile (radius, axial) around the wheel axis. */
function lathe(profile, segs, mat) {
  const pts = profile.map(([r, a]) => new THREE.Vector2(Math.max(1e-4, r), a));
  const g = new THREE.LatheGeometry(pts, segs);
  const m = new THREE.Mesh(g, mat);
  m.rotation.z = Math.PI / 2;      // lathe axis Y -> wheel axis X
  return m;
}

function makeWheel(mats) {
  const g = new THREE.Group();
  const R = DIMS.wheelR, HW = DIMS.wheelW / 2;
  const RIM = R * 0.735;           // big-rim / low-profile stance

  // tyre: crowned tread with rounded shoulders and real sidewalls, open at the bore
  const tyre = lathe([
    [RIM, -HW * 1.00], [R * 0.86, -HW * 1.00], [R * 0.955, -HW * 0.90],
    [R * 0.995, -HW * 0.66], [R, -HW * 0.34], [R, HW * 0.34],
    [R * 0.995, HW * 0.66], [R * 0.955, HW * 0.90], [R * 0.86, HW * 1.00], [RIM, HW * 1.00],
  ], 56, mats.tyre);
  tyre.castShadow = true;
  g.add(tyre);

  // rim barrel + dished face
  const barrel = lathe([
    [RIM * 0.995, -HW * 0.98], [RIM * 0.995, HW * 0.92], [RIM * 0.92, HW * 0.98],
  ], 48, mats.rim);
  g.add(barrel);

  // dark cavity behind the spokes so the wheel reads as open, not as a disc
  const cavity = lathe([[0, HW * 0.30], [RIM * 0.90, HW * 0.30]], 32, mats.wheelDark);
  g.add(cavity);

  // polished outer lip — a torus so its UV tangent runs around the ring, which is what
  // the anisotropic BRDF stretches the highlight along
  const lipGeo = new THREE.TorusGeometry(RIM * 0.945, 0.019, 10, 64);
  lipGeo.computeTangents();
  const lip = new THREE.Mesh(lipGeo, mats.lip);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = HW * 0.93;
  g.add(lip);

  // spokes: tapered, dished slightly outboard
  const spokeGeo = new THREE.CylinderGeometry(0.030, 0.058, RIM * 0.90, 4, 1);
  spokeGeo.translate(0, RIM * 0.45, 0);
  for (let i = 0; i < 5; i++) {
    for (const off of [-0.055, 0.055]) {
      const sp = new THREE.Mesh(spokeGeo, mats.rim);
      const a = (i / 5) * Math.PI * 2 + off;
      sp.rotation.order = 'YXZ';
      sp.rotation.z = Math.PI / 2;
      sp.rotation.x = a;
      sp.position.x = HW * 0.72;
      sp.scale.set(0.55, 1, 1.0);
      sp.castShadow = true;
      g.add(sp);
    }
  }

  const hub = lathe([[0, HW * 0.96], [0.055, HW * 0.96], [0.062, HW * 0.86], [0.062, HW * 0.70]], 24, mats.rim);
  g.add(hub);
  for (let i = 0; i < 5; i++) {
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 6), mats.lip);
    const a = (i / 5) * Math.PI * 2 + 0.3;
    nut.rotation.z = Math.PI / 2;
    nut.position.set(HW * 0.98, Math.sin(a) * 0.042, Math.cos(a) * 0.042);
    g.add(nut);
  }

  // brake disc + caliper, visible through the spokes
  const disc = lathe([[0.06, 0.012], [RIM * 0.82, 0.012], [RIM * 0.82, -0.012], [0.06, -0.012]], 32, mats.disc);
  disc.position.x = HW * 0.18;
  g.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.16), mats.caliper);
  caliper.position.set(HW * 0.18, RIM * 0.62, -0.03);
  g.add(caliper);

  return g;
}

// ===========================================================================
// 5. assembly
// ===========================================================================

export function createCar(rng, { paint = 0xd8420f } = {}) {
  const group = new THREE.Group();
  const shell = new THREE.Group();      // everything that leans with the body
  group.add(shell);

  // ---- textures --------------------------------------------------------
  // Flake has to read as a sparkle field riding *inside* the probe reflection, not as a
  // grain overlay sitting on top of the paint — keep the repeat low enough that the cells
  // stay above the pixel grid and the perturbation gentle.
  // `flakeMatx` must carry the SAME repeat as `flake` or the metal facets stop coinciding
  // with the tilted facets and the sparkle turns into two unrelated grains beating together.
  const { normal: flake, matx: flakeMatx } = flakeMaps(rng, 512, 4);
  flake.repeat.set(8, 9);
  flakeMatx.repeat.set(8, 9);
  const peel = orangePeelMap(rng, 512);
  peel.repeat.set(5, 6);
  const liveryTex = makeLivery();
  const grime = makeGrime(rng);
  const glassWave = makeGlassWave(rng);

  const tyreNormal = normalFromFn(256, (u, v) => {
    const sidewall = v < 0.20 || v > 0.80;
    if (sidewall) {
      // fine radial ribs plus a raised lettering band
      const rib = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 60);
      const band = Math.exp(-Math.pow((Math.min(v, 1 - v) - 0.115) / 0.035, 2));
      return rib * 0.55 + band * (0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 22)) * 0.9;
    }
    // tread blocks
    const bx = Math.floor(u * 46) % 2, by = Math.floor((v - 0.2) * 6);
    return ((bx + by) % 2 ? 0.85 : 0.15) * (0.6 + 0.4 * Math.sin(u * Math.PI * 2 * 46));
  }, 1.6, rng);

  const brushed = normalFromFn(256, (u, v) => 0.5
    + 0.5 * Math.sin(u * Math.PI * 2 * 180 + v * 3.0)
    + 0.18 * Math.sin(u * Math.PI * 2 * 611), 0.5, rng);
  brushed.repeat.set(1, 1);

  // ---- materials -------------------------------------------------------
  // Two-lobe car paint. Lobe 1 is the basecoat: a pigmented dielectric binder loaded with
  // aluminium flake, so it has BOTH a coloured diffuse lobe (the binder) and a tinted
  // specular one (the flake's F0), and it is the layer the flake maps drive.
  // Lobe 2 is a thin near-mirror clearcoat (Schlick F0 0.04 rising to 1.0 at grazing)
  // which is achromatic and therefore carries the neutral part of the reflected
  // environment: the sky band, the razor line on the shoulder crease, the Fresnel rim.
  //
  // r6: the basecoat used to run at roughness 0.44. That is where the "no reflected image"
  // verdict came from, and it was NOT the clearcoat's fault. On a metalness-0.90 paint the
  // basecoat lobe is most of what you see, and at 0.44 it fetches a mip five levels down
  // the prefiltered chain — every environment feature is already averaged away before the
  // BRDF runs, so the flank can only ever be a smooth colour ramp. The clearcoat sitting on
  // top of it contributes 4% at normal incidence, far too little to redraw an image the
  // basecoat has erased. Reference `car-paint-closeup-03` is the counter-example: its
  // bright-band/dark-band split with a fast transition at the body horizon is the
  // *basecoat* reflecting, not the lacquer.
  //
  // r6 fixed that by making the basecoat a SMOOTH metal (0.90 / 0.10), and traded one
  // failure for a worse one. A metal has no diffuse lobe at all, so 100% of the panel's
  // mid-tone budget then rode a narrow specular cone; box projection, by correctly aiming
  // that cone sideways into dark dusk tarmac, DEEPENED the mid-flank hole to L 9.5 against
  // a 45-63 shoulder band — a 4.8x internal range where `car-paint-closeup-03` spans 1.5x
  // and never drops below ~64. Ours also ran oversaturated in the hole (0.81 vs 0.23-0.54),
  // which is the signature of candy lacquer over black rather than metallic paint.
  //
  // r8 splits the two layers instead of collapsing them into one metal. The scalars below
  // are the FULLY-FLAKED values; `flakeMatx` (see flakeMaps) modulates them per facet, and
  // with E[cov] = 1/(1+FLAKE_SKEW) = 0.357 the area averages the panel actually shows are
  //
  //     metalness ~ 0.27 * 0.730 = 0.20      roughness ~ 0.43 * 0.893 = 0.38
  //
  // i.e. a pigmented dielectric with a real diffuse lobe, sparkling off a sparse population
  // of near-mirror metal facets. The diffuse lobe is what restores the floor: it integrates
  // the whole hemisphere of probe irradiance, so it cannot be extinguished by a reflection
  // vector that happens to point at tarmac, and it is achromatic-weighted by the sky rather
  // than tinted by an F0, so it pulls the hole's saturation down at the same time.
  //
  // r11 — ccGain 4.5 -> 1.6, AND THIS WAS THE CAR'S GLOBAL DESATURATOR. The damage critic
  // found it from the other end: killing `paintMat.clearcoat` lifted crush-zone chroma
  // +0.174 but lifted AT-REST chroma +0.128, so it was never a crumple-lobe effect. The
  // clearcoat is the only ACHROMATIC lobe on a saturated colour, so a 4.5x gain on it is a
  // 4.5x neutral veil over the whole car, and three's clearcoat IBL already carries the
  // correct Schlick weight — the gain multiplies the head-on 4% term too, which is exactly
  // where a real lacquer contributes nothing.
  // Measured (`_px.mjs --region fender=0.09,0.21,0.50,0.62 --region door=0.432,0.526,0.435,0.52`
  // on `car-paint-closeup`): fender sat 0.455 -> 0.527, door 0.430 -> 0.519, against
  // ref-04's own red paint at sat 0.524 (`--region wingTop=0.4375,0.488,0.5625,0.600`) and
  // 0.580 (`wingSide=0.449,0.488,0.606,0.644`). Killing the clearcoat outright reaches
  // 0.582/0.587 — i.e. 1.6 recovers ~80% of the available chroma while keeping the lobe.
  // The reflected horizon and the shoulder razor line SURVIVE: the flank profile is still
  // non-monotonic (83.2 / 53.8 / 72.9 / 29.1 down a
  // `_crop.mjs shots/x.png:0.09:0.21:0.50:0.78:10` column) and the sky/ground band split
  // moves 3.18x -> 2.86x, i.e. TOWARD ref-03's 1.63x, not away from it.
  // clearcoat 1.0 / clearcoatRoughness 0.090 are unchanged — the coverage and the lobe
  // WIDTH were never the problem, only the gain sitting on top of them.
  //
  // envMapIntensity goes back UP, 1.25 -> 2.10. The 1.25 ceiling existed because a metal's
  // specular IBL *is* its whole appearance, so at roughness 0.10 an upward-facing panel
  // mirrored the midday zenith directly and the yellow `daytime-downtown` car's rear deck
  // clipped R and G before B into flat white. A metalness-0.22 basecoat cannot do that: 78%
  // of the lifted energy now arrives through a cosine-averaged diffuse term that rolls off
  // through ACES instead of a mirror, and the specular share that remains is spread over
  // roughness 0.38. Verified against `daytime-downtown` for the clip regression.
  const paintMat = applyPaintShader(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHex(paint, THREE.SRGBColorSpace),
    metalness: 0.27, roughness: 0.43,
    metalnessMap: flakeMatx, roughnessMap: flakeMatx,
    // clearcoatRoughness 0.018 -> 0.090. At 0.018 the lacquer is a mirror, and a mirror is
    // the wrong instrument for the crown that now exists in the loft: it returns the
    // environment 1:1, so the sky band arrived as a hard seam one or two pixels wide with
    // aliasing on it, and the measured highlight FWHM was 7 px against 18-22 px in both
    // side-view references. Widening the lobe to 0.090 convolves the crown's reflected
    // sweep with a lobe of comparable width, which is what turns it into the
    // soft graduated band the references show, and it costs nothing in peak gloss because
    // the crease is a geometric discontinuity rather than a roughness one.
    //
    // p1: 0.090 -> 0.20, and the same rule-4 argument one step further. What consumes this
    // number is `roughnessToMip` on the PMREM chain of the 512-px car probe. three's curve
    // below roughness 0.21 is `-2*log2(1.16*r)`, so 0.090 lands on mip 6.5 of a 9-level
    // chain — a near-mirror of the probe's RAW content. The probe's highest-contrast content
    // at this camera is the mid-ground building band's strip of lit windows: a periodic row
    // of hard-edged emissive rectangles. A mip-6.5 lobe resolves that periodicity, so the
    // whole front flank imaged it as a vertical comb of desaturated bars straight through
    // the wheel-arch highlight. 0.20 puts the lobe on mip 4.1, ~5x the solid angle, which
    // smears the window strip into the continuous sheen it should be while still being a
    // glossy lacquer (railMat's SATIN clearcoat is 0.22, so 0.20 is on the gloss side of it).
    // ISOLATED, live-override, single-variable: setting only this to 0.20 removes the comb;
    // setting it to 0.14 does not (bars still legible on the right-hand panel). See the
    // wave-p verdict for the four disproofs that got here — the comb is NOT the flake.
    clearcoat: 1.0, clearcoatRoughness: 0.20,
    clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.030, 0.030),
    // Flake normal amplitude 0.28 -> 0.95, and it needed three changes together, because on
    // its own the scale did essentially nothing (4.84% -> 5.34% grain against a 9.4-17.6%
    // reference band). The three multiplied terms that decide how far a flake facet is
    // actually tilted are `normalScale * flakeGate * (encoded cell tilt)`, and the encoded
    // tilt averages ~0.16, so at 0.28 scale and a gate sitting on its 0.05 floor the flank's
    // facets were being turned by 0.28 * 0.05 * 0.16 = 0.0022, i.e. a tenth of a degree.
    // The gate floor was the binding constraint, not the scale: a dusk flank reflects a dim
    // city, so `ccLit` is small there and the gate collapses onto its floor exactly where the
    // measurement is taken. Hence flakeFloor 0.05 -> 0.50 below, and see FLAKE_RGH for the
    // third term.
    normalMap: flake, normalScale: new THREE.Vector2(0.95, 0.95),
    iridescence: 0.08, iridescenceIOR: 1.32, iridescenceThicknessRange: [110, 420],
    envMapIntensity: 2.10,
    // flakeMip 0.55 -> 0.12. The bias exists so a sub-pixel flake cell resolves to a sheen
    // instead of boiling, and it still does — at 30 m it is 2.2 mips. But a flake cell is 4
    // texels of a 512 map stretched over the body UV, which is ~42 mm of panel and ~8 screen
    // px in the closeup, so 0.55 was spending 2.6 mips of blur at the exact distance the
    // sparkle is supposed to be visible: the roughness/metalness map (auto-LOD, mip 0) stayed
    // sharp while the normal map went smooth, so the two halves of the same facet population
    // were no longer even in register. 0.12 is ~1.3 mips at the closeup and unchanged far
    // away; checked for boiling in dusk-highway-chase and daytime-downtown.
    // matxFloor 0.00: an unlit flake cell is pure binder. See the matxGate comment in
    // applyPaintShader — the material map is the only term in the paint that changed the
    // BRDF without asking how lit the fragment was, so it was the whole of the flat 1.08
    // lit/shadow flake-coupling ratio. The floor is 0 rather than a small number because
    // the normal map still carries a 0.50 floor, so a shadowed panel keeps its facet
    // structure; what it loses is the near-mirror BRDF that turned that structure into
    // black-and-white pepper.
  }), { flakeMip: 0.12, flakeFloor: 0.50, matxFloor: 0.00, matxLo: 1.20, matxHi: 3.20, normFloor: 0.45, gain: 6.0, ccGain: 1.6, scatter: 0.10 });

  // Roof rail / A-pillar cap. Body-coloured, but NOT on the paint material: a 23 mm tube
  // carrying a roughness-0.03 clearcoat produces a continuous near-mirror bead down the
  // whole A-pillar and roof edge, and that bead was reading as bright chrome trim outlining
  // the canopy. The only continuous bright line on the car should be the shoulder crease,
  // so the rail runs a satin clearcoat on a much dimmer probe: it still catches a broken
  // sheen along the top of the door glass, but it cannot out-shine the flank.
  const railMat = boxProjected(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHex(paint, THREE.SRGBColorSpace),
    metalness: 0.55, roughness: 0.52,
    clearcoat: 0.7, clearcoatRoughness: 0.22,
    envMapIntensity: 0.85,
  }), 'rail');

  // Livery vinyl: dielectric under the same clearcoat, so gloss is matched across the
  // colour boundary and the specular sweep never breaks.
  const liveryMat = applyPaintShader(new THREE.MeshPhysicalMaterial({
    map: liveryTex, transparent: true,
    color: 0xffffff, metalness: 0.12, roughness: 0.30,
    // tracks the basecoat's clearcoatRoughness exactly (0.018 -> 0.090 -> 0.20) for the same
    // reason it tracks envMapIntensity: if the vinyl's lobe is sharper than the paint's, the
    // reflected horizon changes width as it crosses the decal edge and the decal reads as a
    // separate, glossier sticker instead of as paint under the same lacquer. This mesh draws
    // over the WHOLE body with depthWrite:false, so leaving it at 0.090 would have kept the
    // window-strip comb alive everywhere the livery covers.
    clearcoat: 1.0, clearcoatRoughness: 0.20,
    clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.030, 0.030),
    // tracks the basecoat's envMapIntensity exactly: the vinyl is already a dielectric, so
    // if the probe gain differs between them the decal reads dimmer than the paint it sits
    // on and the "gloss is independent of base colour" read in `car-paint-closeup-04` breaks.
    envMapIntensity: 2.10,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    // Gloss-matched to the basecoat: same clearcoat roughness, same probe gain, so the
    // specular sweep and the reflected horizon cross the decal boundary unbroken.
  }), { ccGain: 1.6 });
  const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });

  // Layered glass: dark tint, a near-mirror outer lobe carrying the sky, the roller
  // wave spreading that lobe across the probe, grime streaks breaking it up, and
  // partial opacity so the interior buck still reads underneath.
  //
  // NOTE on `roughness: 1.0` — it is not a flat pane of mud, and it never was. three
  // MULTIPLIES roughnessMap.g into material.roughness, and makeGrime paints a #0a0a0a
  // base (10/255 = 0.039) with streaks topping out near 70/255. The map is authored
  // NoColorSpace, so the pane's effective roughness has always been 0.039 in the clean
  // glass and ~0.27 under a wiper streak. Setting the base to 0.05-0.10 would push the
  // effective floor to 0.002-0.004 and squash the streaks to 0.01 — a harder mirror
  // with the grime layer erased, i.e. the opposite of the layered read. Keeping 1.0
  // keeps the 0.04 floor AND the 7x streak modulation on top of it.
  const glassMat = boxProjected(new THREE.MeshPhysicalMaterial({
    color: 0x080b12, metalness: 0.0, roughness: 1.0, roughnessMap: grime,
    ior: 1.50, specularIntensity: 1.0,
    // See makeGlassWave. Without it the pane samples ~2 degrees of probe and no probe
    // gain can produce range inside it — driving envMapIntensity from 1.6 to 24 moved
    // the pane from a flat L48 to a flat L80 and the in-pane std stayed at 17. The
    // wave is what converts gain into contrast instead of into brightness.
    normalMap: glassWave, normalScale: new THREE.Vector2(GLASS_NORMAL_SCALE, GLASS_NORMAL_SCALE),
    // Two stacked near-mirror lobes of the same sky was the 4.6 blown-canopy failure.
    // One strong lobe: the dielectric Fresnel base does the work, the clearcoat is
    // reduced to a thin surface sheen rather than a second full mirror.
    clearcoat: 0.4, clearcoatRoughness: 0.014,
    // Glass is a dielectric, so the base lobe only returns ~7% of the probe head-on.
    // At the old 1.6 the pane carried a few percent of a dusk sky and read as a hole.
    // The gain is high because it is fighting Fresnel, not because the probe is dim:
    // substituting a pure white metal mirror into this same pane (metalness 1,
    // roughness 0.02, no wave, gain 3) tops out at in-box p99 111, so a flat pane
    // cannot reach the reference no matter how it is driven. The gain lands above that
    // 111 ceiling because of the wave above: the crests reach probe directions and
    // punctual-sun angles a flat pane never points at.
    //
    // opacity 0.80 -> 0.70 goes with it. Alpha blending scales the pane's own output,
    // so dropping it darkens the troughs towards the interior buck while the gain
    // lifts the crests — that is the layering, and the two knobs have to move in
    // opposite directions or the pane just gets uniformly brighter.
    //
    // r11: 9.0 -> 8.2. 9.0 was set against a p99 target that turned out to be the wrong
    // handle (see makeGlassWave). Tuned on a GLASS-ONLY rect, because the rect the r10
    // critic used (`0.547 0.677 0.352 0.417`) is about a third red bodywork and moves with
    // the paint: on `0.547 0.612 0.359 0.405`, which is pane and nothing else, the r10 build
    // measured p90 185.9 against ref-03's own pane-only p90 of 84.4
    // (`reference/car-paint-closeup-03.jpg 0.365 0.451 0.6204 0.6593`) — 2.2x hot, worse
    // than the mixed rect showed. 8.2 lands 82.5.
    // This is the "let envMapIntensity come down" half of the r10 verdict — the other half,
    // cutting `normalScale` 3.2 -> ~1.2, is NOT taken: normalScale and the wave's own height
    // amplitude are the same knob, and the amplitude is where the shape lives, so the
    // reduction is spent inside makeGlassWave where it can be spent per-term.
    transparent: true, opacity: 0.70, envMapIntensity: 8.2,
    side: THREE.FrontSide, depthWrite: false,
  }), 'glass');

  // Aperture seal. The eroded ring of the glass regions renders as this: a matte EPDM
  // gasket sunk between the painted skin and the recessed pane, so the canopy has an
  // actual edge and the A-pillar reads as a pillar rather than a fade in the paint.
  const sealMat = new THREE.MeshStandardMaterial({
    color: 0x0b0c0f, metalness: 0.0, roughness: 0.72, envMapIntensity: 0.30,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x07080a, metalness: 0.15, roughness: 0.92, envMapIntensity: 0.25,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: 0.4, roughness: 0.5 });
  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0b0e, metalness: 0.35, roughness: 0.34,
    clearcoat: 0.9, clearcoatRoughness: 0.08, envMapIntensity: 1.0,
  });
  const chromeMat = boxProjected(new THREE.MeshPhysicalMaterial({
    color: 0xe4e8ee, metalness: 1.0, roughness: 0.055, envMapIntensity: 3.0,
  }), 'chrome');
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x090a0c, metalness: 0.8, roughness: 0.45 });

  const tyreMat = new THREE.MeshStandardMaterial({
    color: 0x090909, metalness: 0.0, roughness: 0.96,
    normalMap: tyreNormal, normalScale: new THREE.Vector2(0.85, 0.85),
    envMapIntensity: 0.18,
  });
  // Near-mirror alloy face...
  const rimMat = boxProjected(new THREE.MeshPhysicalMaterial({
    color: 0xc9ced6, metalness: 1.0, roughness: 0.085,
    clearcoat: 0.8, clearcoatRoughness: 0.05, envMapIntensity: 3.2,
  }), 'rim');
  // ...with a sharp anisotropic ring highlight on the polished lip, sitting directly
  // against the near-zero-specular sidewall.
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: 0xd7dde6, metalness: 1.0, roughness: 0.19,
    anisotropy: 0.95, anisotropyRotation: 0.0,
    normalMap: brushed, normalScale: new THREE.Vector2(0.20, 0.20),
    envMapIntensity: 1.5,
  });
  const wheelDarkMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.1 });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6, metalness: 1.0, roughness: 0.42,
    normalMap: brushed, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.0,
  });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb02818, metalness: 0.5, roughness: 0.42 });

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xf4f7ff, emissive: 0xdfe9ff, emissiveIntensity: 0.0, roughness: 0.10, metalness: 0.05,
  });
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xdfe8f5, metalness: 0.0, roughness: 0.03,
    clearcoat: 1.0, clearcoatRoughness: 0.01,
    transparent: true, opacity: 0.24, envMapIntensity: 2.8, depthWrite: false,
  });
  const reflectorMat = new THREE.MeshStandardMaterial({
    color: 0xf0f4fa, metalness: 1.0, roughness: 0.06, envMapIntensity: 2.4,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x4a0a0a, emissive: 0xff1a12, emissiveIntensity: 0.6, roughness: 0.22, metalness: 0.1,
  });
  // Interior buck: deliberately dim but never black. It has to stay just readable through
  // the tinted screen so the glass shows sky reflection *over* a cabin, not over a void.
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x2a303b, roughness: 0.84, metalness: 0.05, envMapIntensity: 1.2 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x343a45, roughness: 0.76, metalness: 0.02, envMapIntensity: 1.1 });

  // ---- local environment probe -------------------------------------------
  // Every car material takes its specular IBL from one cube camera sitting at the car's
  // own origin, so the reflection each panel sees is the world actually around the car:
  // sky above the horizon, tarmac and scenery below it. Binding an explicit `envMap`
  // (rather than leaning on scene.environment) means the split lands on the body's own
  // reflection horizon and we keep full control of the intensity per material.
  const envUsers = [
    paintMat, liveryMat, railMat, glassMat, sealMat, darkMat, trimMat, carbonMat, chromeMat, meshMat,
    tyreMat, rimMat, lipMat, wheelDarkMat, discMat, caliperMat,
    lensMat, reflectorMat, tailMat, headMat, interiorMat, seatMat,
  ];

  // 512 px faces: PMREM derives its roughness chain length from the cube size
  // (lodMax = log2(size)), so this is a 10-level prefiltered chain instead of 9, and the
  // roughness-0.03 clearcoat lobe lands on a mip that still has detail in it rather than
  // on the top of a short, already-blurred chain. Half-float throughout — an LDR cube
  // would clip the sun and quantise the sky gradient the flank is reflecting.
  const PROBE_RES = 512;
  const PROBE_EVERY = 6;      // frames between refreshes
  const PROBE_MOVE = 5.0;     // ...or sooner, once the car has driven this far (metres)
  const PROBE_Y = 0.95;       // eye height of the probe ≈ the shoulder-crease line

  // Local reflection box. group.position.y sits on the wheel contact plane, so the
  // floor of the box IS the road surface — that face is the one that earns its keep.
  // The walls and ceiling are pushed far enough out (26 m to the side, 32 m up) that
  // sky and skyline rays are effectively still sampled at infinity; only the ground
  // gets meaningfully re-aimed, which is exactly the parallax the body horizon needs.
  const BOX_R = 26.0;
  const BOX_H = 32.0;

  let probe = null;
  let probeAge = 1e9;
  const probeAt = new THREE.Vector3(NaN, NaN, NaN);
  const _pw = new THREE.Vector3();

  function bindEnvMap(tex) {
    for (const m of envUsers) {
      if (m.envMap === tex) continue;
      m.envMap = tex;
      m.needsUpdate = true;
    }
  }

  /** Build the probe against a renderer + scene. Safe to call twice; second call is a no-op. */
  function attachEnv(host) {
    if (probe || !host || !host.renderer || !host.scene) return !!probe;
    const cubeRT = new THREE.WebGLCubeRenderTarget(PROBE_RES, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false, depthBuffer: true,
    });
    const cubeCam = new THREE.CubeCamera(0.5, 1400, cubeRT);
    const pmrem = new THREE.PMREMGenerator(host.renderer);
    pmrem.compileCubemapShader();
    probe = { renderer: host.renderer, scene: host.scene, cubeRT, cubeCam, pmrem, envRT: null };
    probeAge = 1e9;
    return true;
  }

  /** Re-render the six faces with the car itself hidden, then PMREM into the live envMap. */
  function refreshEnv() {
    if (!probe) return;
    const { renderer, scene, cubeCam, cubeRT, pmrem } = probe;

    group.updateWorldMatrix(true, false);
    group.getWorldPosition(_pw);
    cubeCam.position.set(_pw.x, _pw.y + PROBE_Y, _pw.z);
    cubeCam.updateMatrixWorld(true);

    // The box travels with the car and its floor stays welded to the road surface.
    ENV_BOX.uProbePos.value.copy(cubeCam.position);
    ENV_BOX.uBoxCenter.value.set(_pw.x, _pw.y + BOX_H * 0.5, _pw.z);
    ENV_BOX.uBoxHalf.value.set(BOX_R, BOX_H * 0.5, BOX_R);

    // The car must not reflect itself, and the shadow map is already current from the
    // main pass — re-deriving it six times per refresh is the one thing that would make
    // this expensive.
    const wasVisible = group.visible;
    const wasAuto = renderer.shadowMap.autoUpdate;
    group.visible = false;
    renderer.shadowMap.autoUpdate = false;
    try {
      cubeCam.update(renderer, scene);
    } finally {
      group.visible = wasVisible;
      renderer.shadowMap.autoUpdate = wasAuto;
    }

    // fromCubemap reuses the target we hand it, so this allocates exactly once.
    const rt = pmrem.fromCubemap(cubeRT.texture, probe.envRT);
    probe.envRT = rt;
    bindEnvMap(rt.texture);

    probeAge = 0;
    probeAt.copy(_pw);
  }

  function serviceEnv() {
    if (!probe && !attachEnv(typeof window !== 'undefined' ? window.__game : null)) return;
    group.updateWorldMatrix(true, false);
    group.getWorldPosition(_pw);
    const moved = Number.isFinite(probeAt.x) ? _pw.distanceTo(probeAt) : Infinity;
    if (probeAge >= PROBE_EVERY || moved > PROBE_MOVE) refreshEnv();
    else probeAge++;
  }

  function disposeEnv() {
    if (!probe) return;
    bindEnvMap(null);
    if (probe.envRT) probe.envRT.dispose();
    probe.cubeRT.dispose();
    probe.pmrem.dispose();
    probe = null;
    probeAt.set(NaN, NaN, NaN);
  }

  // ---- body ------------------------------------------------------------
  const { body: bodyGeo, glass: glassGeo } = buildBody();
  // group 1 is now the rubber aperture seal, not the glazing — the glass is its own mesh.
  const bodyMesh = new THREE.Mesh(bodyGeo, [paintMat, sealMat, darkMat]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  shell.add(bodyMesh);

  // Livery shell: SAME geometry instance, so panel dents from damage.js deform the
  // decals with the metal. Only the paint group draws.
  const liveryMesh = new THREE.Mesh(bodyGeo, [liveryMat, hiddenMat, hiddenMat]);
  liveryMesh.renderOrder = 1;
  shell.add(liveryMesh);

  // Glazing: separate mesh, separate geometry, recessed 11 mm inside the seal.
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.renderOrder = 2;
  glassMesh.castShadow = false;
  shell.add(glassMesh);

  // ---- A-pillar / roof rail / C-pillar -----------------------------------
  // One swept section per side following the drip-rail corner of the loft: it rises out
  // of the cowl as the A-pillar, runs the length of the roof as the rail, and falls away
  // into the fastback as the C-pillar. Without it the canopy has no frame and the glass
  // dissolves into the roof. A thinner matte tube tucked just inboard of it is the weather
  // strip, and it is what draws the dark outline around the pane.
  for (const side of [-1, 1]) {
    const railPts = [], sealPts = [];
    for (let z = 1.09; z >= -1.72; z -= 0.05) {
      const hwS = Math.max(0.045, hwShoulder(z));
      const tum = tumble(z);
      const hwB = hwS * 0.985;
      const hwT = Math.min(hwB - 0.006, hwS * tum);
      const yt = yTop(z);
      const yTopSide = yt - Math.min(0.10, 0.055 + 0.05 * (hwT / Math.max(hwS, 1e-3)));
      railPts.push(new THREE.Vector3(side * hwT * 0.972, yTopSide - 0.011, z));
      sealPts.push(new THREE.Vector3(side * hwT * 0.944, yTopSide - 0.026, z));
    }
    const rail = new THREE.Mesh(
      noSeam(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), railPts.length, 0.0115, 8, false)), railMat);
    rail.castShadow = true;
    shell.add(rail);
    const weather = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sealPts), sealPts.length, 0.0075, 6, false), sealMat);
    shell.add(weather);
  }

  // ---- interior buck (dim, read through the glass) -----------------------
  const interior = new THREE.Group();
  shell.add(interior);
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.62, 2.05), interiorMat);
  tub.position.set(0, 0.86, -0.25);
  interior.add(tub);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.20, 0.42), interiorMat);
  dash.position.set(0, 1.02, 0.72);
  dash.rotation.x = 0.28;
  interior.add(dash);
  for (const s of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.50), seatMat);
    base.position.set(s * 0.34, 0.98, -0.12);
    interior.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.60, 0.14), seatMat);
    back.position.set(s * 0.34, 1.24, -0.40);
    back.rotation.x = -0.20;
    interior.add(back);
  }
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.019, 8, 24), interiorMat);
  wheelRim.position.set(0.34, 1.10, 0.50);
  wheelRim.rotation.x = 1.16;
  interior.add(wheelRim);
  const rollBar = new THREE.Mesh(new THREE.TorusGeometry(0.60, 0.030, 8, 20, Math.PI), trimMat);
  rollBar.position.set(0, 0.95, -0.60);
  interior.add(rollBar);

  // Rigid front-clip props (grille, splitter, lamp pods). These are static children of
  // `shell`, so they do NOT follow the per-weld skin displacement that damage.js applies.
  // damage.js reads `car.crushRigids` and drives each one along the crush map itself;
  // without that, a crushed nose leaves them hanging in open air ahead of the bodywork.
  // Populated as each prop is built below, published on the returned car object.
  const crushRigids = [];

  // ---- rocker skirts, splitter, diffuser, spoiler ------------------------
  for (const s of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 2.30), carbonMat);
    skirt.position.set(s * 0.845, 0.285, -0.02);
    skirt.rotation.z = s * 0.10;
    skirt.castShadow = true;
    shell.add(skirt);
  }
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.035, 0.34), carbonMat);
  splitter.position.set(0, 0.285, 2.14);
  splitter.castShadow = true;
  shell.add(splitter);
  crushRigids.push(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.22, 0.46), carbonMat);
  diffuser.position.set(0, 0.335, -2.12);
  shell.add(diffuser);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.20, 0.44), carbonMat);
    fin.position.set(i * 0.27, 0.34, -2.14);
    shell.add(fin);
  }

  // ducktail spoiler blended onto the rear deck
  const lip = new THREE.Mesh(noSeam(new THREE.BoxGeometry(1.58, 0.05, 0.30)), paintMat);
  lip.position.set(0, 1.062, -1.99);
  lip.rotation.x = -0.20;
  lip.castShadow = true;
  shell.add(lip);
  const liveryLip = new THREE.Mesh(lip.geometry, liveryMat);
  liveryLip.position.copy(lip.position); liveryLip.rotation.copy(lip.rotation);
  shell.add(liveryLip);

  // ---- front mouth / grille ---------------------------------------------
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.24, 0.14), meshMat);
  grille.position.set(0, 0.545, 2.24);
  shell.add(grille);
  crushRigids.push(grille);
  for (let i = 0; i < 5; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.016, 0.03), chromeMat);
    slat.position.set(0, 0.46 + i * 0.043, 2.31);
    shell.add(slat);
  }
  for (const s of [-1, 1]) {
    // kept inboard of hwShoulder(z) — a duct that pierces the fender skin reads as a
    // black hole punched in the paint, which is the last thing this shot needs
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.12), meshMat);
    duct.position.set(s * 0.50, 0.47, 2.14);
    duct.rotation.y = s * 0.16;
    shell.add(duct);
  }

  // ---- headlights: lens + internal reflector -----------------------------
  const headlights = [];
  const headGlows = [];
  const glowTex = (() => {
    const { c, ctx: g2 } = makeCanvas(128, 128);
    const grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.30, 'rgba(255,240,215,0.55)');
    grd.addColorStop(1, 'rgba(255,225,180,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
    return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping });
  })();

  for (const s of [-1, 1]) {
    const lamp = new THREE.Group();
    lamp.position.set(s * 0.575, 0.812, 2.045);
    lamp.rotation.y = s * -0.20;
    lamp.rotation.z = s * 0.10;
    shell.add(lamp);
    // Published to damage.js via car.crushRigids so the lamp pods ride the crush map
    // instead of floating at stock offsets ahead of a collapsed nose. See below.
    crushRigids.push(lamp);

    // recessed dark housing
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.17, 0.14), darkMat);
    housing.position.z = -0.055;
    lamp.add(housing);

    // internal reflector: nested chrome cones + concentric rings, which is what makes
    // the lens read as a real optic rather than a white quad
    for (const dx of [-0.095, 0.095]) {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.072, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), reflectorMat);
      bowl.rotation.x = Math.PI / 2;
      bowl.position.set(dx, 0, -0.03);
      bowl.material.side = THREE.DoubleSide;
      lamp.add(bowl);
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026 + r * 0.019, 0.0055, 6, 20), reflectorMat);
        ring.position.set(dx, 0, -0.012 - r * 0.008);
        lamp.add(ring);
      }
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), headMat);
      bulb.position.set(dx, 0, -0.012);
      lamp.add(bulb);
      headlights.push(bulb);
    }
    // strip DRL along the top of the lens
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.012), headMat);
    drl.position.set(0, 0.062, -0.005);
    lamp.add(drl);
    headlights.push(drl);

    // outer lens
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.13, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.scale.set(1.62, 1.0, 0.66);
    lens.renderOrder = 2;
    lamp.add(lens);

    // warm bloom card in front of the lens
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.44), new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xffe6bd, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.z = 0.10;
    glow.renderOrder = 5;
    lamp.add(glow);
    headGlows.push(glow.material);
  }

  // ---- taillights --------------------------------------------------------
  const taillights = [];
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.06), tailMat);
    tl.position.set(s * 0.40, 0.935, -2.315);
    shell.add(tl);
    taillights.push(tl);
    const lensTL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.03), lensMat);
    lensTL.position.set(s * 0.40, 0.935, -2.295);
    shell.add(lensTL);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.022, 0.045), tailMat);
  tailBar.position.set(0, 0.935, -2.318);
  shell.add(tailBar);

  // ---- mirrors -----------------------------------------------------------
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.028, 0.038), trimMat);
    arm.position.set(s * 0.88, 1.045, 0.60);
    shell.add(arm);
    const cap = new THREE.Mesh(noSeam(new THREE.SphereGeometry(0.075, 14, 10)), paintMat);
    cap.scale.set(0.62, 0.72, 1.25);
    cap.position.set(s * 0.955, 1.052, 0.60);
    cap.castShadow = true;
    shell.add(cap);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.062), chromeMat);
    mirror.position.set(s * 0.958, 1.052, 0.52);
    mirror.rotation.y = Math.PI;
    shell.add(mirror);
  }

  // ---- exhausts ----------------------------------------------------------
  for (const s of [-1, 1]) {
    const ex = lathe([[0.052, 0.09], [0.062, 0.09], [0.062, -0.09], [0.048, -0.09]], 20, chromeMat);
    ex.rotation.z = 0; ex.rotation.x = Math.PI / 2;
    ex.position.set(s * 0.50, 0.365, -2.30);
    shell.add(ex);
  }

  // ---- wheels ------------------------------------------------------------
  const wheelMats = { tyre: tyreMat, rim: rimMat, lip: lipMat, wheelDark: wheelDarkMat, disc: discMat, caliper: caliperMat };
  const wheels = [];
  const wheelPos = [
    [DIMS.track, DIMS.frontZ, 'FL'], [-DIMS.track, DIMS.frontZ, 'FR'],
    [DIMS.track, DIMS.rearZ, 'RL'], [-DIMS.track, DIMS.rearZ, 'RR'],
  ];
  for (const [x, z, name] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(x, DIMS.wheelR, z);
    const spin = makeWheel(wheelMats);
    spin.scale.x = x > 0 ? 1 : -1;
    pivot.add(spin);
    group.add(pivot);
    wheels.push({ pivot, spin, name, steers: z > 0 });
  }

  // ---- boost heat + headlight pool ---------------------------------------
  const boostGlowMat = new THREE.MeshBasicMaterial({
    color: 0x4fb4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boostGlow = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), boostGlowMat);
  boostGlow.position.set(0, 0.38, -2.42);
  boostGlow.scale.set(1.4, 0.7, 1.0);
  group.add(boostGlow);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xbcd4ff, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beams = [];
  for (const s of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 12, 18, 1, true), beamMat);
    cone.rotation.x = -Math.PI / 2 + 0.035;
    cone.position.set(s * 0.6, 0.72, 2.05 + 6);
    cone.renderOrder = 3;
    cone.visible = false;
    group.add(cone);
    beams.push(cone);
  }
  let beamsEnabled = false;

  const poolTex = (() => {
    const { c, ctx: g2 } = makeCanvas(128, 128);
    const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
    return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping });
  })();
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, color: 0xffeccc, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(11, 22), poolMat);
  lightPool.rotation.x = -Math.PI / 2;
  lightPool.position.set(0, 0.05, 11);
  lightPool.renderOrder = 4;
  group.add(lightPool);

  let spinAngle = 0, lightsOn = false;

  const car = {
    group, shell, bodyMesh, cabinMesh: bodyMesh, liveryMesh, glassMesh, interior, wheels, DIMS,
    // damage.js deforms bodyMesh.geometry; the glazing is a second geometry over the same
    // vertex grid, so any future panel deform should walk both.
    deformTargets: [bodyGeo, glassGeo],
    paintMat, liveryMat, glassMat, sealMat, trimMat, carbonMat, chromeMat, tyreMat, rimMat, lipMat,
    darkMat, headMat, lensMat, tailMat, headlights, taillights, boostGlow,

    setPaint(hex) {
      paintMat.color.setHex(hex, THREE.SRGBColorSpace);
      railMat.color.setHex(hex, THREE.SRGBColorSpace);
    },

    setLights(on) {
      lightsOn = !!on;
      headMat.emissiveIntensity = on ? 3.2 : 0.0;
      for (const m of headGlows) m.opacity = on ? 0.85 : 0.0;
      beamMat.opacity = on && beamsEnabled ? 0.022 : 0.0;
      for (const b of beams) b.visible = on && beamsEnabled;
      poolMat.opacity = on ? 0.55 : 0.0;
      lightPool.visible = on;
      tailMat.emissiveIntensity = on ? 2.4 : 0.5;
    },
    get lightsOn() { return lightsOn; },

    /** Volumetric headlight cones look wrong in close-ups — let scenes switch them off. */
    setBeams(v) { beamsEnabled = !!v; car.setLights(lightsOn); },

    setBrake(a) { tailMat.emissiveIntensity = lerp(lightsOn ? 1.6 : 0.5, 7.0, clamp(a, 0, 1)); },

    setBoostGlow(a) {
      boostGlowMat.opacity = clamp(a, 0, 1) * 0.85;
      boostGlow.scale.set(1.4 + a * 0.6, 0.7 + a * 0.3, 1.0 + a * 1.6);
    },

    /** Live handles on the reflection rig, for A/B'ing without a recompile. */
    envBox: ENV_BOX,
    setCcGain(v) {
      paintMat.userData.ccGainU.value = v;
      liveryMat.userData.ccGainU.value = v;
    },

    /** Aluminium broadband backscatter added to the basecoat albedo. Live, no recompile. */
    setFlakeScatter(v) { paintMat.userData.scatterU.value = v; },

    /**
     * Rigid front-clip props (grille, splitter, both lamp pods) in build order.
     * damage.js drives these along the crush map; they are static children of `shell`
     * and would otherwise float ahead of a collapsed nose. Read-only from outside.
     */
    crushRigids,

    /** Bind the environment probe explicitly. Optional — update() latches on by itself. */
    attachEnv(host) { return attachEnv(host); },
    refreshEnv,
    dispose() { disposeEnv(); },

    update(dt, { speed = 0, steer = 0, lean = 0, pitch = 0 } = {}) {
      serviceEnv();
      spinAngle += (speed / DIMS.wheelR) * dt;
      for (const w of wheels) {
        w.spin.rotation.x = spinAngle;
        w.pivot.rotation.y = w.steers ? steer * 0.52 : 0;
      }
      shell.rotation.z = -lean * 0.05;
      group.rotation.x = pitch;
    },
  };

  car.setLights(false);
  return car;
}
