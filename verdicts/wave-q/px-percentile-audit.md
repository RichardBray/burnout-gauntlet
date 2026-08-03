# WAVE Q — `_px.mjs` percentile sampler: FIX + cross-piece impact audit

PIECE: tooling (`tools/_px.mjs`).
FILES EDITED: `tools/_px.mjs` **only**.
Nothing under `game/` was touched; `./tools/lint.sh` returns `lint ok`.

`tools/_px.mjs` md5 **BEFORE `be244cafe4297b22429622ab63fe0833`** (the wave-Q revision every
wave-Q report names) → **AFTER `6b0e73db0aa999c527ab6fdd7cba5b7f`**.

## LEAD — the conclusion that broke

**Nothing in the target set flipped, but the wave-Q critic UNDERSTATED the defect's magnitude by
roughly 4x, and its own proposed mitigation is unsound.**

`verdicts/wave-q/damage-model.md:270-277` measured the error by quoting each region beside its
**one-pixel-narrower twin** and calling that spread the error bar (`:288-289`, re-issued as binding
at `:343`: *"Every percentile must be quoted beside its one-pixel-narrower twin; if the pair
disagrees by more than 5% the number is unusable."*). Measured against the **true full population**
instead of against one other arbitrary sample, the real errors are larger:

| frame / region | statistic | old tool | width-1px twin (the quoted error bar) | TRUE (full population) | true error |
|---|---|---|---|---|---|
| `daytime-downtown` L0.75 CAM-D, `bonnetTight` | p99 | 110.9 | — | **127.7** | **+15.1%** |
| `car-paint-closeup` L0.75, `bonnetTight` | p50 | 81.0 | — | **72.6** | **-10.4%** |
| `car-paint-closeup` L0.95, `bonnetTight` | p50 | 75.0 | — | **69.6** | **-7.2%** |
| `crash-cam-03` `refFlank` | p01 | 71.3 | — | **66.3** | **-7.0%** |
| `daytime-downtown` L0.95 CAM-D, `bonnetTight` | p99 | 105.5 | 107.4 (+1.8%) | **108.6** | **+2.9%** |

The twin-quoting rule is a **false comfort**: on `bonnetTight` at `dd`/L0.95/CAM-D the 192/191/193
triple read `105.5 / 107.4 / 105.5` on the old tool — a 1.8% spread that passes the "<5%" gate —
while the true answer is 108.6. Two wrong samples can agree. **`damage-model.md:288-289` and
`:343` (quote-the-twin) are RETIRED and superseded by the fix: percentiles are now exact and
width-independent, so no error bar is needed.**

Second-order: `damage-model.md:284` scopes the retirement to *"any region whose pixel width is a
multiple of 32."* That is the worst case, not the only one. The HUD `road` region
(`0.9315,0.9345` → **6 px** wide at 1920) is not a 32-multiple, but at 6 px x 81 rows the old
sampler kept **15 samples total** — its `p01`/`p99` were percentiles of fifteen numbers
(`road p99` moves 122.9 → 129.9, **+5.7%**). Any small region was suspect regardless of phase.

---

## PART 1 — THE FIX

### The failing control, reproduced first

`/tmp/qcsyn.mjs <phase> <out.png>` — 1600x1000, vertical comb, period 32, duty 4/32, values
240/40. True population 12.5% at 240 / 87.5% at 40 → **true p01/p50/p99 = 40 / 40 / 240**.
Read at `--region w192=0.26,0.38,0,1` (x 416..608, width **192 = 6x32**, `bonnetTight`'s exact
width) and `--region w191=0.26,0.379375,0,1` (x 416..607, width 191).

| comb phase | old tool, width 192 | old tool, width 191 | fixed tool, EITHER width |
|---|---|---|---|
| 0, 8, 16, 24, 28, 30, 31 | **40 / 40 / 40** | 40 / 40 / 240 | **40 / 40 / 240** |
| 1, 2, 3, 4 | **240 / 240 / 240** | 40 / 40 / 240 | **40 / 40 / 240** |

The critic's `40/40/40` vs `240/240/240` on an identical population is reproduced exactly
(phase offset differs by sign convention from `damage-model.md:258-259`; the two states are the
same two states). Widths 160 (`intactFlank`) and 224 (`bonnetInner`) behave identically.
**After the fix every cell of that table reads `40 / 40 / 240`.**

### BEFORE / AFTER literals

`tools/_px.mjs:44` — unchanged accumulator line, kept for context.

BEFORE `tools/_px.mjs:45`:
```js
      const lums = [];
```
BEFORE `tools/_px.mjs:60`:
```js
          if ((n & 31) === 0) lums.push(l);
```
BEFORE `tools/_px.mjs:63`:
```js
      lums.sort((a, bb) => a - bb);
```
BEFORE `tools/_px.mjs:72-74`:
```js
        p01: +lums[Math.floor(lums.length * 0.01)].toFixed(1),
        p50: +lums[Math.floor(lums.length * 0.5)].toFixed(1),
        p99: +lums[Math.floor(lums.length * 0.99)].toFixed(1),
```

AFTER `tools/_px.mjs:62-63`:
```js
      const HB = 2551;
      const hist = new Int32Array(HB);
```
AFTER `tools/_px.mjs:78`:
```js
          hist[Math.round(l * 10)]++;
```
AFTER `tools/_px.mjs:83-91`:
```js
      const pct = (q) => {
        const target = Math.floor(n * q);
        let cum = 0;
        for (let bin = 0; bin < HB; bin++) {
          cum += hist[bin];
          if (cum > target) return +(bin / 10).toFixed(1);
        }
        return +((HB - 1) / 10).toFixed(1);
      };
```
AFTER `tools/_px.mjs:100-104`:
```js
        p01: pct(0.01),
        p10: pct(0.10),
        p50: pct(0.50),
        p90: pct(0.90),
        p99: pct(0.99),
```
AFTER `tools/_px.mjs:82` (print line) gains `p10` and `p90` in the console row.
`tools/_px.mjs:45-61` is a new comment block recording the defect, the control and the reason
the replacement is width-independent.

**Why this satisfies the brief.** Full population, not a stride and not a shuffle — every pixel in
the region is counted, so the sample cannot be a function of region width, column phase or
traversal order. 2551 bins at 0.1 luma; luma is a fixed function of three 8-bit channels and is
reported to one decimal, so the bins are exact at the reported precision. It is **deterministic**
with no RNG at all (the constraint that produced the seeded SSAO in
`verdicts/wave-p/post-determinism.md`) — verified by two identical runs on the same frame, byte-for-byte
output. It is also cheaper than the `Array#sort` it replaces.

`p10` and `p90` were added because `verdicts/wave-p/damage-model.md:179` and
`verdicts/wave-q/damage-model.md:373` both ask for `(p90-p10)/p50` "once `_px`'s sampler is fixed."
It is fixed; the statistic is now available.

### Width-independence on a real frame

`/tmp/px-dd095-camD.png`, `bonnetTight 0.26,0.38,0.285,0.355` at widths 192 / 191 / 193:

| | p01 | p50 | p99 |
|---|---|---|---|
| old tool, w192 | 28.9 | 62.5 | 105.5 |
| old tool, w191 | 27.9 | 62.5 | 107.4 |
| old tool, w193 | 28.9 | 62.5 | 105.5 |
| **fixed tool, all three** | **28.7** | **63.4** | **108.6** |

The fixed tool agrees to the digit across widths; the old one did not, and (note w193 == w192) its
disagreement was not even monotone in width.

### Rank convention

`pct(q)` returns the smallest luma whose cumulative count exceeds `Math.floor(n * q)` — the same
0-based nearest-rank the sorted-array code used, so old and new numbers are comparable in kind and
every delta below is the sampling defect alone, not a definitional change.

---

## PART 2 — THE CONCURRENT `meanCast` / `satPx` SPLIT: PRESERVED AND RE-VERIFIED

`_px.mjs:69-73` (per-pixel `ssat` accumulation) and `_px.mjs:96-97` (`sat` = `meanCast`,
`satPx` = true per-pixel chroma) are **untouched by this change**. The split was proven correct by
`verdicts/wave-q/hud.md:70-88`; I did not revert it and did not move it.

Re-verified with a fresh paired control, `/tmp/qcchk.mjs` — 1600x1000 red/cyan checker, 8 px cell,
`(240,40,40)` / `(40,240,240)`. Mean RGB is `(140,140,140)`, so a mean-cast metric must score 0;
every pixel has true chroma `(240-40)/240 = 0.833`.

| region | `rgb` | `meanCast` | `satPx` |
|---|---|---|---|
| width 192 | 140, 140, 140 | **0.000** (correct: it IS a mean cast) | **0.833** (correct) |
| width 191 | 140, 140, 140 | **0.000** | **0.833** |

Both fields behave exactly as `hud.md` specifies, at both widths, after the percentile change.
On real frames `meanCast` and `satPx` reproduce their wave-Q values to the digit (e.g.
`crash-cam-03 refInner` `meanCast 0.138` / `satPx 0.175`, matching `damage-model.md:379`'s
`0.175`). Neither field passes through the histogram, so neither could have moved.

Also unchanged and re-confirmed byte-identical on every frame measured: `rgb`, `sub40`, `sup200`,
`subBlack`. `damage-model.md:265-266`'s finding that the mean- and area-based statistics were
always sound is upheld.

---

## PART 3 — IMPACT AUDIT

### Scope

Grepped `verdicts/wave-p/` and `verdicts/wave-q/` for `p01 p10 p50 p90 p99` and any ratio built
from them: 160 hits across 13 files. **Excluded as not taken through `_px`** (verified by reading
the surrounding method statement in each):

| report | figures | actual tool |
|---|---|---|
| `wave-q/crash-cam.md:178-184, 229-239, 308-311` | all diff-image `p90/p99/max`, `p99/p50` | `/tmp/q-sparkdiff.mjs` |
| `wave-p/crash-cam.md:74, 89, 120, 160-162` | `lenPx/widPx/aspect p50`, `p90` | `/tmp/crashmeas-o.mjs` probe |
| `wave-q/road-surface.md:182-184, 256-259` | `p99/p50` of `|e|` | `/tmp/q-aniso.mjs skew` |
| `wave-q/environment.md:368-377, 435-451, 641-643` | block `p50/p90/p99` | own block harness; `:29-33` states `_px` was **NOT USED** |
| `wave-p/car-paint.md:136, 156`, `wave-q/car-paint.md:376` | glass `p90` 51.2, band 49-75 | `_paintmeas.mjs` |

That leaves **four pieces** with live `_px` percentiles: damage-model (P and Q), car-paint (P and
Q), hud (P and Q), sky-lighting (Q).

### Trigger condition per region

Widths computed as `floor(x1*W) - floor(x0*W)` at each report's own stated render resolution.

| region | source | render W | px width | 32-multiple? |
|---|---|---|---|---|
| `bonnetTight 0.26,0.38` | damage-model P+Q | 1600 | 192 | **YES (6x32)** |
| `bonnetInner 0.29,0.43` | damage-model P+Q, car-paint Q | 1600 | 224 | **YES (7x32)** |
| `intactFlank 0.60,0.70` | damage-model P+Q, car-paint P+Q | 1600 | 160 | **YES (5x32)** |
| `full 0,1,0,1` | damage-model P+Q | 1600 | 1600 | **YES (50x32)** |
| `full 0,1,0,1` (cc03 ref) | damage-model Q | 1920 | 1920 | **YES (60x32)** |
| `minimap 0.8125,0.9896` | hud P+Q | 1920 | 340 | no |
| `road 0.9315,0.9345` | hud P+Q | 1920 | **6** | no — but only 15 samples survived |
| `inner 0.840,0.975` | hud P+Q | 1920 | 260 | no |
| `z/valley/v1/v2/mid 0.55,0.65` | sky-lighting Q | 1920 | 192 | **YES (6x32)** |
| `s 0.75,0.82`, `s2` | sky-lighting Q | 1920 | 134 | no |
| `up/lo 0.0833,0.1563` | car-paint Q | 1920 | 141 | no |
| `refFlank 0.156,0.292` (cc03) | damage-model Q | 1920 | 261 | no |
| `refInner 0.5833,0.6771` (cc03) | damage-model Q | 1920 | 180 | no |
| cc03 denominator probes `0.30,0.42` / `0.72,0.86` / `0.02,0.14` | damage-model Q | 1920 | 230 / 269 / 230 | no |

I re-measured **all of them**, 32-multiple or not, because the `road` case shows width alone is not
the whole trigger.

### Re-measurement method

Every suspect figure re-rendered on the **current tree** at the scene, damage level **and** camera
its own report names, then read with both the old tool (restored from `/tmp/_px-BEFORE.mjs`, md5
`be244cafe4297b22429622ab63fe0833`) and the fixed tool on the **same PNG**, so the delta is purely
the tool.

```
node tools/damage-shot.mjs --scene daytime-downtown  --do "d.setLevel(0.95)" \
  --cam "3.9,1.6,4.2|0,0.75,0.3|40" --out /tmp/px-dd095-camD.png     # 1600x1000, CAM-D
node tools/damage-shot.mjs --scene daytime-downtown  --do "d.setLevel(0.75)" \
  --cam "3.9,1.6,4.2|0,0.75,0.3|40" --out /tmp/px-dd075-camD.png     # 1600x1000, CAM-D
node tools/damage-shot.mjs --scene car-paint-closeup --do "d.setLevel(0.75)" --out /tmp/px-cpc075.png  # CAM-0
node tools/damage-shot.mjs --scene car-paint-closeup --do "d.setLevel(0.95)" --out /tmp/px-cpc095.png  # CAM-0
node tools/shot.mjs --scene hud-overlay        --w 1920 --h 1080 --out /tmp/px-hud-1920.png
node tools/shot.mjs --scene hud-overlay        --w  960 --h  540 --out /tmp/px-hud-960.png
node tools/shot.mjs --scene dusk-highway-chase --w 1920 --h 1080 --out /tmp/px-sky-1920.png
node tools/shot.mjs --scene car-paint-closeup  --w 1920 --h 1080 --out /tmp/px-cpc-1920.png
```

**Tree-drift check, and it is clean.** On the old tool these fresh renders reproduce the quoted
wave-P/wave-Q figures **to the digit** — `bonnetTight 28.9/62.5/105.5`, `bonnetInner p50 61.3`,
`intactFlank p50 105.1` (dd/L0.95/CAM-D); `intactFlank p50 47.7` / `bonnetInner p50 68.5`
(cpc/L0.75/CAM-0); `intactFlank p50 46.0` / `bonnetInner p50 56.2` (cpc/L0.95); `road p50 87.9`,
`minimap p01 5.9 / p50 54.2 / p99 177.7`, `inner p99 187.2` (hud 1920). **Every delta below is the
tool and nothing else.**

### THE TABLE

| # | figure | report (`file:line`) | scene / level / camera | OLD | NEW | delta | conclusion survives? |
|---|---|---|---|---|---|---|---|
| 1 | `bonnetTight` p01/p50/p99 | `wave-p/damage-model.md:93` | dd / L0.95 / CAM-D | 28.9 / 62.5 / 105.5 | **28.7 / 63.4 / 108.6** | -0.7 / +1.4 / **+2.9%** | YES |
| 2 | `bonnetTight (p99-p01)/p50` vs target 2.30 | `wave-p/damage-model.md:94,107,152`; `wave-q:213` | dd / L0.95 / CAM-D | **1.226** | **1.260** | +2.8% | **YES — still MISSED by 45%. Target already RETIRED (`wave-p:177-178`, `wave-q:374`); retirement stands.** |
| 3 | `bonnetInner p50` | `wave-p/damage-model.md:90` | dd / L0.95 / CAM-D | 61.3 | **61.2** | -0.2% | YES |
| 4 | `bonnetInner p99` | `wave-p/damage-model.md:143` | dd / L0.95 / CAM-D | 112.9 | **115.0** | +1.9% | YES (the 2.30-ceiling arithmetic at `:170` gets slightly *more* headroom and still fails) |
| 5 | `intactFlank p50` | `wave-p/damage-model.md:91,187` | dd / L0.95 / CAM-D | 105.1 | **105.0** | -0.1% | YES |
| 6 | `intactFlank p50` | `wave-p/damage-model.md:187` | dd / L0.75 / CAM-D | 112.0 | **111.1** | -0.8% | YES |
| 7 | `bonnetInner / intactFlank` = 0.583, band 0.55-0.70 | `wave-p/damage-model.md:155` | dd / L0.95 / CAM-D | **0.583** | **0.583** | 0.0% | YES numerically. **The target it fed was already RETIRED by `wave-q:186-192` (6x denominator swing); that retirement is untouched.** |
| 8 | frame `full p01 25.7`, 0.00% under 16 | `wave-p/damage-model.md:165`; `wave-q:230-231,440` | dd / L0.95 / CAM-D | 25.7 / 0.00% | **25.7 / 0.00%** | 0.0% | YES — the grade-floor argument is intact |
| 9 | frame `full p50` (T1 denominator) | `wave-q/damage-model.md:349` | dd / L0.95 / CAM-D | 85.1 | **84.7** | -0.5% | YES |
| 10 | **T1** `bonnetInner p50 / full p50`, band 1.00-1.35 | `wave-q/damage-model.md:344-350` | dd / L0.95 / CAM-D | ours **0.720** | ours **0.723** | +0.4% | YES — still far outside the band |
| 11 | T1 reference anchor `68.2 / 57.2 = 1.192` | `wave-q/damage-model.md:349` | `reference/crash-cam-03.jpg` | 68.2 / 57.2 = 1.192 | **67.9 / 56.7 = 1.198** | +0.5% | YES — restate the anchor as **1.198** |
| 12 | cc03 `full p01 4.0`, 9.36% under 16 | `wave-q/damage-model.md:231,365,440` | `crash-cam-03.jpg` | 4.0 / 9.36% | **4.0 / 9.36%** | 0.0% | YES |
| 13 | cc03 inner-face `(p99-p01)/p50 = 2.587` | `wave-q/damage-model.md:232` | `crash-cam-03.jpg` `refInner` | **2.587** | **2.554** | -1.3% | YES |
| 14 | cc03 `refFlank p50 105.3` | `wave-q/damage-model.md:159-160` | `crash-cam-03.jpg` | 105.3 | **105.1** | -0.2% | YES |
| 15 | cc03 denominator swing 205.6 / 57.6 / 34.9 → ratios 0.33 / 1.18 / 1.95 | `wave-q/damage-model.md:176-180` | `crash-cam-03.jpg` | 6x swing | **205.0 / 57.3 / 35.0 → 0.331 / 1.185 / 1.940**, 5.9x swing | <1% | YES — the retirement argument is unaffected |
| 16 | **`intactFlank p50 = 47.7`, the binding denominator** | `wave-q/car-paint.md:269,292-294` | `car-paint-closeup` / L0.75 / CAM-0 | **47.7** | **46.8** | **-1.9%** | Conclusion YES (scene choice is right). **The CONSTANT must be restated to 46.8 before the damage builder tunes against it.** |
| 17 | `intactFlank p50 = 46.0` @ L0.95 | `wave-q/car-paint.md:270,293` | `car-paint-closeup` / L0.95 / CAM-0 | 46.0 | **45.5** | -1.1% | YES (level delta was -3.6%, now -2.8%) |
| 18 | `bonnetInner p50 = 68.5 / 56.2` | `wave-q/car-paint.md:269-270,295` | `car-paint-closeup` / L0.75 & L0.95 / CAM-0 | 68.5 / 56.2 | **68.2 / 56.1** | -0.4 / -0.2% | YES — and `:296`'s "13% intra-arm spread, do not use" still governs |
| 19 | "2.3x wrong denominator" (105.1 dd vs 47.7 cpc) | `wave-p/damage-model.md:185`; `wave-q/car-paint.md:281` | both | 2.20x | **2.24x** | +1.8% | YES |
| 20 | dd `intactFlank` L0.75 == L0.95 bit-identical (the "no car in region" proof) | `wave-q/car-paint.md:277-280` | dd / L0.75 & L0.95 / CAM-0 | identical | still identical on the fixed tool | — | YES |
| 21 | `up p50 / lo p50 = 1.03`, target band 1.30-1.60 | `wave-q/car-paint.md:311,362` | `car-paint-closeup` / default / 1920x1080 | 85.8/83.2 = **1.031** | 85.3/83.3 = **1.024** | -0.7% | YES |
| 22 | `lo p99 = 106.7`, hold band 130-175 | `wave-q/car-paint.md:312,363` | same | 106.7 | **106.5** | -0.2% | YES |
| 23 | `minimap p01 5.9`, target `<= 6` | `wave-p/hud.md:140,195`; `wave-q:54` | `hud-overlay` / 1920x1080 | **5.9** | **5.9** | 0.0% | YES — HIT, and it was 0.1 from failing before and still is |
| 24 | `road p50 87.9`, band 85-110 | `wave-p/hud.md:138,195`; `wave-q:222` | `hud-overlay` / 1920x1080 | 87.9 | **88.5** | +0.7% | YES — HIT |
| 25 | `road p01 / p99` | `wave-p/hud.md:138` context | `hud-overlay` / 1920x1080 | 84.1 / 122.9 | **83.0 / 129.9** | -1.3% / **+5.7%** | n/a as a target, but **this region carried only 15 samples**; see the lead |
| 26 | `minimap p50 54.2`, band 50-60 | `wave-p/hud.md:143,197`; `wave-q:218` | `hud-overlay` / 1920x1080 | 54.2 | **54.4** | +0.4% | YES — HIT |
| 27 | `minimap p99 177.7` (regression evidence) | `wave-p/hud.md:144,275-281` | `hud-overlay` / 1920x1080 | 177.7 | **179.2** | +0.8% | YES — and `wave-q/hud.md:148,254` **RETIRED** this metric anyway (one graphic pins it) |
| 28 | `inner p99 187.2` vs ref03 215.4 | `wave-p/hud.md:146,275-281` | `hud-overlay` / 1920x1080 | 187.2 | **191.0** | +2.0% | YES — still 11% short of 215.4 |
| 29 | 960x540 scale leg: `road p50 88.8`, `minimap p50 54.7`, `p01 6.5` | `wave-p/hud.md:176-178`; `wave-q:67` | `hud-overlay` / 960x540 | 88.8 / 54.7 / 6.5 | **88.8 / 55.5 / 6.5** | 0 / +1.5% / 0 | YES — scale persistence holds |
| 30 | sky `s` region `p99-p01 = 30.1` vs ref `2.3` | `wave-q/sky-lighting.md:149-151,303` | `dusk-highway-chase` / default / 1920x1080 | 30.1 | **29.9** | -0.7% | YES — 12x, the argument is not close to marginal |
| 31 | sky `z / valley / v1 / v2 / mid` p50 (all 192 px wide) | `wave-q/sky-lighting.md:77-79` | `dusk-highway-chase` / default / 1920x1080 | 86.2 / 113.6 / 107.9 / 110.7 / 111.6 | **86.3 / 113.9 / 108.1 / 110.7 / 111.7** | <=+0.3% | YES — the dome-radiance ladder is unchanged. **These were the highest-risk regions in the sweep (all 6x32) and they moved least: the comb had no phase to lock onto in a smooth gradient.** |
| 32 | sky `s` mean-R hold gate | `wave-q/sky-lighting.md:272-274` | `dusk-highway-chase` / default / 1920x1080 | rgb 210.3 | **rgb 210.3** | 0 | YES — mean-based, structurally immune |

### Not re-measurable, and stated as such

Two figures are A/B legs of **code edits that were restored byte-exactly** and cannot be re-read
without redoing the edit:

- **`bonnetTight p99 105.4 → 89.6`, the no-`metalnessMap` "15% worse"** (`wave-p/damage-model.md:141,221`).
  The shipped leg re-measures 105.5 → **108.6** (+2.9%), so if the probe leg moves comparably the
  gap stays near 15%. `wave-p:221` already calls it directional; **that remains the correct
  reading, now with a bounded tool error rather than an unbounded one.**
- **`160.5 / 158.5` with bonnet AO 1.0 and colour forced white** (`wave-q/damage-model.md:223,419`),
  feeding `(160.5 - 28.9)/2.30 = 57.2` against target 2's 57.8, "within 1%". With the corrected
  `p01 = 28.7` the same arithmetic gives **57.3**. **Still within 1%. The "targets are marginal,
  not mutually exclusive" ruling at `:226` survives** — and it survives *by* 1%, so it should be
  re-derived once, whole, on the fixed tool before anything is built on it.

### Untouched by the fix, confirmed

`rgb`, `sub40`, `sup200`, `subBlack`, `meanCast`, `satPx` are byte-identical on every frame
measured. That validates, on real frames, `damage-model.md:265-266`'s claim that only the
percentiles were broken. In particular these targets need no restatement:

- `bonnetTight sub40 / sup200` **8.65% / 0.00%** vs cc03 `refInner` **11.43% / 0.58%**, bands
  8-15% / 0.2-1.2% (`wave-q/damage-model.md:358,372`) — **all four numbers reproduce exactly.**
- `bonnetInner satPx` **0.150** vs cc03 `refInner` **0.175**, band 0.14-0.21
  (`wave-q/damage-model.md:379`) — reproduces exactly.
- `minimap sub40 38.15%`, `subBlack 13.2%`, `meanCast 0.094` (`wave-p/hud.md:15,195`;
  `wave-q/hud.md:67`) — reproduce exactly.

`wave-q/hud.md:148-149`'s decision to replace `p99` with the area statistic `sup200` was the right
call for an independent reason and is **strengthened**, not weakened, by this fix.

---

## RETIRE / RESTATE

- **RETIRED: `verdicts/wave-q/damage-model.md:288-289` and `:343` — "quote every percentile beside
  its one-pixel-narrower twin and treat the spread as the error bar."** Demonstrably unsafe: on
  `bonnetTight` at `dd`/L0.95/CAM-D the 192/191 pair spread 1.8% (passing the "<5%" gate) around a
  value that was 2.9% wrong, and on `dd`/L0.75 the true p99 error is 15.1%. Two samples of a
  broken sampler can agree. Superseded — percentiles are now exact.
- **RETIRED: `verdicts/wave-q/damage-model.md:284` — "`_px` p01/p50/p99 RETIRED on any region whose
  pixel width is a multiple of 32."** Superseded by the fix. Note also that the 32-multiple framing
  was too narrow: the 6 px-wide HUD `road` region kept 15 samples and moved +5.7% on p99.
- **RESTATED: the binding denominator handed to the damage builder is
  `intactFlank 0.60,0.70,0.45,0.53` p50 = 46.8** (was 47.7), scene `car-paint-closeup`, damage
  level 0.75, `damage-shot.mjs` default camera, 1600x1000
  (`wave-q/car-paint.md:292-294`). At L0.95, **45.5** (was 46.0).
- **RESTATED: T1's reference anchor is `67.9 / 56.7 = 1.198`** (was `68.2 / 57.2 = 1.192`),
  `reference/crash-cam-03.jpg`, `refInner 0.5833,0.6771,0.3704,0.5741` over `full 0,1,0,1`
  (`wave-q/damage-model.md:349`). Ours is **0.723** (was 0.720). Band 1.00-1.35 unchanged.
- **NEW: `_px` prints `p10` and `p90`.** `(p90-p10)/p50` — the tail-free range statistic both
  `wave-p/damage-model.md:179` and `wave-q/damage-model.md:373` asked for once the sampler was
  fixed — is now measurable. On `bonnetTight`, dd/L0.95/CAM-D it is **(82.9 - 41.3)/63.4 = 0.656**;
  on cc03 `refInner` it is **(83.2 - 35.4)/67.9 = 0.704**. Ratio ours:ref **0.93**. Offered as a
  measurement, **not** as a target — nobody has yet shown this statistic tracks the eye, and this
  session's transferable lesson is exactly about numbers that come loose from what they represent.

## PROVENANCE

- `tools/_px.mjs` md5 `be244cafe4297b22429622ab63fe0833` → `6b0e73db0aa999c527ab6fdd7cba5b7f`.
  Only file edited. Old revision preserved at `/tmp/_px-BEFORE.mjs` for anyone re-deriving a delta.
- Nothing under `game/` touched. `./tools/lint.sh` → `lint ok`.
- Controls: `/tmp/qcsyn.mjs` (comb, percentile phase-lock), `/tmp/qcchk.mjs` (red/cyan checker,
  `meanCast`/`satPx`). Both regenerate their PNGs deterministically from source.
- Renders: `/tmp/px-dd095-camD.png`, `/tmp/px-dd075-camD.png`, `/tmp/px-cpc075.png`,
  `/tmp/px-cpc095.png`, `/tmp/px-hud-1920.png`, `/tmp/px-hud-960.png`, `/tmp/px-sky-1920.png`,
  `/tmp/px-cpc-1920.png`. All on the current tree; all reproduce their reports' quoted figures on
  the old tool, so no tree drift is folded into any delta above.
