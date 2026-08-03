// road.js — asphalt + lane-marking materials and road ribbon mesh generation.
// API: createRoadKit(rng, {renderer}) -> kit. kit.buildRibbon(points2D, {width, cls, y}) -> THREE.Mesh
//      kit.setWet(0..1) retunes every road material; kit.addWetSmear(group,x,z,ang,color,w,l,i)
//      drops an additive light-smear quad on the tarmac (used for wet-night reflections).
//
// The surface is built at four scales so it never dissolves into flat grey:
//   1. MACRO — a dedicated low-frequency wetness/puddle mask on its *own* tile size, sampled
//              at two octaves and stretched down-road. This is what makes the tarmac a mosaic
//              of dry matte patches and glossy puddles instead of one uniform wet wash.
//   2. MESO  — one 1024x2048 tile stretched over the whole road width and ~32-40 m of length.
//              Carries mottling, tar seams, patched repairs, per-lane tyre polish, rubber
//              aprons, skid deposits and the (worn, chipped) lane paint. Survives into the
//              far third of frame because its features are metres across.
//   3. MICRO — a seamless 4 m / 1024px aggregate tile (256 texel/m, ~3.9 mm per texel)
//              whose RED channel is the raw HEIGHT FIELD. Parallax occlusion mapping
//              marches that height in the near field so chips occlude each other, and
//              the same height is thresholded against a water level so puddles are a
//              plane cutting real stone geometry: hard rims, per-stone contour.
//   4. SHADER— roughness that is mirror only *below* the waterline and stays matte on
//              the crowns above it, micro-occlusion applied to the indirect SPECULAR
//              (not just the diffuse — a wet night road is lit almost entirely by
//              indirect specular, so relief that never touches it is invisible), and a
//              planar reflection whose ray is perturbed by the chip slope so streaks
//              are chopped per stone near the camera and only knit back together at
//              grazing angles toward the horizon.

import * as THREE from 'three';
import { makeCanvas, canvasTexture, valueNoise2D, clamp, lerp, smoothstep } from './util.js';

const PX_W = 1024;  // meso texture pixels across the road
const PX_H = 2048;  // meso texture pixels along one tile
const DET = 1024;   // micro aggregate tile resolution
const DET_M = 4.0;  // metres covered by one micro tile (256 texel/m = 3.9 mm per texel)
const WET = 512;    // wetness mask tile resolution
const WET_M = 30;   // metres covered by one wetness tile (across the road)
const PLANE_Y = 0.03; // road plane height used by the planar reflection pass

// ---------------------------------------------------------------------------
// micro scale: aggregate height field -> matched albedo/roughness + normal map
// ---------------------------------------------------------------------------

/**
 * Stamp a population of stone chips into a height field with wrapping.
 * `rMin/rMax` are texel radii; at 256 texel/m a radius of 3-15 texels is a
 * 23-117 mm chip, which lands at 1-6 screen px in the near field. That is the
 * whole point: aggregate has to be *resolvable*, not sub-pixel sandpaper.
 */
function stampStones(h, size, rng, count, rMin, rMax, aMin, aMax) {
  for (let s = 0; s < count; s++) {
    const cx = rng() * size, cy = rng() * size;
    // rng()*rng() biases hard toward small stones with a few large ones
    const r = rMin + rng() * rng() * (rMax - rMin);
    const amp = aMin + rng() * (aMax - aMin);
    const pw = 0.26 + rng() * 0.70;      // dome flatness: low = flat-topped chip
    const ax = 1 + (rng() - 0.5) * 0.85; // slight elongation
    const rot = rng() * Math.PI;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const R = Math.ceil(r * (1 + Math.abs(ax - 1)) + 1);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const ux = (dx * cs + dy * sn) / (r * ax);
        const uy = (-dx * sn + dy * cs) / r;
        const d2 = ux * ux + uy * uy;
        if (d2 >= 1) continue;
        const v = amp * Math.pow(1 - d2, pw);
        const x = ((((cx + dx) | 0) % size) + size) % size;
        const y = ((((cy + dy) | 0) % size) + size) % size;
        const i = y * size + x;
        if (v > h[i]) h[i] = v;
      }
    }
  }
}

/**
 * Walk a crack (or a crack-sealant bead) across the tile, carving into `h` and,
 * for sealed seams, writing coverage into `seam`.
 *   sealed = false -> a dark open crack: aggregate is cut away to a narrow void.
 *   sealed = true  -> a bitumen bead: relief is flattened to a smooth ribbon,
 *                     which the shader then renders markedly *glossier* than the
 *                     surrounding aggregate. That contrast is the tar-seam read.
 */
function carveCrack(h, seam, size, rng, sx, sy, ang0, len, wid0, sealed, branches) {
  let x = sx, y = sy, ang = ang0, wid = wid0;
  const steps = Math.max(2, Math.round(len));
  const forks = [];
  for (let s = 0; s < steps; s++) {
    ang += (rng() - 0.5) * (sealed ? 0.10 : 0.85);
    x += Math.cos(ang); y += Math.sin(ang);
    // cracks taper and pinch out; sealant beads keep a steadier width
    const taper = sealed ? 1 : (0.45 + 0.55 * Math.sin(Math.PI * (s / steps)));
    const w = Math.max(0.7, wid * taper * (sealed ? 1 : 0.7 + rng() * 0.6));
    const R = Math.ceil(w) + 1;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy) / w;
        if (d >= 1) continue;
        const prof = 1 - d * d;
        const ix = ((((x + dx) | 0) % size) + size) % size;
        const iy = ((((y + dy) | 0) % size) + size) % size;
        const i = iy * size + ix;
        if (sealed) {
          const k = prof * 0.92;
          h[i] = h[i] * (1 - k) + 0.34 * k;
          if (prof > seam[i]) seam[i] = prof;
        } else {
          // shallow soft-walled groove: a hairline crack, not a normal-map cliff
          const k = prof * 0.60;
          h[i] = h[i] * (1 - k) + 0.10 * k;
        }
      }
    }
    if (branches > 0 && !sealed && rng() < 0.014) {
      forks.push([x, y, ang + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.7),
        len * (0.18 + rng() * 0.34), wid * 0.62]);
    }
  }
  for (const f of forks) carveCrack(h, seam, size, rng, f[0], f[1], f[2], f[3], f[4], false, branches - 1);
}

/**
 * Seamless aggregate field. Returns { h, seam } where h is 0..1 relief and seam
 * is 0..1 coverage of crack-sealant / joint bitumen.
 */
function aggregateHeight(rng, size) {
  const h = new Float32Array(size * size);
  const seam = new Float32Array(size * size);
  const fine = valueNoise2D(rng, size, 6);
  // binder floor sits well above zero so carved cracks read as genuinely dark
  for (let i = 0; i < h.length; i++) h[i] = 0.24 + fine[i] * 0.20;

  // Three chip populations. The coarse one is deliberately the loudest: at 256
  // texel/m a radius of 3-10 texels is a 23-78 mm chip, which is 4-14 screen px at
  // the 3-6 m the chase camera actually shows, so those stones *resolve*. The fine
  // fractions only fill the interstices; if they dominate the field averages out
  // into sandpaper and the whole layer reads as a flat wash.
  stampStones(h, size, rng, 15000, 3.0, 10.0, 0.66, 1.00);
  stampStones(h, size, rng, 30000, 1.8, 5.0, 0.50, 0.84);
  stampStones(h, size, rng, 52000, 0.9, 2.6, 0.40, 0.66);

  // crack network — branching, tapering, wrapping. Hairlines, not canyons.
  for (let c = 0; c < 20; c++) {
    carveCrack(h, seam, size, rng, rng() * size, rng() * size,
      rng() * Math.PI * 2, 50 + rng() * 150, 0.55 + rng() * 0.75, false, 2);
  }
  // crack-sealant beads / paving joints: wide, smooth, glossy
  for (let c = 0; c < 4; c++) {
    carveCrack(h, seam, size, rng, rng() * size, rng() * size,
      rng() * Math.PI * 2, 260 + rng() * 900, 2.6 + rng() * 3.4, true, 0);
  }

  // normalise to 0..1
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < h.length; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
  const inv = 1 / Math.max(1e-5, hi - lo);
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) * inv;
  return { h, seam };
}

/**
 * ANISOTROPIC GROOVE FIELD (r9). Real tarmac is not isotropic: traffic polishes it
 * smooth ALONG the wheel path and leaves it ridged ACROSS it — paver screed chatter,
 * transverse compaction waves, the polished crowns between them. Seen at the 10-20
 * degrees off the deck a chase camera actually shows, those cross-road ridges
 * foreshorten into HORIZONTAL DASHES, and that is the feature that cuts a reflected
 * vertical (a lamp, a neon sign) into a stack of bars instead of letting it run as an
 * unbroken vertical comb. Measured on reference/wet-night-asphalt-01 the road-only
 * row/col banding ratio is 3.89:1; an isotropic chip field alone gives 1.5:1, which is
 * why every previous build read as venetian blinds on wet glass rather than as tarmac.
 *
 * The field is a sum of wrapping lattice octaves whose cells are `stretch` times WIDER
 * ACROSS the road than they are LONG down it, so the field's gradient lives almost
 * entirely on the along-road axis. For the road tile texture X is across-road and
 * texture Y is along-road (uDetailRepeat = widthM/DET_M, tileLenM/DET_M), so the
 * stretch goes on X. Because the structure is coherent over ~1-4 m across the road, it
 * survives mip filtering as banding instead of dissolving into the per-chip hash that
 * motivated removing the isotropic breakup in the previous round.
 *
 * `octaves` is [cellsAlongRoad, amplitude] pairs. Returned roughly zero-mean, -1..1.
 */
function grooveField(rng, size, stretch, octaves) {
  const out = new Float32Array(size * size);
  const fade = (t) => t * t * (3 - 2 * t);
  for (const [cellsY, amp] of octaves) {
    const cellsX = Math.max(1, Math.round(cellsY / stretch));
    const g = new Float32Array(cellsX * cellsY);
    for (let i = 0; i < g.length; i++) g[i] = rng() * 2 - 1;
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cellsY;
      const yf = Math.floor(fy);
      const y0 = ((yf % cellsY) + cellsY) % cellsY, y1 = (y0 + 1) % cellsY;
      const ty = fade(fy - yf);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cellsX;
        const xf = Math.floor(fx);
        const x0 = ((xf % cellsX) + cellsX) % cellsX, x1 = (x0 + 1) % cellsX;
        const tx = fade(fx - xf);
        const a = g[y0 * cellsX + x0], b = g[y0 * cellsX + x1];
        const c = g[y1 * cellsX + x0], d = g[y1 * cellsX + x1];
        out[y * size + x] += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
    }
  }
  let m = 1e-5;
  for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
  for (let i = 0; i < out.length; i++) out[i] /= m;
  return out;
}

function dataTex(data, size, { srgb = false, aniso = 16 } = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Build {detail, normal} from one height field so grain and specular agree. */
function makeMicroAggregate(rng, aniso) {
  const { h, seam } = aggregateHeight(rng, DET);
  const at = (x, y) => h[(((y % DET) + DET) % DET) * DET + (((x % DET) + DET) % DET)];

  // Cross-road groove field. One micro tile is DET_M = 4 m, so the four octaves below
  // are along-road wavelengths of 0.67 / 0.31 / 0.15 / 0.073 m — coarse enough that
  // each band is several screen pixels tall out to ~20 m, which is where the reference
  // frame's transverse bars live. STRETCH = 5 makes them 5x longer across the road than
  // down it, so the gradient is ~all along-road.
  const GROOVE_STRETCH = 5;
  const gr = grooveField(rng, DET, GROOVE_STRETCH, [
    [6, 0.85], [13, 0.62], [27, 0.52], [55, 0.42], [110, 0.26],
  ]);
  const gAt = (x, y) => gr[(((y % DET) + DET) % DET) * DET + (((x % DET) + DET) % DET)];

  // detail: R = HEIGHT (the raw relief — this is the channel parallax occlusion
  // mapping marches through and the channel the water level is thresholded
  // against, so it must stay linear and un-remapped), G = roughness mod,
  // B = cavity (AO-ish), A = seam mask. Albedo is derived from R in the shader,
  // which guarantees the grain, the shading and the waterline all agree.
  const det = new Uint8Array(DET * DET * 4);
  // normal
  const nrm = new Uint8Array(DET * DET * 4);
  const STRENGTH = 3.4;
  // Running mean of the cavity channel. The r11 ambient chip floor is an ADDITIVE,
  // radiance-independent term, so it has to be exactly zero-mean or it lifts (or
  // sinks) the whole road: the tile's own mean is the only honest centre, and it is
  // strongly skewed toward 1.0 because most texels are chip crowns, not crevices.
  let cavSum = 0;
  for (let y = 0; y < DET; y++) {
    for (let x = 0; x < DET; x++) {
      const i = (y * DET + x) * 4;
      const c = at(x, y);
      const sm = seam[y * DET + x];
      const gv = gAt(x, y);
      // sealant is a poured bitumen film: much smoother than the aggregate around it.
      // The groove crowns are tyre-polished and therefore glossier than the troughs,
      // which hold grit and water-borne fines: that is a TRANSVERSE gloss band, and it
      // is the term that survives to the far field where the normal has to retire.
      const rgh = clamp((0.28 + c * 0.70) * (1 - sm * 0.62) * (1 - Math.max(gv, 0) * 0.52), 0, 1);
      // Cavity: how far below the local neighbourhood max this texel sits. Sampled
      // over two radii so both the crevice between two touching chips and the
      // broader pit between chip clusters darken. This is the term that actually
      // puts a micro-shadow on every stone once it also occludes the specular.
      const nb1 = Math.max(at(x + 2, y), at(x - 2, y), at(x, y + 2), at(x, y - 2));
      const nb2 = Math.max(at(x + 5, y), at(x - 5, y), at(x, y + 5), at(x, y - 5),
        at(x + 4, y + 4), at(x - 4, y - 4), at(x + 4, y - 4), at(x - 4, y + 4));
      const cav = clamp(1 - (nb1 - c) * 1.7 - (nb2 - c) * 0.9, 0, 1);
      cavSum += cav;
      // A shallow share of the groove goes into HEIGHT so the parallax silhouette and
      // the waterline follow the ridges too: water collects in the transverse troughs,
      // which is what turns the wet mask itself into cross-road bands. Kept small so
      // the chip layer keeps its full 0..1 contrast (flattening it is what washed out
      // an earlier build).
      const hg = clamp(c + gv * 0.14, 0, 1);
      det[i] = hg * 255; det[i + 1] = rgh * 255; det[i + 2] = cav * 255;
      det[i + 3] = clamp(sm, 0, 1) * 255;

      const dx = (at(x + 1, y) - at(x - 1, y)) * STRENGTH;
      const dy = (at(x, y + 1) - at(x, y - 1)) * STRENGTH;
      // Groove gradient, differenced over +/-2 texels so it reads the ridge rather than
      // the chip sitting on it. GROOVE_N is large because the field is deliberately
      // long-wavelength: per texel its slope is an order of magnitude gentler than a
      // chip edge, and the point is for the two to be COMPARABLE in the shading normal.
      // Note the x term is left in at full weight and simply comes out ~1/5 of the y
      // term by construction (GROOVE_STRETCH) — that anisotropy is the whole feature.
      const GROOVE_N = 11.0;
      // encode scale for the alpha channel below; 1/GROOVE_A recovers slope units
      const GROOVE_A = 1.5;
      const gdx = (gAt(x + 2, y) - gAt(x - 2, y)) * 0.25 * GROOVE_N;
      const gdy = (gAt(x, y + 2) - gAt(x, y - 2)) * 0.25 * GROOVE_N;
      let nx = -(dx + gdx), ny = -(dy + gdy), nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nrm[i] = (nx * 0.5 + 0.5) * 255;
      nrm[i + 1] = (ny * 0.5 + 0.5) * 255;
      nrm[i + 2] = (nz * 0.5 + 0.5) * 255;
      // ALPHA = the groove's along-road slope on its own, signed, 0.5 = flat. The
      // shader needs it separable from the chip slope for two reasons: the water
      // flattening has to level the chips but NOT the grooves (a millimetre film over a
      // 300 mm ridge follows the ridge, it does not fill it), and the mirror's
      // transverse bar cut has to retire over tens of metres while the per-chip cut
      // retires at ~14 m. Mip filtering averages this toward 0.5, which is exactly the
      // amplitude retire the far field wants, for free.
      nrm[i + 3] = clamp(gdy * GROOVE_A * 0.5 + 0.5, 0, 1) * 255;
    }
  }
  return {
    detail: dataTex(det, DET, { aniso }),
    normal: dataTex(nrm, DET, { aniso }),
    cavMean: cavSum / (DET * DET),
  };
}

/**
 * Low-frequency wetness mask, on its own tile so puddles do not repeat in lock-step
 * with the meso road tile. R = puddle (contrasty islands), G = damp-film variation,
 * B = ripple noise used to break up the mirror.
 */
function makeWetnessTile(rng, aniso) {
  const big = valueNoise2D(rng, WET, 3);
  const med = valueNoise2D(rng, WET, 5);
  const rip = valueNoise2D(rng, WET, 7);
  const d = new Uint8Array(WET * WET * 4);
  for (let i = 0, n = WET * WET; i < n; i++) {
    const j = i * 4;
    const v = big[i] * 0.74 + med[i] * 0.26;
    // Distinct standing-water islands with genuinely dry land between, but ramped
    // rather than clipped: the shader turns the low end of this ramp into the damp
    // wicking collar around each pool. A hard clip here is what produced the
    // dithered noise-threshold rim instead of a transition.
    const p = smoothstep(0.40, 0.58, v);
    d[j] = p * 255;
    d[j + 1] = med[i] * 255;
    d[j + 2] = rip[i] * 255;
    d[j + 3] = 255;
  }
  return dataTex(d, WET, { aniso });
}

// ---------------------------------------------------------------------------
// meso scale: the road-width tile
// ---------------------------------------------------------------------------

/**
 * Paint one repeating road tile.
 * Returns { albedo: canvas, surf: DataTexture-backed canvas }.
 *   surf.R = paint coverage, surf.G = dry roughness, surf.B = damp mask
 */
function makeRoadTile(rng, { widthM, tileLenM, lanes, cls }, aniso) {
  const { c: ac, ctx: a } = makeCanvas(PX_W, PX_H);   // albedo
  const { c: pc, ctx: p } = makeCanvas(PX_W, PX_H);   // lane paint (RGBA, A = coverage)
  const { c: sc, ctx: s } = makeCanvas(PX_W, PX_H);   // structure: R polish, G tar, B damp
  const pxX = PX_W / widthM;          // pixels per metre across
  const pxY = PX_H / tileLenM;        // pixels per metre along
  const laneW = widthM / lanes;
  const rr = (lo, hi) => lo + (hi - lo) * rng();

  // ---- base tone -----------------------------------------------------
  // sRGB byte value. Real asphalt sits around 0.06-0.11 linear, i.e. ~72-92 here.
  // Asphalt is a cool neutral slate, never a warm tan. Authoring the base blue-grey
  // means warm sodium/neon lighting lands *on* stone rather than tinting a varnish.
  const base = cls === 'highway' ? 80 : 86;
  const cool = (v, alpha) => (alpha === undefined
    ? `rgb(${Math.round(v - 8)},${Math.round(v - 2)},${Math.round(v + 9)})`
    : `rgba(${Math.round(v - 8)},${Math.round(v - 2)},${Math.round(v + 9)},${alpha})`);
  a.fillStyle = cool(base);
  a.fillRect(0, 0, PX_W, PX_H);
  s.fillStyle = 'rgb(0,0,0)';
  s.fillRect(0, 0, PX_W, PX_H);

  // ---- meso mottling: big soft blotches of older/newer surfacing ------
  // Drawn as radial gradients so they survive mipping into the distance.
  for (let i = 0; i < 42; i++) {
    const x = rng() * PX_W, y = rng() * PX_H;
    const r = rr(0.9, 4.5) * pxX;
    const d = Math.round(rr(-15, 13));
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    const v = clamp(base + d, 40, 140);
    g.addColorStop(0, cool(v, 0.55));
    g.addColorStop(1, cool(v, 0));
    a.fillStyle = g;
    a.beginPath(); a.arc(x, y, r, 0, 7); a.fill();
    // wrap horizontally so the tile stays seamless across the width seam
    if (x < r || x > PX_W - r) {
      const x2 = x < r ? x + PX_W : x - PX_W;
      const g2 = a.createRadialGradient(x2, y, 0, x2, y, r);
      g2.addColorStop(0, cool(v, 0.55));
      g2.addColorStop(1, cool(v, 0));
      a.fillStyle = g2; a.beginPath(); a.arc(x2, y, r, 0, 7); a.fill();
    }
  }

  // ---- patched repairs ------------------------------------------------
  // A rectangle of newer, darker, finer mix with a fat tar-bleed outline.
  const ragged = (ctx, x0, y0, w, h) => {
    ctx.beginPath();
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const per = t * 4;
      let x, y;
      if (per < 1) { x = x0 + w * per; y = y0; }
      else if (per < 2) { x = x0 + w; y = y0 + h * (per - 1); }
      else if (per < 3) { x = x0 + w * (3 - per); y = y0 + h; }
      else { x = x0; y = y0 + h * (4 - per); }
      const j = 0.10 * pxX;
      if (i === 0) ctx.moveTo(x + (rng() - 0.5) * j, y + (rng() - 0.5) * j);
      else ctx.lineTo(x + (rng() - 0.5) * j, y + (rng() - 0.5) * j);
    }
    ctx.closePath();
  };
  for (let i = 0; i < 5; i++) {
    const w = rr(1.4, 5.0) * pxX, h = rr(1.2, 4.0) * pxY;
    const x0 = rng() * (PX_W - w), y0 = rng() * (PX_H - h);
    const v = clamp(base + Math.round(rr(-20, 8)), 38, 130);
    a.fillStyle = cool(v);
    ragged(a, x0, y0, w, h); a.fill();
    // A patch is a newer, finer, bitumen-rich mix: it is measurably *glossier* than
    // the open aggregate around it, so it goes into the tar (G) channel as a fill,
    // not just as an outline.
    s.globalCompositeOperation = 'lighter';
    s.fillStyle = 'rgba(0,110,0,1)';
    ragged(s, x0, y0, w, h); s.fill();
    s.globalCompositeOperation = 'source-over';
    // tar bleed around the seam
    a.strokeStyle = cool(Math.max(26, v - 30), 0.9);
    a.lineWidth = rr(3, 7);
    ragged(a, x0, y0, w, h); a.stroke();
    s.globalCompositeOperation = 'lighter';
    s.strokeStyle = 'rgba(0,190,0,1)';
    s.lineWidth = rr(3, 7);
    ragged(s, x0, y0, w, h); s.stroke();
    s.globalCompositeOperation = 'source-over';
  }

  // ---- tar seams: long crack-sealant snakes ---------------------------
  const seam = (x0, y0, x1, y1, wid, dark) => {
    const mkPath = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const segs = 7;
      let px = x0, py = y0;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const nx = lerp(x0, x1, t) + (rng() - 0.5) * 0.55 * pxX;
        const ny = lerp(y0, y1, t) + (rng() - 0.5) * 0.35 * pxY;
        ctx.quadraticCurveTo(px, py, (px + nx) * 0.5, (py + ny) * 0.5);
        px = nx; py = ny;
      }
      ctx.lineTo(x1, y1);
    };
    a.lineCap = 'round';
    a.strokeStyle = cool(dark, 0.92);
    a.lineWidth = wid; mkPath(a); a.stroke();
    // slight lighter shoulder where the sealant was smeared flat
    a.strokeStyle = cool(dark + 26, 0.28);
    a.lineWidth = wid * 2.6; mkPath(a); a.stroke();
    s.globalCompositeOperation = 'lighter';
    s.strokeStyle = 'rgba(0,200,0,1)';
    s.lineWidth = wid * 1.3; mkPath(s); s.stroke();
    s.globalCompositeOperation = 'source-over';
  };
  const tar = Math.max(30, base - 30);
  // longitudinal, usually along a lane boundary (that is where paving joints are)
  for (let l = 0; l <= lanes; l++) {
    if (rng() > 0.62) continue;
    const x = l * laneW * pxX + (rng() - 0.5) * 0.4 * pxX;
    seam(x, 0, x, PX_H, rr(3, 7), tar);
  }
  for (let i = 0; i < 2; i++) seam(rng() * PX_W, 0, rng() * PX_W, PX_H, rr(2, 5), tar + 6);
  // transverse construction joints
  for (let i = 0; i < 3; i++) {
    const y = (i + rr(0.15, 0.85)) * (PX_H / 3);
    seam(-10, y, PX_W + 10, y, rr(3, 8), tar + 4);
  }
  // fine hairline cracks
  a.globalAlpha = 0.5;
  for (let i = 0; i < 90; i++) {
    const x = rng() * PX_W, y = rng() * PX_H;
    const ang = rng() * Math.PI * 2, len = rr(0.2, 1.4) * pxX;
    a.strokeStyle = cool(tar + 10);
    a.lineWidth = rr(1, 2.2);
    a.beginPath(); a.moveTo(x, y);
    a.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 1.8);
    a.stroke();
  }
  a.globalAlpha = 1;

  // ---- per-lane tyre polish -------------------------------------------
  // Two darker, glossier bands per lane (1.6 m track width), lighter rougher
  // aggregate left between them and between lanes.
  const trackHalf = 0.42;   // metres, half width of one polished band
  for (let l = 0; l < lanes; l++) {
    const cx = (l + 0.5) * laneW;
    const wobble = rr(-0.12, 0.12);
    for (const off of [-0.80, 0.80]) {
      const px = (cx + off + wobble) * pxX;
      const halfPx = trackHalf * pxX * rr(0.85, 1.25);
      // Rubber-polished wheel track: markedly darker and, in the struct map, markedly
      // smoother. Two bands per lane, ~1.6 m apart, running the full tile length.
      const g = a.createLinearGradient(px - halfPx, 0, px + halfPx, 0);
      g.addColorStop(0.00, 'rgba(16,16,20,0)');
      g.addColorStop(0.22, 'rgba(16,16,20,0.44)');
      g.addColorStop(0.50, 'rgba(14,14,18,0.62)');
      g.addColorStop(0.78, 'rgba(16,16,20,0.44)');
      g.addColorStop(1.00, 'rgba(16,16,20,0)');
      a.fillStyle = g;
      a.fillRect(px - halfPx, 0, halfPx * 2, PX_H);

      const gs = s.createLinearGradient(px - halfPx, 0, px + halfPx, 0);
      gs.addColorStop(0.00, 'rgba(0,0,0,0)');
      gs.addColorStop(0.25, 'rgba(190,0,90,1)');
      gs.addColorStop(0.50, 'rgba(255,0,120,1)');
      gs.addColorStop(0.75, 'rgba(190,0,90,1)');
      gs.addColorStop(1.00, 'rgba(0,0,0,0)');
      s.globalCompositeOperation = 'lighter';
      s.fillStyle = gs;
      s.fillRect(px - halfPx, 0, halfPx * 2, PX_H);
      s.globalCompositeOperation = 'source-over';
    }
    // lighter, rougher, unpolished aggregate ridge down the centre of the lane
    const mx = (cx + wobble) * pxX, mh = 0.46 * pxX;
    const gm = a.createLinearGradient(mx - mh, 0, mx + mh, 0);
    // Cool, and lighter-handed than before: the unpolished ridge should read as
    // exposed aggregate, and that lightening now comes mostly from the micro map.
    gm.addColorStop(0.0, 'rgba(174,180,192,0)');
    gm.addColorStop(0.5, 'rgba(174,180,192,0.17)');
    gm.addColorStop(1.0, 'rgba(174,180,192,0)');
    a.fillStyle = gm; a.fillRect(mx - mh, 0, mh * 2, PX_H);
  }

  // ---- rubber-scuffed aprons and skid deposits -------------------------
  // Broad dark smudge (launch/braking apron) plus individual skid arcs.
  const apron = (cx, cy, w, h, alpha) => {
    const g = a.createRadialGradient(cx, cy, 0, cx, cy, 1);
    // use transform trick for an ellipse gradient
    a.save();
    a.translate(cx, cy); a.scale(w, h);
    const g2 = a.createRadialGradient(0, 0, 0, 0, 0, 1);
    g2.addColorStop(0, `rgba(14,14,16,${alpha})`);
    g2.addColorStop(0.55, `rgba(16,16,19,${alpha * 0.55})`);
    g2.addColorStop(1, 'rgba(16,16,19,0)');
    a.fillStyle = g2; a.beginPath(); a.arc(0, 0, 1, 0, 7); a.fill();
    a.restore();
    s.save();
    s.globalCompositeOperation = 'lighter';
    s.translate(cx, cy); s.scale(w, h);
    const g3 = s.createRadialGradient(0, 0, 0, 0, 0, 1);
    g3.addColorStop(0, `rgba(${Math.round(200 * alpha)},0,0,1)`);
    g3.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = g3; s.beginPath(); s.arc(0, 0, 1, 0, 7); s.fill();
    s.restore();
    s.globalCompositeOperation = 'source-over';
    void g;
  };
  const aprons = cls === 'city' ? 5 : 3;
  for (let i = 0; i < aprons; i++) {
    apron(rng() * PX_W, rng() * PX_H, rr(1.5, 4.5) * pxX, rr(2.5, 7) * pxY, rr(0.22, 0.5));
  }
  // skid arcs — a pair of parallel streaks that curve
  for (let i = 0; i < (cls === 'city' ? 2 : 1); i++) {
    const x0 = rr(0.15, 0.85) * PX_W, y0 = rng() * PX_H;
    const dx = rr(-1.2, 1.2) * pxX, dy = rr(8, 20) * pxY;
    const bow = rr(-0.8, 0.8) * pxX;
    for (const off of [-0.9 * pxX, 0.9 * pxX]) {
      a.strokeStyle = `rgba(13,13,15,${rr(0.14, 0.30)})`;
      a.lineWidth = rr(0.14, 0.26) * pxX;
      a.lineCap = 'round';
      a.beginPath();
      a.moveTo(x0 + off, y0);
      a.quadraticCurveTo(x0 + off + bow, y0 + dy * 0.5, x0 + off + dx, y0 + dy);
      a.stroke();
      s.globalCompositeOperation = 'lighter';
      s.strokeStyle = 'rgba(170,0,0,1)';
      s.lineWidth = rr(0.14, 0.26) * pxX;
      s.beginPath();
      s.moveTo(x0 + off, y0);
      s.quadraticCurveTo(x0 + off + bow, y0 + dy * 0.5, x0 + off + dx, y0 + dy);
      s.stroke();
      s.globalCompositeOperation = 'source-over';
    }
  }

  // ---- structural water bias (blue channel of struct) -------------------
  // Only the *structural* reason water collects somewhere: the polished ruts and the
  // gutters. The actual puddle mosaic is a separate low-frequency map (makeWetnessTile)
  // sampled at its own tile size, so puddles never repeat in step with the road tile.
  {
    const img = s.getImageData(0, 0, PX_W, PX_H);
    const d = img.data;
    for (let y = 0; y < PX_H; y++) {
      for (let x = 0; x < PX_W; x++) {
        const i = (y * PX_W + x) * 4;
        const rut = d[i] / 255;
        const u = x / PX_W;
        const gutter = smoothstep(0.11, 0.0, u) + smoothstep(0.89, 1.0, u);
        d[i + 2] = clamp(rut * 0.55 + gutter * 0.85, 0, 1) * 255;
      }
    }
    s.putImageData(img, 0, 0);
  }

  // ---- lane paint: worn, broken, chipped -------------------------------
  const WHITE = [216, 214, 203], YELLOW = [214, 168, 56];
  const stripe = (xm, halfM, y0, y1, col, wear) => {
    const x = xm * pxX, hw = Math.max(1.5, halfM * pxX);
    // lay the stripe down in short segments with jittered coverage so no two
    // metres of paint have the same opacity
    // slow along-line wear wave, so the stripe fades in and out over metres
    const ph = rng() * 6.28, freq = rr(0.08, 0.22);
    const segH = 0.35 * pxY;
    for (let y = y0; y < y1; y += segH) {
      const h = Math.min(segH, y1 - y);
      const wave = 0.5 + 0.5 * Math.sin(ph + (y / pxY) * freq);
      const cov = clamp(rr(0.80, 1.0) * (1 - wear * wave), 0.06, 1);
      const jx = (rng() - 0.5) * hw * 0.16;
      p.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${cov})`;
      p.fillRect(x - hw + jx, y, hw * 2 + (rng() - 0.5) * hw * 0.22, h + 1);
    }
    // chip the paint away: bite out random flecks along the edges
    p.globalCompositeOperation = 'destination-out';
    const chips = Math.round((y1 - y0) / pxY * 2.2);
    for (let i = 0; i < chips; i++) {
      const cy = lerp(y0, y1, rng());
      const cxp = x + (rng() < 0.5 ? -1 : 1) * hw * rr(0.35, 1.15);
      const r = rr(0.8, 3.6);
      p.fillStyle = `rgba(0,0,0,${rr(0.4, 1)})`;
      p.beginPath(); p.ellipse(cxp, cy, r, r * rr(0.5, 2.2), 0, 0, 7); p.fill();
    }
    // transverse abrasion where tyres cross the line
    for (let i = 0; i < Math.round((y1 - y0) / pxY * 0.22); i++) {
      const cy = lerp(y0, y1, rng());
      p.fillStyle = `rgba(0,0,0,${rr(0.2, 0.62)})`;
      p.fillRect(x - hw * 1.2, cy, hw * 2.4, rr(1, 4) * pxY * 0.10);
    }
    p.globalCompositeOperation = 'source-over';
  };

  const edge = 0.75, lw = 0.085;
  stripe(edge, lw, 0, PX_H, WHITE, 0.42);
  stripe(widthM - edge, lw, 0, PX_H, WHITE, 0.42);

  const mid = widthM / 2;
  const dbl = cls === 'highway' ? 0.35 : 0.22;
  stripe(mid - dbl, lw, 0, PX_H, YELLOW, 0.30);
  stripe(mid + dbl, lw, 0, PX_H, YELLOW, 0.30);

  const dashOn = 3.0 * pxY, dashOff = 5.0 * pxY;
  for (let l = 1; l < lanes; l++) {
    const x = l * laneW;
    if (Math.abs(x - mid) < 0.5) continue;
    for (let y = 0; y < PX_H; y += dashOn + dashOff) {
      stripe(x, lw, y, Math.min(PX_H, y + dashOn), WHITE, 0.38);
    }
  }

  // ---- composite paint onto albedo + build the surface data texture -----
  const aimg = a.getImageData(0, 0, PX_W, PX_H);
  const pimg = p.getImageData(0, 0, PX_W, PX_H);
  const simg = s.getImageData(0, 0, PX_W, PX_H);
  const ad = aimg.data, pd = pimg.data, sd = simg.data;
  const surf = new Uint8Array(PX_W * PX_H * 4);
  const rough = valueNoise2D(rng, 128, 4);

  for (let y = 0; y < PX_H; y++) {
    for (let x = 0; x < PX_W; x++) {
      const i = (y * PX_W + x) * 4;
      const cov = pd[i + 3] / 255;
      if (cov > 0) {
        // paint sits on top; dirt from the tarmac shows through the thin bits
        const grime = 0.72 + (ad[i] / 255) * 0.5;
        for (let k = 0; k < 3; k++) {
          ad[i + k] = clamp(lerp(ad[i + k], pd[i + k] * grime, cov), 0, 255);
        }
      }
      // fine binder grain so the meso tile is never perfectly smooth
      const g = (rng() - 0.5) * 13;
      ad[i] = clamp(ad[i] + g, 8, 250);
      ad[i + 1] = clamp(ad[i + 1] + g, 8, 250);
      ad[i + 2] = clamp(ad[i + 2] + g * 0.9 + 2, 8, 250);

      const polish = sd[i] / 255;
      const tarM = sd[i + 1] / 255;
      const damp = sd[i + 2] / 255;
      // between-lane band: rougher, unpolished aggregate
      const um = (x / PX_W) * widthM;
      const inLane = Math.abs(((um % laneW) / laneW) - 0.5) * 2; // 0 centre -> 1 edge
      const between = smoothstep(0.62, 1.0, inLane);
      const n = rough[(((y * 128 / PX_H) | 0) % 128) * 128 + (((x * 128 / PX_W) | 0) % 128)];

      // Dry asphalt roughness: rough open aggregate ~0.85, polished wheel tracks ~0.58,
      // paint ~0.55 (it is a glossier binder and slightly raised). Kept well below the old
      // near-1.0 wash so the dry surface still has a readable specular response.
      let r = 0.86
        - polish * 0.30
        - tarM * 0.34
        - cov * 0.30
        + between * 0.07
        + (n - 0.5) * 0.15;
      r = clamp(r, 0.45, 0.97);

      surf[i] = cov * 255;
      surf[i + 1] = r * 255;
      surf[i + 2] = damp * 255;
      surf[i + 3] = 255;
    }
  }
  a.putImageData(aimg, 0, 0);

  const albedo = canvasTexture(ac, { srgb: true, repeat: [1, 1], aniso });
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.needsUpdate = true;

  const surfTex = new THREE.DataTexture(surf, PX_W, PX_H, THREE.RGBAFormat);
  surfTex.wrapS = surfTex.wrapT = THREE.RepeatWrapping;
  surfTex.magFilter = THREE.LinearFilter;
  surfTex.minFilter = THREE.LinearMipmapLinearFilter;
  surfTex.generateMipmaps = true;
  surfTex.anisotropy = aniso;
  surfTex.needsUpdate = true;

  return { albedo, surfTex };
}

// ---------------------------------------------------------------------------
// shader injection
// ---------------------------------------------------------------------------

const DECL = /* glsl */`
uniform sampler2D uDetailMap;
uniform sampler2D uWetMap;
uniform sampler2D uReflMap;
uniform vec2  uDetailRepeat;
uniform vec2  uWetRepeat;
uniform vec2  uReflTexel;
uniform float uDetailAmt;
uniform float uGrainAmt;
uniform float uWet;
uniform float uGraze;
uniform float uReflAmt;
uniform float uPomDepth;
uniform float uChipAmb;
uniform float uCavMean;
varying vec4 vReflUv;
// tangent-space micro-relief slope, published by the normal stage so the planar
// reflection can be displaced by the aggregate instead of by a smooth wetness mask
vec2 gMicroN = vec2( 0.0 );
// signed along-road slope of the CROSS-ROAD GROOVE field alone (normal-map alpha),
// kept separate from the chip slope so the mirror can be barred by the grooves at any
// distance while per-chip breakup still retires at ~14 m
float gBand = 0.0;
// r10's gChipN (the pre-film chip slope, published here so the mirror could be warped by
// the full stone tilt) is DELETED in r12. The premise was right - a millimetre of water
// over a 10 mm chip is not a plane, the film bulges and that bulge is a lens - but the
// signal was sampled at the hardware mip, i.e. at one texel per pixel, and driving a
// +/-6 texel mirror displacement with a Nyquist-rate offset is point-sampling, not
// lensing. The lens now comes from 'lensH'/'lensC'/'lensG' in MAP_FRAG: the same tile,
// band-passed to 3-9 screen px by a mip difference, so it can bulge the film without
// being able to create pixel-scale grain. See the CHIP LENS note in REFL_FRAG.
//
// r15 sparse-facet constants. See the SPARSE FACET POPULATION note in REFL_FRAG for FLK_*
// and the DENSE-FLOOR THINNER note beside 'lensC' in MAP_FRAG for SPARSE_*. The two are a
// PAIR and are tuned jointly; neither is meaningful alone and the verdict says why.
//
// sparseShape() is, as it ships, a compress-below-the-knee map with a hard ceiling, and NOT
// the power law it looks like. Measured, not assumed: PWR 2.30 and PWR 2.55 return figures
// identical to three digits at fixed G, which can only happen if min() is taking CAP for
// essentially the whole population - i.e. |v| / KN exceeds CAP^(1/PWR) almost everywhere, so
// the carrier's own sigma is well above SPARSE_KN and the exponent is inert above ~2.3. What
// the map therefore does is: leave the small-|v| population squashed toward zero, and clip
// everything else to KN * G * CAP = 0.228. Do not re-tune PWR expecting it to do work, and do
// not describe this as a power expansion; the r13 draft of this block did, and it was wrong.
#define FLK_A    0.580
#define FLK_B    0.700
#define FLK_AMP  0.240
#define SPARSE_KN  0.020
#define SPARSE_PWR 2.30
#define SPARSE_CAP 6.00
#define SPARSE_G   1.90
float sparseShape( float v ) {
  float a = abs( v ) / SPARSE_KN;
  return sign( v ) * SPARSE_KN * SPARSE_G * min( pow( a, SPARSE_PWR ), SPARSE_CAP );
}
`;

// map_fragment: parallax-march the aggregate, then fold it into albedo and derive
// the height-thresholded waterline that everything downstream keys off.
const MAP_FRAG = /* glsl */`
#include <map_fragment>

float vDist = length( vViewPosition );

// --- MICRO: octaves of the same 4 m aggregate tile.
//   A (1.00x, 4 m)   — the legible chip layer and the only one POM marches through.
//                      256 texel/m; a 23-78 mm chip is 4-14 screen px at 3-6 m.
//   B (0.37x, 10.8m) — macro decorrelator. It tilts the local water level over
//                      metres; it must NOT be averaged into A's relief or it
//                      halves A's contrast, which is what flattened the last build.
//   C (2.60x, 1.5 m) — sub-chip sparkle for the very near field. Still ~1-3 px at
//                      4 m, so it survives instead of mipping to flat grey (the
//                      old 8x octave was pure sub-pixel wash and contributed
//                      nothing but a 0.5 bias that diluted everything else).
vec2  dUv0 = vMapUv * uDetailRepeat;
vec2  dUv  = dUv0;

// --- ALONG-ROAD GROUND FOOTPRINT, metres of road covered by one screen pixel down
// the texture-Y (== along-road) axis. dUv0 is in TILE units and one tile is DET_M
// metres, so the screen gradient of dUv0.y times DET_M is metres/pixel. On a deck
// viewed at a grazing angle this grows like distance SQUARED (the 1/sin(incidence)
// term), which is why it, and not vDist, is the correct retire variable for anything
// whose along-road period is fixed in WORLD units.
// MEASURED, not derived: shots/road-n1-diag-step2.png encodes step() thresholds of this
// value into RGB. On the wet-night-asphalt chase cam at 1920x1080 (44.4 deg vFOV, eye
// 1.95 m) it reads 0.020 at frame y 0.818 (8.5 m) and 0.055 at y 0.679 (~14 m); the
// whole visible road spans only 5.6 m (y 1.0) to 13.2 m (y 0.70), which is worth knowing
// before treating any frame-fraction depth ladder as a distance ladder.
float pxAlongM = length( vec2( dFdx( dUv0.y ), dFdy( dUv0.y ) ) ) * ${DET_M.toFixed(1)};

// TRANSVERSE-BAR RESOLVABILITY. The cross-road groove field's finest usable octave is
// 0.15 m along-road (grooveField octaves are 0.67/0.31/0.15/0.073/0.036 m, and the last
// two are already sub-pixel everywhere in this shot). The finest octave still carrying
// real weight is 0.073 m at 0.42; retire the bar terms as THAT crosses 5 px -> 2 px of
// screen height, i.e. 0.014 -> 0.048 m/px, which is y 0.90 -> 0.74 of frame (about
// 7 m -> 11 m) on this camera. The old retire was a vDist smoothstep(30,120), exactly 1.0 across the
// ENTIRE visible road here and therefore was no retire at all. Measured: with gBand off
// the far band d1 (0.72,1.0,0.70,0.76) drops 21.04 -> 9.24 hfRmsNorm while the near band
// d5 only drops 16.89 -> 11.09, i.e. the groove stack was the dominant grain source at
// 10-13 m and a minority one at 6 m - the exact inversion the depth-persistence metric
// was reading.
float barRes = 1.0 - smoothstep( 0.014, 0.048, pxAlongM );

// CHIP-LENS RESOLVABILITY. Same idea, one octave coarser. The lens carrier below is a
// difference of two FIXED LOD BIASES (+log2(3) and +log2(9)), which is a band-pass at
// 3-9 SCREEN pixels AT EVERY DISTANCE - it is band-limited, so it cannot alias, but it
// is screen-locked, so it re-injects the same relief amplitude onto tarmac at 12 m that
// it puts on tarmac at 6 m. The thing it represents is the water film bulging over a
// 20-40 mm chip; once one pixel covers more road than that chip is wide, the bulge is
// not a resolvable feature and the carrier is inventing relief. Retire on the 40 mm
// scale: full at 0.020 m/px (2 px per chip), gone at 0.055 (0.7 px per chip).
float lensRes = 1.0 - smoothstep( 0.020, 0.055, pxAlongM );

// ---- parallax occlusion mapping on octave A ------------------------------
// The chase camera sits ~2 m up, so the near field is viewed at ~35 deg to the
// deck: exactly the geometry where relief has to occlude itself or the surface
// reads as a decal on glass. Build a tangent frame from screen derivatives (the
// ribbon carries no tangent attribute) and march the height field.
float pomFade = ( 1.0 - smoothstep( 7.0, 30.0, vDist ) ) * uPomDepth;
if ( pomFade > 0.0008 ) {
  vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition );
  vec2 dux = dFdx( dUv0 ), duy = dFdy( dUv0 );
  vec3 Vw  = normalize( vViewPosition );
  vec3 Ng  = normalize( cross( dpx, dpy ) );
  Ng *= sign( dot( Ng, Vw ) );
  vec3 p2  = cross( dpy, Ng );
  vec3 p1  = cross( Ng, dpx );
  vec3 Tg  = p2 * dux.x + p1 * duy.x;
  vec3 Bg  = p2 * dux.y + p1 * duy.y;
  float im = inversesqrt( max( max( dot( Tg, Tg ), dot( Bg, Bg ) ), 1e-12 ) );
  vec3 vts = vec3( dot( Tg, Vw ) * im, dot( Bg, Vw ) * im, dot( Ng, Vw ) );

  // total sweep across the full 0..1 height range, in detail-UV units
  vec2 sweep = ( vts.xy / max( 0.28, abs( vts.z ) ) ) * pomFade;
  const float NS = 12.0;
  float dLayer = 1.0 / NS;
  vec2  dUvStep = sweep * dLayer;
  vec2  cUv = dUv0;
  float cH  = texture2D( uDetailMap, cUv ).r;
  float cL  = 0.0;
  vec2  pUv = cUv; float pH = cH; float pL = 0.0;
  bool  hit = ( cL >= 1.0 - cH );
  for ( int i = 0; i < 12; i ++ ) {
    if ( ! hit ) {
      pUv = cUv; pH = cH; pL = cL;
      cUv -= dUvStep; cL += dLayer;
      cH = texture2D( uDetailMap, cUv ).r;
      hit = ( cL >= 1.0 - cH );
    }
  }
  // one linear crossing solve: this is what puts the intersection on the chip's
  // silhouette rather than on a step edge
  float aft = ( 1.0 - cH ) - cL;
  float bef = ( 1.0 - pH ) - pL;
  float t   = clamp( aft / max( 1e-5, aft - bef ), 0.0, 1.0 );
  dUv = mix( cUv, pUv, t );
}

vec2  dUv2 = dUv * 0.370 + vec2( 0.37, 0.11 );
vec2  dUv3 = dUv * 2.600 + vec2( 0.81, 0.44 );
vec4  dA   = texture2D( uDetailMap, dUv  );
vec4  dB   = texture2D( uDetailMap, dUv2 );
vec4  dC   = texture2D( uDetailMap, dUv3 );

// Height stays A-dominant on purpose. B and C only perturb it slightly, so the
// 4 m chip layer keeps its full contrast all the way to the waterline test.
float hL = clamp( 0.5 + ( dA.r + ( dB.r - 0.5 ) * 0.13 + ( dC.r - 0.5 ) * 0.20 - 0.5 ) * 1.22, 0.0, 1.0 );
float cavV  = clamp( dA.b * 0.74 + dB.b * 0.10 + dC.b * 0.16, 0.0, 1.0 );
float rghD  = clamp( dA.g * 0.70 + dB.g * 0.12 + dC.g * 0.18, 0.0, 1.0 );
// Seams must NOT be averaged across octaves or they turn into grey mush; take the
// strongest hit so a tar bead stays a crisp, continuous ribbon.
float seamV = clamp( max( dA.a, dB.a * 0.85 ), 0.0, 1.0 );
// CHIP RESOLVABILITY, r14. Until now this line read: float detAmt = uDetailAmt; - the whole
// micro-aggregate stack (albedo cavity, roughness swing, mirror cavity, microAO, the lens
// gains) ran at CONSTANT amplitude at every distance, with no pxAlongM and no vDist anywhere
// in it. barRes and lensRes above retire the GROOVES and the LENS; nothing retired the CHIPS.
// The measured signature was a hfRmsNorm ladder that PEAKED IN THE MIDDLE DISTANCE — d1..d5
// 10.37/18.40/21.58/19.82/16.65 over frame y 0.70->1.00 — and no real surface can do that:
// grain must be non-increasing in metres-of-road-per-pixel.
//
// The retire scale is the chip, ~10 mm, not the 40 mm film bulge lensRes uses. Full
// amplitude while a chip still spans better than a pixel (0.008 m/px), gone once one pixel
// covers most of three chips (0.022 m/px).
//
// MEASURED, from the live camera matrix rather than interpolated (probe: unproject each row,
// intersect y=0, difference the ground distance across one pixel). On wet-night-asphalt at
// 1920x1080 the FIVE measurement bands average pxAlongM = 0.0399 / 0.0252 / 0.0174 / 0.0128 /
// 0.0097 m/px for d1..d5, and ground distance runs 11.50 m (y 0.70) to 4.69 m (y 1.00). Note
// the whole visible deck sits ABOVE 0.0086 m/px: the wave-O brief's estimate of 0.004 m/px in
// the near field was 2.4x too small, so nothing in this shot is ever fully inside the gate.
// Resulting gate weights: 0.10 / 0.10 / 0.30 / 0.60 / 0.75.
//
// The floor is 0.10, not 0. A sub-pixel chip field does not vanish, it mip-averages down to a
// small residual contrast; taking it to zero also drove the near/far ratio D below the
// reference's own. The ceiling is 0.78 because the near band measured 16.65 against the
// reference plate's 12.00-12.48 — we were 39% over, so the ceiling is a range fix, not taste.
float chipRes = 1.0 - smoothstep( 0.008, 0.022, pxAlongM );
float detAmt = uDetailAmt * mix( 0.10, 0.78, chipRes );

// --- BAND-LIMITED GRAIN CARRIER (added r12; read the CHIP LENS note in REFL_FRAG for
// why this exists). Every grain channel this file had was driven by dA/dB/dC at the
// hardware's own mip, i.e. at ~1 texel per pixel: that is exactly Nyquist, so all of it
// was pixel-scale by construction. Measured: hfRmsNorm@960 / hfRmsNorm@1920 was
// 0.765 dark / 0.834 bright, against 1.040 / 0.923 for reference/wet-night-asphalt-01 -
// our grain DIES on a 2x box downsample and the reference's does not, which is the
// signature of aliasing rather than of texture. Reference asphalt grain lives at a
// multi-pixel scale (the critic's read: "a broad, soft, multi-pixel ripple"); ours read
// as salt-and-pepper JPEG dither at 1.4x zoom.
//
// This is a DIFFERENCE OF MIPS, and it is band-limited by construction. The LOD the
// hardware picks for dUv is the alias-free level for one pixel, so a +log2(3) bias is
// the alias-free level for a three-pixel feature and +log2(9) for a nine-pixel one.
// Their difference is a band-pass with NO energy above 3 px and none below 9 px, at any
// distance and at any camera angle - it cannot manufacture pixel-scale hfRms even in
// principle, so it cannot fake a grain score. The gain is large because two adjacent
// mip levels of a 1024 tile differ by little; the band is measured, not the amplitude.
// Sampled at dUv0, the UNPARALLAXED tile UV, and this is not a detail. dUv is the output
// of the POM march, which steps a different number of layers on either side of a chip
// silhouette: it is DISCONTINUOUS per pixel by design, so every mip of it - however deeply
// biased - carries a per-pixel jump at every silhouette, and a band-pass built on it is not
// band-limited at all. Measured directly: driving this carrier from dUv left the 960/1920
// scale-persistence at 0.747 (worse than the aliasing it replaced) while tripling the
// absolute grain. dUv0 is linear in screen space, so the LOD is smooth and the band-pass
// is real. It is also the physically correct UV here: the lens is the WATER SURFACE
// bulging over the aggregate, and the water surface has no parallax silhouette.
vec4  dL0 = texture2D( uDetailMap, dUv0, 1.585 );
vec4  dL1 = texture2D( uDetailMap, dUv0, 3.170 );
// signed and zero-mean by construction (a mip difference has mean zero), so every
// consumer REDISTRIBUTES rather than adds - the "pale grit crust" inversion this file
// has failed into twice is a one-sided add, and a band-pass cannot be one.
// r13: gated on 'lensRes' (see MAP_FRAG) - the amplitude, not the band, is what was
// wrong. Measured with the three gains forced to 0.0: far band d1 21.04 -> 19.47
// hfRmsNorm, near band d5 16.89 -> 11.29, i.e. this carrier was already NEAR-weighted
// by its consumers' own nearK terms and was NOT the dominant far-field grain source the
// wave-M brief named it as. The gate is still correct - it removes a screen-locked term
// - it is just worth ~1.5 of d1's 21, not ~12.
float lensH = ( dL0.r - dL1.r ) * 3.4 * lensRes;   // relief:  film bulge that bends the mirror
// DENSE-FLOOR THINNER (r15). lensC is the carrier of the ambient chip floor ('chipAmb' in
// REFL_FRAG), and that floor is where the near-field residual's DENSE, symmetric bulk lives:
// measured one channel at a time at (PWR 2.30, G 1.50), passing lensC through the compressive
// map below moves the d5 top-5% energy share 33.4% -> 48.4% while the same map on lensH moves
// it 33.4% -> 33.3%, i.e. nothing, at any (PWR, G) tried; the roughness path was separately
// kill-controlled to near-zero authority over the same statistic.
// Alone this is NOT a fix and must not be shipped alone: it buys share by DELETING energy
// (d5 5x5 rms 11.20 -> 7.57 against the T3 band 10.0-13.5), and at gain zero - the floor
// removed outright - the share reads 58.5%, PAST the reference. A statistic that scores best
// with the feature deleted is not measuring the feature. It ships only as the other half of a
// pair: thin the dense floor here, add a genuinely sparse population at FLK_* in REFL_FRAG,
// and the two amplitude effects cancel while the two share effects add. That is what the
// plate is - the same total energy, redistributed - and it is why neither half is tuned alone.
float lensC = sparseShape( ( dL0.b - dL1.b ) * 3.4 ) * lensRes;   // cavity:  open-to-the-sky vs shadowed
float lensG = ( dL0.g - dL1.g ) * 3.4 * lensRes;   // roughness: stone face vs binder

vec4  surf = texture2D( roughnessMap, vRoughnessMapUv );
float paintMaskV = surf.r;

// --- MACRO: where water is *allowed* to collect. Two octaves of a dedicated 30 m
// mask plus the structural bias (ruts + gutters) from the meso tile. This is only
// a water *level* now, never the puddle shape itself.
vec4  w1 = texture2D( uWetMap, vMapUv * uWetRepeat );
vec4  w2 = texture2D( uWetMap, vMapUv * uWetRepeat * 0.29 + vec2( 0.27, 0.62 ) );
float wetZone = clamp( w1.r * 0.74 + w2.r * 0.56 - 0.10 + surf.b * 0.46, 0.0, 1.0 );
float dampV   = clamp( 0.28 + w1.g * 0.55 + w2.g * 0.35 + surf.b * 0.30, 0.0, 1.0 );
float rippleV = w1.b * 0.6 + w2.b * 0.4;

// --- WATERLINE: this is the whole fix. Water is a horizontal plane at 'level'
// intersected with the aggregate height field, so the puddle outline is the stone
// geometry's own contour and its edge is one height-quantum wide — a hard rim in a
// real depression, not an airbrushed alpha ramp. Crowns above the line stay dry,
// rough and matte; only the voids below it go mirror.
float level  = mix( -0.10, 1.06, smoothstep( 0.06, 0.96, wetZone ) );
float wDepth = level - hL;
// Analytic antialiasing on the waterline. At 256 texel/m a chip texel is about one
// screen pixel at 5 m, so thresholding the height field at a FIXED width samples right
// at Nyquist and the rim breaks up into blocky dither. Widening the transition to the
// per-pixel gradient of the height itself keeps the rim exactly ~1 px soft at every
// distance: still a hard rim in world units (a genuine thin damp band, millimetres
// across), but resolved rather than aliased.
float hGrad  = length( vec2( dFdx( hL ), dFdy( hL ) ) );
float hardW  = smoothstep( 0.0, max( 0.028, hGrad * 1.8 ), wDepth );
// Past a few metres one chip is sub-pixel and the mip average pulls the height field
// toward its mean, so hard-thresholding it stops producing per-stone contour and starts
// producing a chunky filtered staircase - hard edges with no detail in them, which is
// the artefact this pass is here to remove. Hand over to the smooth macro mask as soon
// as the chips stop resolving. That crossover is also what lets the far field converge
// into the coherent mirror streaks the reference shows toward the horizon.
float softW  = smoothstep( 0.30, 0.80, wetZone );
float nearK  = 1.0 - smoothstep( 4.0, 14.0, vDist );
// HOW MUCH OF THE WATERLINE THE CHIP HEIGHT IS ALLOWED TO OWN. Letting hardW fully
// replace the macro mask in the near field made the wet/dry decision binary per stone:
// every crown flipped to matte-and-rough while the void beside it flipped to mirror,
// and since a matte crown under a bright night hemisphere is brighter than a mirror
// seen at 25 degrees, the surface rendered as pale specks scattered ON TOP of the
// water film. That is backwards. Real damp tarmac is wet everywhere - the chips are
// under the same film as the binder - so the film is continuous and the stones show up
// only as a MODULATION of it: a partial roughness/mirror wobble at chip scale, i.e.
// specular breakup and glints, never a second material with its own albedo.
// It also has to retire much sooner than the rest of the near-field work. Past ~7 m a
// chip is under a pixel, the mip average pulls the height field toward its mean, and
// thresholding that filtered field produces a chunky splotch staircase - the worst of
// both worlds, hard edges with no stone inside them.
float chipK  = ( 1.0 - smoothstep( 2.5, 7.5, vDist ) ) * 0.22;
float water  = uWet * softW * mix( 1.0, hardW, chipK );
float depthN = softW * mix( 1.0, clamp( 0.30 + wDepth * 3.0, 0.0, 1.0 ), chipK );

// DAMP COLLAR. Standing water does not end at a knife edge on porous asphalt: for a
// few centimetres outside the pool the binder is saturated but not submerged. Widen
// the same mask (never a second noise field — one mask drives everything) and take
// the difference as a collar that gets a partial share of the darkening and of the
// roughness drop. This is the thin transition band that replaces the hard threshold.
float hardC  = smoothstep( -0.20, max( 0.030, hGrad * 1.8 ), wDepth );
float softC  = smoothstep( 0.04, 0.60, wetZone );
float wetBand = uWet * softC * mix( 1.0, hardC, chipK );
// The mirror is gated by the collar-softened mask, not by the raw waterline: switching
// a reflection on and off across a one-height-quantum step is what turned puddle rims
// into stair-stepped dither instead of a damp transition.
float reflW  = clamp( mix( water, wetBand, 0.40 ), 0.0, 1.0 );
float collar = clamp( wetBand - water, 0.0, 1.0 );
// One number the albedo and the roughness both key off: 1 submerged, ~0.45 damp, 0 dry.
float soak   = clamp( water + collar * 0.45, 0.0, 1.0 );

// Micro-occlusion. Applied to the *specular* as well as the diffuse further down —
// that is the missing link: a wet road at night is lit almost entirely by indirect
// specular, so relief that only modulates albedo is invisible by construction.
// The strength has to fall away as the surface soaks: water fills the crevices, so
// the cavities that were shadowing the stone are no longer open to the sky at all.
// Held at full strength on a wet road, this alone renders every chip crown as a bright
// speck against a dark void - a chip-scale AO checkerboard that reads as pale grit
// scattered over the film rather than as stone under it.
// r8: the wet attenuation was 0.60, which left only 40% of the cavity term on a
// soaking road - and since the aggregate had already been taken out of albedo, that
// removed the last channel the stone was visible in. The "pale grit crust" failure
// it was guarding against came from the mirror warp, not from this term; with the
// reflection displacement now on a texel budget, the cavity term can stay near full
// strength and it reads as chip-scale glint breakup rather than an AO checkerboard.
// The wet attenuation is also distance-graded: within a few metres a chip subtends
// several pixels and its cavity shadow is legible GLINT BREAKUP, which is what the
// reference sparkle field is. Past ~14 m a chip is sub-pixel, so the same term is
// just noise stamped over the reflected image, and that is where it gets cut hardest.
float microAO = mix( 1.0, clamp( 0.58 + cavV * 0.50, 0.0, 1.0 ),
  detAmt * 0.92 );

// AGGREGATE IS DELIBERATELY ABSENT FROM ALBEDO. Crushed-rock chips and the bitumen
// binder holding them are within a stop of each other in reflectance; what makes
// aggregate legible in a daylight photo is shading, and what makes it legible on a
// wet night is specular breakup. Painting the height field into diffuse produced
// pale speckles sitting ON TOP of the water film, which is the exact inversion of a
// real wet road - a wet surface is DARKER and more uniform in colour, and its stone
// structure shows up only as glints and micro-normal disturbance in the reflected
// neon. So the only diffuse term left from the micro tile is a shallow cavity
// darkening (grime collects in the voids), and even that is faded out as the surface
// soaks, because the film fills those voids and levels the colour out further.
diffuseColor.rgb *= mix( 1.0, 0.615 + cavV * 0.54, detAmt * ( 1.0 - soak * 0.30 ) );
// tar bead: dark, near-black bitumen ribbon over the aggregate
diffuseColor.rgb *= mix( 1.0, 0.52, seamV * 0.85 );
// WETNESS IS A DARKENING. Water fills the voids between the chips, so light that
// would have bounced around in the aggregate and come back out as diffuse instead
// gets refracted into the film and trapped. Albedo therefore drops to roughly a
// third; it never brightens and it never tints toward the lamp colour. Everything
// bright a puddle shows is specular, delivered by the mirror term further down.
// 'soak' carries the collar too, so the rim fades in over centimetres.
vec3 wetTint = mix( vec3( 1.0 ), vec3( 0.90, 0.97, 1.10 ), uWet );
diffuseColor.rgb *= wetTint * mix( 1.0, mix( 0.90 - dampV * 0.14, 0.30, soak ), uWet );
// Diagnostic: add #roaddebug to the page hash to force the albedo flat so only the
// height / normal / waterline layer is visible. This is how the "the detail tile is
// fine, the detail is being drowned by a smooth indirect-specular wash" diagnosis
// was made — if a future round loses near-field grain again, render this first.
#ifdef ROAD_DEBUG_DETAIL
diffuseColor.rgb = vec3( 0.055 );
#endif
`;

// Three-octave normal so the micro relief matches the micro albedo and does not tile.
// Sampled at the *parallax-corrected* UV so the shading agrees with the silhouette.
const NORMAL_FRAG = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
  {
    vec4 t1 = texture2D( normalMap, dUv  );
    vec4 t2 = texture2D( normalMap, dUv2 );
    vec4 t3 = texture2D( normalMap, dUv3 );
    vec3 n1 = t1.xyz * 2.0 - 1.0;
    vec3 n2 = t2.xyz * 2.0 - 1.0;
    vec3 n3 = t3.xyz * 2.0 - 1.0;
    // Cross-road groove slope, alpha channel, in the same slope units as .xy above
    // (encoded at 1.5x in makeMicroAggregate). Octave weights match the xy blend so the
    // separated groove is the same signal that is already baked into the normal.
    gBand = ( ( t1.a * 2.0 - 1.0 ) * 1.05 + ( t2.a * 2.0 - 1.0 ) * 0.26
      + ( t3.a * 2.0 - 1.0 ) * 0.44 ) / 1.5;
    // A carries the resolvable chips so it dominates; B decorrelates over metres,
    // C is the 1.5 m sub-chip layer that keeps the very near field from going smooth.
    vec3 mapN = vec3( n1.xy * 1.05 + n2.xy * 0.26 + n3.xy * 0.44, 1.0 );
    mapN.xy *= normalScale * uGrainAmt * detAmt;
    // Wet near-field glint boost. The chip slope has to be BIGGER close up and SMALLER
    // far away on a wet road, and one global amplitude cannot do both: the far field is
    // where slope turns into transverse serration across the reflected streaks (a chip
    // is sub-pixel there, so it is aliasing, not detail), while the near field is where
    // the reference's sparkle field actually lives. nearK retires this by ~14 m.
    mapN.xy *= mix( 1.0, mix( 1.0, 1.95, nearK ), uWet );
    // Tar bead is a poured film: flatten the aggregate relief inside it. The
    // resulting smooth-vs-rough boundary is what makes seams read as seams.
    mapN.xy *= 1.0 - seamV * 0.80;
    // Standing water has a flat surface: below the waterline the visible normal is
    // the water's, not the stone's. Shallow rims keep most of the stone tilt, which
    // is what gives a puddle edge its bright broken lip.
    mapN.xy = mix( mapN.xy, mapN.xy * 0.07 + ( rippleV - 0.5 ) * 0.05, water * depthN );
    // ...but a film does NOT level a groove. The chips are 10 mm across and a
    // millimetre of water buries them; a camber groove is 300 mm long and a few mm
    // deep, so the water surface over it still slopes with it (and the depth over the
    // ridge is thinner, so the ridge shows through besides). Hand the groove's
    // along-road slope back inside water, at a reduced amplitude - this is what keeps
    // the transverse bars alive in the pools where the reflection actually lives.
    mapN.y -= gBand * normalScale.y * detAmt * 0.55 * water * depthN;
    normal = normalize( tbn * mapN );
    // Publish the slope the surface ACTUALLY has, post-flattening. Publishing the dry
    // stone tilt here (or a 50/50 blend of it) makes the reflection stage perturb the
    // mirror ray by the full chip relief even in the middle of a pool, which scrambles
    // the reflected image into a flat average of the whole scene - a mauve wash with no
    // lamp in it. Inside water this is now near zero, so the mirror stays a mirror.
    gMicroN = mapN.xy;
    // NOTE (r8): there used to be a gMicroN /= max( 0.25, uGrainAmt ) here, on the
    // theory that the mirror stage wants the stone slope back at full amplitude after
    // the film levels the shading normal. It was a 2.94x re-amplification on a wet
    // road and it is deleted. A millimetre of water bending over a 10 mm chip does
    // NOT displace the reflected image by the chip's full slope - it barely bends the
    // ray at all - and re-injecting the dry slope is what shattered every reflected
    // vertical into a stack of transverse chevrons (choppy standing water instead of
    // a film over stone). The chip structure now shows up where it physically should:
    // in the specular glint (micro-normal + microAO, both restored on the wet path),
    // not in a macro warp of the mirror.
  }
#else
  #include <normal_fragment_maps>
#endif
// paint is a smooth film laid over the aggregate — flatten the grain under it
normal = normalize( mix( normal, nonPerturbedNormal, paintMaskV * 0.75 ) );
`;

// roughnessmap_fragment: spatially varying roughness, then the wet ramp.
const ROUGH_FRAG = /* glsl */`
float roughnessFactor = roughness * surf.g;
// Roughness now comes from the aggregate relief itself: stone faces rough, the
// bitumen binder between them smoother. Wide swing so specular breaks per chip.
roughnessFactor *= mix( 1.0, 0.58 + rghD * 0.90, detAmt );
// Tar seams and patch beads: distinctly glossier than the aggregate around them.
roughnessFactor *= mix( 1.0, 0.40, seamV );
// BAND-LIMITED CHIP ROUGHNESS. This is half of the chip lens moved out of the mirror UV
// and into the BRDF, where it belongs: a bulge in the film widens the specular lobe, it
// does not teleport the reflected ray. Because it rides 'lensG'/'lensH' it can only vary
// at >= 3 px, so the glint breakup it produces survives a 2x downsample instead of
// aliasing away. It feeds gloss, blurLen and the mirror gain 'k' downstream, which is
// how a dark region still gets grain: a locally wider lobe pulls in radiance from its
// neighbourhood, so a dark patch beside a bright streak sparkles without the term ever
// having to be a multiplier on the local radiance.
roughnessFactor *= clamp( 1.0 + ( lensG * 0.35 + lensH * 0.50 ) * detAmt * uWet,
  0.35, 2.4 );

// A damp film over everything that is *not* submerged. Burnout has no rain, so this
// is the dominant state: not standing water, just tarmac wetted enough to be
// specular. Crowns must stay ROUGHER than the pools (that contrast is the near-field
// read) but they must not stay matte - a matte crown under a bright night hemisphere
// renders as a pale speck sitting on the film. Damp glossy is the target: a tight
// enough lobe that the aggregate shows as glints, not as a grey wash.
roughnessFactor *= mix( 1.0, mix( 0.70, 0.48, dampV ), uWet * ( 1.0 - wetBand ) );
// Below the waterline: near-mirror, with the last of the relief poking through in
// the shallows so a pool is never one flat roughness value. Driven by 'soak', the
// same mask that darkened the albedo - one mask, moving both terms together, is what
// makes the puddle read as water rather than as a decal that only changed colour.
float wetRough = 0.055 + rippleV * 0.022 + ( 1.0 - depthN ) * 0.10
  + paintMaskV * 0.06 + rghD * 0.040;
roughnessFactor = mix( roughnessFactor, wetRough, soak );

// Grazing ramp: at the horizon the road rakes and goes glossier. Never *raises*
// roughness near the camera — that was what turned the foreground into flat grey.
float grazeFar = smoothstep( 6.0, 95.0, vDist );
roughnessFactor *= mix( 1.0, mix( 1.0, 0.42, grazeFar ), uWet * uGraze );
roughnessFactor = clamp( roughnessFactor, 0.028, 1.0 );
`;

// Micro-occlusion, applied after the lighting sum. Occluding only the diffuse is
// useless here: a wet road at night is lit overwhelmingly by *indirect specular*
// (env probe + planar mirror), so relief that never touches the specular term is
// invisible no matter how many texels the tile has. Darkening the specular in the
// crevices is what finally puts a shadow on the shaded side of every chip.
const AO_FRAG = /* glsl */`
#include <aomap_fragment>
{
  float mAO = microAO;
  // pits are shadowed from the sky dome much harder than they are from a lamp
  // three metres away, so the indirect terms take the full hit
  reflectedLight.indirectDiffuse  *= mAO;
  reflectedLight.indirectSpecular *= mix( 1.0, mAO * mAO, 0.85 );
  reflectedLight.directDiffuse    *= mix( 1.0, mAO, 0.72 );
  reflectedLight.directSpecular   *= mix( 1.0, mAO, 0.55 );

  // The env probe is a broad, direction-poor wash. On a rough dry crown it returns a
  // large fraction of the whole night hemisphere, so if it is cut inside the water but
  // left at full strength on the crowns, every chip standing proud of the film renders
  // BRIGHTER than the film around it: pale specks scattered on top of the water, which
  // is precisely backwards. A damp road is specular everywhere, so the probe is pulled
  // down across the whole wet surface and the planar mirror - which is directional and
  // therefore actually looks like neon in tarmac - is left to carry the light.
  reflectedLight.indirectSpecular *= mix( 1.0, mix( 0.40, 0.17, water ), uWet );
  // Submerged aggregate is also lit far less by the sky: the film refracts most of
  // the incoming hemisphere into a narrow cone before it ever reaches the stone.
  reflectedLight.indirectDiffuse  *= mix( 1.0, 0.42, soak );
  // AMBIENT CHIP BREAKUP. Measured r10: with the mirror term forced off, the dark
  // (unlit) half of the near road rendered at mean 47 with hfRms 0.57 - a 1.2%
  // modulation, i.e. a flat plane - while the lamp-lit half rendered hfRms 17.3 off the
  // same tile. The cavity term above is far too shallow to be the road's texture on its
  // own: it swings roughly +-2% at the display, so all visible relief was riding the
  // mirror and vanished wherever the mirror showed something dark. That is the
  // illumination coupling. It is fixed here rather than by brightening the road,
  // because a wet road IS dark; what it is not is smooth.
  //
  // 'cavD' is the same one cavity mask, re-derived at a much deeper contrast and
  // centred on 1.0 so it redistributes the ambient instead of only subtracting from it
  // (a one-sided cut just dims the road and leaves the crowns as the only feature,
  // which is the pale-grit-crust inversion this file has failed into twice). It is
  // gated on uWet so the dry-daylight path is untouched, and it rides the ambient
  // probe only - never the direct lamp and never the mirror - so it reads as stone
  // under the film rather than as grit stuck on top of it.
  float cavD = mix( 1.0, clamp( 0.38 + cavV * 1.28, 0.10, 1.85 ), detAmt * uWet * 0.85 );
  reflectedLight.indirectSpecular *= cavD;
  reflectedLight.indirectDiffuse  *= cavD;
}
`;

// Planar reflection, sampled with a screen-Y-elongated kernel. A neon sign 6 m up
// mirrors to a point 6 m below the road plane, which is many screen pixels of vertical
// travel, and the anisotropic (vertical-only) blur smears it into a streak whose length
// therefore scales with the source height — exactly the wet-night-asphalt-01 signature.
const REFL_FRAG = /* glsl */`
{
  float reflGate = uWet * uReflAmt;
  if ( reflGate > 0.002 ) {
    vec2 ruv = vReflUv.xy / max( 1e-4, vReflUv.w );
    // Perturb the mirror ray by the surface slope - but by the slope the WATER has,
    // which inside a pool is a few millimetres of ripple, not the full 10 mm chip
    // relief. The displacement budget has to stay inside a couple of screen pixels or
    // neighbouring fragments sample unrelated parts of the scene and the reflection
    // integrates to a flat average instead of resolving as an image. Dry crowns keep a
    // large scatter (they are not mirrors anyway); water gets almost none.
    vec2 disturb = gMicroN + ( normal.xy - nonPerturbedNormal.xy ) * 0.5;
    // The budget above is now enforced in the only unit that means anything: PROBE
    // TEXELS. The old constant was 0.030 UV, which is ~58 px at 1920 - about 30x the
    // stated "couple of screen pixels" - so neighbouring fragments sampled unrelated
    // parts of the scene and the mirror integrated to mush with a transverse ripple
    // beat on top. Scaling by uReflTexel ties the displacement to the probe's actual
    // resolution, and the clamp means no slope, however steep, can push it past ~3
    // texels dry / ~1 texel under water.
    // The GROOVE gets its own, larger displacement budget on the along-road axis. This
    // is the energy-neutral half of the transverse banding: a cross-road ridge tilted a
    // couple of degrees does not dim the mirror, it aims it somewhere else, so each band
    // samples a different height in the reflected scene and the streak comes back as
    // alternating bright and dark dashes rather than as a comb of holes. It is a
    // coherent, metres-wide feature, so it can afford several texels where the per-chip
    // slope above cannot.
    // r13: retired on 'barRes' too. This is a +/-1.6 probe-texel per-pixel warp of the
    // mirror UV driven by the groove slope; once the groove's own along-road period is
    // under ~3 px the warp is resampling the reflected image at Nyquist, which is the
    // same defect the r12 rebuild removed from the CHIP lens and left in place here.
    disturb.y += gBand * 1.6 * barRes;
    disturb = clamp( disturb, vec2( -3.0 ), vec2( 3.0 ) );
    ruv += disturb * uReflTexel * mix( 3.0, 1.6, water ) * ( 0.55 + rippleV * 0.9 );
    // CHIP LENS, r12 REBUILT. The r10 term this replaces displaced the mirror UV by up to
    // +/-6 probe texels using gChipN, the per-texel chip slope, i.e. a signal at Nyquist.
    // A per-pixel offset that large into a full-res high-contrast neon reflection is
    // unfiltered point-sampling of a high-variance signal: neighbouring fragments landed
    // on unrelated parts of the reflected scene, so it manufactured hfRms at exactly one
    // pixel. That was enough to BEAT the reference grain anchor (13.38 vs 12.48) while the
    // surface read as JPEG compression noise - the fourth time this project has passed a
    // metric by a mechanism that makes the image worse. It is also the reason
    // hfRmsNorm@960/@1920 sat at 0.765: a 2x box downsample is precisely the operator that
    // deletes single-pixel dither, and it left almost nothing behind.
    //
    // The fix is a range fix, not a new term. Two constraints, both now respected:
    //   1. The DRIVER is band-limited (lensH, the mip difference built in MAP_FRAG), so
    //      the disturbance varies at >= 3 px and neighbouring fragments sample neighbouring
    //      mirror content. Grain can no longer be created below 3 px.
    //   2. The AMPLITUDE is inside what the resampling can represent. The probe is half
    //      res, so screen position advances 0.5 texel per pixel; a band-limited warp rises
    //      over ~1.5 px, so anything past ~0.75 texels of amplitude re-folds the sampling
    //      and re-aliases regardless of how smooth the driver is. 1.2 texels is the ceiling
    //      the 11-tap kernel below can pre-filter (its floor already spans ~1 texel
    //      horizontally), and the kernel is grown by the warp magnitude just below.
    // The bulk of the chip's visual work has moved to roughnessFactor (lobe width) and to
    // the mirror gain and ambient floor further down - radiance modulation at >= 3 px,
    // which a downsample preserves. Still weighted down-screen: a vertical displacement
    // lands in the row profile where the reference's banding lives, a horizontal one is
    // down-road streak energy and fights the measured transverse ratio.
    float lensWarp = clamp( lensH * 2.6, -1.2, 1.2 ) * uWet * mix( 0.30, 1.0, nearK );
    ruv.y += lensWarp * uReflTexel.y;

    // Vertical smear. A lamp 6 m up mirrors to 6 m below the deck, so its image is
    // already geometrically elongated down-screen; this only adds the ripple-driven
    // softening on top, growing with roughness and with grazing distance. It must stay
    // small in the near field or the elongated image dissolves back into a wash.
    float gloss   = 1.0 - clamp( roughnessFactor * 1.5, 0.0, 1.0 );
    // The near field needs a blur FLOOR, not a blur minimum of zero: the probe is half
    // res, so an un-smeared near-field mirror resolves the source's texels as blocky
    // rectangles. Ripple smear is also physically largest close up, where individual
    // ripples subtend real screen area.
    // r9: cut ~40%. At 16 px of measured streak footprint the smear was eating the
    // transverse bars faster than the grooves could create them - a vertical blur is
    // exactly the operator that erases horizontal banding - and the reference plate
    // resolves its reflections much harder than this (ref-01 road-only vertical
    // autocorrelation half-width is under half of ours at matched angular scale).
    float blurLen = 0.0009 + roughnessFactor * 0.033
      + ( 0.006 + rippleV * 0.013 ) * water * ( 1.0 - 0.45 * grazeFar );
    // WARP-MATCHED PRE-FILTER. Any UV disturbance this stage applies has to be covered by
    // the kernel that samples through it, or the disturbance IS the point-sampler. The
    // outer tap sits at 5 * blurLen * 0.145 in UV, so this is exactly the blurLen that puts
    // the outer tap on the warp's own displacement; the mirror is then sampled at a scale
    // matched to the warp instead of under it. The old +/-6 texel warp would have needed
    // blurLen 0.016 here, eight times the near-field value it actually ran at - that gap is
    // what the dither was.
    blurLen += abs( lensWarp ) * uReflTexel.y / 0.725;
    blurLen = min( blurLen, 0.072 );

    vec3  acc = vec3( 0.0 );
    float wsum = 0.0;
    for ( int i = -5; i <= 5; i ++ ) {
      float fi = float( i );
      float wgt = exp( - fi * fi * 0.13 );
      // Anisotropic on purpose: mostly vertical (that is the stretch a wet plane
      // produces), with just enough horizontal spread to dissolve the half-res probe's
      // texel grid instead of resolving it as blocky rectangles.
      // r9: vertical tap offset cut 40% along with blurLen (0.2 -> 0.12); the horizontal
      // spread keeps its floor because that one is only there to dissolve the half-res
      // probe's texel grid, and it is across-road anyway so it does not blur the bars.
      vec2 t = ruv + vec2( fi * uReflTexel.x * ( 0.6 + blurLen * 26.0 ), fi * blurLen * 0.145 );
      t = clamp( t, vec2( 0.001 ), vec2( 0.999 ) );
      acc += texture2D( uReflMap, t ).rgb * wgt;
      wsum += wgt;
    }
    vec3 refl = min( acc / wsum, vec3( 24.0 ) );

    // Fresnel on water's own F0 (n = 1.33 -> 0.02), with the full Schlick ramp to 1.0
    // at grazing. Evaluated against the flat water plane inside a pool, not against
    // the perturbed stone normal: a mirror's Fresnel is a property of the water
    // surface, and driving it from the chip normal made the ramp noise rather than a
    // ramp, which is why the pools carried no directional brightening at all.
    vec3  V = normalize( vViewPosition );
    vec3  Nf = normalize( mix( normal, nonPerturbedNormal, water * 0.85 ) );
    float ndv = clamp( dot( Nf, V ), 0.0, 1.0 );
    float fres = 0.02 + 0.98 * pow( 1.0 - ndv, 5.0 );
    // Water at 20-30 deg off the deck is visibly mirrored in every reference frame, so
    // soften the fifth-power falloff to a cube inside standing water. The floor stays
    // low on purpose: reference -03 is explicit that the road is nearly matte directly
    // under the camera and only approaches a mirror toward the horizon, so the angle
    // term - not a constant - has to carry the ramp.
    fres = mix( fres, max( fres, 0.05 + 0.95 * pow( 1.0 - ndv, 3.0 ) ), water );

    // Chips whose faces tilt out of the road plane cannot return the mirror ray to the
    // eye, so they punch dark holes in the streak. That breakup belongs to the DRY and
    // shallow surface: in deep water the stones are under the film and the reflection
    // must knit back into a continuous image, so gate the chop out with depth.
    // r8, MEASURED: this term - not the ray displacement above - is what actually
    // produced the transverse chevron serration on every reflected vertical. It is a
    // per-chip multiplicative hole in the mirror up to 80% deep, and an isotropic chip
    // field seen at 10-20 degrees off the deck foreshortens into HORIZONTAL dashes, so
    // an 80% per-chip mirror cut reads as a comb laid across the streaks. Zeroing the
    // reflection disturb entirely changed the render by nothing; halving this changed
    // it immediately. It is physically right on DRY stone (a tilted chip face cannot
    // return the mirror ray) and physically wrong under a film: the film is continuous
    // over the crowns too, so a wet crown still mirrors, it just mirrors a slightly
    // bent version. Depth-gating alone was not enough because this scene is mostly
    // DAMP, not submerged, so 'water * depthN' never gated it. Keep the full chop dry,
    // collapse it with uWet, and let the chip relief show up in the specular glint
    // (micro-normal + microAO) instead of as a hole punched in the reflected image.
    // r9, RE-MEASURED: the r8 note above is right about the mechanism and wrong about
    // the target. reference/wet-night-asphalt-01 (the neon Billiards storefront, the
    // only sharp wet-night plate we have) measures 3.89:1 row/col banding on the road,
    // and this build measured 1.47:1 - i.e. the reference is FAR MORE transverse-banded
    // than we are, not less, and collapsing the ceiling to 0.20 deleted the one feature
    // it has. (The 0.54:1 figure that justified that collapse came from -02, a flat-lit
    // motion-blurred frame; it cannot set a target.) The ceiling reopens to 0.55. What
    // was actually wrong in r8 was the SOURCE: an isotropic per-chip cut is sub-pixel
    // hash by 10 m, so it aliases instead of banding. The transverse structure now comes
    // from the groove field, which is coherent over metres across the road.
    float chop = 1.0 - clamp( length( gMicroN ) * 1.55, 0.0, mix( 0.80, 0.55, uWet ) );
    chop *= mix( 1.0, 1.28, seamV );   // the smooth sealant bead mirrors cleanly
    // Beyond the near field a chip is sub-pixel, so per-stone chopping is pure aliasing
    // rather than detail. Reference -03 is explicit that the streaks knit back together
    // and go almost mirror toward the horizon, so retire the breakup with distance.
    chop = mix( 1.0, chop, nearK );
    // TRANSVERSE BARS. Separate term, separate retire: a groove runs 1-4 m across the
    // road, so it is many pixels wide long after a chip has gone sub-pixel, and its
    // along-road period still subtends a pixel or two out past 60 m. This is the cut
    // that turns a reflected vertical into a stack of dashes - the reference signature.
    // It is retired on distance (not deleted) so the very far field converges to the
    // coherent mirror -03 shows, and the mip chain has already faded the alpha channel
    // toward flat by then, so the two retires reinforce instead of fighting.
    // r13: 'barRes' (MAP_FRAG) is the real retire. bandK is kept only as the far-horizon
    // convergence it was written for; it never leaves 1.0 inside 30 m, so on this camera
    // the bars used to run at FULL amplitude from 5.6 m to 13.2 m with no falloff.
    float bandK = ( 1.0 - smoothstep( 30.0, 120.0, vDist ) ) * barRes;
    float barK = bandK * mix( 0.45, 1.0, uWet );
    // Renormalised, because a groove REDISTRIBUTES the mirror rather than absorbing it:
    // the face tilted away from the eye loses the reflected ray, but the face tilted
    // toward it sits at a shallower angle to the film and returns MORE (higher Fresnel,
    // longer path). A one-sided cut is what pulled the whole near road down by a third
    // of a stop when this term first went in, and it also flattened the bars into a
    // uniform dimming instead of an alternation. The gain is folded INSIDE the barK mix
    // so it retires with the bars: past ~120 m the term is exactly 1.0 again and the far
    // field converges to the coherent mirror reference -03 shows, rather than being
    // pushed to a saturated one.
    // r14: the gain was 6.4 against a 0.86 clamp, i.e. the cut saturated at |gBand| = 0.1344.
    // Two independent estimates of the real gBand distribution (the wave-O critic's replica,
    // and a replica here rescaled until it reproduces the empirically-neutral renormaliser)
    // agree that 66-71% OF ROAD TEXELS SAT AT THAT CEILING. The term was therefore a binary
    // 0.525-vs-3.75 alternation over two thirds of the deck — a hard-edged 7:1 step with no
    // soft shoulder, and the largest single source of the middle-distance hfRms hump that
    // survived turning the chip stack off entirely (d2 residual 12.85 with this term live,
    // 3.00 with it forced to identity). 2.2 puts 22% of texels on the ceiling and drops the
    // multiplier's rms contrast 0.875 -> 0.559 while keeping the same 7:1 span.
    // The renormaliser is re-solved for E[(1-cut)*K] = 1: 3.75 -> 1.91. It is NOT a brightness
    // change chased for its own sake, but 3.75 was not mean-neutral either — the identity
    // null (barK = 0, which returns the mix to exactly 1.0, rather than gBand = 0, which sets
    // it to its CEILING) measured the live term running +9% on the near bands.
    chop *= mix( 1.0, ( 1.0 - clamp( abs( gBand ) * 2.2, 0.0, 0.86 ) ) * 1.91, barK );
    // Only real standing water mirrors; a dry crown above the waterline returns almost
    // nothing. Micro-occlusion likewise applies to the stone, not to the film covering
    // it, so it is faded out with depth alongside the chop.
    // Damp crowns are not mirrors, but they are not matte either - the film wets them
    // too. A near-zero floor here meant the only lit thing on the surface was the env
    // probe wash, which has no image in it. Give the crowns a real share of the mirror
    // so the aggregate reads as broken-up neon rather than as grey speckle.
    // microAO is a chip-scale cavity term, and multiplying the MIRROR by it is the
    // same mistake as 'chop': it stamps the chip field onto the reflected image. The
    // film sits over the cavities, so on a wet road the mirror is handed back most of
    // it and the cavity term does its work in the shading specular (AO_FRAG) where it
    // reads as glint breakup instead of as ripple.
    float k = reflGate * fres * mix( 0.32, 1.0, reflW ) * ( 0.25 + 0.75 * gloss )
      * chop * mix( microAO, 1.0, max( water * depthN, uWet * 0.70 ) );
    // CHIP LENS, RADIANCE HALF. The other half of what the UV warp used to do, done as a
    // gain on the mirror rather than as a displacement of it. Physically it is the same
    // thing the warp was reaching for - a film bulge tilts the local facet, so it returns
    // more or less of the reflected image to the eye - but expressed as a Fresnel/coverage
    // wobble it cannot resample anything, so it inherits lensH's 3-9 px band exactly. This
    // is the term that carries most of the near-field sparkle now, and unlike the old warp
    // its contribution to hfRms is at the band's scale, so a 2x downsample keeps it.
    k *= clamp( 1.0 + lensH * 0.75 * detAmt * uWet * mix( 0.35, 1.0, nearK ), 0.0, 2.6 );
    // Energy: what the mirror returns, the diffuse underneath must give up. Without
    // this the reflection is pure addition and a puddle can only ever be brighter than
    // its surroundings, which is the inversion being fixed.
    outgoingLight = outgoingLight * ( 1.0 - clamp( k, 0.0, 1.0 ) ) + refl * k;
  }

  // AMBIENT CHIP FLOOR — the one grain channel that is NOT a multiplier on scene
  // radiance. Measured r11 with detAmt forced to 0: the entire micro-aggregate stack
  // (microAO, cavD, chop, the chip lens) changes the DARK near-road's absolute
  // high-frequency energy from 6.01 to 6.13 out of a region mean of ~54 - i.e. it
  // contributes essentially nothing there - while in the lamp-lit half it carries
  // 12.4 of the 14.97 total. Every existing term is of the form (radiance x mask), so
  // its amplitude is proportional to whatever the mirror happens to be showing, and
  // where the mirror shows dark sky the road goes glassy. Reference wet-night-asphalt-01
  // is pebbled equally hard in both halves (hfRmsNorm 12.48 dark / 12.00 bright at
  // matched 1920 scale, ratio 1.04): real tarmac grain is INTRINSIC.
  //
  // So this term adds a fixed radiance, independent of everything upstream. It is the
  // hemisphere ambient a chip-scale facet returns: a crown is open to the whole night
  // dome and a crevice is not, and that difference does not scale with the neon three
  // metres away. Centred on the tile's own cavity mean so it is exactly zero-mean -
  // a one-sided add is the "pale grit crust" inversion this file has failed into twice
  // (see the notes at the albedo stage), because it would put a highlight on every
  // crown and nothing in the voids. Signed, it redistributes instead.
  //
  // Retired with distance: past ~50 m a chip is far below a pixel and a fixed-amplitude
  // stamp there is pure aliasing on top of the reflected image, which is also where the
  // transverse band ratio is measured.
  // r12: driven by lensC, not by (cavV - uCavMean). cavV is sampled at the hardware's own
  // mip, i.e. at Nyquist, so this "intrinsic grain" channel was ALSO pixel-scale and also
  // died on downsample - it was adding to the aliasing budget, not to the texture budget.
  // lensC is the same cavity channel band-passed to 3-9 px and already exactly zero-mean
  // (a mip difference has mean zero by construction), so uCavMean is no longer needed to
  // centre it. This is now the one grain channel that is both intrinsic (not a multiplier
  // on scene radiance, so it does not vanish where the mirror shows dark sky) AND
  // band-limited, which is the combination the reference plate actually has.
  float chipFar = 1.0 - smoothstep( 12.0, 50.0, vDist );
  float chipAmb = lensC * 2.0 * uChipAmb * uWet * detAmt * chipFar;
  outgoingLight += chipAmb * vec3( 0.84, 0.94, 1.12 );
  // SPARSE FACET POPULATION (r15). Everything above, chipAmb included, is an AFFINE map of a
  // unimodal noise field, so the specular residual it produces is symmetric and dense. The
  // reference plate's is sparse: on wet-night-asphalt-01 at 1920, HALF the high-frequency
  // energy in the near road lives in 5% of the pixels (top-5% share 50.7% at d5 / 46.6% at
  // d4, p99/p50 of the 5x5 residual 7.88 / 7.52) against ours at 33.4% / 33.0% and 4.63 /
  // 4.60, with 16.4% (white noise) and 27.8% (3x3-blurred noise) as the dense controls.
  //
  // Reshaping an existing channel CANNOT fix that, and this is measured, not argued: a signed
  // power expansion on lensC reaches 48.6% at d5 but only by deleting the dense floor, and it
  // takes the wave-P amplitude ladder with it (d5 5x5 rms 11.20 -> 7.39, T3 band 10.0-13.5).
  // The limit case is the proof: with lensC's gain at ZERO the share reads 58.5%, i.e. PAST
  // the reference, at rms 6.68. A statistic that scores best with the feature deleted is not
  // measuring the feature.
  //
  // So the population has to be ADDED, and it has to be sparse in its own right rather than
  // the tail of something dense. It is the product of two DECORRELATED upper tails of the
  // band-limited mip sample dL0 - height and cavity - so a facet has to be both a proud crown
  // and open to the sky; the product of two ~15% tails of weakly correlated fields is a ~2%
  // population, which is the sparsity the plate has. Sampled from dL0 (LOD 1.585) and not
  // from dA, so the mask inherits the same >= 3 px band-limit as the lens and cannot be
  // per-pixel salt - the 960/1920 persistence guard is what checks it, not this comment.
  //
  // This is a ONE-SIDED add, which the notes above rightly warn about: a one-sided add on a
  // DENSE field is the "pale grit crust" inversion this file has failed into twice. What makes
  // it admissible is measured rather than argued, and it is the crust test: at the shipped
  // constants the d5 region mean moves 96.1 -> 96.9 and d4 90.8 -> 91.5, i.e. +0.8 and +0.7
  // code values, while the top of the residual distribution moves a great deal (d5 p99/p50
  // 4.63 -> 7.91). A crust raises the mean and the floor together; a sparkle raises the top
  // and leaves the mean where it was. The population fraction itself is NOT measured here, so
  // do not quote one: the mean shift is the bound. If a later wave finds the mean moving more
  // than ~1.5 codes, tighten FLK_A / FLK_B, not FLK_AMP.
  //
  // KNOWN RESIDUAL, and it is the honest next gap: this population is one-sided BRIGHT, and
  // the plate's is not. Our d5 residual skew is +1.40 at the shipped constants (A leg +0.30)
  // against the reference's +0.06 - the plate reaches its 50.7% share with a SYMMETRIC
  // high-contrast field (bright specks AND dark voids, i.e. ripple), not with additive
  // sparkle. Matching share and p99/p50 while the skew is 23x the plate's means the shape of
  // the sparse population is still wrong even though its concentration is now right.
  float flk = smoothstep( FLK_A, 1.0, dL0.r ) * smoothstep( FLK_B, 1.0, dL0.b );
  outgoingLight += flk * FLK_AMP * uWet * detAmt * chipFar * vec3( 0.90, 0.96, 1.10 );
}
`;

function patchRoadMaterial(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform mat4 uReflTexMatrix;\nvarying vec4 vReflUv;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\n  vReflUv = uReflTexMatrix * modelMatrix * vec4( transformed, 1.0 );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n'
        + (globalThis.location && /roaddebug/.test(globalThis.location.hash) ? '#define ROAD_DEBUG_DETAIL\n' : '')
        + DECL)
      .replace('#include <map_fragment>', MAP_FRAG)
      .replace('#include <normal_fragment_maps>', NORMAL_FRAG)
      .replace('#include <roughnessmap_fragment>', ROUGH_FRAG)
      .replace('#include <aomap_fragment>', AO_FRAG)
      .replace('#include <opaque_fragment>', REFL_FRAG + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'roadsurf2';
}

// ---------------------------------------------------------------------------

/**
 * Planar reflection of the whole scene in the road plane. Driven entirely from the road
 * meshes' own onBeforeRender, so nothing outside road.js has to call us. Only runs when
 * the surface is wet, so the dry-daylight path costs exactly nothing.
 */
function createReflection(renderer) {
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  black.needsUpdate = true;

  const state = {
    map: black,
    texMatrix: new THREE.Matrix4(),
    texel: new THREE.Vector2(1 / 1024, 1 / 512),
    enabled: false,
    hidden: [],
    uniforms: [],
    rt: null,
    rtW: 0, rtH: 0,
    busy: false,
    token: -1,
  };
  if (!renderer) return state;

  const vCam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const anchor = new THREE.Vector3(0, PLANE_Y, 0);
  const camPos = new THREE.Vector3();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const bias = new THREE.Matrix4().set(
    0.5, 0.0, 0.0, 0.5,
    0.0, 0.5, 0.0, 0.5,
    0.0, 0.0, 0.5, 0.5,
    0.0, 0.0, 0.0, 1.0,
  );
  const size = new THREE.Vector2();

  function ensureRT() {
    const cur = renderer.getRenderTarget();
    const w = cur ? cur.width : renderer.getDrawingBufferSize(size).x;
    const h = cur ? cur.height : renderer.getDrawingBufferSize(size).y;
    // Half res: the vertical smear kernel hides the resolution loss completely.
    const tw = Math.max(256, Math.min(1600, Math.round(w * 0.5)));
    const th = Math.max(144, Math.min(900, Math.round(h * 0.5)));
    if (!state.rt || state.rtW !== tw || state.rtH !== th) {
      if (state.rt) state.rt.dispose();
      state.rt = new THREE.WebGLRenderTarget(tw, th, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: true, stencilBuffer: false,
      });
      state.rtW = tw; state.rtH = th;
      state.texel.set(1 / tw, 1 / th);
      state.map = state.rt.texture;
      for (const u of state.uniforms) u.uReflMap.value = state.map;
    }
  }

  state.render = function render(scene, camera) {
    if (!state.enabled || state.busy) return;
    if (!camera.isPerspectiveCamera) return;
    // One reflection per outer render pass. The nested render below bumps
    // info.render.frame itself, so the token is stamped *after* it: every later road
    // mesh in the same pass then sees a matching token and skips.
    if (renderer.info.render.frame === state.token) return;
    state.busy = true;

    ensureRT();

    // Mirror the camera through the road plane (three's Reflector construction).
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(anchor, camPos).reflect(normal).negate().add(anchor);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(anchor, lookAt).reflect(normal).negate().add(anchor);
    vCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal).negate();
    vCam.position.copy(view);
    vCam.lookAt(target);
    vCam.near = camera.near; vCam.far = camera.far;
    vCam.updateMatrixWorld();
    vCam.projectionMatrix.copy(camera.projectionMatrix);

    state.texMatrix.copy(bias)
      .multiply(vCam.projectionMatrix)
      .multiply(vCam.matrixWorldInverse);

    // The road itself (and the additive smear quads that live on it) must not appear
    // in its own reflection.
    for (const o of state.hidden) { o.userData._rv = o.visible; o.visible = false; }

    const prevRT = renderer.getRenderTarget();
    const prevActive = renderer.getActiveCubeFace();
    const prevLevel = renderer.getActiveMipmapLevel();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevXr = renderer.xr.enabled;
    renderer.shadowMap.autoUpdate = false;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(state.rt);
    renderer.clear(true, true, false);
    renderer.render(scene, vCam);
    renderer.setRenderTarget(prevRT, prevActive, prevLevel);
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.xr.enabled = prevXr;

    for (const o of state.hidden) o.visible = o.userData._rv !== false;

    state.token = renderer.info.render.frame;
    state.busy = false;
  };

  return state;
}

export function createRoadKit(rng, opts = {}) {
  const renderer = opts.renderer || null;
  const aniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  const refl = createReflection(renderer);

  const specs = {
    city: { widthM: 20, tileLenM: 32, lanes: 4, cls: 'city' },
    highway: { widthM: 36, tileLenM: 40, lanes: 6, cls: 'highway' },
  };

  const micro = makeMicroAggregate(rng, aniso);
  const wetMask = makeWetnessTile(rng, aniso);

  const mats = {};
  const allUniforms = [];
  for (const key of Object.keys(specs)) {
    const sp = specs[key];
    const { albedo, surfTex } = makeRoadTile(rng, sp, aniso);

    // micro tile repeat: keep the aggregate at a fixed ~2 m in world space so
    // the grain density matches between road classes.
    const rx = sp.widthM / DET_M, ry = sp.tileLenM / DET_M;
    const nrm = micro.normal.clone();
    nrm.needsUpdate = true;
    nrm.repeat.set(rx, ry);

    // Wetness tile: squeezed across, stretched along, so puddles and damp sheets run
    // down-road the way water actually drains and tyres actually spread it.
    // r8: 1.6 / 2.2 (a 3.5:1 aspect) was not enough. A wet mask is seen at 10-20
    // degrees off the deck, and that grazing view foreshortens the down-road axis by
    // roughly a factor of five, so a 3.5:1 world-space stretch renders as a field of
    // patches that are WIDER THAN TALL on screen - i.e. transverse crests, the exact
    // "choppy standing water" read. 1.15 / 5.6 is a 9.7:1 world stretch, which
    // survives the perspective squash and still reads as down-road streaking.
    const wx = (sp.widthM / WET_M) * 1.15, wy = sp.tileLenM / (WET_M * 5.6);

    const u = {
      uDetailMap: { value: micro.detail },
      uWetMap: { value: wetMask },
      uReflMap: { value: refl.map },
      uReflTexMatrix: { value: refl.texMatrix },
      uReflTexel: { value: refl.texel },
      uDetailRepeat: { value: new THREE.Vector2(rx, ry) },
      uWetRepeat: { value: new THREE.Vector2(wx, wy) },
      uDetailAmt: { value: 1.0 },
      uGrainAmt: { value: 1.0 },
      uWet: { value: 0.0 },
      uGraze: { value: 1.0 },
      uReflAmt: { value: 1.0 },
      // POM sweep depth in detail-tile UV units. One tile is DET_M metres, so
      // 0.0026 = ~10 mm of relief: a touch deeper than real asphalt macrotexture
      // (0.5-2 mm) because the chips have to occlude each other by at least a
      // pixel or two at 3-6 m to be legible at all.
      uPomDepth: { value: 0.0026 },
      // Additive, radiance-independent chip amplitude in linear scene units. Tiny by
      // construction: the wet near road sits around 0.03 linear, so this is a few
      // percent modulation of it, and it is calibrated on the dark/bright grain ratio
      // rather than on any absolute look target. Set live in setWet.
      uChipAmb: { value: 0.0 },
      uCavMean: { value: micro.cavMean },
    };
    allUniforms.push(u);
    refl.uniforms.push(u);

    const m = new THREE.MeshPhysicalMaterial({
      map: albedo,
      roughnessMap: surfTex,
      normalMap: nrm,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 1.0,
      metalness: 0.0,
      specularIntensity: 1.0,
      // Wear polishes the surface along the direction of travel, so even dry
      // tarmac reflects slightly anisotropically down-road. Rotation pi/2 puts
      // the elongation on the V (along-road) axis of the ribbon UVs.
      anisotropy: 0.30,
      anisotropyRotation: Math.PI / 2,
      envMapIntensity: 0.9,
      dithering: true,
    });
    patchRoadMaterial(m, u);

    mats[key] = { mat: m, map: albedo, surfTex, uniforms: u, spec: sp, normalMap: nrm };
    // legacy field names some callers may poke at
    mats[key].roughDry = surfTex;
    mats[key].roughWet = surfTex;
  }

  // ---- shoulder / verge -------------------------------------------------
  const shoulderNrm = micro.normal.clone();
  shoulderNrm.needsUpdate = true;
  shoulderNrm.repeat.set(24, 36);
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0x37373a, roughness: 0.97, metalness: 0.0,
    normalMap: shoulderNrm, normalScale: new THREE.Vector2(1.1, 1.1),
    envMapIntensity: 0.5,
  });

  let wet = 0;

  const kit = {
    materials: mats,
    shoulderMat,
    detailMap: micro.detail,
    microNormal: micro.normal,

    /**
     * Build a road ribbon along a 2-D polyline. points = [[x,z], ...].
     * Returns a Group containing the paved surface plus a slightly wider base.
     */
    buildRibbon(points, { cls = 'city', y = 0.03, shoulder = 1.6, closed = false } = {}) {
      const spec = mats[cls].spec;
      const pts = points.map(([x, z]) => new THREE.Vector2(x, z));
      if (closed && pts[0].distanceTo(pts[pts.length - 1]) > 0.001) pts.push(pts[0].clone());
      const n = pts.length;

      const normals = [];
      const dist = [0];
      for (let i = 0; i < n; i++) {
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
        const t = new THREE.Vector2().subVectors(next, prev).normalize();
        normals.push(new THREE.Vector2(-t.y, t.x));
        if (i > 0) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
      }

      const group = new THREE.Group();
      const build = (halfW, yy, uvScaleV) => {
        const pos = [], uv = [], idx = [], nor = [];
        for (let i = 0; i < n; i++) {
          const p = pts[i], nm = normals[i];
          pos.push(p.x - nm.x * halfW, yy, p.y - nm.y * halfW);
          pos.push(p.x + nm.x * halfW, yy, p.y + nm.y * halfW);
          nor.push(0, 1, 0, 0, 1, 0);
          const v = dist[i] / uvScaleV;
          uv.push(0, v, 1, v);
        }
        for (let i = 0; i < n - 1; i++) {
          // wind CCW when viewed from above so the surface faces +Y
          const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
          idx.push(a0, b0, a1, b0, b1, a1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeBoundingSphere();
        return g;
      };

      if (shoulder > 0) {
        const sm = new THREE.Mesh(build(spec.widthM / 2 + shoulder, y - 0.02, 12), shoulderMat);
        sm.receiveShadow = true;
        group.add(sm);
        refl.hidden.push(sm);
      }
      const road = new THREE.Mesh(build(spec.widthM / 2, y, spec.tileLenM), mats[cls].mat);
      road.receiveShadow = true;
      // Drive the planar reflection from the road itself: no external per-frame hook
      // needed, and it self-guards to one pass per render.
      road.onBeforeRender = (r, sc, cam) => { if (refl.render) refl.render(sc, cam); };
      group.add(road);
      refl.hidden.push(road);
      group.userData.length = dist[n - 1];
      return group;
    },

    /** 0 = dry, 1 = soaking. Retunes every road material. */
    setWet(v) {
      wet = clamp(v, 0, 1);
      refl.enabled = wet > 0.02;
      for (const key of Object.keys(mats)) {
        const e = mats[key];
        e.uniforms.uWet.value = wet;
        e.uniforms.uReflMap.value = refl.map;
        // A film of water LEVELS the aggregate. Dry asphalt is a field of chips each
        // tilting its own way, and that is what makes dry tarmac read as grit; wet
        // asphalt has those tilts filled in by a millimetre of water, so the effective
        // surface normal is far closer to the road plane. Holding the dry normal
        // amplitude through the wet ramp is what put a pale grit crust over the whole
        // near field: every chip facet caught its own highlight and the road read as
        // gravel scattered on top of the film instead of stone under it. What is left
        // at 0.70 is a fine disturbance in the reflected neon plus a legible glint
        // field on the stone, not a lit texture in its own right.
        // r8: this floor was 0.34. Combined with the aggregate having been removed
        // from albedo, that made the chips invisible on a wet night - measured 30%
        // less chip-scale high-frequency energy than the reference - while the same
        // slope was being re-amplified into the mirror. The re-amplification is gone
        // (see the note at gMicroN) and the reflection displacement is now on a probe
        // texel budget, so the honest amplitude can be carried here instead.
        e.uniforms.uDetailAmt.value = 1.0;
        e.uniforms.uGrainAmt.value = lerp(1.0, 0.70, wet);
        // Ambient chip floor: wet-only, so the dry path is algebraically identical.
        e.uniforms.uChipAmb.value = wet * 0.020;
        // Down-road anisotropy is real but must stay well under the point where it
        // smears every highlight into one continuous vertical band.
        e.mat.anisotropy = lerp(0.30, 0.55, wet);
        e.mat.envMapIntensity = lerp(0.9, 1.5, wet);
        e.mat.roughness = 1.0;
      }
      shoulderMat.color.setHex(wet > 0.5 ? 0x1e1e21 : 0x37373a);
      shoulderMat.roughness = lerp(0.97, 0.42, wet);
    },
    get wet() { return wet; },

    /** Stretched additive smear of a light source reflected in wet tarmac. */
    addWetSmear(parent, x, z, angle, color, w = 3, l = 22, intensity = 1) {
      if (!kit._smearTex) {
        const { c, ctx } = makeCanvas(64, 256);
        // Down-road elongation with a bright, tight head and a long ragged tail:
        // the tail is broken up so the streak reads as a reflection in a rippled
        // surface rather than a clean airbrushed gradient.
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0.00, 'rgba(255,255,255,1)');
        g.addColorStop(0.12, 'rgba(255,255,255,0.72)');
        g.addColorStop(0.40, 'rgba(255,255,255,0.28)');
        g.addColorStop(0.72, 'rgba(255,255,255,0.09)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
        // horizontal ripple bands chop the tail
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 46; i++) {
          const y = 20 + rng() * 236;
          ctx.fillStyle = `rgba(0,0,0,${0.10 + rng() * 0.45 * (y / 256)})`;
          ctx.fillRect(0, y, 64, 1 + rng() * 3);
        }
        // Breakup: bite holes out of the smear so it is not an airbrushed gradient
        // sliding over an untextured plane. These are DOWN-ROAD ELONGATED and sparse on
        // purpose. A dense field of round stone-sized bites stipples the streak into
        // pale grit, which is the same albedo-aggregate mistake one layer up: on wet
        // tarmac a light streak is broken by ripples running along the direction of
        // travel, not tiled with pebbles.
        for (let i = 0; i < 260; i++) {
          const y = rng() * 256, x = rng() * 64;
          const r = 0.7 + rng() * rng() * 2.6;
          ctx.fillStyle = `rgba(0,0,0,${0.10 + rng() * 0.30})`;
          ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * (1.6 + rng() * 3.0), 0, 0, 7); ctx.fill();
        }
        const gx = ctx.createLinearGradient(0, 0, 64, 0);
        gx.addColorStop(0.0, 'rgba(0,0,0,1)');
        gx.addColorStop(0.5, 'rgba(0,0,0,0)');
        gx.addColorStop(1.0, 'rgba(0,0,0,1)');
        ctx.fillStyle = gx; ctx.fillRect(0, 0, 64, 256);
        ctx.globalCompositeOperation = 'source-over';
        kit._smearTex = canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping, aniso });
      }
      const mat = new THREE.MeshBasicMaterial({
        map: kit._smearTex, color: new THREE.Color(color).multiplyScalar(intensity),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = angle;
      m.position.set(x, 0.06, z);
      m.renderOrder = 5;
      parent.add(m);
      refl.hidden.push(m);
      return m;
    },
  };

  void allUniforms;
  return kit;
}
