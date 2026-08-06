// _t10-sharpness.mjs — T10's audit instrument.
//
// The task's premise is that the shadow / GI / halo terms are sized in PIXELS or in fractions of
// the render target, so fixing the render size at 720p and 1080p exposed them. That premise has to
// be TESTED before anything is retuned, because if it is wrong the retune is a fudge factor.
//
// The test is a scale-invariant sharpness number. For each image: convert to luma, take the mean
// gradient magnitude with a Sobel pair, and normalise the sampling step by frame height, so a
// 720p frame and a 1080p frame of the SAME scene at the same quality score the same. Anything that
// is sized in pixels rather than in world or angular units breaks that equality, which is exactly
// what the task suspects — so the number either finds the defect or refutes the theory.
//
// Reported per image and per band, because "blurry" is not one thing: a soft shadow edge and a
// smeared sun halo live in different parts of the frame.
//
// Usage: node tools/_t10-sharpness.mjs [--scene dusk-highway-chase]
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const here = dirname(new URL(import.meta.url).pathname);
const repo = resolve(here, '..');
const scene = args.scene || 'dusk-highway-chase';
const out = resolve(repo, 'shots/t10');
mkdirSync(out, { recursive: true });

/**
 * Render the scene at a size through the normal shot harness.
 *
 * `#cap=` IS NOT OPTIONAL, and leaving it out is the trap this tool fell into first. main.js caps
 * the drawing buffer at the chosen internal resolution and lets CSS upscale to the window, and the
 * default cap is 720. So `--w 1920 --h 1080` alone produces a 1920x1080 PNG that was RENDERED at
 * 1280x720 - the file looks like a 1080p render and is a stretched 720p one. The first run of this
 * tool measured that file as "1080p" and reported an 18% resolution gap; the tell was that a 720p
 * frame upscaled in ffmpeg scored within 0.1% of it, which is only possible if they were the same
 * picture. renderSize() is asserted below so the mistake cannot come back silently.
 */
function shoot(w, h, cap) {
  const file = `${out}/${scene}-${h}.png`;
  execFileSync('node', [resolve(here, 'shot.mjs'), '--scene', scene, '--out', file,
    '--w', String(w), '--h', String(h), '--hash', `cap=${cap}`], { cwd: repo, stdio: 'pipe' });
  const rs = JSON.parse(execFileSync('node', [resolve(here, 'probe.mjs'),
    '--scene', scene, '--w', String(w), '--h', String(h), '--hash', `cap=${cap}`,
    '--expr', 'JSON.stringify(__game.renderSize())'], { cwd: repo }).toString().trim().slice(1, -1)
    .replace(/\\"/g, '"'));
  if (rs.w !== w || rs.h !== h) {
    throw new Error(`asked for ${w}x${h} but the buffer is ${rs.w}x${rs.h} (cap ${rs.cap})`);
  }
  return file;
}

/**
 * Decode any image to a plain 8-bit luma plane with ffmpeg.
 *
 * ffmpeg rather than an image library because there is no image library in this repo's
 * dependencies (playwright only) and this tool is not worth adding one for: `-pix_fmt gray` is
 * exactly the buffer the measurement wants, and it reads JPEG references and PNG renders through
 * the same path so neither gets a different decode.
 */
function luma(path) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', path]).toString().trim();
  const [w, h] = probe.split('x').map(Number);
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path,
    '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const y = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) y[i] = raw[i] / 255;
  return { w, h, y };
}

/**
 * Mean gradient magnitude with the sampling step scaled to frame height.
 *
 * THE STEP IS THE WHOLE POINT, AND IT MUST BE FRACTIONAL. Sampling adjacent pixels measures
 * "energy per pixel", which is higher at low resolution for the same picture and would make 720p
 * look SHARPER than 1080p. A step of h/720 pixels measures the gradient over the same fraction of
 * the FRAME at both sizes, which is what the eye sees.
 *
 * The first version of this function ROUNDED that step to an integer, and at 1080p round(1.5) = 2
 * — a 33% over-step that inflated 1080p's number and manufactured an 18% "resolution gap" out of
 * nothing. The tell was that a 720p frame bilinearly upscaled to 1080 scored the same as a native
 * 1080p render, which is impossible. Bilinear taps, no rounding.
 *
 * `box` limits the measurement to a region, as [x0, y0, x1, y1] in fractions of the frame.
 */
function sharpness({ w, h, y }, box = [0, 0, 1, 1]) {
  const step = h / 720;
  const at = (fx, fy) => {
    const x = Math.min(w - 1.001, Math.max(0, fx));
    const yy = Math.min(h - 1.001, Math.max(0, fy));
    const x0 = Math.floor(x), y0 = Math.floor(yy);
    const tx = x - x0, ty = yy - y0;
    const i = y0 * w + x0;
    return (y[i] * (1 - tx) + y[i + 1] * tx) * (1 - ty)
      + (y[i + w] * (1 - tx) + y[i + w + 1] * tx) * ty;
  };
  const pad = Math.ceil(step) + 1;
  const x0 = Math.round(box[0] * w) + pad, x1 = Math.round(box[2] * w) - pad;
  const y0 = Math.round(box[1] * h) + pad, y1 = Math.round(box[3] * h) - pad;
  // Sample on a grid whose spacing also scales with the frame, so both images contribute the
  // same NUMBER of independent samples and neither is averaged over more of its own noise.
  const grid = Math.max(1, Math.round(step));
  let sum = 0, n = 0;
  for (let yy = y0; yy < y1; yy += grid) {
    for (let x = x0; x < x1; x += grid) {
      const gx = at(x + step, yy) - at(x - step, yy);
      const gy = at(x, yy + step) - at(x, yy - step);
      sum += Math.hypot(gx, gy);
      n++;
    }
  }
  return n ? sum / n : 0;
}

const BANDS = {
  'whole frame': [0, 0, 1, 1],
  'sky + sun halo': [0.15, 0.05, 0.85, 0.42],
  'road + shadows': [0.10, 0.55, 0.90, 1.00],
  'facades (left)': [0.00, 0.30, 0.28, 0.85],
};

const rows = [];
const s720 = shoot(1280, 720, 720);
const s1080 = shoot(1920, 1080, 1080);
// WHAT THE PLAYER ACTUALLY SEES when the cap is 720p and the window is bigger: the browser
// bilinearly upscales the drawing buffer to the CSS size. That step is not in either render, and
// it is the one thing in this whole chain that no shader constant can compensate. Measured here so
// its share of the softness is a number rather than an assumption.
const s720up = `${out}/${scene}-720-upscaled-to-1080.png`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', s720,
  '-vf', 'scale=1920:1080:flags=bilinear', s720up]);
const shots = [['720p render', s720], ['1080p render', s1080],
  ['720p upscaled', s720up]];
for (let i = 1; i <= 4; i++) {
  const p = resolve(repo, `reference/${scene}-0${i}.jpg`);
  if (existsSync(p)) shots.push([`reference-0${i}`, p]);
}
for (const [name, path] of shots) {
  const L = luma(path);
  const r = { name, size: `${L.w}x${L.h}` };
  for (const [b, box] of Object.entries(BANDS)) r[b] = sharpness(L, box);
  rows.push(r);
}

const cols = Object.keys(BANDS);
console.log(`scene: ${scene}`);
console.log(['image'.padEnd(14), 'size'.padEnd(11), ...cols.map((c) => c.padStart(16))].join(''));
for (const r of rows) {
  console.log([r.name.padEnd(14), r.size.padEnd(11),
    ...cols.map((c) => r[c].toFixed(4).padStart(16))].join(''));
}

const a = rows[0], b = rows[1], up = rows[2];
console.log('\n1080p vs 720p, per band (a term sized in PIXELS shows up as a gap here):');
for (const c of cols) {
  const d = (b[c] / a[c] - 1) * 100;
  console.log(`  ${c.padEnd(18)} ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
}
const refs = rows.slice(3);
console.log('\nwhat the 720p cap costs on a 1080p-or-larger window (bilinear upscale vs native):');
for (const c of cols) {
  const d = (up[c] / b[c] - 1) * 100;
  console.log(`  ${c.padEnd(18)} ${d.toFixed(1)}%`);
}
if (refs.length) {
  console.log('\nours vs the reference stills, whole frame:');
  const rm = refs.reduce((s, r) => s + r['whole frame'], 0) / refs.length;
  console.log(`  reference mean   ${rm.toFixed(4)}`);
  console.log(`  720p             ${a['whole frame'].toFixed(4)}  (${((a['whole frame'] / rm - 1) * 100).toFixed(1)}%)`);
  console.log(`  1080p            ${b['whole frame'].toFixed(4)}  (${((b['whole frame'] / rm - 1) * 100).toFixed(1)}%)`);
}
