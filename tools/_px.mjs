// _px.mjs — region statistics on rendered PNGs, so "the blacks are blacker" is a number.
//   node tools/_px.mjs shots/a.png shots/b.png
// Regions are fractions of the frame: zenith (top strip), nearRoad (bottom centre),
// horizon (band across the vanishing point), full.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Optional extra regions: --region name=x0,x1,y0,y1 (repeatable). Defaults below are unchanged.
const argv = process.argv.slice(2);
const EXTRA = {};
for (let i = argv.length - 2; i >= 0; i--) {
  if (argv[i] !== '--region') continue;
  const [name, nums] = argv[i + 1].split('=');
  EXTRA[name] = nums.split(',').map(Number);
  argv.splice(i, 2);
}
const files = argv;
const browser = await chromium.launch();
const page = await browser.newPage();

const REGIONS = Object.keys(EXTRA).length ? EXTRA : {
  zenith: [0.05, 0.95, 0.00, 0.08],
  horizon: [0.30, 0.70, 0.42, 0.50],
  nearRoad: [0.10, 0.90, 0.86, 1.00],
  full: [0, 1, 0, 1],
};

for (const f of files) {
  const b64 = (await readFile(f)).toString('base64');
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const out = await page.evaluate(async ([data, regions, mimeType]) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,` + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    const res = {};
    for (const [name, r] of Object.entries(regions)) {
      const x0 = Math.floor(r[0] * c.width), x1 = Math.floor(r[1] * c.width);
      const y0 = Math.floor(r[2] * c.height), y1 = Math.floor(r[3] * c.height);
      let sr = 0, sg = 0, sb = 0, n = 0, dark = 0, dark40 = 0, ssat = 0, br200 = 0;
      // WAVE Q: percentiles are a FULL-POPULATION histogram, not a subsample.
      // The old code pushed a luma only when `(n & 31) === 0` - every 32nd pixel in raster
      // order - so on any region whose WIDTH is a multiple of 32 the sample collapsed to a
      // fixed 5-7 column set, identical on every row, and the reported triple became a
      // function of the feature's phase against that lattice rather than of the population.
      // Paired synthetic control (1600x1000, vertical comb period 32 duty 4/32, values
      // 240/40; true p01/p50/p99 = 40/40/240): at width 192 the old sampler returned
      // 40/40/40 at comb phase 0/8/16/24 and 240/240/240 at phase 1/2/3/4 - 6x wrong in
      // both directions on an IDENTICAL population - while width 191 was correct.
      // See verdicts/wave-q/damage-model.md §5 and verdicts/wave-q/px-percentile-audit.md.
      //
      // 2551 bins at 0.1 luma. Luma is a fixed function of three 8-bit channels and is
      // reported to one decimal, so 0.1 bins are exact at the reported precision. Every
      // pixel is counted: the result cannot depend on region width, column phase, or
      // traversal order, and it is deterministic (this project seeds its RNG for the same
      // reason - verdicts/wave-p/post-determinism.md). Counting is also cheaper than the
      // Array#sort it replaces.
      const HB = 2551;
      const hist = new Int32Array(HB);
      for (let y = y0; y < y1; y++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (y * c.width + xx) * 4;
          const R = px[i], G = px[i + 1], B = px[i + 2];
          sr += R; sg += G; sb += B; n++;
          // WAVE Q: per-PIXEL chroma. `sat` below averages RGB FIRST and is therefore
          // a mean-CAST number that scores 0.000 on a red/cyan checker (paired control
          // in verdicts/wave-q/hud.md). satPx is the metric that actually follows chroma.
          const pmx = Math.max(R, G, B), pmn = Math.min(R, G, B);
          ssat += (pmx - pmn) / Math.max(1, pmx);
          const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          if (l < 16) dark++;
          if (l < 40) dark40++;
          if (l >= 200) br200++;   // WAVE Q: area of the bright tail. p99 is one graphic away from a lie.
          hist[Math.round(l * 10)]++;
        }
      }
      // Nearest-rank on the full population, same rank convention the sorted-array code
      // used (0-based index Math.floor(n * q)), so fixed numbers stay comparable in kind.
      const pct = (q) => {
        const target = Math.floor(n * q);
        let cum = 0;
        for (let bin = 0; bin < HB; bin++) {
          cum += hist[bin];
          if (cum > target) return +(bin / 10).toFixed(1);
        }
        return +((HB - 1) / 10).toFixed(1);
      };
      const mr = sr / n, mg = sg / n, mb = sb / n;
      const mx = Math.max(mr, mg, mb), mn = Math.min(mr, mg, mb);
      res[name] = {
        rgb: [mr, mg, mb].map((v) => +v.toFixed(1)),
        sat: +((mx - mn) / Math.max(1, mx)).toFixed(3),
        satPx: +(ssat / n).toFixed(3),
        sub40: +(100 * dark40 / n).toFixed(2),
        sup200: +(100 * br200 / n).toFixed(2),
        p01: pct(0.01),
        p10: pct(0.10),
        p50: pct(0.50),
        p90: pct(0.90),
        p99: pct(0.99),
        subBlack: +(100 * dark / n).toFixed(2),
      };
    }
    return res;
  }, [b64, REGIONS, mime]);
  console.log(f);
  for (const [k, v] of Object.entries(out)) {
    console.log(`  ${k.padEnd(9)} rgb ${String(v.rgb).padEnd(22)} meanCast ${String(v.sat).padEnd(6)} satPx ${String(v.satPx).padEnd(6)} p01 ${String(v.p01).padEnd(6)} p10 ${String(v.p10).padEnd(6)} p50 ${String(v.p50).padEnd(6)} p90 ${String(v.p90).padEnd(6)} p99 ${String(v.p99).padEnd(6)} <16: ${String(v.subBlack).padEnd(6)}% <40: ${String(v.sub40).padEnd(6)}% >=200: ${v.sup200}%`);
  }
}
await browser.close();
