// util.js — shared deterministic helpers. Owned by nobody in particular; keep it tiny.
// API: makeRng(seed)->()=>[0,1), cellHash(a,b,salt)->uint32, rngRange/rngInt/rngPick,
//      clamp, lerp, damp, smoothstep,
//      makeCanvas(w,h)->{c,ctx}, canvasTexture(canvas,opts), valueNoise2D(rng,size)->Float32Array.
// Everything here MUST be deterministic: no Math.random, no Date.now.

import * as THREE from 'three';

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Integer hash of a coordinate pair plus a domain salt -> unsigned 32-bit int.
 *
 * The point of it: `makeRng(cellHash(x, z, salt))` gives a per-cell / per-block / per-edge random
 * stream whose seed is a pure function of WHERE the thing is, never of when it was visited. That is
 * the whole determinism contract of a streaming world — a chunk built at boot and the same chunk
 * built after a ten-minute drive must be byte-identical — so this must stay pure: no Math.random,
 * no Date, no module-level mutable state.
 *
 * The finaliser is an xor-shift-multiply chain (the murmur/splitmix family). Its job is avalanche:
 * adjacent cells differ in exactly one low bit of one input, and the output must differ in about
 * half of all 32 bits. Verified over a 100x100 lattice — see the note in the wave-T verdict.
 *
 * NOTE ON THE NAME. `hashNum` at world.js:954 is a URL-hash-param reader (it parses
 * `location.hash`) and is a completely unrelated thing. Do not overload that name, and do not
 * shorten this one to `hash`.
 *
 * @param {number} a integer-ish (truncated with |0)
 * @param {number} b integer-ish (truncated with |0)
 * @param {number} [salt=0] domain separator, so the per-block and per-edge streams for the same
 *   numeric pair do not coincide
 * @returns {number} unsigned 32-bit integer
 */
export function cellHash(a, b, salt = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ (salt | 0);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return (h ^ (h >>> 16)) >>> 0;
}

export const rngRange = (rng, a, b) => a + (b - a) * rng();
export const rngInt = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
export const rngPick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
// frame-rate independent exponential approach
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d', { willReadFrequently: false }) };
}

export function canvasTexture(canvas, {
  repeat = [1, 1], srgb = false, aniso = 16, wrap = THREE.RepeatWrapping,
} = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Tileable value-noise field, size x size, values 0..1. */
export function valueNoise2D(rng, size = 64, octaves = 4) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = Math.max(2, size >> (octaves - 1 - o + 1));
    const grid = new Float32Array(g * g);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * g, fy = (y / size) * g;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const i00 = (y0 % g) * g + (x0 % g);
        const i10 = (y0 % g) * g + ((x0 + 1) % g);
        const i01 = ((y0 + 1) % g) * g + (x0 % g);
        const i11 = ((y0 + 1) % g) * g + ((x0 + 1) % g);
        const a = lerp(grid[i00], grid[i10], sx);
        const b = lerp(grid[i01], grid[i11], sx);
        out[y * size + x] += amp * lerp(a, b, sy);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Build a normal map DataTexture from a height field.
 *
 * DataTexture defaults to NearestFilter with no mipmaps, which is wrong for
 * every use we have: point-sampling a normal map under a low-roughness surface
 * quantises the reflection into visible texel terraces, and with no mip chain
 * it aliases into sparkle at distance. So filter trilinearly and dither the
 * 8-bit encode - a normal quantised to 1/255 is a ~0.4 degree step, which a
 * near-mirror clearcoat resolves as banding. */
export function normalFromHeight(height, size, strength = 1, { aniso = 16 } = {}) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  // Ordered 4x4 Bayer dither, scaled to +/- half an LSB.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const d = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      const i = (y * size + x) * 4;
      data[i] = clamp((nx * 0.5 + 0.5) * 255 + d, 0, 255);
      data[i + 1] = clamp((ny * 0.5 + 0.5) * 255 + d, 0, 255);
      data[i + 2] = clamp((nz * 0.5 + 0.5) * 255 + d, 0, 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
