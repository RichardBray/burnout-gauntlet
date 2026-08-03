// damage.js — Burnout-style vehicle damage: localised sheet-metal deformation with
// hard crumple folds, an accumulating scratch / bare-metal / soot mask painted into
// the body's own (u, v) parameter space, progressive glass fracture, blown-out lamps,
// and panels that tear off the shell at high energy.
//
// API (stable — main.js and crash.js call into this):
//   createDamage(car) -> dmg
//   dmg.addImpact(localPoint:Vector3, strength 0..1, dir:Vector3)  one hit, accumulates
//   dmg.setLevel(0..1)   canned deterministic wreck at that severity
//   dmg.level / dmg.severity   the 0..1 accumulator driving the overall look
//   dmg.update(dt) / dmg.settle(seconds)   step detached parts (optional; if nobody
//     ever calls update(), parts settle deterministically the moment they detach)
//   dmg.reset()          restores the car exactly — geometry, normals, masks, glazing,
//                        lamps, parts, and every object this module hid.
//
// Ownership: this module never edits another module's material. Paint damage is an
// overlay mesh sharing the body geometry INSTANCE (so dents deform the scuffs with the
// metal) drawn with a material this module owns; the only things it touches on the car
// are `visible` flags, each recorded and handed back by reset(). The env map and paint
// colour are mirrored off car.paintMat at draw time so the overlay's bare metal
// reflects the same local probe as the paint under it.
//
// car.js builds the glazing as a SEPARATE geometry over the same vertex grid as the
// body and publishes both in `car.deformTargets`; every target is deformed by the same
// per-vertex displacement so the panes stay welded into their apertures as the aperture
// crumples. Deformation is solved on *welded* vertices, which is what stops the loft's
// duplicated hard-seam columns — shoulder crease, beltline, drip rail, and the sunken
// shutline channels — from tearing apart under a dent.
//
// Everything is deterministic: seeded rng only, no Math.random, no Date.now.

import * as THREE from 'three';
import { makeCanvas, makeRng, clamp, lerp } from './util.js';

const TEX = 1024;          // paint-damage mask resolution (body uv space)
const CRACK = 2048;        // glass fracture mask resolution. The glazing shares the
                           // body's unwrap, so a single pane only owns a slice of it —
                           // the extra resolution is what keeps a crack a filament
                           // rather than a smear once it is mip-filtered.
const MAX_DISP = 0.26;     // hard ceiling on accumulated per-vertex displacement (m)
// Max displacement difference across an edge, as a fraction of its rest length — the
// anti-inversion guarantee. 0.32 caps the surface slope at 18 deg, which is a DENT, not
// a crease: it sanded every buckle ridge flat and was the single biggest reason the
// wreck read as one smooth taffy envelope. 0.75 (37 deg) still cannot fold a triangle
// through itself but lets a fold ridge stand up as a real crease.
const EDGE_LIMIT = 0.90;
// Cross-panel edges get a far looser limit: a seam is *supposed* to open under load.
const SEAM_LIMIT = 1.15;
// Dihedral angle past which two faces stop sharing a vertex normal. A buckle steeper
// than this shades as a hard line instead of a gradient.
const CREASE_COS = Math.cos(24 * Math.PI / 180);
const GRAV = -22;          // matches crash.js so loose parts fall at the same rate

// Severity thresholds for the discrete damage states.
const T_CRACK = 0.16;
const T_MIRROR = 0.28;
const T_BUMPER = 0.42;
const T_HEADLAMP = 0.46;
const T_BONNET = 0.55;
const T_TAILLAMP = 0.58;
const T_DOOR = 0.64;
const T_SHATTER = 0.80;
const T_WHEEL = 0.86;      // front wheel tears clean off the hub

// ===========================================================================
// rigid-body crush
//
// Everything else in this file deforms the SKIN. That left the wreck with a
// chassis that could not shorten: at setLevel(0.95) the body box measured
// 4.704 x 2.033 x 1.176 m against a rest 4.750 x 1.990 x 1.168 — 46 mm of
// longitudinal loss, 1%, while the width and height actually GREW. The result
// read as an intact car wearing a dented skin. crash-cam-02 loses 0.6-0.9 m of
// front overhang: the nose telescopes back into the engine bay, the hood tents
// up over the shortened bay, and the front wheel is jammed rearward into a
// collapsed arch.
//
// So the shell is first put through a rigid-body crush: a monotone piecewise
// linear map z -> z' that compresses each longitudinal zone by its own scale
// factor and drags everything ahead of it rearward. Because the map is monotone
// and anchored at the tail, it can never fold the chassis through itself and the
// total length loss is exactly sum((1 - scale_i) * length_i) — length is a dialled
// number, not an emergent one. The per-weld buckle field then rides on top.
//
// Zones are listed rear to front and crush in order of structural weakness:
// `max` is the fraction of its own length the zone may lose, ramped in over the
// crush accumulator's [on, off] window. The front overhang is gone before the
// cabin has started, which is the collapse order of a real front rail.
// ===========================================================================
const CRUSH_ZONES = [
  { max: 0.010, on: 0.70, off: 1.00 },   // rear body      z_min .. Z_DOORR
  { max: 0.055, on: 0.50, off: 1.00 },   // cabin          Z_DOORR .. Z_COWL
  { max: 0.460, on: 0.10, off: 0.85 },   // engine bay     Z_COWL .. Z_FBUMP
  { max: 0.700, on: 0.00, off: 0.50 },   // front overhang Z_FBUMP .. z_max
];
const CRUSH_PINCH = 0.085;     // the nose narrows as it telescopes
const CRUSH_TENT = 0.185;      // hood tents up over the shortened bay
const CRUSH_NOSEDROP = 0.130;  // front rails fold under below the bumper line
const CRUSH_ROOF = 0.055;      // cabin settles once it starts taking load
const CRUSH_ARCH = 0.085;      // arch lip folds down onto the tyre
const CRUSH_ARCH_REACH = 0.58; // how far either side of the axle the arch folds
// Extra rearward travel of the hub over and above the skin's own crush, i.e. the
// suspension arm folding. Without it the hub and the arch migrate together and the
// wheel stays perfectly centred in its opening however hard the nose is crushed.
const CRUSH_HUB_JAM = 0.105;

/** Ramp used for every crush schedule: C1 at both ends, so no zone snaps in. */
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Soft one-sided limiter: returns e for e << h, asymptotes to h, C1 everywhere,
 * and is exactly 0 at h = 0. Used by the silhouette guard, where h is a vertex's
 * remaining headroom to the rest bounding box: a vertex already ON the box cannot
 * move outward at all, one just inside it can move nearly freely, and the
 * transition between the two is smooth so no flat spot appears on the flank.
 */
const softRoom = (e, h) => (h > 1e-6 ? (h * e) / (h + e) : 0);

// How close to the rest box a vertex may travel before the guard starts softening
// its motion. Outside this band the guard is the exact identity, which matters: the
// nose has 4.7 m of headroom to the tail and must be free to travel its full 0.7 m
// of crush without being scaled down for it.
const ENV_SLACK = 0.06;
/** Travel `e` toward a box face `h` away, limited so the face is never crossed. */
const envLimit = (e, h) => {
  const free = h - ENV_SLACK;
  if (e <= free) return e;
  return free > 0 ? free + softRoom(e - free, ENV_SLACK) : softRoom(e, h);
};

/**
 * Triangle wave in [-1, 1] with a sharp crease at every half-period. The derivative
 * discontinuity is the whole point: a sine dents a panel into a smooth bowl, a triangle
 * wave *folds* it, and the fold ridge is what catches a hard specular line the way
 * buckled thin sheet does in crash-cam-03.
 */
const sawFold = (x) => 4 * Math.abs(x - Math.round(x)) - 1;

// ===========================================================================
// panel map
//
// The shell is not one surface. car.js lofts it as one mesh, but it cuts REAL inset
// shutline channels into that loft at fixed (z, u) stations — the same numbers repeated
// here — and those channels are where a real body separates. Classifying every vertex
// into the panel it belongs to gives the deformer panel identity: a hit creases the
// panel it landed on, drags its immediate neighbours a little, and leaves the rest of
// the car alone, with the seam between them free to open.
//
// u is the loft's section parameter (0 under-centre -> 0.5 crown, mirrored past 0.5), so
// uh = min(u, 1-u) is "how far up the section" and u < 0.5 is the right-hand side.
// These constants mirror car.js's SEAM_Z / SEAM_L / U_* tables; they are the panel
// boundaries the car already draws a gap along.
// ===========================================================================
const P_FLOOR = 0, P_FBUMP = 1, P_RBUMP = 2, P_BONNET = 3, P_ROOF = 4, P_BOOT = 5,
  P_WING = 6, P_DOOR = 8, P_QTR = 10, N_PANEL = 12;   // side panels are base + side

const Z_FBUMP = 2.030;     // front bumper / clip split
const Z_COWL = 1.120;      // bonnet trailing edge
const Z_DOORF = 0.800;     // door leading edge
const Z_DOORR = -0.340;    // door trailing edge at the B-pillar
const Z_HATCH = -1.720;    // hatch lower edge under the backlight
const Z_RBUMP = -2.060;    // rear bumper split
const U_LONG = 0.4411;     // longitudinal bonnet/deck shut against the wings (SEAM_T)
const U_BELTP = 0.300;     // beltline: below it is door/wing/quarter, above it greenhouse
const U_SILLP = 0.048;     // below it is the underbody pan

function panelOf(z, u) {
  const uh = Math.min(u, 1 - u);
  const side = u < 0.5 ? 0 : 1;
  if (z > Z_FBUMP) return P_FBUMP;
  if (z < Z_RBUMP) return P_RBUMP;
  if (uh < U_SILLP) return P_FLOOR;
  if (z > Z_COWL) return uh > U_LONG ? P_BONNET : P_WING + side;
  if (z < Z_HATCH) return uh > U_LONG ? P_BOOT : P_QTR + side;
  if (uh > U_BELTP) return P_ROOF;
  if (z > Z_DOORF) return P_WING + side;
  if (z > Z_DOORR) return P_DOOR + side;
  return P_QTR + side;
}

/**
 * Two-octave fold field. The domain is warped by a slow sine of the *other* axis before
 * the triangle waves are evaluated: without that warp two crossed triangle waves lay
 * down a perfect egg-crate, which reads as corrugated roofing rather than as buckled
 * sheet. The warp bends every ridge along its length and breaks the grid.
 */
function ridge(a, b) {
  const aw = a + 0.55 * Math.sin(b * 0.83 + 1.7) + 0.22 * Math.sin(b * 2.1);
  const bw = b * 1.37 + a * 0.21 + 0.48 * Math.sin(a * 1.19 - 0.4);
  return sawFold(aw) * 0.60 + sawFold(bw) * 0.40;
}

// ===========================================================================
// small deterministic helpers
// ===========================================================================

/**
 * Canvas-backed texture with real trilinear + anisotropic filtering. util.js's
 * canvasTexture is fine, but masks that land on a clearcoated panel terrace badly
 * without mipmaps, so the filtering is spelled out here rather than inherited.
 */
function maskTexture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Parametric quad grid. fn(u, v) -> [x, y, z], u and v both 0..1 inclusive. */
function panelGeo(nu, nv, fn) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, k = j * (nu + 1) + i;
      const p = fn(u, v);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uv[k * 2] = u; uv[k * 2 + 1] = v;
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * A closed, solid panel: the same parametric grid emitted twice, offset +/- along
 * `axis` by a thickness that smoothly falls to zero at the outline, so the two skins
 * meet at the rim and the panel reads as pressed sheet with an edge rather than as a
 * billboard. A torn-off door has to have a thickness or it looks like a decal.
 *
 * `ribs(u, v)` is an optional EXTRA offset applied to the -axis skin only, in metres,
 * so that skin can carry pressed stiffening sections instead of being a parallel copy
 * of the outer one. It is multiplied by the same rim falloff, so however deep a rib is
 * pressed the two skins still meet at the outline and the panel stays closed.
 *
 * Two index groups are emitted, +axis skin first, so a caller that wants a different
 * material on the inside (a bonnet underside is primer and box sections, not paint)
 * can pass a two-material array. A caller passing ONE material is unaffected: the
 * renderer only walks groups when the material is an array.
 */
function slabGeo(nu, nv, axis, thick, fn, ribs) {
  const M = (nu + 1) * (nv + 1);
  const posA = new Float32Array(M * 2 * 3);
  const uvA2 = new Float32Array(M * 2 * 2);
  const edge = (u, v) => {
    const d = Math.min(u, 1 - u, v, 1 - v) * 7;
    const t = clamp(d, 0, 1);
    return t * t * (3 - 2 * t);
  };
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, k = j * (nu + 1) + i;
      const p = fn(u, v);
      const e = edge(u, v);
      const h = thick * 0.5 * e;
      const rib = ribs ? ribs(u, v) * e : 0;
      for (const [side, base] of [[1, 0], [-1, M]]) {
        const o = (base + k) * 3;
        const d = side > 0 ? h : -(h + rib);
        posA[o] = p[0] + axis[0] * d;
        posA[o + 1] = p[1] + axis[1] * d;
        posA[o + 2] = p[2] + axis[2] * d;
        uvA2[(base + k) * 2] = u;
        uvA2[(base + k) * 2 + 1] = v;
      }
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const half = idx.length;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(M + a, M + b, M + c, M + b, M + d, M + c);
    }
  }
  const g = new THREE.BufferGeometry();
  const uvAttr = new THREE.BufferAttribute(uvA2, 2);
  g.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  g.setAttribute('uv', uvAttr);
  // aoMap reads uv1 by default in three >= r151; alias it onto the same buffer rather
  // than relying on Texture.channel, which is the newer of the two spellings.
  g.setAttribute('uv1', uvAttr);
  g.setIndex(idx);
  g.addGroup(0, half, 0);
  g.addGroup(half, idx.length - half, 1);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * A geometry that shares another's attribute buffers but keeps only the triangles
 * `keep()` accepts. Sharing the buffers (not copying them) means the sub-geometry
 * deforms for free whenever the parent's positions are rewritten.
 */
function subGeometry(src, keep) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name]);
  const si = src.index;
  const idx = [];
  if (si) {
    for (let i = 0; i < si.count; i += 3) {
      const a = si.getX(i), b = si.getX(i + 1), c = si.getX(i + 2);
      if (keep(a, b, c)) idx.push(a, b, c);
    }
  }
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ===========================================================================

export function createDamage(car) {
  const refGeo = car.bodyMesh.geometry;
  const pos = refGeo.attributes.position;
  const uvA = refGeo.attributes.uv || null;
  const shell = car.bodyMesh.parent || car.group;
  const vCount = pos.count;

  const rng = makeRng(0xDEAD11);

  // -------------------------------------------------------------------------
  // deform targets: the painted body plus the glazing, which car.js builds over the
  // same vertex grid. Anything published there whose vertex count matches gets the
  // identical per-vertex displacement, so a pane can never float free of its aperture.
  // -------------------------------------------------------------------------
  const targets = [];
  {
    const list = (Array.isArray(car.deformTargets) && car.deformTargets.length)
      ? car.deformTargets : [refGeo];
    const seen = new Set();
    for (const g of list) {
      if (!g || !g.attributes || !g.attributes.position) continue;
      if (g.attributes.position.count !== vCount) continue;
      if (seen.has(g.uuid)) continue;
      seen.add(g.uuid);
      targets.push({
        geo: g,
        pos: g.attributes.position,
        restPos: g.attributes.position.array.slice(),
        restNrm: g.attributes.normal ? g.attributes.normal.array.slice() : null,
      });
    }
    if (!seen.has(refGeo.uuid)) {
      targets.unshift({
        geo: refGeo, pos,
        restPos: pos.array.slice(),
        restNrm: refGeo.attributes.normal ? refGeo.attributes.normal.array.slice() : null,
      });
    }
  }
  const restPos = targets[0].restPos;            // body rest pose drives the falloff
  const restNrm = targets[0].restNrm;
  const extraBounds = [];                        // sub-geometries needing a bounds refresh

  // -------------------------------------------------------------------------
  // weld map. The loft duplicates whole vertex columns at every hard seam so
  // computeVertexNormals cannot average across them, and it sinks the shutline
  // channels along the skin normal. Displacing duplicates independently would rip the
  // crease open and unzip a shutline, so all displacement is solved once per welded
  // position and scattered back to every duplicate.
  //
  // Note the displacement is only ever *added* to the rest pose — the channels and
  // creases live in the rest pose and are never smoothed, so a light hit deepens or
  // skews a shutline but cannot erase one.
  // -------------------------------------------------------------------------
  // Panel id per RAW vertex. With uv present this is the loft's own (z, u) station map;
  // without one, fall back to a positional proxy so the module still runs.
  const panelOfVert = new Int8Array(vCount);
  {
    let yLo = Infinity, yHi = -Infinity;
    if (!uvA) {
      for (let i = 0; i < vCount; i++) {
        const y = restPos[i * 3 + 1];
        if (y < yLo) yLo = y;
        if (y > yHi) yHi = y;
      }
    }
    for (let i = 0; i < vCount; i++) {
      const x = restPos[i * 3], y = restPos[i * 3 + 1], z = restPos[i * 3 + 2];
      let u;
      if (uvA) u = uvA.getX(i);
      else {
        const t = clamp((y - yLo) / Math.max(1e-4, yHi - yLo), 0, 1) * 0.5;
        u = x >= 0 ? t : 1 - t;
      }
      panelOfVert[i] = panelOf(z, u);
    }
  }

  const weldOf = new Int32Array(vCount);
  const weldPos = [];
  const weldNrm = [];
  const weldPanelL = [];
  {
    const table = new Map();
    for (let i = 0; i < vCount; i++) {
      const x = restPos[i * 3], y = restPos[i * 3 + 1], z = restPos[i * 3 + 2];
      // The panel id is PART OF THE WELD KEY. That is what lets a panel move away from
      // its neighbour: two coincident vertices on opposite sides of a shutline are no
      // longer forced to share one displacement, so the gap between them can widen.
      const k = `${panelOfVert[i]}|${Math.round(x * 4096)},${Math.round(y * 4096)},${Math.round(z * 4096)}`;
      let w = table.get(k);
      if (w === undefined) {
        w = weldPos.length / 3;
        table.set(k, w);
        weldPos.push(x, y, z);
        weldNrm.push(0, 0, 0);
        weldPanelL.push(panelOfVert[i]);
      }
      weldOf[i] = w;
      if (restNrm) {
        weldNrm[w * 3] += restNrm[i * 3];
        weldNrm[w * 3 + 1] += restNrm[i * 3 + 1];
        weldNrm[w * 3 + 2] += restNrm[i * 3 + 2];
      }
    }
  }
  const wCount = weldPos.length / 3;
  const wPos = new Float32Array(weldPos);
  const wNrm = new Float32Array(weldNrm);
  for (let w = 0; w < wCount; w++) {
    const l = Math.hypot(wNrm[w * 3], wNrm[w * 3 + 1], wNrm[w * 3 + 2]) || 1;
    wNrm[w * 3] /= l; wNrm[w * 3 + 1] /= l; wNrm[w * 3 + 2] /= l;
  }
  const wDisp = new Float32Array(wCount * 3);
  const wPanel = new Int8Array(weldPanelL);
  const wCrease = new Float32Array(wCount);      // how buckled this weld ended up, 0..1
  // ANISOTROPIC part of that buckle: 1 where the sheet falls away along one axis only
  // (a fold crest or valley), 0 where it falls away equally in every direction (a dish
  // or a dome). Bare metal is gated on this, not on wCrease — a 0.6 m deep dish has a
  // huge Laplacian but no crest to abrade, and gating on the Laplacian alone stripped
  // the paint off the entire front clip.
  const wRidge = new Float32Array(wCount);

  // Per-panel weld lists plus a centroid and an average outward normal. The fold axis of
  // an impact is built in this frame, which is why a bonnet hit folds ACROSS the bonnet
  // rather than along whatever direction the impact happened to arrive from.
  const panelWelds = [];
  const panelCen = [];
  const panelNrm = [];
  for (let k = 0; k < N_PANEL; k++) {
    panelWelds.push([]);
    panelCen.push(new THREE.Vector3());
    panelNrm.push(new THREE.Vector3());
  }
  for (let w = 0; w < wCount; w++) {
    const k = wPanel[w];
    panelWelds[k].push(w);
    panelCen[k].x += wPos[w * 3]; panelCen[k].y += wPos[w * 3 + 1]; panelCen[k].z += wPos[w * 3 + 2];
    panelNrm[k].x += wNrm[w * 3]; panelNrm[k].y += wNrm[w * 3 + 1]; panelNrm[k].z += wNrm[w * 3 + 2];
  }
  for (let k = 0; k < N_PANEL; k++) {
    const n = panelWelds[k].length || 1;
    panelCen[k].multiplyScalar(1 / n);
    if (panelNrm[k].lengthSq() < 1e-8) panelNrm[k].set(0, 1, 0);
    panelNrm[k].normalize();
  }
  // Which panels share a seam — filled in by buildAdj() once the edge list exists.
  const panelAdj = new Uint8Array(N_PANEL * N_PANEL);

  // -------------------------------------------------------------------------
  // glazing
  // -------------------------------------------------------------------------
  const glassMesh = car.glassMesh && car.glassMesh.isMesh ? car.glassMesh : null;
  const glassGeo = glassMesh ? glassMesh.geometry : null;
  const glassMatRef = car.glassMat
    || (glassMesh ? glassMesh.material : null)
    || (Array.isArray(car.bodyMesh.material) ? car.bodyMesh.material[1] : null);

  /**
   * Which pane a glazing triangle belongs to: 0 screen, 1 rear, 2 left flank, 3 right.
   *
   * Classified by the triangle's own FACING, not by an x threshold. The windscreen wraps
   * a long way outboard as it meets the A-pillar, so any |x| cut would slice its outer
   * thirds off and hand them to the side glass — which is exactly how the previous cut
   * left the screen with holes in its top corners after a blow-out. Side glass faces
   * across the car, the screen and the backlight face along it.
   */
  const paneOfTri = (gp) => (a, b, c) => {
    const ax = gp[a * 3], ay = gp[a * 3 + 1], az = gp[a * 3 + 2];
    const e1x = gp[b * 3] - ax, e1y = gp[b * 3 + 1] - ay, e1z = gp[b * 3 + 2] - az;
    const e2x = gp[c * 3] - ax, e2y = gp[c * 3 + 1] - ay, e2z = gp[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const cz = (az + gp[b * 3 + 2] + gp[c * 3 + 2]) / 3;
    const cx = (ax + gp[b * 3] + gp[c * 3]) / 3;
    if (Math.abs(nx) >= Math.max(Math.abs(ny), Math.abs(nz))) return cx > 0 ? 2 : 3;
    return cz > 0 ? 0 : 1;
  };

  /** Laminated windscreen: it crazes and stays in its aperture; tempered glass blows out. */
  let screenGeo = null;
  if (glassGeo && glassGeo.index) {
    const gp = glassGeo.attributes.position.array;
    const pane = paneOfTri(gp);
    screenGeo = subGeometry(glassGeo, (a, b, c) => pane(a, b, c) === 0);
    if (screenGeo.index && screenGeo.index.count > 0) extraBounds.push(screenGeo);
    else screenGeo = null;
  }

  /**
   * Pane clusters, discovered from the glazing geometry itself (or, if car.js has no
   * separate glazing mesh, from the body's glass material group) so the fracture webs
   * land on real panes no matter how the greenhouse is cut.
   *
   * Each pane carries: its uv bounding box (the fracture is CLIPPED to it, so a web can
   * never spill across a pillar onto the next pane), the vertex list needed to snap a
   * world-space impact onto the pane, and the uv-per-metre scale along each axis. That
   * last one is what keeps a crack web circular in the world: the loft's u runs around
   * the ring and v runs down the car, at wildly different rates, so a circle drawn in uv
   * would land on the screen as a badly-stretched ellipse.
   */
  const glassPanels = (() => {
    let source = null, srcPos = null, srcUv = null;
    if (glassGeo && glassGeo.index && glassGeo.attributes.uv) {
      source = glassGeo.index;
      srcPos = glassGeo.attributes.position.array;
      srcUv = glassGeo.attributes.uv;
    } else {
      const g1 = (refGeo.groups || []).find((g) => g.materialIndex === 1);
      if (!g1 || !refGeo.index || !uvA) return [];
      source = { count: g1.count, getX: (i) => refGeo.index.getX(g1.start + i) };
      srcPos = restPos;
      srcUv = uvA;
    }
    // Bucketed per TRIANGLE with the same facing test the screen sub-geometry uses, so a
    // pane's uv box and the geometry that survives a blow-out can never disagree.
    const pane = paneOfTri(srcPos);
    const seen = [new Set(), new Set(), new Set(), new Set()];
    const buckets = [[], [], [], []];        // screen / rear / left flank / right flank
    for (let i = 0; i + 2 < source.count; i += 3) {
      const a = source.getX(i), b = source.getX(i + 1), c = source.getX(i + 2);
      const k = pane(a, b, c);
      for (const vi of [a, b, c]) {
        if (seen[k].has(vi)) continue;
        seen[k].add(vi);
        buckets[k].push(vi);
      }
    }
    const names = ['screen', 'rear', 'sideL', 'sideR'];
    const out = [];
    for (let b = 0; b < 4; b++) {
      const list = buckets[b];
      if (list.length < 6) continue;
      let su = 0, sv = 0, u0 = 1, u1 = 0, v0 = 1, v1 = 0;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      const verts = [];
      for (const vi of list) {
        const u = srcUv.getX(vi), v = srcUv.getY(vi);
        su += u; sv += v;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        const x = srcPos[vi * 3], y = srcPos[vi * 3 + 1], z = srcPos[vi * 3 + 2];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
        verts.push(x, y, z, u, v);
      }
      // u runs across the pane's width, v along the car; the pane's rake means the
      // v extent covers both z and y.
      const spanU = Math.max(0.10, x1 - x0);
      const spanV = Math.max(0.10, Math.hypot(z1 - z0, y1 - y0));
      out.push({
        name: names[b], u: su / list.length, v: sv / list.length,
        u0, u1, v0, v1,
        ru: Math.max(0.015, (u1 - u0) * 0.5), rv: Math.max(0.015, (v1 - v0) * 0.5),
        cx: (x0 + x1) * 0.5, cy: (y0 + y1) * 0.5, cz: (z0 + z1) * 0.5,
        uPerM: (u1 - u0) / spanU, vPerM: (v1 - v0) / spanV,
        verts: new Float32Array(verts),
      });
    }
    return out;
  })();

  /** Snap a world-space (car-local) impact onto a pane, in that pane's uv. */
  function paneUvAt(panel, p) {
    if (!p) return null;
    const a = panel.verts;
    let best = Infinity, bu = panel.u, bv = panel.v;
    for (let i = 0; i < a.length; i += 5) {
      const d = (a[i] - p.x) ** 2 + (a[i + 1] - p.y) ** 2 + (a[i + 2] - p.z) ** 2;
      if (d < best) { best = d; bu = a[i + 3]; bv = a[i + 4]; }
    }
    return { u: bu, v: bv, dist: Math.sqrt(best) };
  }

  // ===========================================================================
  // paint-damage masks (albedo+alpha, metalness, roughness) in body uv space
  // ===========================================================================
  const { c: albC, ctx: alb } = makeCanvas(TEX, TEX);
  const { c: metC, ctx: met } = makeCanvas(TEX >> 1, TEX >> 1);
  const { c: rghC, ctx: rgh } = makeCanvas(TEX >> 1, TEX >> 1);
  const albTex = maskTexture(albC, true);
  const metTex = maskTexture(metC, false);
  const rghTex = maskTexture(rghC, false);

  function clearMasks() {
    alb.globalCompositeOperation = 'source-over';
    alb.clearRect(0, 0, TEX, TEX);
    met.clearRect(0, 0, TEX >> 1, TEX >> 1);
    rgh.clearRect(0, 0, TEX >> 1, TEX >> 1);
    albTex.needsUpdate = metTex.needsUpdate = rghTex.needsUpdate = true;
  }
  clearMasks();

  // Bare metal, soot and torn-open cavities all ride on ONE overlay material.
  // metalness and roughness come from their own masks (the material scalars are 1.0 and
  // three.js multiplies by the map), so a bright bare-metal scrape and a matte soot
  // bloom can sit a few pixels apart without a second pass.
  const dmgMat = new THREE.MeshPhysicalMaterial({
    map: albTex, metalnessMap: metTex, roughnessMap: rghTex,
    metalness: 1.0, roughness: 1.0,
    clearcoat: 0.30, clearcoatRoughness: 0.30,
    envMapIntensity: 2.2,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16,
  });
  const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });

  // Match the body's material-group layout so the overlay draws over paint and the dark
  // underbody but never over the rubber aperture seal in group 1.
  const nGroups = (refGeo.groups || []).length;
  const dmgMats = [];
  for (let i = 0; i < nGroups; i++) dmgMats.push(i === 1 ? hiddenMat : dmgMat);
  const dmgMesh = new THREE.Mesh(refGeo, nGroups > 1 ? dmgMats : dmgMat);
  dmgMesh.renderOrder = 3;
  dmgMesh.visible = false;
  dmgMesh.castShadow = false;
  dmgMesh.receiveShadow = false;
  shell.add(dmgMesh);

  // ===========================================================================
  // glass fracture — drawn INTO the glazing, not pasted on top of it
  //
  // There is no decal quad and no additive overlay. The fracture is a second draw of
  // car.js's own glazing geometry with a material this module owns that is a faithful
  // clone of the car's glass (same tint, same grime roughness, same probe, same partial
  // opacity) plus three fracture channels:
  //
  //   map        the glass tint, whitened ONLY inside the small crushed-frost zone at
  //              the strike core, so the pane keeps its dark tint everywhere else;
  //   alphaMap   opacity, seeded at the car's own glass opacity so the cabin and the
  //              background still read straight through the fracture, rising to nearly
  //              opaque only in that same frost core and a touch along each crack;
  //   emissiveMap the caustic: a thin bright filament along every crack line. Emission
  //              ADDS light rather than replacing albedo, which is what makes a crack a
  //              sparkle in a transparent pane (crash-cam-03) instead of white paint.
  //
  // Because it is the real pane, the fracture is bounded by the aperture the car built —
  // no straight edge can cut across an A-pillar or a door line.
  // ===========================================================================
  const GLASS_TINT = glassMatRef && glassMatRef.color
    ? `#${glassMatRef.color.getHexString()}` : '#080b12';
  const GLASS_ALPHA = glassMatRef && glassMatRef.opacity != null
    ? clamp(glassMatRef.opacity, 0.05, 1) : 0.72;

  const { c: tintC, ctx: tint } = makeCanvas(CRACK, CRACK);
  const { c: alfC, ctx: alf } = makeCanvas(CRACK, CRACK);
  const { c: cauC, ctx: cau } = makeCanvas(CRACK, CRACK);
  const tintTex = maskTexture(tintC, true);
  const alfTex = maskTexture(alfC, false);
  const cauTex = maskTexture(cauC, true);
  for (const t of [tintTex, alfTex, cauTex]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;

  function clearCracks() {
    const a = Math.round(GLASS_ALPHA * 255);
    for (const [ctx2, fill] of [[tint, GLASS_TINT], [alf, `rgb(${a},${a},${a})`], [cau, '#000000']]) {
      ctx2.globalCompositeOperation = 'source-over';
      ctx2.fillStyle = fill;
      ctx2.fillRect(0, 0, CRACK, CRACK);
    }
    tintTex.needsUpdate = alfTex.needsUpdate = cauTex.needsUpdate = true;
  }
  clearCracks();

  const fracMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: tintTex,
    alphaMap: alfTex, transparent: true, opacity: 1.0,
    metalness: 0.0, roughness: 1.0,
    roughnessMap: (glassMatRef && glassMatRef.roughnessMap) || null,
    ior: 1.50, specularIntensity: 1.0,
    clearcoat: 1.0, clearcoatRoughness: 0.010,
    emissive: 0xffffff, emissiveMap: cauTex, emissiveIntensity: 2.2,
    envMapIntensity: (glassMatRef && glassMatRef.envMapIntensity) || 4.6,
    side: THREE.FrontSide, depthWrite: false,
  });

  const fracMesh = new THREE.Mesh(
    glassGeo || refGeo,
    glassGeo ? fracMat : [hiddenMat, fracMat, hiddenMat]);
  fracMesh.renderOrder = glassMesh ? glassMesh.renderOrder : 2;
  fracMesh.visible = false;
  fracMesh.castShadow = false;
  shell.add(fracMesh);

  // The car rebuilds its probe asynchronously, so bind the env map at draw time exactly
  // as the paint overlay does — otherwise a fractured screen loses its sky reflection.
  fracMesh.onBeforeRender = () => {
    const src = glassMatRef || car.paintMat;
    if (!src) return;
    if (fracMat.envMap !== src.envMap) { fracMat.envMap = src.envMap; fracMat.needsUpdate = true; }
  };

  // ===========================================================================
  // detachable parts
  // ===========================================================================
  const partPaint = new THREE.MeshPhysicalMaterial({
    color: 0xd8420f, metalness: 0.88, roughness: 0.44,
    clearcoat: 1.0, clearcoatRoughness: 0.075,
    envMapIntensity: 2.6, side: THREE.DoubleSide,
  });
  // ---------------------------------------------------------------------------
  // bonnet underside.
  //
  // The torn-off bonnet tents open TOWARDS the crash camera, so its inner face — not
  // its paint — is the largest single surface in the wreck. It used to be a second
  // instance of the same single-sided sheet 5 cm below the first, in a 4%-albedo
  // unmapped black: a matte lid, flat to within 2 luma levels over 40% of its area,
  // with nothing behind it and no edge anywhere. crash-cam-03/-04 both show a LIT
  // interior with structure in it.
  //
  // Three things had to change together, and the ordering matters. Albedo alone cannot
  // fix it: at `envMapIntensity 0.3` and `metalness 0.25` a pure-white material renders
  // 38/255 in that region, so the old back face was already within 11 levels of its own
  // CEILING — the classic range violation, a colour pushed at a term whose gain had
  // already been throttled to nothing. So the env gain comes up first (this face is lit
  // almost entirely by the sky dome), then a primer-grey map goes on it, and only then
  // does an AO map have any range left to carve the box sections back out of.
  // ---------------------------------------------------------------------------
  const RIB_D = 0.040;             // depth the stiffening sections are pressed (m)
  /** Flat-topped pad: 1 within `flat` of `c`, smoothly 0 by `flat + sh`. */
  const ribPad = (t, c, flat, sh) =>
    (() => { const a = clamp((flat + sh - Math.abs(t - c)) / sh, 0, 1); return a * a * (3 - 2 * a); })();
  /**
   * ONE rib field, read by the geometry and by both underside maps, so the stamped
   * pattern in the texture is the pattern in the mesh.
   *
   * WAVE P, SUBTRACTIVE. This used to be six overlapping tents (two longitudinals, a
   * centre bead, a transverse rail and two diagonal braces). crash-cam-03's inner face
   * (px 1120-1300 x 400-620) has NOTHING like that: it is a broad flat mid-grey FIELD
   * carrying ONE closed box-section pad and ONE bright flange line. The six-tent web
   * read as crumpled foil. It was also below its own tessellation: the bonnet slab is
   * 24x18, so du = 0.0417, and the diagonal braces were 0.042 wide — one vertex across.
   * The mesh could not represent them, so what they actually produced was grid-aligned
   * displacement noise, which is exactly the radial web the critic saw.
   *
   * So: one flat-topped PAD, 0.31 wide in u (7 segments) and 0.62 tall in v (11
   * segments). A pad, not a tent, because a box section reads as an OUTLINE — two
   * parallel shoulder lines with flat pressed steel between them — which is what cc03
   * shows. The flange is NOT in here: it is a 3-texel albedo/AO feature and the 24x18
   * grid cannot carry it, so it lives only in the map (see `flange` below).
   */
  function bonnetRib(u, v) {
    return ribPad(u, 0.40, 0.085, 0.070) * ribPad(v, 0.52, 0.220, 0.090);
  }
  const UND = 512;
  const { c: undAlbC, ctx: undAlbX } = makeCanvas(UND, UND);
  const { c: undAoC, ctx: undAoX } = makeCanvas(UND, UND);
  {
    const alb = undAlbX.createImageData(UND, UND);
    const ao = undAoX.createImageData(UND, UND);
    const rimFall = (u, v) => {
      const t = clamp(Math.min(u, 1 - u, v, 1 - v) * 12, 0, 1);
      return t * t * (3 - 2 * t);
    };
    // Sparse near-black debris flecks. cc03's inner face carries ~8 of them across the
    // crop and they are the ONLY thing on it darker than the field. A coarse 11x11 cell
    // grid with a 0.93 threshold gives ~8 cells; each fleck is an elongated chip, jittered
    // inside its cell so the grid never reads as a grid.
    const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const CN = 11;
    const fleckAt = (u, v) => {
      const ci = Math.floor(u * CN), cj = Math.floor(v * CN);
      if (hash(ci, cj) <= 0.93) return 0;
      const fx = u * CN - ci - (0.25 + 0.50 * hash(ci + 7.3, cj));
      const fy = v * CN - cj - (0.25 + 0.50 * hash(ci, cj + 3.1));
      const th = 6.2831 * hash(ci + 1.7, cj + 1.7);
      const px = fx * Math.cos(th) - fy * Math.sin(th);
      const py = fx * Math.sin(th) + fy * Math.cos(th);
      const q = (px / 0.30) * (px / 0.30) + (py / 0.11) * (py / 0.11);
      return q >= 1 ? 0 : Math.pow(1 - q, 0.35);
    };
    // ONE flange line: the pressed return round the panel outline, standing proud of the
    // field and unoccluded, so it is the brightest thing on the face. It is a texture-only
    // feature by necessity — 3 texels of a 512 map, versus a 24x18 mesh.
    const flangeAt = (u, v) => {
      const d = Math.min(u, 1 - u, v, 1 - v);
      const a = 1 - Math.abs(d - 0.055) / 0.034;
      return a <= 0 ? 0 : a * a * (3 - 2 * a);
    };
    for (let j = 0; j < UND; j++) {
      for (let i = 0; i < UND; i++) {
        const u = i / (UND - 1), v = j / (UND - 1), o = (j * UND + i) * 4;
        const r = bonnetRib(u, v);
        // the concave FOOT of a box section, where the pressing turns back into the
        // flat. `r` now sweeps 0 -> 1 across the pad's SHOULDER, so a band centred on
        // r = 0.35 is the shoulder line, i.e. the box section's outline. That outline
        // is the one piece of structure cc03 actually has.
        const root = Math.max(0, 1 - Math.abs(r - 0.35) / 0.33);
        const rim = rimFall(u, v);
        const flange = flangeAt(u, v);
        const fleck = fleckAt(u, v);
        // primer grey, lightly mottled with sealant and oil so the flats are not one
        // value; crowns are wiped brighter where the press tool polished the steel
        const mottle = 0.5 + 0.5 * Math.sin(u * 21.3 + 1.1) * Math.sin(v * 17.7 - 0.4);
        // ONE broad diagonal wash across the whole panel. crash-cam-03's inner face is
        // not uniform: it sweeps bright-to-dark corner to corner. Primer is sprayed,
        // not dipped, so the coat thins across the pressing.
        const wash = 0.5 + 0.5 * Math.sin((u * 0.9 + v * 1.35) * 2.2 - 1.15);
        // base + crown term peaks at 1.00 BEFORE the mottle subtraction and the wash
        // multiply, so nothing here clips the 0..1 the albedo texture can carry.
        let g = 0.86 + 0.14 * Math.pow(r, 0.8) - 0.09 * mottle;
        g *= 0.78 + 0.22 * wash;
        // The box-section FEET are baked into the ALBEDO as well as into the AO map.
        // three applies aoMap to indirect diffuse (and, softly, to indirect specular);
        // albedo is the one term no lighting path can bypass, so the section shadowing
        // survives whatever the sky dome does.
        g *= 1 - 0.45 * Math.pow(root, 1.3);
        g *= 0.55 + 0.45 * rim;               // shaded under the outer skin's return
        // The flange is the panel's HIGHLIGHT and it has to come out of albedo, not out
        // of roughness: wave N proved this face is indirect-diffuse led (forcing
        // metalness to 0 moves its p50 by one level), so a low-roughness line renders
        // as nothing. Written as a lerp TOWARDS 1 so it can never exceed what an 8-bit
        // albedo texture can carry, whatever the field level underneath it is.
        g += 0.88 * flange * (1 - g);
        g *= 1 - 0.92 * fleck;                // debris chips, the only thing below field
        const g8 = Math.round(clamp(g, 0.03, 1) * 255);
        // WARM primer. This face is lit only by the sky dome, whose irradiance is
        // B/R > 1; at the old 0.925 the rendered panel came out bluer than its own
        // albedo allows, i.e. it read as sky, not as steel. cc03's inner face is
        // B/R 1.12 (rgb 58.8,68.2,65.9) - cool grey primer, NOT tan, so this is a
        // small warm bias and not a rust colour.
        alb.data[o] = g8;
        alb.data[o + 1] = Math.round(g8 * 0.930);
        alb.data[o + 2] = Math.round(g8 * 0.830);
        alb.data[o + 3] = 255;
        // AO: crowns see the sky, the flat bays between the sections are half occluded
        // by those sections, the feet are nearly closed, the rim is under the flange.
        let a = 0.72 + 0.28 * Math.pow(r, 0.65);
        a *= 1 - 0.60 * Math.pow(root, 1.3);
        a *= 0.40 + 0.60 * rim;
        a = a + 0.90 * flange * (1 - a);      // the flange stands proud; nothing occludes it
        a *= 1 - 0.55 * fleck;
        const a8 = Math.round(clamp(a, 0.02, 1) * 255);
        // glTF-style ORM packing in ONE texture: three reads aoMap from .r and
        // roughnessMap from .g. The press tool polishes the crown of a box section, so
        // a crown is a hard specular line and the bay beside it is dead flat primer —
        // that specular line is what cc03 has and a single scalar roughness cannot give.
        // .b is left at 0 and NO metalnessMap is bound. WAVE P TESTED THE OPPOSITE AND IT
        // LOST: the panel's only light is the sky dome, so a purely diffuse texel tops out
        // at albedo 1.0 x AO 1.0, which measures p99 105.4 in `bonnetTight` — well under
        // cc03's ~180 flange. The obvious escape is a metal flange line whose specular can
        // exceed the diffuse ceiling, so .b was packed with `0.10 + 0.82 * flange`,
        // metalnessMap bound and the scalar taken to 1.0. Measured paired, same tree, one
        // variable: `bonnetTight` p99 105.4 -> 89.6, i.e. 15% WORSE. The dome's radiance
        // along this face's reflection vector is dimmer than its irradiance, so the metal
        // flange spends diffuse it needs and buys specular that is not there. Reverted.
        const rough = 0.90 - 0.30 * Math.pow(r, 1.4) - 0.50 * flange;
        ao.data[o] = a8;
        ao.data[o + 1] = Math.round(clamp(rough, 0.05, 1) * 255);
        ao.data[o + 2] = 0; ao.data[o + 3] = 255;
      }
    }
    undAlbX.putImageData(alb, 0, 0);
    undAoX.putImageData(ao, 0, 0);
  }
  const undAlbTex = maskTexture(undAlbC, true);
  const undAoTex = maskTexture(undAoC, false);
  for (const t of [undAlbTex, undAoTex]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const partUnder = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: undAlbTex,
    aoMap: undAoTex, aoMapIntensity: 1.0,
    // roughness/metalness are SCALAR MULTIPLIERS over the map, so roughness must be 1.0
    // for the packed .g channel to mean what it says.
    roughnessMap: undAoTex, roughness: 1.0,
    metalness: 0.10,
    // envMapIntensity STAYS AT 2.0. The wave-M brief asked for 0.8 on the theory that
    // sky specular was drowning the aoMap. Measured, that theory is wrong twice over:
    // forcing metalness to 0 moves this region's p50 by 1 level (34.8 -> 35.8), so the
    // specular share is negligible and the face is indirect-DIFFUSE led already; and
    // forcing envMapIntensity to 0 collapses the region to a dead-flat p01/p50/p99 of
    // 24.9/25.7/26.7, i.e. the sky dome is the ONLY light this face gets, and the 25.7
    // is the graded frame's own black floor (the whole 1600x1000 frame has p01 25.7 and
    // 0% of pixels under luma 16). Cutting the env gain only pushes the panel INTO that
    // floor, which is exactly the flat-tarp read the brief is complaining about.
    envMapIntensity: 2.0, side: THREE.DoubleSide,
  });
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8ccdc, metalness: 0.0, roughness: 0.06,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    envMapIntensity: 2.4,
  });

  // Mirror the paint colour and the car's own probe onto the parts at draw time:
  // car.js rebuilds the probe asynchronously and scenes call setPaint() after
  // createDamage(), so sampling once at construction would leave the parts flat.
  function syncFromPaint() {
    const src = car.paintMat;
    if (!src) return;
    partPaint.color.copy(src.color);
    for (const m of [partPaint, partUnder, dmgMat, shardMat]) {
      if (m.envMap !== src.envMap) { m.envMap = src.envMap; m.needsUpdate = true; }
    }
  }
  dmgMesh.onBeforeRender = syncFromPaint;

  const partsRoot = new THREE.Group();
  shell.add(partsRoot);
  const looseRoot = new THREE.Group();
  (car.group.parent || car.group).add(looseRoot);

  const parts = [];
  function addPart(spec) {
    const pivot = new THREE.Group();
    pivot.position.copy(spec.at);
    pivot.visible = false;
    partsRoot.add(pivot);
    // `mats` opts into the slab's two index groups (outer skin, then inner skin) so a
    // panel can be paint on the outside and primer on the inside. One material still
    // means one draw over the whole index — the renderer only walks groups for arrays.
    const skin = new THREE.Mesh(spec.geo, spec.mats || partPaint);
    skin.castShadow = true;
    // ...and receives, so a 40 mm box section on the bonnet inner drops a real shadow
    // into the bay beside it instead of relying on the AO map alone.
    skin.receiveShadow = true;
    skin.onBeforeRender = syncFromPaint;
    pivot.add(skin);
    const p = { pivot, spec, detached: false, t: 0, rest: { p: spec.at.clone(), e: new THREE.Euler() } };
    parts.push(p);
    return p;
  }

  // --- bonnet: hinged at the cowl, torn upward, buckled irregularly ---------
  // A SLAB, like the door and the bumper: 22 mm of pressed sheet closing to zero at the
  // outline, so every torn edge in the wreck has a thickness. The inner skin carries the
  // stiffening sections and its own primer material (group 1), which replaces the old
  // trick of instancing the same one-sided sheet 50 mm below in flat black.
  const bonnetGeo = slabGeo(24, 18, [0, 1, 0], 0.022, (u, v) => {
    const x = -0.70 + 1.40 * u;
    const z = 1.00 * v;
    const crown = 0.030 * (1 - Math.pow(2 * u - 1, 2));
    // amplitude modulated by a slow envelope so the folds never read as corrugation
    const env = 0.55 + 0.45 * Math.sin(x * 1.9 + z * 2.7 + 0.6);
    const buckle = 0.052 * ridge(x * 2.1 + z * 0.8 + 0.31, z * 3.1 + 1.07) * env * (0.25 + 0.75 * v);
    // one hard transverse fold across the panel — a torn-off bonnet is always creased
    // across its width, and the |.| gives the crest a real kink rather than a bump
    const hinge = 0.44 + 0.055 * Math.sin(x * 3.1 + 0.4);
    const crease = 0.085 * Math.max(0, 1 - Math.abs(z - hinge) / 0.20);
    const bend = -0.10 * v * v;             // the whole panel folds back over its hinge
    return [x, crown - 0.055 * v + bend + buckle + crease, z];
  }, (u, v) => RIB_D * bonnetRib(u, v));
  creaseNormals(bonnetGeo, {}, null);
  const bonnet = addPart({
    at: new THREE.Vector3(0, 1.005, 1.03),
    geo: bonnetGeo, mats: [partPaint, partUnder],
    pose: { p: new THREE.Vector3(0.03, 1.020, 1.10), e: new THREE.Euler(-0.36, 0.08, 0.17) },
    tent: 0.34,      // extra hinge-open per unit of chassis crush
  });

  // --- driver's door: swings out on a bent hinge, dark cabin behind it ------
  // outline follows a real door: sill rising over the rear arch, beltline falling away
  const doorGeo = slabGeo(22, 15, [1, 0, 0], 0.075, (u, v) => {
    const z = -1.04 * u;
    const yBot = 0.03 + 0.20 * u * u;
    const yTop = 0.55 - 0.05 * u - 0.06 * Math.pow(Math.max(0, u - 0.7) / 0.3, 2);
    const y = lerp(yBot, yTop, v);
    const tuck = -0.085 * v * v - 0.05 * Math.pow(u, 2.2);
    const env = 0.45 + 0.55 * Math.sin(z * 2.3 + y * 3.1);
    const buckle = 0.042 * ridge(z * 2.2 + 0.7, y * 4.1 + z * 0.6 + 0.2) * env;
    // vertical crease down the door skin, kicked in where the panel took the hit
    const crease = -0.062 * Math.max(0, 1 - Math.abs(u - 0.38 - 0.05 * Math.sin(y * 4.4)) / 0.17);
    return [tuck + buckle + crease, y, z];
  });
  creaseNormals(doorGeo, {}, null);
  const door = addPart({
    at: new THREE.Vector3(0.885, 0.585, 0.60),
    geo: doorGeo,
    pose: { p: new THREE.Vector3(0.870, 0.545, 0.62), e: new THREE.Euler(0.05, -0.78, -0.22) },
  });

  // --- front bumper: separated and rotated rather than intersecting ---------
  const bumperGeo = slabGeo(24, 10, [0, 0, 1], 0.15, (u, v) => {
    const x = -0.68 + 1.36 * u;
    const taper = 1 - 0.45 * Math.pow(Math.abs(2 * u - 1), 3);
    const y = 0.30 * v * taper;
    const wrap = -0.22 * Math.pow(2 * u - 1, 2);
    const env = 0.45 + 0.55 * Math.sin(x * 3.3 + 1.1);
    const buckle = 0.042 * ridge(x * 2.4 + 0.13, y * 5.0 + x * 0.9 + 2.2) * env;
    // the bumper folds around the corner it hit
    const crease = -0.048 * Math.max(0, 1 - Math.abs(x - 0.30) / 0.26);
    return [x, y, wrap + buckle + crease];
  });
  creaseNormals(bumperGeo, {}, null);
  const bumper = addPart({
    at: new THREE.Vector3(0, 0.40, 2.16),
    geo: bumperGeo,
    pose: { p: new THREE.Vector3(0.21, 0.16, 2.44), e: new THREE.Euler(-1.12, 0.30, 0.46) },
  });

  // --- wing mirrors: car.js owns those meshes, so hide them and throw our own
  //     caps into the world as real loose bodies.
  const mirrorTargets = [];
  {
    for (const s of [-1, 1]) {
      const anchor = new THREE.Vector3(s * 0.95, 1.05, 0.58);
      for (const child of shell.children) {
        if (!child.isMesh && !child.isGroup) continue;
        if (child === dmgMesh || child === fracMesh || child === partsRoot) continue;
        if (child.position.distanceTo(anchor) < 0.22) mirrorTargets.push(child);
      }
    }
  }
  const mirrorCapGeo = new THREE.SphereGeometry(0.075, 12, 8);
  mirrorCapGeo.scale(0.55, 0.62, 1.10);
  const shardGeo = new THREE.PlaneGeometry(0.09, 0.06);

  // free rigid bodies living in the car-root frame, so they stay in shot with the wreck
  // while still resting on the ground plane
  // ---------------------------------------------------------------------------
  // Contact shadow for a loose body. A torn-off wheel lying on the tarmac with no
  // shadow floats, and crash-cam-02's separated wheel is grounded by its own dark
  // ellipse. Built here rather than relying on the scene's shadow map: the loose
  // wheel must read as grounded in every scene, including the ones that render the
  // wreck without a directional shadow pass.
  // ---------------------------------------------------------------------------
  let blobTex = null;
  function blobShadowTex() {
    if (blobTex) return blobTex;
    const { c, ctx } = makeCanvas(128, 128);
    const g2 = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g2.addColorStop(0.00, 'rgba(0,0,0,0.80)');
    g2.addColorStop(0.45, 'rgba(0,0,0,0.52)');
    g2.addColorStop(0.78, 'rgba(0,0,0,0.16)');
    g2.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 128, 128);
    blobTex = maskTexture(c, false);
    blobTex.wrapS = blobTex.wrapT = THREE.ClampToEdgeWrapping;
    return blobTex;
  }
  const blobMats = [];
  function makeBlobShadow(radius) {
    const mat = new THREE.MeshBasicMaterial({
      map: blobShadowTex(), transparent: true, depthWrite: false,
      color: 0x000000, opacity: 1,
    });
    blobMats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  }

  const loose = [];
  /**
   * `src` may be a geometry (wrapped in a Mesh with `mat`) or a ready Object3D — the
   * torn-off wheel is a clone of car.js's own wheel group, which is several meshes.
   */
  /**
   * Take a car-LOCAL spawn point, launch velocity and rest attitude into looseRoot's
   * frame. looseRoot is parented outside the car so debris does not ride the wreck, and
   * every caller measures its spawn in the car's own frame (a wheel pivot, a mirror
   * mount) — so without this the transform is simply dropped and the debris is laid out
   * around the PARENT's origin instead. In the city that origin is 300 m up the block,
   * which is why a torn-off wheel read as a deleted wheel: it was real, lying in another
   * postcode. Rotation is carried through too, or a tyre torn off a car heading north
   * settles on a lean that only makes sense for a car heading east.
   */
  const _looseM = new THREE.Matrix4();
  const _looseP = new THREE.Vector3();
  const _looseQ = new THREE.Quaternion();
  const _looseS = new THREE.Vector3();
  function toLooseFrame(at, vel, restRot) {
    car.group.updateMatrixWorld(true);
    looseRoot.updateMatrixWorld(true);
    _looseM.copy(looseRoot.matrixWorld).invert().multiply(car.group.matrixWorld);
    _looseM.decompose(_looseP, _looseQ, _looseS);
    const p = at.clone().applyMatrix4(_looseM);
    const v = vel.clone().applyQuaternion(_looseQ);
    const r = restRot
      ? new THREE.Euler().setFromQuaternion(
        _looseQ.clone().multiply(new THREE.Quaternion().setFromEuler(restRot)))
      : null;
    return { p, v, r };
  }

  function spawnLoose(src, mat, at, vel, spin, radius, opts = null) {
    const m = src && src.isObject3D ? src : new THREE.Mesh(src, mat);
    if (m.isMesh) {
      m.castShadow = mat !== shardMat;
      m.onBeforeRender = syncFromPaint;
    } else {
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    }
    const f = toLooseFrame(at, vel, (opts && opts.restRot) || null);
    // A body spawned below its own radius starts INSIDE the ground, and stepBody then
    // applies its ground damping on every single step, so the thing dies where it was
    // born. That is the other half of the missing wheel: a hub sits at y 0.29 and a tyre
    // is 0.365 in radius, so the torn wheel lost 68% of its velocity per step and settled
    // back inside its own arch. Lifted clear of the plane so the launch actually happens.
    if (f.p.y < radius * 1.02) f.p.y = radius * 1.02;
    m.position.copy(f.p);
    looseRoot.add(m);
    const b = {
      mesh: m, r: radius, p: f.p.clone(), v: f.v, w: spin.clone(), rest: false,
      shadow: null, restRot: f.r,
    };
    if (opts && opts.shadow) {
      b.shadow = makeBlobShadow(opts.shadow);
      looseRoot.add(b.shadow);
      syncShadow(b);
    }
    loose.push(b);
    return b;
  }

  /** Ground the body's contact shadow: tighter and darker the closer it sits. */
  function syncShadow(b) {
    if (!b.shadow) return;
    const h = clamp((b.p.y - b.r) / 1.2, 0, 1);
    b.shadow.position.set(b.p.x, 0.010, b.p.z);
    const s = 1 + h * 1.5;
    b.shadow.scale.set(s, s, s);
    b.shadow.material.opacity = 0.92 * (1 - h * 0.75);
  }

  function stepBody(b, dt) {
    if (b.rest) return;
    b.v.y += GRAV * dt;
    b.p.addScaledVector(b.v, dt);
    if (b.p.y < b.r) {
      b.p.y = b.r;
      if (Math.abs(b.v.y) < 1.1 && b.v.lengthSq() < 3.5) {
        b.rest = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0);
        // A tyre does not come to rest at whatever angle the tumble left it on: it
        // topples onto a settled lean. Snapped explicitly so the wreck is the same
        // deterministic frame every time it is rendered.
        if (b.restRot) {
          b.mesh.rotation.copy(b.restRot);
          b.p.y = b.r;
        }
      } else {
        b.v.y = -b.v.y * 0.30;
        b.v.x *= 0.68; b.v.z *= 0.68;
        b.w.multiplyScalar(0.68);
      }
    }
    b.mesh.position.copy(b.p);
    if (!b.rest || !b.restRot) {
      b.mesh.rotation.x += b.w.x * dt;
      b.mesh.rotation.y += b.w.y * dt;
      b.mesh.rotation.z += b.w.z * dt;
    }
    syncShadow(b);
  }

  // ===========================================================================
  // state we must be able to hand back untouched
  // ===========================================================================
  const hidden = [];                       // {obj, visible}
  const glassWasVisible = glassMatRef ? glassMatRef.visible : true;

  function hideObj(obj) {
    if (!obj || obj.visible === false) return;
    hidden.push({ obj, visible: obj.visible });
    obj.visible = false;
  }

  let level = 0;
  let updateDriven = false;
  let scripted = false;                    // inside setLevel(): don't self-accumulate
  let mirrorsGone = false;
  let wheelTorn = false;
  let impactSeq = 0;

  // Every impact this car has taken, in car space. The glass fracture radiates from the
  // recorded strike, so the web on the screen is a consequence of the same hit that
  // creased the roof rather than a decal centred on the pane.
  const impacts = [];

  // ---- shared fold structure, per PANEL rather than per impact ----------------
  //
  // A panel does not get a fresh set of creases every time something hits it. Sheet
  // steel work-hardens: once a fold line exists, the next blow on the same panel drives
  // that SAME line deeper because it is the softest thing left. The old code gave every
  // impact its own frame and its own hinge pair, so setLevel()'s four front-metre hits
  // laid eight competing crease lines across one 1 m fascia and the nose measured out at
  // a ~6 px accordion period instead of the reference fender's 18.5 px pillow lobes.
  //
  // `panelFrame` pins a panel's fold ORIENTATION at the first hit it takes, and
  // `panelHinges` records where its creases live, as a distance along that frame's `fwd`
  // measured from the panel CENTROID so the coordinate does not move with the strike
  // point. A later hit snaps onto an existing hinge inside HINGE_MERGE and adds
  // amplitude there instead of opening a new crease.
  const HINGE_MERGE = 0.35;                // metres; merge radius along the fold axis
  const panelFrame = new Array(N_PANEL).fill(null);
  const panelHinges = [];
  for (let k = 0; k < N_PANEL; k++) panelHinges.push([]);

  /**
   * Snap `S` (a hinge station in panel-centroid coordinates) onto the nearest existing
   * hinge on `panel`, or register it as a new one. `avoid` is a station already claimed
   * by this same impact, so a hit's second fold can never collapse onto its first.
   * Returns the hinge record, which carries the crease's own wander phase — merged
   * hinges must wander together or the "merge" just stacks two offset creases.
   */
  function hingeAt(panel, S, avoid) {
    const hs = panelHinges[panel];
    let best = null, bd = HINGE_MERGE;
    for (const h of hs) {
      if (avoid && h === avoid) continue;
      const d = Math.abs(h.S - S);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) return best;
    // Phase is drawn from the impact counter, not from rng(): the deformer's fold
    // phases share one stream and an extra draw here would reshape the whole wreck.
    const h = { S, ph: (hs.length * 0.437 + panel * 0.131) % 1 };
    hs.push(h);
    return h;
  }

  /** The recorded impact most likely to have broken this pane. */
  function strikeFor(panel) {
    let best = null, bestScore = -1;
    for (const h of impacts) {
      const d = Math.hypot(h.p.x - panel.cx, h.p.y - panel.cy, h.p.z - panel.cz);
      const score = h.e / (0.30 + d * d);
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best ? best.p : null;
  }

  // ===========================================================================
  // mask painting
  // ===========================================================================

  /** Draw cb at x plus its wrapped copies, so a splat across u = 0 does not clip. */
  function wrapped(ctx, x, w, cb) {
    cb(x);
    if (x < w) cb(x + ctx.canvas.width);
    if (x > ctx.canvas.width - w) cb(x - ctx.canvas.width);
  }

  function radial(ctx, x, y, r, inner, outer) {
    wrapped(ctx, x, r, (px) => {
      const g = ctx.createRadialGradient(px, y, 0, px, y, r);
      g.addColorStop(0, inner);
      g.addColorStop(0.55, outer);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, y - r, r * 2, r * 2);
    });
  }

  /**
   * Bare-metal scuff plus a soot bloom, splatted per affected vertex so the mask
   * follows the body's own unwrap instead of assuming a planar projection.
   * @param hits array of [u, v, weight]
   */
  function paintScuffs(hits, strength) {
    if (!hits.length) return;
    const s = clamp(strength, 0, 1);

    // 0. crazed clearcoat, under everything including the soot. Crumpling micro-cracks
    //    the lacquer and orange-peels the sheet across the WHOLE dished field, not just
    //    on the crests, so the fold loses its mirror finish while keeping the body
    //    colour — crash-cam-04's crumpled front quarter holds 94.5% of the saturation
    //    of the intact door but has none of its sharp reflection. Without this the base
    //    paint's clearcoat turns every sky-facing crumple lobe into a white highlight,
    //    which desaturates the crush zone just as thoroughly as bare metal did.
    const pcol = car.paintMat && car.paintMat.color;
    if (pcol) {
      const enc = (v) => {
        const c = clamp(v, 0, 1);
        return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
      };
      const pr = enc(pcol.r), pg = enc(pcol.g), pb = enc(pcol.b);
      for (const [u, v, w, cr0, , dm0] of hits) {
        // driven by how far the sheet MOVED, not by curvature: the blown-out lobes are
        // the smooth parts between the folds, which is exactly where curvature is lowest
        const haze = clamp(Math.max(w * 0.95, (dm0 || 0) * 0.95) + (cr0 || 0) * 0.45, 0, 1);
        if (haze < 0.12) continue;
        const x = u * TEX, y = (1 - v) * TEX;
        const hr = 14 + 26 * haze;
        const ha = clamp(haze * 0.68 * (0.40 + 0.60 * s), 0, 0.72);
        radial(alb, x, y, hr, `rgba(${pr},${pg},${pb},${ha})`, `rgba(${pr},${pg},${pb},${ha * 0.5})`);
        // A third of the metalness of intact paint and roughness ~0.66: most of the
        // response becomes coloured diffuse, so the panel still reads as painted steel
        // but scatters the sky instead of imaging it
        radial(met, x * 0.5, y * 0.5, hr * 0.5,
          `rgba(92,92,92,${ha})`, `rgba(104,104,104,${ha * 0.5})`);
        radial(rgh, x * 0.5, y * 0.5, hr * 0.5,
          `rgba(168,168,168,${ha})`, `rgba(152,152,152,${ha * 0.5})`);
      }
    }

    // 1. soot / scorching first: wide, matte, dielectric, under everything else
    let cu = 0, cv = 0, tw = 0;
    for (const [u, v, w] of hits) { cu += u * w; cv += v * w; tw += w; }
    if (tw > 1e-4) {
      cu /= tw; cv /= tw;
      const sx = cu * TEX, sy = (1 - cv) * TEX;
      const sr = lerp(34, 92, s);
      radial(alb, sx, sy, sr, `rgba(22,19,17,${0.44 * s})`, `rgba(40,34,30,${0.16 * s})`);
      radial(rgh, sx * 0.5, sy * 0.5, sr * 0.5,
        `rgba(255,255,255,${0.7 * s})`, `rgba(255,255,255,${0.3 * s})`);
      radial(met, sx * 0.5, sy * 0.5, sr * 0.5, 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.25)');
    }

    // 2. paint fails in layers, and it fails where the sheet is bent hardest. `cr` is the
    //    local buckle curvature, so a crease crest scuffs through the clearcoat to grey
    //    primer first and only the sharpest crests go through to bright bare metal — the
    //    strike centre itself, if it merely dished, keeps its paint.
    for (const [u, v, w, cr0, rg0] of hits) {
      const cr = cr0 || 0;
      const rg = rg0 || 0;
      // Primer needs a fold, not merely a bent panel: `rg` carries most of the weight and
      // the isotropic `cr` only tops it up, so a dished-in but unfolded field stays under
      // the gate. Reference (crash-cam-04) keeps 94.5% of its saturation across a crumpled
      // front quarter, so anything that greys a whole panel is wrong by construction.
      const wear = clamp(rg * 0.90 + cr * 0.22 + Math.max(0, w - 0.70) * 0.5, 0, 1);
      // Deliberately high: paint wear that spreads over a whole quarter reads as mud,
      // not as scuffing. Only the crest of a fold loses its clearcoat.
      if (wear < 0.40) continue;
      const x = u * TEX, y = (1 - v) * TEX;

      // primer: matte, dielectric, a wide-ish patch along the fold
      const pr = 4 + 7 * wear;
      const pa = clamp((wear - 0.40) * 0.85 * (0.4 + 0.6 * s), 0, 0.50);
      radial(alb, x, y, pr, `rgba(126,120,112,${pa})`, `rgba(112,106,99,${pa * 0.4})`);
      radial(met, x * 0.5, y * 0.5, pr * 0.5, `rgba(0,0,0,${pa})`, `rgba(0,0,0,${pa * 0.4})`);
      radial(rgh, x * 0.5, y * 0.5, pr * 0.5,
        `rgba(235,235,235,${pa})`, `rgba(210,210,210,${pa * 0.4})`);

      // Bare metal: the CREST of the fold only, so this is gated on the anisotropic `rg`
      // with no isotropic term at all. A dish, however deep, never reaches it.
      const bare = clamp(rg * 1.05 + Math.max(0, w - 0.88) * 0.30, 0, 1);
      if (bare < 0.72) continue;
      const t2 = (bare - 0.72) / 0.28;
      const r = 2.0 + 3.4 * t2;
      const a = clamp(Math.pow(t2, 1.4) * 0.62 * (0.35 + 0.65 * s), 0, 0.58);
      radial(alb, x, y, r, `rgba(168,170,175,${a})`, `rgba(140,142,147,${a * 0.45})`);
      radial(met, x * 0.5, y * 0.5, r * 0.5,
        `rgba(215,215,215,${a})`, `rgba(175,175,175,${a * 0.5})`);
      // Torn steel is not chrome. At 105 (roughness 0.41) against an envMapIntensity of
      // 2.2 this read as a mirror of the sky; 186 is roughness 0.73, which scatters.
      radial(rgh, x * 0.5, y * 0.5, r * 0.5,
        `rgba(186,186,186,${a})`, `rgba(196,196,196,${a * 0.5})`);
    }

    // 3. scratches — long, thin, running lengthwise, which is the direction a panel
    //    actually drags along a wall or another car.
    const n = Math.round(8 + 30 * s);
    for (let i = 0; i < n; i++) {
      const h = hits[Math.floor(rng() * hits.length)];
      if (!h || h[2] < 0.12) continue;
      // Abrasion rides the fold crests. Reference puts it in thin streaks ALONG the
      // creases, so a hit with no ridge under it only rarely gets a scratch.
      // Decided off the loop index, NOT off rng(): every impact's fold phases are drawn
      // from the same stream, so an extra draw here would reshape the whole wreck.
      if ((h[4] || 0) < 0.30 && (i & 3) !== 0) continue;
      const x = h[0] * TEX, y = (1 - h[1]) * TEX;
      const len = (20 + rng() * 150) * (0.4 + s);
      const drift = (rng() - 0.5) * 42;
      const bright = 150 + Math.floor(rng() * 90);
      const alpha = (0.22 + 0.42 * rng()) * h[2];
      alb.lineWidth = 0.5 + rng() * 1.5;
      alb.lineCap = 'round';
      alb.strokeStyle = `rgba(${bright},${bright + 4},${bright + 12},${alpha})`;
      wrapped(alb, x, len, (px) => {
        alb.beginPath();
        alb.moveTo(px, y);
        alb.quadraticCurveTo(px + drift * 0.5, y - len * 0.5, px + drift, y - len);
        alb.stroke();
      });
      for (const [ctx2, style] of [[met, 'rgba(225,225,225,0.55)'], [rgh, 'rgba(178,178,178,0.5)']]) {
        ctx2.lineWidth = 0.6;
        ctx2.strokeStyle = style;
        ctx2.beginPath();
        ctx2.moveTo(x * 0.5, y * 0.5);
        ctx2.quadraticCurveTo((x + drift * 0.5) * 0.5, (y - len * 0.5) * 0.5,
          (x + drift) * 0.5, (y - len) * 0.5);
        ctx2.stroke();
      }
    }

    albTex.needsUpdate = metTex.needsUpdate = rghTex.needsUpdate = true;
    dmgMesh.visible = true;
  }

  /** A torn hole in the paint where a panel came away: dark cavity, ragged bright rim. */
  function paintCavity(u0, u1, v0, v1, a = 0.9) {
    const x = u0 * TEX, y = (1 - v1) * TEX;
    const w = (u1 - u0) * TEX, h = (v1 - v0) * TEX;
    // an ellipse, not a rectangle — a rectangle reads as a sticker every time
    alb.save();
    alb.beginPath();
    alb.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    alb.clip();
    const g = alb.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(9,9,10,${a * 0.6})`);
    g.addColorStop(0.4, `rgba(6,6,7,${a})`);
    g.addColorStop(1, `rgba(11,11,12,${a * 0.75})`);
    alb.fillStyle = g;
    alb.fillRect(x, y, w, h);
    alb.restore();
    met.fillStyle = 'rgba(0,0,0,0.9)';
    met.fillRect(x * 0.5, y * 0.5, w * 0.5, h * 0.5);
    rgh.fillStyle = 'rgba(255,255,255,0.9)';
    rgh.fillRect(x * 0.5, y * 0.5, w * 0.5, h * 0.5);
    // ragged torn lip of bare metal around the opening
    alb.strokeStyle = `rgba(196,201,209,${0.6 * a})`;
    alb.lineWidth = 2.6;
    alb.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const jr = 1 + (rng() - 0.35) * 0.11;
      const px = x + w / 2 + Math.cos(t) * (w / 2) * jr;
      const py = y + h / 2 + Math.sin(t) * (h / 2) * jr;
      if (i === 0) alb.moveTo(px, py); else alb.lineTo(px, py);
    }
    alb.closePath();
    alb.stroke();
    albTex.needsUpdate = metTex.needsUpdate = rghTex.needsUpdate = true;
    dmgMesh.visible = true;
  }

  /**
   * The crack network. Everything about it hangs off ONE strike point:
   *
   *   - a small crushed-frost core (whitened tint, opacity climbing toward opaque) whose
   *     radius is a few centimetres, never the pane;
   *   - a dense concentric web inside ~10 cm of the strike, where laminated glass
   *     actually shatters into small polygons;
   *   - sparse long radials running outward, tapering in width and brightness as they
   *     go, so the fracture has a direction and a source instead of being a uniform
   *     tangle of equal-weight strokes.
   *
   * Line work goes into the emissive caustic channel (bright thin filament) and only
   * faintly into opacity, so a crack scatters light without hiding what is behind it.
   * The whole thing is clipped to the pane's own uv footprint.
   */
  function paintFracture(panel, amount, hit) {
    const a = clamp(amount, 0, 1);
    const at = paneUvAt(panel, hit);
    // Keep the origin inside the pane: a strike recorded on the cowl in front of the
    // screen still has to put its core on glass.
    const mu = (panel.u1 - panel.u0) * 0.18, mv = (panel.v1 - panel.v0) * 0.18;
    const ou = clamp(at ? at.u : panel.u, panel.u0 + mu, panel.u1 - mu);
    const ov = clamp(at ? at.v : panel.v, panel.v0 + mv, panel.v1 - mv);
    const x = ou * CRACK, y = (1 - ov) * CRACK;
    // metres -> canvas px per axis, so a circle in the world stays a circle on the pane
    const sx = Math.max(1e-3, panel.uPerM) * CRACK;
    const sy = Math.max(1e-3, panel.vPerM) * CRACK;
    const cx0 = panel.u0 * CRACK, cy0 = (1 - panel.v1) * CRACK;
    const cw = (panel.u1 - panel.u0) * CRACK, ch = (panel.v1 - panel.v0) * CRACK;
    const clipPane = (ctx2) => {
      ctx2.save();
      ctx2.beginPath();
      ctx2.rect(cx0, cy0, cw, ch);
      ctx2.clip();
      ctx2.lineCap = 'round';
      ctx2.lineJoin = 'round';
    };
    // polar -> pixels, v pointing up the canvas
    const px = (ang, r) => x + Math.cos(ang) * r * sx;
    const py = (ang, r) => y - Math.sin(ang) * r * sy;

    /**
     * One crack segment. `bright` is the caustic weight: thin bright filament in the
     * emissive channel, a whisper of extra opacity where the glass has separated.
     */
    const crackLine = (pts, w, bright) => {
      for (const [ctx2, style, lw] of [
        [cau, `rgba(206,234,255,${clamp(bright, 0, 1)})`, w],
        [alf, `rgba(255,255,255,${clamp(bright * 0.22, 0, 1)})`, w * 1.35],
      ]) {
        ctx2.strokeStyle = style;
        ctx2.lineWidth = lw;
        ctx2.beginPath();
        ctx2.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx2.lineTo(pts[i], pts[i + 1]);
        ctx2.stroke();
      }
    };

    for (const ctx2 of [tint, alf, cau]) clipPane(ctx2);

    // --- crushed frost core: small, and the ONLY place the pane loses transparency ---
    const rf = lerp(0.045, 0.095, a);
    const frost = (ctx2, r, stops) => {
      ctx2.save();
      ctx2.translate(x, y);
      ctx2.scale(1, sy / sx);
      const R = Math.max(2, r * sx);
      const g = ctx2.createRadialGradient(0, 0, 0, 0, 0, R);
      for (const [t, c] of stops) g.addColorStop(t, c);
      ctx2.fillStyle = g;
      ctx2.fillRect(-R, -R, R * 2, R * 2);
      ctx2.restore();
    };
    frost(tint, rf, [
      [0, `rgba(196,212,226,${0.80 * a})`],
      [0.45, `rgba(150,172,190,${0.34 * a})`],
      [1, 'rgba(150,172,190,0)'],
    ]);
    frost(alf, rf, [
      [0, `rgba(255,255,255,${0.85 * a})`],
      [0.5, `rgba(255,255,255,${0.30 * a})`],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // pulverised glass at the core scatters, so it glows faintly on its own
    frost(cau, rf * 1.5, [
      [0, `rgba(178,206,230,${0.30 * a})`],
      [0.5, `rgba(150,182,210,${0.10 * a})`],
      [1, 'rgba(0,0,0,0)'],
    ]);

    // --- radials: few, long, tapering out from the strike ------------------------
    const reach = lerp(0.22, 0.60, a);
    const nRad = Math.round(lerp(9, 17, a));
    const angles = [];
    for (let i = 0; i < nRad; i++) {
      const base = (i / nRad) * Math.PI * 2 + (rng() - 0.5) * 0.42;
      angles.push(base);
      const len = reach * (0.45 + rng() * 0.85);
      const segs = 7;
      let ang = base, r = rf * 0.5;
      let ax = px(ang, r), ay = py(ang, r);
      for (let s = 0; s < segs; s++) {
        ang += (rng() - 0.5) * 0.22;
        const r2 = r + (len / segs) * (0.7 + rng() * 0.6);
        const bx = px(ang, r2), by = py(ang, r2);
        const t = r2 / len;                          // 0 at the strike, 1 at the tip
        crackLine([ax, ay, bx, by], lerp(2.6, 0.55, clamp(t, 0, 1)),
          lerp(0.95, 0.18, clamp(t, 0, 1)) * (0.55 + 0.45 * a));
        // a radial that forks partway out, which is how a long crack actually runs
        if (s === 2 && rng() < 0.55) {
          const fa = ang + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.5);
          const fr = r2 + len * (0.18 + rng() * 0.30);
          crackLine([bx, by, px(fa, fr), py(fa, fr)], 0.9, 0.34 * (0.5 + 0.5 * a));
        }
        ax = bx; ay = by; r = r2;
      }
    }

    // --- dense concentric web, only near the hit ---------------------------------
    const ri = lerp(0.055, 0.125, a);
    const rings = Math.round(lerp(5, 9, a));
    for (let k = 1; k <= rings; k++) {
      const rr = rf * 0.8 + (ri - rf * 0.8) * Math.pow(k / rings, 0.85);
      const w = lerp(1.9, 0.65, k / rings);
      const bright = lerp(0.70, 0.24, k / rings) * (0.5 + 0.5 * a);
      for (let i = 0; i < angles.length; i++) {
        const a0 = angles[i], a1 = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
        if (rng() > 0.86) continue;                 // a few ties are simply missing
        const j0 = rr * (0.88 + rng() * 0.24), j1 = rr * (0.88 + rng() * 0.24);
        const am = (a0 + a1) * 0.5, jm = rr * (0.80 + rng() * 0.3);
        crackLine([px(a0, j0), py(a0, j0), px(am, jm), py(am, jm), px(a1, j1), py(a1, j1)],
          w, bright);
      }
    }

    // --- crazing: short chords filling the inner web with small polygons ---------
    const nCraze = Math.round(30 * a);
    for (let i = 0; i < nCraze; i++) {
      const a0 = rng() * Math.PI * 2;
      const r0 = rf * 0.6 + rng() * (ri - rf * 0.6);
      const a1 = a0 + (rng() - 0.5) * 0.9;
      const r1 = r0 * (0.6 + rng() * 0.7);
      crackLine([px(a0, r0), py(a0, r0), px(a1, r1), py(a1, r1)], 0.75, 0.28 * a);
    }

    for (const ctx2 of [tint, alf, cau]) ctx2.restore();
    tintTex.needsUpdate = alfTex.needsUpdate = cauTex.needsUpdate = true;
    if (glassMesh) hideObj(glassMesh);
    fracMesh.visible = true;
  }


  // ===========================================================================
  // rigid-body crush stage
  //
  // Runs BEFORE the per-weld buckle field and is kept in its own array: the
  // gradient limiter, the MAX_DISP clamp and the Laplacian relax all operate on
  // wDisp, so none of them can sand the chassis crush back out. writePositions
  // sums the two.
  // ===========================================================================

  // Rest silhouette. The crush and the buckle together may never push a vertex
  // outside this box — a crumpling car does not get longer, wider or taller, and
  // the old wreck grew 43 mm in width and 8 mm in height because nothing said so.
  const env = { xMax: 0, yLo: Infinity, yHi: -Infinity, zLo: Infinity, zHi: -Infinity };
  for (let i = 0; i < vCount; i++) {
    const x = Math.abs(restPos[i * 3]), y = restPos[i * 3 + 1], z = restPos[i * 3 + 2];
    if (x > env.xMax) env.xMax = x;
    if (y < env.yLo) env.yLo = y;
    if (y > env.yHi) env.yHi = y;
    if (z < env.zLo) env.zLo = z;
    if (z > env.zHi) env.zHi = z;
  }

  // Zone breakpoints, taken from the same shutline stations the panel map uses so a
  // zone boundary always falls on a seam the body already draws a gap along.
  const zoneEdges = [env.zLo, Z_DOORR, Z_COWL, Z_FBUMP, env.zHi];
  const zones = CRUSH_ZONES.map((z, i) => ({
    ...z, z0: zoneEdges[i], z1: zoneEdges[i + 1], q: 0,
  }));
  const crushS = new Float32Array(zones.length).fill(1);   // per-zone length scale
  const wCrush = new Float32Array(wCount * 3);
  let crush = 0;                                           // accumulator, 0..1
  const axleZ = (car.DIMS && car.DIMS.frontZ) || 1.50;

  /**
   * The crush map. Monotone piecewise linear in z, anchored at the tail: the rear
   * bumper never moves and every station ahead of it is pulled rearward by the
   * accumulated loss of all the zones behind it. Strictly increasing while every
   * scale stays positive, so the chassis cannot invert however hard it is crushed.
   */
  function crushZ(z) {
    if (z <= zones[0].z0) return z;
    let out = zones[0].z0;
    for (let i = 0; i < zones.length; i++) {
      const zn = zones[i];
      if (z >= zn.z1) { out += (zn.z1 - zn.z0) * crushS[i]; continue; }
      return out + (z - zn.z0) * crushS[i];
    }
    return out + (z - zones[zones.length - 1].z1);
  }

  /** Total longitudinal loss at the current crush, in metres. */
  function crushLoss() {
    let l = 0;
    for (let i = 0; i < zones.length; i++) l += (zones[i].z1 - zones[i].z0) * (1 - crushS[i]);
    return l;
  }

  const wheelRest = (car.wheels || []).map((w) => ({
    w, p: w.pivot.position.clone(), front: w.pivot.position.z > 0,
    side: w.pivot.position.x >= 0 ? 1 : -1,
  }));

  // Rigid front-clip props: the same problem the wheels had, one layer out. The grille,
  // the splitter, its slats and ducts and the two lamp pods are STATIC children of
  // `shell`, so the per-weld skin displacement never touches them. The crush pulls the
  // nose SKIN back by up to 0.78 m while they hold their stock offsets, and the render
  // shows a bumper slab, a chrome grille and two lamp pods hanging in open air with a
  // clean gap behind them — in the reference the clip either stays welded into the
  // collapsing structure or separates outright, never floats at a stock offset.
  //
  // car.js publishes the four main nodes as `car.crushRigids`. Its grille slats and
  // brake ducts are NOT in that list, so anything else parented straight to the shell
  // forward of the bumper split is picked up here by position: the whole clip has to
  // travel together or the trim tears away from the panel it is bolted to. Only direct
  // children qualify — a nested node's position is not in the shell's frame, which is
  // the frame crushZ is defined in.
  //
  // Each prop is BOUND to the welds around it rather than to the crush map alone. The
  // map is only half the motion: the buckle field dents the nose skin another 100-200 mm
  // rearward on top of it, so a prop driven off crushZ by itself ends up protruding
  // through the very panel it is supposed to be bolted into. Riding the weld cloud makes
  // the prop follow whatever the skin actually did, crush and buckle together.
  const RIGID_Z0 = Z_FBUMP - 0.30;
  const RIGID_BIND_R = 0.42;       // weld-binding radius around a prop, metres
  const RIGID_LEAD_SLOP = 0.05;    // how far a prop may drift off its rest lead, metres
  const _pbox = [0, 0, 0, 0];
  const _pm = new THREE.Matrix4();
  const _pb = new THREE.Box3();

  /**
   * A prop's leading z and its (x, y) box, in the shell's frame, for its CURRENT pose.
   * The footprint has to follow the prop: a splitter blade pitched 20 deg nose-down
   * sweeps a very different band of bodywork than the one it started under, and pinning
   * it against its rest band is what left it 134 mm proud at level 0.95.
   */
  function propGeom(n) {
    shell.updateMatrixWorld(true);
    _pm.copy(shell.matrixWorld).invert();
    const shellInv = _pm.clone();
    n.updateMatrixWorld(true);
    let front = -Infinity;
    _pbox[0] = Infinity; _pbox[1] = -Infinity; _pbox[2] = Infinity; _pbox[3] = -Infinity;
    n.traverse((o) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _pb.copy(o.geometry.boundingBox).applyMatrix4(_pm.copy(shellInv).multiply(o.matrixWorld));
      if (_pb.max.z > front) front = _pb.max.z;
      if (_pb.min.x < _pbox[0]) _pbox[0] = _pb.min.x;
      if (_pb.max.x > _pbox[1]) _pbox[1] = _pb.max.x;
      if (_pb.min.y < _pbox[2]) _pbox[2] = _pb.min.y;
      if (_pb.max.y > _pbox[3]) _pbox[3] = _pb.max.y;
    });
    return Number.isFinite(front) ? { front, box: _pbox } : null;
  }

  /**
   * Leading z of the bodywork inside `box`, over the DEFORMED skin when `def` is set and
   * over the rest pose otherwise — identical at rest, which is what makes setLevel(0)
   * restore the stock pose exactly. Returns null when the box catches nothing.
   *
   * The MAXIMUM, and the box is taken with no margin. Both matter: a quantile or a padded
   * box measures a slightly different piece of metal than the prop is actually in front
   * of, and on a nose whose skin has a 0.3 m/cm gradient a 20 mm pad on the box was worth
   * 320 mm of prop travel. This is the same quantity the crumple is judged by — prop
   * front face minus skin z-max inside the prop's own (x, y) footprint — so it holds
   * exactly rather than approximately.
   */
  function footSkinZ(box, zCut, def) {
    let m = -Infinity;
    const bx0 = box[0], bx1 = box[1];
    const by0 = box[2], by1 = box[3];
    for (const t of targets) {
      // The WRITTEN vertex array, not `wPos + wCrush + wDisp`. writePositions() adds each
      // vertex's own rest offset off the weld and then runs the rest-silhouette envelope
      // guard over the result, so the weld cloud can sit a long way from the skin that is
      // actually on screen — and "is the trim poking through the bodywork" is a question
      // about the skin on screen.
      const arr = def ? t.pos.array : t.restPos;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        if (x < bx0 || x > bx1) continue;
        const y = arr[i + 1];
        if (y < by0 || y > by1) continue;
        const z = arr[i + 2];
        if (z < zCut || z <= m) continue;
        m = z;
      }
    }
    return Number.isFinite(m) ? m : null;
  }
  const rigidRest = (() => {
    // Every rest measurement below is taken in the SHELL's frame, the frame the weld
    // cloud and the crush map are both defined in.
    shell.updateMatrixWorld(true);
    const shellInv = shell.matrixWorld.clone().invert();
    const list = [];
    const seen = new Set();
    const add = (n) => {
      if (!n || !n.isObject3D || n.parent !== shell || seen.has(n)) return;
      seen.add(n);
      const p = n.position;
      // Weld binding: inverse-square-falloff weights over every weld inside the radius,
      // widened until something is caught so a prop can never end up unbound.
      let idx = [], wt = [], r = RIGID_BIND_R;
      for (let pass = 0; pass < 4 && !idx.length; pass++, r *= 1.6) {
        idx = []; wt = [];
        for (let w = 0; w < wCount; w++) {
          const dx = wPos[w * 3] - p.x, dy = wPos[w * 3 + 1] - p.y, dz = wPos[w * 3 + 2] - p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r * r) continue;
          idx.push(w);
          wt.push(1 / (1 + d2 / (0.10 * 0.10)));
        }
      }
      // How far this prop's leading face sticks out past the leading edge of its own weld
      // cloud at rest. The apply step holds that offset, so trim can never swim through
      // the panel it is bolted to nor sink away inside it.
      let front = -Infinity, cloudFront = -Infinity;
      for (const w of idx) if (wPos[w * 3 + 2] > cloudFront) cloudFront = wPos[w * 3 + 2];
      n.updateMatrixWorld(true);
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      n.traverse((o) => {
        if (!o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone()
          .applyMatrix4(shellInv.clone().multiply(o.matrixWorld));
        if (b.max.z > front) front = b.max.z;
        if (b.min.x < bx0) bx0 = b.min.x;
        if (b.max.x > bx1) bx1 = b.max.x;
        if (b.min.y < by0) by0 = b.min.y;
        if (b.max.y > by1) by1 = b.max.y;
      });
      // FOOTPRINT reference: the bodywork directly in front of / around this prop,
      // selected by the prop's own (x, y) box rather than by a sphere about its origin.
      //
      // The sphere cloud above is the right thing to average BULK motion over, but it is
      // the wrong reference for depth: a 0.42 m ball around a lamp pod picks up bonnet
      // and valance welds whose leading edge, once the nose folds, belongs to a
      // completely different piece of metal than the one the lamp is looking through.
      // That is what let the grille sink 163 mm, the lamps surface 126 mm and the
      // splitter go non-monotonic — the clamp was holding a reference that itself moved.
      const box = [bx0, bx1, by0, by1];
      const zCut = Number.isFinite(front) ? front - 1.20 : -Infinity;  // front clip only
      const footZ = Number.isFinite(front) ? footSkinZ(box, zCut, false) : null;
      list.push({
        n, p: p.clone(), rx: n.rotation.x,
        idx: Int32Array.from(idx), wt: Float32Array.from(wt),
        wSum: wt.reduce((a, b) => a + b, 0) || 1,
        front: Number.isFinite(front) ? front : p.z,
        lead: Number.isFinite(front) && Number.isFinite(cloudFront) ? front - cloudFront : null,
        box,
        leadF: footZ === null ? null : front - footZ,
      });
    };
    // published list first, so build order is preserved for anyone reading it back
    if (Array.isArray(car.crushRigids)) for (const n of car.crushRigids) add(n);
    for (const n of shell.children) if (n.position.z > RIGID_Z0) add(n);
    return list;
  })();

  /**
   * Drive the rigid props off the deformed SKIN.
   *
   * Translation is the weighted mean displacement of the welds the prop is bound to, so
   * a prop telescopes exactly as far as the bodywork around it and neither floats ahead
   * of a collapsed nose nor punches out through it.
   *
   * Rotation is a pitch taken from the local FOLD GRADIENT of that same cloud: the
   * weighted least-squares slope of the vertical displacement along z, d(uy)/dz, so a
   * prop tips nose-down by however much the structure under it folded away. That is what
   * makes the bumper ROTATE as it telescopes instead of reading as a part on rails.
   *
   * The other half of a full rotation tensor, d(uz)/dy, is deliberately NOT used: it is
   * dominated by pure compression shear rather than rotation — the bonnet line collapses
   * two to three times further than the valance below it, which fits slopes of -2.3 rad/m
   * and pitches the splitter 26 deg nose-UP into the air. Clamped either way, since a
   * cloud straddling a fold ridge can still fit a steep slope.
   *
   * No-ops cleanly when car.js published nothing and nothing sits forward of the split.
   */
  function applyCrushToRigids() {
    for (const r of rigidRest) {
      const { idx, wt, wSum } = r;
      if (!idx.length) continue;
      let ux = 0, uy = 0, uz = 0, cz = 0;
      for (let k = 0; k < idx.length; k++) {
        const w = idx[k] * 3, q = wt[k];
        ux += q * (wCrush[w] + wDisp[w]);
        uy += q * (wCrush[w + 1] + wDisp[w + 1]);
        uz += q * (wCrush[w + 2] + wDisp[w + 2]);
        cz += q * wPos[w + 2];
      }
      ux /= wSum; uy /= wSum; uz /= wSum; cz /= wSum;
      let szy = 0, szz = 0;
      for (let k = 0; k < idx.length; k++) {
        const w = idx[k] * 3, q = wt[k];
        const dz = wPos[w + 2] - cz;
        szy += q * dz * (wCrush[w + 1] + wDisp[w + 1] - uy);   // d(uy)/dz numerator
        szz += q * dz * dz;
      }
      const dydz = szz > 1e-6 ? szy / szz : 0;
      const theta = clamp(-dydz, -0.20, 0.35);

      // Lead clamp. The weighted mean is a good bulk motion but it is an average over a
      // cloud that can collapse very unevenly — the bonnet line above the splitter goes
      // twice as far as the valance below it — so the mean alone still lets a lip poke
      // 0.14 m out through the crumpled skin or a grille sink 0.15 m inside it. Holding
      // the prop's rest lead over the LEADING edge of its own cloud pins it to the panel
      // instead. Exactly the identity at rest, so setLevel(0) restores stock offsets.
      r.n.position.set(r.p.x + ux, r.p.y + uy, r.p.z + uz);
      r.n.rotation.x = r.rx + theta;

      // Depth is then RE-PINNED against the footprint skin, and it is set rather than
      // clamped: the prop's rest lead over the metal directly in front of it is the one
      // quantity that has to survive the crush exactly, or the trim is either swallowed
      // by the bodywork or left jutting out of a collapsed nose. The x/y band is read off
      // the pose just written, so the reference follows the prop instead of staying where
      // the prop used to be, and the skin is read DEFORMED — identical to the rest set at
      // rest, so setLevel(0) still restores the stock pose exactly.
      let pinned = false;
      if (r.leadF !== null) {
        const gm = propGeom(r.n);
        if (gm) {
          const fz = footSkinZ(gm.box, gm.front - 1.20, true);
          if (fz !== null) { r.n.position.z += (fz + r.leadF) - gm.front; pinned = true; }
        }
      }
      if (!pinned && r.lead !== null) {
        let cf = -Infinity;
        for (let k = 0; k < idx.length; k++) {
          const w = idx[k] * 3;
          const z = wPos[w + 2] + wCrush[w + 2] + wDisp[w + 2];
          if (z > cf) cf = z;
        }
        const want = cf + r.lead - r.front;
        r.n.position.z = r.p.z + clamp(uz, want - RIGID_LEAD_SLOP, want + RIGID_LEAD_SLOP);
      }
    }
  }

  /**
   * The wheels are driven off the SAME map as the skin, which is the whole point:
   * a hub whose z comes from anywhere else floats at the stock wheelbase while the
   * arch around it collapses. On top of the map the front hubs get CRUSH_HUB_JAM of
   * extra rearward travel (the folding suspension arm), a little drop as the spring
   * seat collapses, and negative camber plus toe-out from the bent knuckle.
   */
  function applyCrushToWheels() {
    for (const r of wheelRest) {
      const piv = r.w.pivot;
      const jam = r.front ? CRUSH_HUB_JAM : 0.012;
      piv.position.z = crushZ(r.p.z) - jam * crush;
      piv.position.y = r.p.y - (r.front ? 0.075 : 0.010) * crush;
      piv.position.x = r.p.x * (1 - (r.front ? 0.045 : 0.004) * crush);
      if (r.front) {
        piv.rotation.z = -r.side * 0.24 * crush;
        piv.rotation.x = 0.14 * crush;
      }
    }
  }

  /**
   * Rebuild the crush field at accumulator `c` and push it into the shell, the
   * wheels and the detached-panel poses. Cheap enough to call per impact: it is one
   * linear pass over the welds.
   */
  function setCrush(c) {
    const next = clamp(c, 0, 1);
    if (next === crush && next === 0) return;
    crush = next;
    for (let i = 0; i < zones.length; i++) {
      zones[i].q = smoothstep(zones[i].on, zones[i].off, crush);
      crushS[i] = 1 - zones[i].max * zones[i].q;
    }
    const qCab = zones[1].q;
    if (crush <= 0) {
      wCrush.fill(0);
    } else {
      for (let w = 0; w < wCount; w++) {
        const x = wPos[w * 3], y = wPos[w * 3 + 1], z = wPos[w * 3 + 2];
        const ny = wNrm[w * 3 + 1];
        let dx = 0, dy = 0;
        const dz = crushZ(z) - z;

        // 1. lateral pinch — the front clip is squeezed narrower as it telescopes,
        //    which is also what keeps the width from creeping outward.
        const fwd = clamp((z - Z_DOORF) / (Z_FBUMP - Z_DOORF), 0, 1);
        dx -= x * CRUSH_PINCH * crush * fwd;

        // 2. hood tent. The bay lost ~46% of its length; the skin over it lost none,
        //    so the surplus sheet has to go somewhere and it tents up over the
        //    shortened bay. Only up-facing skin is lifted, and `ridge` breaks the
        //    tent into folds so it is not one smooth dome.
        if (ny > 0.18 && y > 0.62) {
          const tz = Math.max(0, 1 - Math.abs(z - (Z_COWL + 0.20)) / 0.68);
          const fold = 0.72 + 0.42 * ridge(x * 2.6 + 0.4, z * 2.2 + 1.9);
          dy += CRUSH_TENT * crush * tz * clamp((ny - 0.18) / 0.5, 0, 1) * fold;
        }

        // 3. nose drop — below the bumper line the rails fold under rather than back.
        if (z > Z_FBUMP - 0.25 && y < 0.66) {
          const t = clamp((z - (Z_FBUMP - 0.25)) / 0.55, 0, 1);
          dy -= CRUSH_NOSEDROP * crush * t * clamp((0.66 - y) / 0.30, 0, 1);
        }

        // 4. cabin settles onto its shortened floor once it starts taking load.
        if (y > 1.10 && qCab > 0) {
          dy -= CRUSH_ROOF * qCab * clamp((y - 1.10) / 0.28, 0, 1);
        }

        // 5. front arch collapse. The z map already ovalises the opening; this folds
        //    its lip down onto the tyre, hardest on the leading edge, so the arch
        //    stops being an unbroken circle at a stock wheelbase.
        const ac = clamp(1 - Math.abs(z - axleZ) / CRUSH_ARCH_REACH, 0, 1);
        if (ac > 0 && y > 0.30 && y < 0.98) {
          const av = clamp(1 - (y - 0.34) / 0.60, 0, 1);
          dy -= CRUSH_ARCH * crush * ac * av * (z > axleZ ? 1.0 : 0.55);
        }

        wCrush[w * 3] = dx;
        wCrush[w * 3 + 1] = dy;
        wCrush[w * 3 + 2] = dz;
      }
    }
    applyCrushToWheels();
    for (const p of parts) applyPartPose(p);
    writePositions();
  }

  /** Severity -> chassis crush. Nothing structural happens under a light knock. */
  const crushForLevel = (l) => clamp((l - 0.12) / 0.80, 0, 1);

  // ===========================================================================
  // deformation
  // ===========================================================================
  const _t1 = new THREE.Vector3();
  const _t2 = new THREE.Vector3();
  const _d = new THREE.Vector3();

  /**
   * Crease-threshold vertex normals.
   *
   * computeVertexNormals averages every face around a vertex unconditionally, so a
   * buckle ridge — which is a ~60 deg dihedral over one edge — comes out as a smooth
   * shading gradient and the fold is invisible. This does the standard two-pass split:
   * an unconditional average first, then a second accumulation that keeps only the
   * faces lying within CREASE_COS of that average. On a ridge the two sides disagree by
   * more than the threshold, so each vertex takes the side it mostly belongs to and the
   * shading breaks hard along the fold — the same result as splitting the vertex, but
   * without touching a vertex count car.js owns.
   *
   * Faces flatter than the threshold are unaffected, so the loft's smooth panels and the
   * deliberately-degenerate hard-seam quads both come through exactly as before.
   */
  function creaseNormals(geo, cache, restN) {
    const idx = geo.index;
    if (!idx || !geo.attributes.normal) { geo.computeVertexNormals(); return; }
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const nf = idx.count / 3;
    if (!cache.faceN || cache.faceN.length !== nf * 3) {
      cache.faceN = new Float32Array(nf * 3);
      cache.avgN = new Float32Array(n.length);
    }
    const fN = cache.faceN, avg = cache.avgN;
    avg.fill(0);
    for (let f = 0; f < nf; f++) {
      const a = idx.getX(f * 3) * 3, b = idx.getX(f * 3 + 1) * 3, c = idx.getX(f * 3 + 2) * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      // unnormalised cross product = 2 * area * unit normal, i.e. area weighting for free
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      fN[f * 3] = nx; fN[f * 3 + 1] = ny; fN[f * 3 + 2] = nz;
      for (const o of [a, b, c]) { avg[o] += nx; avg[o + 1] += ny; avg[o + 2] += nz; }
    }
    for (let i = 0; i < avg.length; i += 3) {
      const l = Math.hypot(avg[i], avg[i + 1], avg[i + 2]);
      if (l > 1e-12) { avg[i] /= l; avg[i + 1] /= l; avg[i + 2] /= l; }
    }
    n.fill(0);
    for (let f = 0; f < nf; f++) {
      const nx = fN[f * 3], ny = fN[f * 3 + 1], nz = fN[f * 3 + 2];
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      const ux = nx / l, uy = ny / l, uz = nz / l;
      for (let e = 0; e < 3; e++) {
        const o = idx.getX(f * 3 + e) * 3;
        if (ux * avg[o] + uy * avg[o + 1] + uz * avg[o + 2] < CREASE_COS) continue;
        n[o] += nx; n[o + 1] += ny; n[o + 2] += nz;
      }
    }
    const rn = restN;
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
      if (l > 1e-9) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; continue; }
      // a vertex whose faces all disagreed with their own average, or an orphan column
      // on a hard seam: fall back to the plain average, then to the rest normal
      const la = Math.hypot(avg[i], avg[i + 1], avg[i + 2]);
      if (la > 1e-9) { n[i] = avg[i]; n[i + 1] = avg[i + 1]; n[i + 2] = avg[i + 2]; }
      else if (rn) { n[i] = rn[i]; n[i + 1] = rn[i + 1]; n[i + 2] = rn[i + 2]; }
      else { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
    }
    geo.attributes.normal.needsUpdate = true;
  }

  function writePositions() {
    for (const t of targets) {
      const arr = t.pos.array, rp = t.restPos;
      for (let i = 0; i < vCount; i++) {
        const w = weldOf[i] * 3;
        const rx = rp[i * 3], ry = rp[i * 3 + 1], rz = rp[i * 3 + 2];
        let px = rx + wCrush[w] + wDisp[w];
        let py = ry + wCrush[w + 1] + wDisp[w + 1];
        let pz = rz + wCrush[w + 2] + wDisp[w + 2];

        // --- rest-silhouette guard -----------------------------------------
        // Crumpling conserves the envelope: the wreck may collapse inward as far
        // as it likes but may not push past the box the pristine body occupied.
        // Written against each vertex's OWN rest coordinate with softRoom, so it
        // is exactly the identity at rest — setLevel(0) still returns the
        // pristine 4.750 x 1.990 x 1.168 box to the millimetre — and it shades
        // off smoothly instead of shaving a flat spot along the flank.
        const ax = Math.abs(px), arx = Math.abs(rx);
        if (ax > arx) {
          const na = arx + envLimit(ax - arx, env.xMax - arx);
          px = px < 0 ? -na : na;
        }
        if (py > ry) py = ry + envLimit(py - ry, env.yHi - ry);
        else if (py < ry) py = ry - envLimit(ry - py, ry - env.yLo);
        if (pz > rz) pz = rz + envLimit(pz - rz, env.zHi - rz);
        else if (pz < rz) pz = rz - envLimit(rz - pz, rz - env.zLo);

        arr[i * 3] = px;
        arr[i * 3 + 1] = py;
        arr[i * 3 + 2] = pz;
      }
      t.pos.needsUpdate = true;
      // Recomputed against each target's own index, exactly as car.js builds it, so the
      // deliberately-degenerate crease quads keep contributing no normal and the hard
      // seams stay hard — plus a crease threshold, so a fold ridge produced by the
      // deformer gets a hard shading break rather than a smooth gradient.
      creaseNormals(t.geo, t, t.restNrm);
      const n = t.geo.attributes.normal.array;
      const rn = t.restNrm;
      for (let i = 0; i < n.length; i += 3) {
        if (!Number.isFinite(n[i]) || !Number.isFinite(n[i + 1]) || !Number.isFinite(n[i + 2])) {
          if (rn) { n[i] = rn[i]; n[i + 1] = rn[i + 1]; n[i + 2] = rn[i + 2]; }
          else { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
        }
      }
      t.geo.attributes.normal.needsUpdate = true;
      t.geo.computeBoundingSphere();
    }
    for (const g of extraBounds) g.computeBoundingSphere();
    // Rigid props ride the finished field, so they are re-posed here rather than in
    // setCrush: the buckle from every impact lands in wDisp AFTER the crush stage, and a
    // prop that only saw the crush would still float out of the dent around it.
    applyCrushToRigids();
  }

  /**
   * Welded adjacency plus the rest length of every edge. The lengths are what the
   * gradient limiter below needs: a triangle can only fold through itself if the
   * displacement difference across one of its edges approaches that edge's length, so
   * bounding the difference bounds inversion.
   */
  let adjStart = null, adjList = null, adjLen = null, minEdge = null, adjSeam = null;
  function buildAdj() {
    if (adjStart) return;
    const index = refGeo.index;
    const counts = new Int32Array(wCount);
    const edges = [];
    const seen = new Set();
    const push = (a, b) => {
      if (a === b) return;
      const k = a < b ? a * wCount + b : b * wCount + a;
      if (seen.has(k)) return;
      seen.add(k);
      edges.push(a, b);
      counts[a]++; counts[b]++;
    };
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = weldOf[index.getX(i)], b = weldOf[index.getX(i + 1)], c = weldOf[index.getX(i + 2)];
        push(a, b); push(b, c); push(c, a);
      }
    }
    adjStart = new Int32Array(wCount + 1);
    for (let i = 0; i < wCount; i++) adjStart[i + 1] = adjStart[i] + counts[i];
    const cursor = adjStart.slice(0, wCount);
    adjList = new Int32Array(adjStart[wCount]);
    adjLen = new Float32Array(adjStart[wCount]);
    adjSeam = new Uint8Array(adjStart[wCount]);
    minEdge = new Float32Array(wCount).fill(Infinity);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      const L = Math.hypot(
        wPos[a * 3] - wPos[b * 3],
        wPos[a * 3 + 1] - wPos[b * 3 + 1],
        wPos[a * 3 + 2] - wPos[b * 3 + 2]) || 1e-4;
      const seam = wPanel[a] !== wPanel[b] ? 1 : 0;
      if (seam) {
        panelAdj[wPanel[a] * N_PANEL + wPanel[b]] = 1;
        panelAdj[wPanel[b] * N_PANEL + wPanel[a]] = 1;
      }
      adjSeam[cursor[a]] = seam;
      adjSeam[cursor[b]] = seam;
      adjLen[cursor[a]] = L; adjList[cursor[a]++] = b;
      adjLen[cursor[b]] = L; adjList[cursor[b]++] = a;
      if (L < minEdge[a]) minEdge[a] = L;
      if (L < minEdge[b]) minEdge[b] = L;
    }
    for (let i = 0; i < wCount; i++) if (!Number.isFinite(minEdge[i])) minEdge[i] = 0.05;
  }

  /**
   * Gauss-Seidel edge-length limiter: no edge's displacement difference may exceed
   * EDGE_LIMIT of its rest length. This is the guarantee that repeated impacts can
   * never fold a triangle back through itself, no matter how the fold field, the
   * clamp and the gather happen to line up — and it is applied to the displacement
   * field only, so the shutline channels underneath are never touched.
   */
  function limitGradient(touched, iters) {
    if (!adjStart) return;
    for (let it = 0; it < iters; it++) {
      for (let n = 0; n < touched.length; n++) {
        const w = touched[n], i = w * 3;
        for (let a = adjStart[w]; a < adjStart[w + 1]; a++) {
          const m = adjList[a], j = m * 3;
          const dx = wDisp[i] - wDisp[j];
          const dy = wDisp[i + 1] - wDisp[j + 1];
          const dz = wDisp[i + 2] - wDisp[j + 2];
          const mag = Math.hypot(dx, dy, dz);
          const lim = (adjSeam[a] ? SEAM_LIMIT : EDGE_LIMIT) * adjLen[a];
          if (mag <= lim || mag < 1e-9) continue;
          const k = 0.5 * (1 - lim / mag);
          wDisp[i] -= dx * k; wDisp[i + 1] -= dy * k; wDisp[i + 2] -= dz * k;
          wDisp[j] += dx * k; wDisp[j + 1] += dy * k; wDisp[j + 2] += dz * k;
        }
      }
    }
  }

  /**
   * One Laplacian pass over the touched welds. It runs on the *displacement field*, not
   * on the positions, so it clips any spike a fold or a clamp introduced without ever
   * smoothing the rest pose — the shutline channels and creases come through untouched.
   */
  function relax(touched, k) {
    buildAdj();
    if (!adjStart) return;
    const out = new Float32Array(touched.length * 3);
    for (let n = 0; n < touched.length; n++) {
      const w = touched[n];
      let sx = 0, sy = 0, sz = 0, c = 0;
      for (let a = adjStart[w]; a < adjStart[w + 1]; a++) {
        // never average a panel's displacement with its neighbour's across a seam —
        // that is precisely the leak that turned twelve panels back into one blob
        if (adjSeam[a]) continue;
        const m = adjList[a] * 3;
        sx += wDisp[m]; sy += wDisp[m + 1]; sz += wDisp[m + 2];
        c++;
      }
      const i = w * 3;
      if (!c) {
        out[n * 3] = wDisp[i]; out[n * 3 + 1] = wDisp[i + 1]; out[n * 3 + 2] = wDisp[i + 2];
        continue;
      }
      out[n * 3] = lerp(wDisp[i], sx / c, k);
      out[n * 3 + 1] = lerp(wDisp[i + 1], sy / c, k);
      out[n * 3 + 2] = lerp(wDisp[i + 2], sz / c, k);
    }
    for (let n = 0; n < touched.length; n++) {
      const i = touched[n] * 3;
      wDisp[i] = out[n * 3]; wDisp[i + 1] = out[n * 3 + 1]; wDisp[i + 2] = out[n * 3 + 2];
    }
  }

  /**
   * One impact. `localPoint` is in car space, `dir` is the direction the impact
   * travelled (unit, pointing into the panel).
   *
   * Three superposed terms:
   *   - a smooth dent along `dir`, weighted by how squarely the panel faces the hit, so
   *     the far side of the shell is never dragged along and the hull cannot collapse
   *     into a ball;
   *   - a triangle-wave fold field along the vertex normal, which buckles the sheet into
   *     ridges and valleys instead of denting it into a smooth bowl;
   *   - a small inward gather toward the impact point, so metal bunches at the crush
   *     front the way a real thin panel shortens rather than stretches.
   * The accumulated field is clamped per vertex, floored above the road, and relaxed
   * once — which together are what keep repeated impacts from exploding the mesh or
   * folding a triangle back through itself.
   */
  function addImpact(localPoint, strength = 0.6, dir = new THREE.Vector3(0, 0, -1)) {
    const e = clamp(strength, 0, 1);
    if (e <= 0) return;
    const p = localPoint;
    _d.copy(dir);
    if (_d.lengthSq() < 1e-8) _d.set(0, 0, -1);
    _d.normalize();

    // ---- 0. chassis crush ------------------------------------------------
    // Only the axial component of a hit collapses the frame: a rearward blow to the
    // front clip telescopes it, a forward blow to the tail shortens the rear a little,
    // and a glancing side swipe does nothing structural at all. setLevel() drives the
    // accumulator directly instead, so this is skipped while scripted.
    if (!scripted) {
      const axial = clamp(-_d.z, 0, 1) * clamp((p.z - Z_DOORR) / (Z_FBUMP - Z_DOORR), 0, 1)
        + 0.45 * clamp(_d.z, 0, 1) * clamp((Z_DOORR - p.z) / 1.4, 0, 1);
      if (axial > 0.01) setCrush(crush + e * 0.55 * axial);
    }

    _t1.set(0, 1, 0);
    if (Math.abs(_d.y) > 0.9) _t1.set(1, 0, 0);
    _t1.crossVectors(_d, _t1).normalize();
    _t2.crossVectors(_d, _t1).normalize();

    // A hit landing on a chassis that has already collapsed buckles the sheet far
    // harder than the same hit on a straight one: the metal has nowhere left to go.
    // So the crush accumulator SCALES the buckle field rather than replacing it —
    // the per-weld fold work below is unchanged, it just sits on a shorter chassis.
    const cs = 1 + 0.55 * crush;
    const maxDisp = MAX_DISP * (1 + 0.35 * crush);

    const radius = lerp(0.38, 0.86, e);
    const depth = lerp(0.04, 0.20, e) * cs;
    // Halved against r7. `ridge()` is an isotropic saw field evaluated per weld and
    // clamped against the local mesh scale, so above about a quarter of the dent depth
    // the clamp starts biting per-vertex and the panel breaks up into mesh-frequency
    // faceting — which is most of what the 6 px grain period was measuring. It is here
    // to roughen the hinge lobes, not to compete with them.
    const foldAmp = depth * 0.26;
    const gather = depth * 0.24;
    impactSeq++;
    impacts.push({ p: p.clone(), e });
    const ph1 = (impactSeq * 0.371) % 1;
    const ph2 = (impactSeq * 0.719) % 1;
    const k1 = 2.55, k2 = 4.15;

    buildAdj();

    // ---- 1. which PANEL took the hit -------------------------------------
    // Scored, not nearest-vertex: the panel that presents the most squarely-facing
    // area inside the impact radius is the one that collapses. Everything below is
    // built in that panel's frame.
    const score = new Float32Array(N_PANEL);
    for (let w = 0; w < wCount; w++) {
      const dx = wPos[w * 3] - p.x, dy = wPos[w * 3 + 1] - p.y, dz = wPos[w * 3 + 2] - p.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;
      const t = dist / radius;
      const facing = clamp(-(wNrm[w * 3] * _d.x + wNrm[w * 3 + 1] * _d.y
        + wNrm[w * 3 + 2] * _d.z), 0, 1);
      score[wPanel[w]] += (1 - t * t) * (0.15 + 0.85 * facing);
    }
    let prim = -1, primScore = 0;
    for (let k = 0; k < N_PANEL; k++) if (score[k] > primScore) { primScore = score[k]; prim = k; }

    // Neighbours of the struck panel are dragged, everything else is nearly untouched.
    // This is what stops a nose hit from smoothly deforming the tail: the old code had
    // one global radial falloff and no notion of where a panel ended.
    const pw = new Float32Array(N_PANEL);
    for (let k = 0; k < N_PANEL; k++) {
      pw[k] = k === prim ? 1
        : (prim >= 0 && panelAdj[prim * N_PANEL + k] ? 0.30 : 0.05);
    }

    // ---- 2. the panel's own fold frame -----------------------------------
    // fwd runs from the strike across the panel (the direction the crush front travels),
    // lat runs along the fold line. Buckle ridges are laid out in this frame, so they
    // cross the panel the way a pressed sheet actually folds, and they stop dead at the
    // panel's boundary instead of blending into the next one.
    let fwd = null, lat = null, pn = null, sMax = 0.6;
    let hinge1 = null, hinge2 = null, cenS = 0;
    if (prim >= 0 && panelWelds[prim].length > 8) {
      // The panel's fold frame is established ONCE, by whichever hit reaches it first,
      // and every later hit on that panel is resolved in it. Recomputing it per impact
      // is what let four front-metre hits cross-hatch the fascia with creases running in
      // four different directions.
      const pf = panelFrame[prim];
      if (pf) {
        pn = pf.pn; fwd = pf.fwd; lat = pf.lat;
      } else {
        pn = panelNrm[prim].clone();
        if (pn.dot(_d) > 0) pn.negate();                   // outward, against the impact
        fwd = panelCen[prim].clone().sub(p);
        fwd.addScaledVector(pn, -fwd.dot(pn));
        if (fwd.lengthSq() < 1e-6) {
          fwd.copy(_d).addScaledVector(pn, -_d.dot(pn));
          if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
        }
        fwd.normalize();
        lat = new THREE.Vector3().crossVectors(pn, fwd).normalize();
        panelFrame[prim] = { pn, fwd, lat };
      }
      sMax = 0.10;
      for (const w of panelWelds[prim]) {
        const s = (wPos[w * 3] - p.x) * fwd.x + (wPos[w * 3 + 1] - p.y) * fwd.y
          + (wPos[w * 3 + 2] - p.z) * fwd.z;
        if (s > sMax) sMax = s;
      }
      // where this strike sits along the shared axis, so hinge stations can be stored
      // in a frame that does not move from impact to impact
      cenS = (p.x - panelCen[prim].x) * fwd.x + (p.y - panelCen[prim].y) * fwd.y
        + (p.z - panelCen[prim].z) * fwd.z;
    }
    // Two fold lines: the primary buckle just behind the crush front and a shallower
    // second one further across — thin sheet accordions, it does not dish. Both are
    // MERGED onto the panel's existing creases when they land close enough; the merged
    // line simply takes more amplitude, which is what turns an accordion field into two
    // or three deep lobes separated by knife-sharp ridges.
    const raw1 = clamp(0.30 * sMax + 0.06, 0.10, 0.70);
    const raw2 = clamp(raw1 + 0.34 * sMax, raw1 + 0.16, 1.05);
    let hd1 = raw1, hd2 = raw2;
    if (fwd !== null) {
      hinge1 = hingeAt(prim, cenS + raw1, null);
      hinge2 = hingeAt(prim, cenS + raw2, hinge1);
      hd1 = hinge1.S - cenS;
      hd2 = hinge2.S - cenS;
    }
    const W1 = 0.10, W2 = 0.14;
    const buckle1 = lerp(0.030, 0.196, e) * cs;
    const buckle2 = buckle1 * 0.62;
    // the whole panel is knocked back a little, which is what opens its seams
    const shove = lerp(0.004, 0.026, e);
    // The crease's own wander phase travels WITH the hinge: two impacts merged onto one
    // hinge but wandering out of phase are still two creases, just closer together.
    const jp1 = hinge1 ? hinge1.ph : ph1;
    const jp2 = hinge2 ? hinge2.ph : ph2;

    const touched = [];
    for (let w = 0; w < wCount; w++) {
      const pk = wPanel[w];
      const pwk = pw[pk];
      const x = wPos[w * 3], y = wPos[w * 3 + 1], z = wPos[w * 3 + 2];
      const dx = x - p.x, dy = y - p.y, dz = z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const near = dist <= radius;
      const isPrim = pk === prim && fwd !== null;
      if (!near && !isPrim) continue;

      const nx = wNrm[w * 3], ny = wNrm[w * 3 + 1], nz = wNrm[w * 3 + 2];
      const facing = clamp(-(nx * _d.x + ny * _d.y + nz * _d.z), 0, 1);
      const cap = 0.35 * minEdge[w] + 0.004;
      let ax = 0, ay = 0, az = 0;

      if (near) {
        const t = dist / radius;
        const fall = (1 - t * t) * (1 - t * t) * pwk;      // C1 at the boundary
        const bias = 0.20 + 0.80 * facing;

        const a = (x * _t1.x + y * _t1.y + z * _t1.z) * k1 + ph1;
        const b = (x * _t2.x + y * _t2.y + z * _t2.z) * k2 + ph2;
        const fold = ridge(a, b);

        // The fold and gather terms are high-frequency, so they are capped against the
        // local mesh scale: a 10 cm buckle across a 5 mm shutline wall would invert it.
        const dentAmt = depth * fall * bias;
        const foldAmt = clamp(foldAmp * fall * fold * (0.35 + 0.65 * facing), -cap, cap);
        const inv = dist > 1e-5 ? 1 / dist : 0;
        const gAmt = Math.min(gather * fall * fall, cap);

        ax += _d.x * dentAmt + nx * foldAmt - dx * inv * gAmt;
        ay += _d.y * dentAmt + ny * foldAmt - dy * inv * gAmt;
        az += _d.z * dentAmt + nz * foldAmt - dz * inv * gAmt;
      }

      if (isPrim) {
        const s = dx * fwd.x + dy * fwd.y + dz * fwd.z;
        const l = dx * lat.x + dy * lat.y + dz * lat.z;
        // the fold line wanders along its length — a dead-straight crease reads as a
        // modelled bend, not as buckled sheet
        const j1 = 0.055 * Math.sin(l * 3.1 + jp1 * 6.3) + 0.022 * Math.sin(l * 7.7 + 1.4);
        const j2 = 0.045 * Math.sin(l * 2.4 - jp2 * 6.3);
        // tent profiles: |s - hd| has a derivative discontinuity AT the fold line, so the
        // ridge crest is a genuine crease and not the top of a bump
        const r1 = Math.max(0, 1 - Math.abs(s - (hd1 + j1)) / W1);
        const r2 = Math.max(0, 1 - Math.abs(s - (hd2 + j2)) / W2);
        // ahead of the first fold the sheet is crushed inward; beyond it, it stands up
        // `raw1`, not `hd1`: the compressed region ahead of the fold belongs to THIS
        // strike's crush front, and a merged hinge can sit behind the strike point.
        const crush = clamp(1 - Math.max(0, s) / Math.max(0.08, raw1), 0, 1);
        // NOTE r1 enters linearly: squaring it rounds the crest off and the crease
        // stops being a crease. The kink at r1 = 1 is the entire point of the term.
        // The second fold goes the OTHER WAY: thin sheet accordions, alternating out
        // and in, and a pair of same-sign ridges just inflates the panel into a balloon.
        const amp = buckle1 * r1 * (0.45 + 0.55 * facing) - buckle2 * r2;
        ax += pn.x * amp + _d.x * (depth * 0.42 * crush * crush + shove);
        ay += pn.y * amp + _d.y * (depth * 0.42 * crush * crush + shove);
        az += pn.z * amp + _d.z * (depth * 0.42 * crush * crush + shove);
      }

      if (ax === 0 && ay === 0 && az === 0) continue;
      wDisp[w * 3] += ax;
      wDisp[w * 3 + 1] += ay;
      wDisp[w * 3 + 2] += az;
      touched.push(w);
    }

    if (touched.length) {
      for (const w of touched) {
        const i = w * 3;
        const m = Math.hypot(wDisp[i], wDisp[i + 1], wDisp[i + 2]);
        if (m > maxDisp) {
          const k = maxDisp / m;
          wDisp[i] *= k; wDisp[i + 1] *= k; wDisp[i + 2] *= k;
        }
        // road floor, measured against the CRUSHED rest pose rather than the pristine
        // one — the crush has already dropped the nose toward the tarmac
        const yMin = 0.045 - wPos[i + 1] - wCrush[i + 1];
        if (wDisp[i + 1] < yMin) wDisp[i + 1] = yMin;
      }
      // A light relax only: at 0.26 the Laplacian pass rounded the fold crests off
      // almost as fast as the buckle term put them there.
      relax(touched, 0.22);
      limitGradient(touched, 10);
      writePositions();

      // How buckled each touched weld ended up. Two separate numbers, because they gate
      // two different paint failures and conflating them is what turned the whole front
      // clip into bare metal:
      //
      //  * `cr`, the magnitude of the displacement field's Laplacian — how far this weld
      //    sits off the plane of its neighbours. ISOTROPIC: a smooth 0.6 m dish scores
      //    exactly as high as a 5 mm crease, so on its own it cannot say where the sheet
      //    actually folded.
      //  * `rg`, the ANISOTROPY of that buckle. A fold crest (or valley) falls away along
      //    one axis and is flat along the other, so its fall-away directions collapse
      //    onto a line; a dish or a dome falls away equally in every direction. This is
      //    the second derivative resolved per direction rather than summed over them,
      //    which is exactly the distinction the isotropic Laplacian throws away.
      //
      // Primer follows a mix of the two and bare metal follows `rg` alone, so the dished
      // field between the folds keeps its colour and only the crests go through to steel.
      for (const w of touched) {
        let sx = 0, sy = 0, sz = 0, c = 0;
        for (let a = adjStart[w]; a < adjStart[w + 1]; a++) {
          if (adjSeam[a]) continue;
          const m = adjList[a] * 3;
          sx += wDisp[m]; sy += wDisp[m + 1]; sz += wDisp[m + 2];
          c++;
        }
        if (!c) continue;
        const i = w * 3;
        const lapx = wDisp[i] - sx / c, lapy = wDisp[i + 1] - sy / c, lapz = wDisp[i + 2] - sz / c;
        const lap = Math.hypot(lapx, lapy, lapz);
        if (lap < 1e-7) continue;
        // Scale relative to how far this bit of bodywork actually travelled, not against
        // a fixed 2 cm. The chassis crush alone is 0.64 m at level 0.7, and a field that
        // deep is a couple of centimetres off-plane everywhere it is even slightly
        // curved — against a fixed 20 mm every weld in the clip pinned at 1.0. It is
        // still NOT edge-relative: the loft's shutline stations are 4.5 mm apart and an
        // edge-relative measure saturated on every seam in the car.
        const dpx = wDisp[i] + wCrush[i];
        const dpy = wDisp[i + 1] + wCrush[i + 1];
        const dpz = wDisp[i + 2] + wCrush[i + 2];
        const scale = 0.020 + 0.075 * Math.hypot(dpx, dpy, dpz);
        const cr = clamp(lap / scale, 0, 1);
        if (cr > wCrease[w]) wCrease[w] = cr;

        // Tangent frame about the buckle direction, then a 2x2 scatter matrix of the
        // directions in which the surface falls away from this weld. One dominant
        // eigenvalue means a fold line; two equal ones mean a dish or a dome.
        const bnx = lapx / lap, bny = lapy / lap, bnz = lapz / lap;
        let hx = 0, hy = 0, hz = 1;
        if (Math.abs(bnz) > 0.9) { hx = 1; hz = 0; }
        let ux = bny * hz - bnz * hy, uy = bnz * hx - bnx * hz, uz = bnx * hy - bny * hx;
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        const vx = bny * uz - bnz * uy, vy = bnz * ux - bnx * uz, vz = bnx * uy - bny * ux;
        let m00 = 0, m01 = 0, m11 = 0;
        for (let a = adjStart[w]; a < adjStart[w + 1]; a++) {
          if (adjSeam[a]) continue;
          const nb = adjList[a], m = nb * 3;
          const ex = wPos[m] - wPos[i], ey = wPos[m + 1] - wPos[i + 1], ez = wPos[m + 2] - wPos[i + 2];
          const el = Math.hypot(ex, ey, ez);
          if (el < 1e-7) continue;
          // how fast the surface drops away from this weld along that edge, measured
          // in the buckle direction — positive means the neighbour is below the crest
          const g = ((wDisp[i] - wDisp[m]) * bnx + (wDisp[i + 1] - wDisp[m + 1]) * bny
            + (wDisp[i + 2] - wDisp[m + 2]) * bnz) / el;
          if (g <= 0) continue;
          const tu = ex * ux + ey * uy + ez * uz;
          const tv = ex * vx + ey * vy + ez * vz;
          const tl = Math.hypot(tu, tv);
          if (tl < 1e-7) continue;
          const au = tu / tl, av = tv / tl;
          m00 += g * au * au; m01 += g * au * av; m11 += g * av * av;
        }
        const tr = m00 + m11;
        if (tr < 1e-9) continue;
        const disc = Math.sqrt(Math.max(0, (m00 - m11) * (m00 - m11) + 4 * m01 * m01));
        // (l1 - l2) / (l1 + l2): 1 for a pure fold line, 0 for a dish or a dome
        const aniso = clamp(disc / tr, 0, 1);
        const rg = cr * aniso;
        if (rg > wRidge[w]) wRidge[w] = rg;
      }

      // paint the mask from the vertices that actually moved
      if (uvA) {
        const hits = [];
        const cell = new Map();
        for (let i = 0; i < vCount; i++) {
          const w = weldOf[i];
          const dx = wPos[w * 3] - p.x, dy = wPos[w * 3 + 1] - p.y, dz = wPos[w * 3 + 2] - p.z;
          const dist = Math.hypot(dx, dy, dz);
          const cr = wCrease[w];
          const rg = wRidge[w];
          // How far this bit of bodywork actually travelled, chassis crush included.
          // The crazed-lacquer pass keys off THIS rather than the impact falloff: the
          // fold the primary-panel buckle throws two feet behind the strike point is
          // still crumpled sheet, and driving haze off `fall` alone left it glossy and
          // mirroring the sky while everything around it had gone matte.
          const dm = clamp(Math.hypot(
            wDisp[w * 3] + wCrush[w * 3],
            wDisp[w * 3 + 1] + wCrush[w * 3 + 1],
            wDisp[w * 3 + 2] + wCrush[w * 3 + 2]) / 0.16, 0, 1);
          if (dist > radius && cr < 0.35 && dm < 0.5) continue;
          const t = clamp(dist / radius, 0, 1);
          const fall = (1 - t * t) * (1 - t * t);
          if (fall < 0.10 && cr < 0.35 && dm < 0.5) continue;
          const u = uvA.getX(i), v = uvA.getY(i);
          const key = `${Math.round(u * 64)},${Math.round(v * 64)}`;
          const prev = cell.get(key);
          if (prev) {
            if (fall > prev[2]) prev[2] = fall;
            if (cr > prev[3]) prev[3] = cr;
            if (rg > prev[4]) prev[4] = rg;
            if (dm > prev[5]) prev[5] = dm;
            continue;
          }
          const rec = [u, v, fall, cr, rg, dm];
          cell.set(key, rec);
          hits.push(rec);
        }
        paintScuffs(hits, e);
      }
    }

    if (!scripted) {
      level = clamp(level + e * 0.30, 0, 1);
      applyState();
    }
  }

  // ===========================================================================
  // discrete state driven by the severity accumulator
  // ===========================================================================
  const cracked = new Set();
  let shattered = false, headsOut = false, tailsOut = false;

  function applyPartPose(part) {
    const t = part.t;
    const a = part.rest, b = part.spec.pose;
    // Torn panels ride the crush map too: a bonnet still hinged at the cowl of a bay
    // that lost half its length has to come back with it, and it tents up steeper for
    // the same reason the skin under it does.
    const zr = a.p.z;
    const dz = crush > 0 ? crushZ(zr) - zr : 0;
    const tent = (part.spec.tent || 0) * crush;
    part.pivot.position.set(
      lerp(a.p.x, b.p.x, t),
      lerp(a.p.y, b.p.y, t) + tent * 0.18,
      lerp(a.p.z, b.p.z, t) + dz);
    part.pivot.rotation.set(
      lerp(a.e.x, b.e.x, t) - tent,
      lerp(a.e.y, b.e.y, t), lerp(a.e.z, b.e.z, t));
  }

  function detach(part, cavity) {
    if (part.detached) return;
    part.detached = true;
    part.t = updateDriven ? 0 : 1;
    part.pivot.visible = true;
    applyPartPose(part);
    if (cavity) paintCavity(cavity[0], cavity[1], cavity[2], cavity[3], cavity[4]);
  }

  function settleLoose(seconds, step = 1 / 120) {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) for (const b of loose) stepBody(b, step);
  }

  function applyState() {
    // --- glass -------------------------------------------------------------
    if (level >= T_CRACK && glassPanels.length && !shattered) {
      const order = ['screen', 'sideR', 'sideL', 'rear'];
      const n = 1 + Math.floor(clamp((level - T_CRACK) / 0.20, 0, 3));
      for (let i = 0; i < n; i++) {
        const panel = glassPanels.find((g) => g.name === order[i]);
        if (!panel || cracked.has(panel.name)) continue;
        cracked.add(panel.name);
        paintFracture(panel, clamp((level - T_CRACK) / 0.50, 0.3, 1), strikeFor(panel));
      }
    }
    if (level >= T_SHATTER && !shattered) {
      shattered = true;
      // Tempered side and rear glass blows out; the laminated windscreen stays in its
      // aperture and keeps crazing. That split is what crash-cam-01 and crash-cam-03 both
      // show — and the screen is still glass afterwards, so the cabin reads through the
      // web instead of vanishing behind it.
      if (screenGeo && glassMesh) {
        hideObj(glassMesh);
        fracMesh.geometry = screenGeo;
      } else if (glassMatRef) {
        glassMatRef.visible = false;
      }
      const screen = glassPanels.find((g) => g.name === 'screen');
      // A second, heavier web from the same strike: more radials, denser core, still one
      // origin. Two independent origins on one pane is the thing that reads as scribble.
      if (screen) paintFracture(screen, 0.92, strikeFor(screen));
      fracMesh.visible = true;
      // the tempered panes leave the car as a shower of small cubes
      for (let i = 0; i < 12; i++) {
        spawnLoose(shardGeo, shardMat,
          new THREE.Vector3((rng() - 0.5) * 1.6, 1.15 + rng() * 0.2, (rng() - 0.5) * 2.2),
          new THREE.Vector3((rng() - 0.5) * 5, 1.5 + rng() * 2.5, (rng() - 0.5) * 5),
          new THREE.Vector3((rng() - 0.5) * 20, (rng() - 0.5) * 20, (rng() - 0.5) * 20),
          0.035);
      }
      if (!updateDriven) settleLoose(2.4);
    }

    // --- lamps -------------------------------------------------------------
    if (level >= T_HEADLAMP && !headsOut) {
      headsOut = true;
      for (const m of car.headlights || []) hideObj(m);
    }
    if (level >= T_TAILLAMP && !tailsOut) {
      tailsOut = true;
      for (const m of car.taillights || []) hideObj(m);
    }

    // --- panels ------------------------------------------------------------
    if (level >= T_MIRROR && !mirrorsGone) {
      mirrorsGone = true;
      for (const o of mirrorTargets) hideObj(o);
      for (const s of [-1, 1]) {
        spawnLoose(mirrorCapGeo, partPaint,
          new THREE.Vector3(s * 1.05, 1.05, 0.58),
          new THREE.Vector3(s * (0.9 + rng() * 0.6), 1.1 + rng() * 0.6, -0.8 - rng()),
          new THREE.Vector3((rng() - 0.5) * 14, (rng() - 0.5) * 14, (rng() - 0.5) * 14),
          0.07);
      }
      if (!updateDriven) settleLoose(2.2);
    }
    if (level >= T_BUMPER) detach(bumper, null);
    if (level >= T_BONNET) detach(bonnet, [0.442, 0.558, 0.790, 0.928, 0.90]);
    if (level >= T_DOOR) detach(door, [0.122, 0.252, 0.424, 0.586, 0.86]);

    // --- front wheel tears off ---------------------------------------------
    // Past T_WHEEL the collapsing arch has taken the hub with it and the knuckle
    // lets go: the wheel leaves the car as a loose body and lies beside the wreck
    // with its own contact shadow, which is the single most legible cue in
    // crash-cam-02 that the front end is destroyed rather than dented. The
    // near-side wheel goes, so the empty collapsed arch faces the camera.
    if (level >= T_WHEEL && !wheelTorn) {
      wheelTorn = true;
      const fw = wheelRest.find((r) => r.front && r.side > 0);
      if (fw) {
        const from = fw.w.pivot.position.clone();
        hideObj(fw.w.pivot);
        // A clone shares car.js's wheel geometry and materials, so the loose wheel is
        // the same alloy and the same tyre as the three still on the car — nothing on
        // the car is mutated and reset() only has to drop the clone.
        const spun = fw.w.spin.clone(true);
        spun.rotation.set(0, 0, 0);
        spawnLoose(spun, null, from,
          new THREE.Vector3(2.2 + rng() * 0.5, 1.8, 0.9 + rng() * 0.4),
          new THREE.Vector3(4.5, 9.0, 3.0),
          (car.DIMS && car.DIMS.wheelR) || 0.365,
          {
            shadow: 0.62,
            // upright but toppling away from the car, as in the reference
            restRot: new THREE.Euler(0.06, 0.42, 0.30),
          });
        if (!updateDriven) settleLoose(2.4);
      }
    }
  }

  // ===========================================================================
  // public surface
  // ===========================================================================
  const dmg = {
    get level() { return level; },
    get severity() { return level; },
    get parts() { return parts; },
    get shattered() { return shattered; },
    mask: albTex,
    crackMask: cauTex,

    addImpact,

    /**
     * Canned, deterministic wreck at severity `l`: head-on biased with a secondary
     * crumple in the front quarters, which is the shape crash-cam-02 and crash-cam-04
     * both settle into — one primary impact axis plus one secondary quarter fold.
     */
    setLevel(l) {
      dmg.reset();
      l = clamp(l, 0, 1);
      if (l <= 0) return;
      // Three hits in the front metre, not four. A real front-end collapse is ONE crush
      // front with a couple of quarter folds; the fourth bonnet strike at (0.30, 1.06,
      // 1.32) only ever added a fourth crease line to a 1 m fascia and its work is now
      // carried by raising the right-quarter hit's share and pulling it inboard/up onto
      // the bonnet shoulder. The 2-3 pillow lobes in crash-cam-04 are what this is for.
      const spots = [
        [new THREE.Vector3(0.05, 0.72, 2.28), new THREE.Vector3(-0.10, -0.28, -1.00), 1.00],
        [new THREE.Vector3(0.50, 0.94, 1.74), new THREE.Vector3(-0.42, -0.52, -0.74), 1.00],
        [new THREE.Vector3(-0.70, 0.80, 1.72), new THREE.Vector3(0.62, -0.18, -0.76), 0.74],
        // Follow-through on the bonnet shoulder, aimed mostly REARWARD rather than down.
        // It restores the axial shortening the deleted fourth strike used to contribute
        // (the body z-extent has to stay on 0.283 / 0.641 / 0.755 m) and, because it
        // lands on a panel that has already been hit, its fold snaps onto that panel's
        // existing hinge instead of opening a fourth crease.
        [new THREE.Vector3(0.26, 1.00, 1.50), new THREE.Vector3(-0.10, -0.46, -0.88), 0.76],
        [new THREE.Vector3(0.88, 0.84, 0.42), new THREE.Vector3(-0.95, -0.12, -0.28), 0.52],
        [new THREE.Vector3(-0.88, 0.78, -0.65), new THREE.Vector3(0.94, -0.10, 0.30), 0.40],
        [new THREE.Vector3(0.36, 1.06, -1.95), new THREE.Vector3(-0.18, -0.55, 0.82), 0.46],
      ];
      // The chassis collapses FIRST, then the sheet metal buckles over it: the crush
      // shortens the frame and the impacts below crease whatever shape that left,
      // with their amplitude scaled by how far it has collapsed.
      setCrush(crushForLevel(l));
      // The accumulator must land exactly on l, so the scripted impacts do not
      // self-accumulate — otherwise seven hits would race the severity past every
      // threshold on their way to a level the caller never asked for.
      scripted = true;
      try {
        for (const [p, d, share] of spots) {
          const s = l * share;
          if (s < 0.04) continue;
          addImpact(p, s, d.clone().normalize());
        }
      } finally { scripted = false; }
      level = l;
      applyState();
    },

    /** Step the detaching panels and loose bodies. Optional — see settle-on-detach. */
    update(dt) {
      updateDriven = true;
      let live = false;
      for (const p of parts) {
        if (!p.detached || p.t >= 1) continue;
        p.t = clamp(p.t + dt * 3.2, 0, 1);
        applyPartPose(p);
        live = true;
      }
      for (const b of loose) if (!b.rest) { stepBody(b, dt); live = true; }
      return live;
    },

    /** Deterministic fast-forward, mirroring crash.settle(). */
    settle(seconds, step = 1 / 120) {
      const n = Math.round(seconds / step);
      for (let i = 0; i < n; i++) dmg.update(step);
    },

    get crush() { return crush; },
    /** Longitudinal length lost to the chassis crush, in metres. */
    get crushLoss() { return crushLoss(); },

    reset() {
      wDisp.fill(0);
      wCrease.fill(0);
      wRidge.fill(0);
      // Undo the chassis crush before the positions are restored: the wheels and the
      // panel pivots are driven off it, so it has to go back to zero for the car to
      // come back pristine.
      crush = 0;
      wCrush.fill(0);
      crushS.fill(1);
      for (const z of zones) z.q = 0;
      for (const r of wheelRest) {
        r.w.pivot.position.copy(r.p);
        r.w.pivot.rotation.x = 0;
        r.w.pivot.rotation.z = 0;
      }
      for (const r of rigidRest) {
        r.n.position.copy(r.p);
        r.n.rotation.x = r.rx;
      }
      for (const t of targets) {
        t.pos.array.set(t.restPos);
        t.pos.needsUpdate = true;
        if (t.restNrm && t.geo.attributes.normal) {
          t.geo.attributes.normal.array.set(t.restNrm);
          t.geo.attributes.normal.needsUpdate = true;
        } else {
          t.geo.computeVertexNormals();
        }
        t.geo.computeBoundingSphere();
      }
      for (const g of extraBounds) g.computeBoundingSphere();

      clearMasks();
      clearCracks();
      dmgMesh.visible = false;
      fracMesh.visible = false;
      fracMesh.geometry = glassGeo || refGeo;

      for (const h of hidden) h.obj.visible = h.visible;
      hidden.length = 0;
      if (glassMatRef) glassMatRef.visible = glassWasVisible;

      for (const p of parts) {
        p.detached = false;
        p.t = 0;
        p.pivot.visible = false;
        applyPartPose(p);
      }
      for (const b of loose) {
        looseRoot.remove(b.mesh);
        if (b.shadow) {
          looseRoot.remove(b.shadow);
          b.shadow.geometry.dispose();
          b.shadow.material.dispose();
        }
      }
      loose.length = 0;
      blobMats.length = 0;

      cracked.clear();
      shattered = false; headsOut = false; tailsOut = false; mirrorsGone = false;
      wheelTorn = false;
      impactSeq = 0;
      impacts.length = 0;
      // The fold structure is part of the wreck, so it goes back with it. Leaving it in
      // place would make setLevel() depend on whatever the car had already hit.
      panelFrame.fill(null);
      for (const hs of panelHinges) hs.length = 0;
      scripted = false;
      level = 0;
    },

    dispose() {
      dmg.reset();
      shell.remove(dmgMesh);
      shell.remove(fracMesh);
      shell.remove(partsRoot);
      looseRoot.parent?.remove(looseRoot);
      for (const t of [albTex, metTex, rghTex, tintTex, alfTex, cauTex, undAlbTex, undAoTex]) t.dispose();
      if (blobTex) { blobTex.dispose(); blobTex = null; }
      for (const m of [dmgMat, fracMat, hiddenMat, partPaint, partUnder, shardMat]) m.dispose();
      for (const g of [bonnetGeo, doorGeo, bumperGeo, mirrorCapGeo, shardGeo]) g.dispose();
      if (screenGeo) screenGeo.dispose();
    },
  };

  return dmg;
}
