// _hudedge.mjs — 10-90 transition widths of the boost bar's four edges, plus the
// rim/core colour profile. Written for hud r8; the r7 round measured the same four
// numbers with a throwaway script, so this puts the measurement on disk.
//
//   node tools/_hudedge.mjs <file> <coreX0,coreX1,coreY0,coreY1>
//
// The box is given in FRACTIONS of the frame and must be the bar's SOLID core
// (safely inside all four edges, and left of the burn front). Everything else is
// found by walking outward from it.
//
// Conventions, fixed so rounds are comparable:
//   * vertical edges (top rail, bottom rail) are reported as % of FRAME HEIGHT
//   * horizontal edges (left cap, burn front) are reported as % of FRAME WIDTH
//   * 10 and 90 are percentiles of the span between the local outside baseline
//     (median of the 12 rows/cols furthest outside) and the core plateau.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [file, box] = process.argv.slice(2);
if (!file || !box) {
  console.error('usage: node tools/_hudedge.mjs <file> <x0,x1,y0,y1 as fractions>');
  process.exit(1);
}
const B = box.split(',').map(Number);

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = (await readFile(file)).toString('base64');
const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';

const out = await page.evaluate(async ([data, mimeType, bx]) => {
  const img = new Image();
  img.src = `data:${mimeType};base64,` + data;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  const at = (x, y) => (y * W + x) * 4;

  const cx0 = Math.round(bx[0] * W), cx1 = Math.round(bx[1] * W);
  const cy0 = Math.round(bx[2] * H), cy1 = Math.round(bx[3] * H);
  const barH = cy1 - cy0, barW = cx1 - cx0;

  // reach: how far outside the core we look for the transition to finish
  const vReach = Math.round(barH * 1.2), hReach = Math.round(barW * 0.35);

  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };

  // ---- vertical profile: mean luma per row, averaged over the core's x span ----
  const yA = Math.max(0, cy0 - vReach), yB = Math.min(H - 1, cy1 + vReach);
  const vprof = [];
  for (let y = yA; y <= yB; y++) {
    let s = 0, n = 0;
    for (let x = cx0; x < cx1; x++) { s += lum(at(x, y)); n++; }
    vprof.push(s / n);
  }
  // ---- horizontal profile: mean luma per column over the core's middle 50% ----
  const hy0 = Math.round(cy0 + barH * 0.25), hy1 = Math.round(cy1 - barH * 0.25);
  const xA = Math.max(0, cx0 - hReach), xB = Math.min(W - 1, cx1 + Math.round(barW * 1.2));
  const hprof = [];
  for (let x = xA; x <= xB; x++) {
    let s = 0, n = 0;
    for (let y = hy0; y < hy1; y++) { s += lum(at(x, y)); n++; }
    hprof.push(s / n);
  }

  // Plateau = the profile's own peak, not the median of the given box: the box
  // only has to be roughly right, and a box whose top row already sits below the
  // 90% threshold would otherwise make the edge unmeasurable.
  const argmax = (a, off) => { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi + off; };
  const iPeakV = argmax(vprof.slice(cy0 - yA, cy1 - yA), cy0 - yA);
  const iPeakH = argmax(hprof.slice(cx0 - xA, cx1 - xA), cx0 - xA);
  const plateauV = vprof[iPeakV], plateauH = hprof[iPeakH];

  // walk from index `from` toward `to`, return the fractional index where the
  // profile first crosses `thr`
  function cross(prof, from, to, thr) {
    const step = to > from ? 1 : -1;
    for (let i = from; i !== to; i += step) {
      const a = prof[i], b = prof[i + step];
      if (a === undefined || b === undefined) break;
      if ((a - thr) * (b - thr) <= 0 && a !== b) return i + step * (thr - a) / (b - a);
    }
    return null;
  }

  function edge(prof, outerIdx, innerIdx, plateau, denom, label) {
    // Baseline: the DARKEST point reached walking outward from the plateau, not
    // the frame-edge median — above the bar the event feed sits inside the reach
    // and dragged the median up until the 10% threshold was never crossed.
    const step = outerIdx > innerIdx ? 1 : -1;
    let base = Infinity, baseIdx = innerIdx;
    for (let i = innerIdx; i !== outerIdx + step; i += step) {
      if (prof[i] === undefined) break;
      if (prof[i] < base) { base = prof[i]; baseIdx = i; }
    }
    outerIdx = baseIdx;
    const t10 = base + 0.10 * (plateau - base);
    const t90 = base + 0.90 * (plateau - base);
    // walk from the plateau OUTWARD, so the first crossing found is the edge that
    // actually bounds the body; walking inward from the frame edge picks up
    // whatever else happens to be bright out there (feed text, road specular).
    const i90 = cross(prof, innerIdx, outerIdx, t90);
    const i10 = cross(prof, innerIdx, outerIdx, t10);
    const wpx = (i10 === null || i90 === null) ? null : Math.abs(i90 - i10);
    return { label, base: +base.toFixed(1), plateau: +plateau.toFixed(1),
      px: wpx === null ? null : +wpx.toFixed(1),
      pct: wpx === null ? null : +(100 * wpx / denom).toFixed(2) };
  }

  // walks start at the profile's peak so the 90% threshold is always crossed
  const iTopOuter = 0, iTopInner = iPeakV;
  const iBotOuter = vprof.length - 1, iBotInner = iPeakV;
  const iLeftOuter = 0, iLeftInner = iPeakH;
  const iFrontOuter = hprof.length - 1, iFrontInner = iPeakH;

  const edges = [
    edge(vprof, iTopOuter, iTopInner, plateauV, H, 'topRail   (%H)'),
    edge(vprof, iBotOuter, iBotInner, plateauV, H, 'bottomRail(%H)'),
    edge(hprof, iLeftOuter, iLeftInner, plateauH, W, 'leftCap   (%W)'),
    edge(hprof, iFrontOuter, iFrontInner, plateauH, W, 'burnFront (%W)'),
  ];

  // ---- colour profile down the bar: 9 bands from top rim to bottom rim -------
  const bands = [];
  for (let b = 0; b < 9; b++) {
    const ya = Math.round(cy0 + (b / 9) * barH), yb = Math.round(cy0 + ((b + 1) / 9) * barH);
    let r = 0, gg = 0, bl = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = cx0; x < cx1; x++) {
      const i = at(x, y); r += px[i]; gg += px[i + 1]; bl += px[i + 2]; n++;
    }
    r /= n; gg /= n; bl /= n;
    const mx = Math.max(r, gg, bl), mn = Math.min(r, gg, bl);
    bands.push({ y: [ya, yb], rgb: [r, gg, bl].map((v) => +v.toFixed(1)),
      sat: +((mx - mn) / Math.max(1, mx)).toFixed(3), bg: +(bl / Math.max(1, gg)).toFixed(3) });
  }

  // ---- rim: the row where the vertical profile first reaches 50% of plateau --
  function rim(fromIdx, toIdx) {
    const step = fromIdx > toIdx ? 1 : -1;
    let base = Infinity;
    for (let i = toIdx; i !== fromIdx + step; i += step) {
      if (vprof[i] === undefined) break;
      if (vprof[i] < base) base = vprof[i];
    }
    const i = cross(vprof, toIdx, fromIdx, base + 0.5 * (plateauV - base));
    if (i === null) return null;
    const y = Math.round(yA + i);
    let r = 0, gg = 0, bl = 0, n = 0;
    for (let yy = y - 1; yy <= y + 1; yy++) for (let x = cx0; x < cx1; x++) {
      const k = at(x, yy); r += px[k]; gg += px[k + 1]; bl += px[k + 2]; n++;
    }
    r /= n; gg /= n; bl /= n;
    const mx = Math.max(r, gg, bl), mn = Math.min(r, gg, bl);
    return { y, rgb: [r, gg, bl].map((v) => +v.toFixed(1)),
      sat: +((mx - mn) / Math.max(1, mx)).toFixed(3), bg: +(bl / Math.max(1, gg)).toFixed(3) };
  }

  // ---- box stats over the whole core ---------------------------------------
  let r = 0, gg = 0, bl = 0, n = 0; const L = [];
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
    const i = at(x, y); r += px[i]; gg += px[i + 1]; bl += px[i + 2]; n++;
    L.push(lum(i));
  }
  r /= n; gg /= n; bl /= n;
  L.sort((a, b2) => a - b2);
  const mx = Math.max(r, gg, bl), mn = Math.min(r, gg, bl);
  const blown = 100 * L.filter((v) => v >= 250).length / L.length;

  return { size: [W, H], edges, bands,
    rimTop: rim(iTopOuter, iTopInner), rimBot: rim(iBotOuter, iBotInner),
    box: { rgb: [r, gg, bl].map((v) => +v.toFixed(1)),
      sat: +((mx - mn) / Math.max(1, mx)).toFixed(3),
      p50: +L[L.length >> 1].toFixed(1), p99: +L[Math.floor(L.length * 0.99)].toFixed(1),
      blown250: +blown.toFixed(2) } };
}, [b64, mime, B]);

console.log(`${file}  ${out.size.join('x')}`);
for (const e of out.edges) console.log(`  ${e.label}  ${String(e.pct).padEnd(6)}%  (${e.px} px)  base ${e.base} -> plateau ${e.plateau}`);
console.log(`  rimTop  y${out.rimTop && out.rimTop.y} rgb ${out.rimTop && out.rimTop.rgb} sat ${out.rimTop && out.rimTop.sat} B/G ${out.rimTop && out.rimTop.bg}`);
console.log(`  rimBot  y${out.rimBot && out.rimBot.y} rgb ${out.rimBot && out.rimBot.rgb} sat ${out.rimBot && out.rimBot.sat} B/G ${out.rimBot && out.rimBot.bg}`);
console.log(`  box     rgb ${out.box.rgb} sat ${out.box.sat} p50 ${out.box.p50} p99 ${out.box.p99} >=250: ${out.box.blown250}%`);
console.log('  band profile (top -> bottom):');
for (const b of out.bands) console.log(`    y ${b.y.join('-')}  rgb ${String(b.rgb).padEnd(22)} sat ${b.sat}  B/G ${b.bg}`);
await browser.close();
