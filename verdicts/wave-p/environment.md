# WAVE P BUILDER — environment (p1) — game/world.js

PIECE: environment   ROUND: p1   FILE: `game/world.js` (only file edited in `game/`)
TOOL EDITED: `tools/_facademeas.mjs` (two new output columns, nothing removed)
SCENE: daytime-downtown   SHOT: `shots/environment-p1.png` (= `shots/_envs-B4.png`)
REFS: `reference/daytime-downtown-01.jpg`, `-02`, `-04`

---

## 0. FIRST ACT — TREE DIFF AGAINST THE VERDICT LITERALS. CLEAN.

Per the new standing rule, before measuring anything I greped every literal quoted in
`verdicts/wave-n/environment.md` and `verdicts/wave-o/environment.md` against the tree.
**All present, all matching, no unexplained edits.**

```
world.js:1251  STYLE_TRIM  { glass 0x7c8e9f, office 0xa8977c, brick 0x9a6a56, concrete 0xb0a288 }
world.js:1327  PAINT_NEUTRAL [0xd9cba6,0x9fb3c9,0xbfae8f,0xd2bc9e,0x92a4b6,0xcab19f]
world.js:1338  PAINT_CHANCE  { glass 0.05, brick 0.12, office 0.44, concrete 0.44 }
world.js:1346  PODIUM_TRIM   [0xe0d3b3,0xd4c2a1,0xe8dcba,0xa1b4c9,0xdcc9a4,0xefe3c4,0x3f8f74,0x9e4038]
world.js:1358  STYLE_TRIM fallback 0xa99b80
world.js:888   AIR_GAIN 6.0   :887 AIR_D0_FALLBACK 0.0016   :889 AIR_W 0.85   :890 AIR_D_MAX 0.0105
```
Only line drift: wave-o cites PAINT_CHANCE at `:1314`; it is at `:1338` (the verdict listed it
out of source order). STYLE_TRIM `:1252 -> :1251`, PODIUM_TRIM `:1347 -> :1346`. Nothing else.
Pre-edit `md5 game/world.js = 1f55b1b2ee1a1c469a6275fccdf56286`, kept byte-exact at
`/tmp/world.A.js` and used as the A leg of every pair below.

**CROSS-FILE ROUTE — honoured, `game/sky.js` NOT touched.** `world.js:1003-1011` `skyFogD0()`
reads `_sky.fogParams[0]` first (writer `sky.js:1536`, exported `:1454`), then `preset.fog.d0`,
then `scene.fog.density` with the `0.001` placeholder explicitly rejected, then
`AIR_D0_FALLBACK`. Read-only. Confirmed live again this round: with the daytime preset the
airlight runs on d0 = 0.0016, not on the dead 0.001.

**DUSK RE-BASELINE — NOT APPLICABLE TO THIS PIECE, and that is now measured, not assumed.**
`daytime-downtown` is the only scene environment is scored on and it is the `midday` preset;
sky's own report states midday and night renders came out byte-stable. I re-derived the whole
wave-o table on the CURRENT (post-sky) tree anyway and it reproduces: far-band sobel shipping
**16.33** (wave-o 16.18), `#air=3` **18.41** (18.24), `#air=0` **24.31** (23.84, still BREAKS the
12-22 gate). Band dark% shipping **7.6** (6.9), `#air=0` **11.0** (11.6), `#air=3` **7.7** (6.5).
The sky move did not reach this scene.

---

## 1. WHAT CHANGED — MECHANISM FIRST

The headline gap was right and the fix is the one the brief named: **the airlight had no
near-field onset.** `fq = 1 - exp(-uHazeD * dist)` has its *steepest* slope at `dist = 0`, so the
single scalar calibrated on the 85-200 m band was also deciding how much haze a 30 m storefront
took — 25% of the way to `uHaze` before the `AIR_W` ceiling, laid over exactly the pixels (shop
reveals, awning undersides, canyon floor) that have to go dark. That is why `dark%` and far-band
sobel were welded together: gain 3 kept sobel legal and left dark% flat, gain 0 freed dark% and
blew the far band to 24.3.

So the path length gets a soft start. `world.js:954`:

```glsl
float de   = dist - uHazeS * (1.0 - exp(-dist / max(uHazeS, 1e-3)));
float fq   = 1.0 - exp(-uHazeD * de);
```

`de` is quadratic in `dist` near zero (`~dist^2 / 2S`) and asymptotically parallel to `dist - S`
far away. One exp, C1-continuous, no branch.

**Bug-class rule 4 check, explicitly.** `de <= dist` for every `dist >= 0`, so the new form can
only ever REMOVE optical depth relative to the old one — the consumer (`1 - exp(...)` into a
`mix` clamped by `AIR_W`) never sees a larger argument than it already did. The `AIR_GAIN` rise
below is a **renormalisation, not a gain**: `de(200; S=55) = 146.4 m` and
`0.0016 * 8.2 * 146.4 = 1.92 = 0.0016 * 6.0 * 200`, i.e. the 200 m point is held FIXED by
construction and every distance below ~190 m gets strictly less haze than before. `AIR_D_MAX`
moves by the same 1.367x so the three uncalibrated presets stay clamped at exactly the thickness
they had.

### CONSTANTS — BEFORE -> AFTER, re-greped AFTER the final render (Rule 5)

```
world.js:896   AIR_GAIN      6.0     -> 8.2        (renormalisation, see above)
world.js:897   AIR_D_START   —       -> 55.0       NEW
world.js:902   AIR_D_MAX     0.0105  -> 0.0144     (same 1.367x, keeps the preset clamp)
world.js:895   AIR_D0_FALLBACK 0.0016 -> 0.0016    UNCHANGED
world.js:898   AIR_W         0.85    -> 0.85       UNCHANGED
world.js:778   ATMO_DECL     + `uniform float uHazeS;`
world.js:954   atmoTail      float fq = 1.0 - exp(-uHazeD * dist)
                          -> float de = dist - uHazeS*(1.0 - exp(-dist/max(uHazeS,1e-3)));
                             float fq = 1.0 - exp(-uHazeD * de);
world.js:1021  _airStart = hashNum('airs', AIR_D_START)   NEW (URL A/B, same pattern as #air)
world.js:1052  atmo.uHazeS { value: AIR_D_START }         NEW
world.js:2922  atmo.uHazeS.value = _airStart               NEW
```
No paint table, no `uCanyon`, no `uShadeAmt`, no `uFillK` touched. `./tools/lint.sh` = `lint ok`
before every render and as the last action. Post-edit `md5 game/world.js =
023e9cd05d5b6757112340855d21390a`.

---

## 2. THE MEASUREMENT FINDING THAT DOMINATES THIS ROUND

### 2a. `daytime-downtown` IS NOT DETERMINISTIC. RUN-TO-RUN dark% VARIANCE IS +/-2.4 POINTS, NOT +/-0.04.

Three renders of the **same** `world.js` with **peer md5s frozen** (`6d505a4299a7...` before and
after all three):

| run | lum | dark% | darkAll% | sky% |
|---|---|---|---|---|
| _envr-B1 | 84.6 | 8.6 | 5.08 | 40.9 |
| _envr-B2 | 84.6 | 9.4 | 5.61 | 40.5 |
| _envr-B3 | 82.4 | 12.1 | 7.26 | 39.8 |

A pixel diff of two identical-build renders: **77-81% of all pixels differ, 5-9% by more than
16/255**, concentrated in the facade rows. `_px` on a pure-sky patch across four A renders:
`rgb 54.2,72.3,92.4` / `48.6,65.2,84.4` / `49.9,66.8,86.3` / `47.6,63.7,82.5` — a 14% swing in R
on unchanged code. The road patch swings 107.9-116.0.

**ROOT CAUSE FOUND, and it is not in my file — `game/post.js:606-621`.** The SSAO hemisphere
kernel and its 4x4 rotation-noise texture are built with **unseeded `Math.random()`** at pass
construction, so every browser process gets a different AO kernel. Proven directly with two
consecutive `probe.mjs` boots of the same tree:

```
node tools/probe.mjs --scene daytime-downtown --w 1920 --h 1080 \
  --expr "(()=>{const s=window.__game.ssao;const n=s._noise.image.data;
           return JSON.stringify({noise:[n[0],n[1],n[4],n[5],n[8]]});})()"
run 1 -> noise [3,156,0,132,13]
run 2 -> noise [102,3,203,25,219]
```

`main.js:305-325` is labelled "deterministic screenshot run" and the sim genuinely is (fixed dt,
seeded rng); **the POST CHAIN is not.** SSAO multiplies ambient over the whole frame, so this is
a global level shift, which is why it lands hardest on `dark%` and `lum`.

**Consequences, and someone must action these:**
- The WAVE-P-BRIEF's "measured run-to-run noise on a frozen tree is +/-0.04" is **false for any
  scene with SSAO on**. It may hold for the metrics it was measured on; it does not hold here.
- **Every single-render row in the wave-o environment table is inside or near this noise band.**
  "canyon MAXED buys +0.9 dark%" (6.9 -> 7.8) is **not resolvable** — do not quote it as a
  measured ceiling. `#air=1` 11.3 vs `#air=0` 11.6 is likewise noise. (The `#air=0` vs shipping
  gap, ~4 points, and the far-sobel numbers, which are edge statistics and much steadier, do
  survive.)
- Environment measurements must be **N>=4 interleaved and reported as means with the range**, not
  as single renders. That is what section 3 does.
- **Fix belongs to whoever owns `post.js`**: seed those two loops (a fixed LCG, or hoist the
  kernel to a module-level constant). One-line-class change, unblocks every piece scored on this
  scene. I did not touch it — not my file.

### 2b. `_facademeas` `dark%` HAS A HAZE-FED DENOMINATOR. NEW COLUMN `darkAll%`.

`dark%` divides by the **non-sky** population, and the sky mask is `(B-R) >= 8 && luma >= 110` —
a blue-and-bright test that the scene's own blue airlight feeds. Reduce the haze and hazed distant
facades stop passing the sky test and re-enter the band: measured, the band population moved
**586282 -> 645045 px** on an identical 1035k-px rectangle within one A/B. So both numerator and
denominator move and `dark%` is **not comparable across any airlight change** — including the
wave-o `#air` table.

Added `darkAll%` = dark pixels / whole band rectangle (sky in the denominator). Same rectangle
for every image, so it is comparable. Reference anchors: dd-01 **10.46**, dd-02 **18.07**,
dd-04 **33.60**.

---

## 3. PAIRED ATOMIC A/B — A,B,A,B,A,B,A,B INTERLEAVED, n=4 EACH

`peer() { md5 game/*.js | grep -v world.js | md5 -q; }` sampled after every render.
Peers held `ab1dd1d95d33...` for A1,B1,A2,B2,A3 and `2658f43373...` for A4,B4.
**A peer moved between A3 and B3, so `_envs-B3` is VOID by rule and is excluded from every mean
below** (it read dark% 9.1 / cSpread 53.32, i.e. it would not have changed the conclusion — stated
so nobody thinks it was dropped for being inconvenient).

`node tools/_facademeas.mjs shots/_envs-{A1,B1,A2,B2,A3,A4,B4}.png --band 0.05,0.55`

| metric | A runs | A mean | B runs | B mean | delta |
|---|---|---|---|---|---|
| dark% | 6.6 8.0 7.6 9.0 | **7.80** | 10.3 9.5 11.5 | **10.43** | +2.6 |
| darkAll% | 3.43 4.48 4.13 5.06 | **4.28** | 6.10 5.56 7.07 | **6.24** | +1.96 (+46%) |
| lum | 91.8 86.4 87.6 85.8 | **87.9** | 83.8 85.0 80.9 | **83.2** | -4.7 |
| sat | .331 .340 .337 .340 | **0.337** | .350 .349 .352 | **0.350** | +0.013 |
| **cSpread** | 43.9 41.6 42.8 41.7 | **42.50** | 54.0 54.1 51.4 | **53.17** | +25% |
| sobel | 12.81 12.60 12.47 12.60 | **12.62** | 13.40 12.95 12.82 | **13.06** | +0.44 |

**Every B run beats every A run on dark%, darkAll% and cSpread with no overlap** (B min 9.5 vs
A max 9.0; B min 5.47 vs A max 5.06; B min 51.4 vs A max 43.9). Given 2a, rank separation across
4 vs 4 is the claim I am willing to make, not the point estimate.

NON-REG, same renders,
`--sky 999,110 --x 0.560,0.750 --band 0.180,0.440`:

| | A1 | A2 | A4 | A mean | B1 | B2 | B4 | B mean | gate |
|---|---|---|---|---|---|---|---|---|---|
| far sobel | 16.38 | 16.39 | 16.51 | **16.43** | 17.78 | 17.16 | 16.95 | **17.30** | 12-22 **HELD** |

`node tools/shadow-ab.mjs` on the shipped build: **road MAD 14.76** (gate >12) **HELD**;
facade 12.86, full 8.74.

SCALE PERSISTENCE (`--normw 960`, earlier clean pair `_envp`, peers `4293ef20...` stable across
all four renders): A 7.4 -> 7.6 and 6.5 -> 6.7; **B 12.4 -> 12.6 and 12.3 -> 12.6** — agreement
within **2.4%**, gate is 10%. **PASS.** As instructed this is not treated as sufficient on its
own; see the crop below.

A second, earlier clean pair (`_envp`, peers stable, n=2) gave a **larger** effect than the n=4
set — dark% 7.4/6.5 -> 12.4/12.3, lum 85.9/86.8 -> 80.0/79.8, far sobel 16.51/16.56 ->
17.53/16.91. It is corroboration only; **the n=4 interleave is the pair of record** and it is the
more conservative of the two. Reporting the smaller number.

STREET BAND `--band 0.38,0.55` (from the `_envp` pair, n=2, so caveated by 2a):
dark% 7.3/6.4 -> **10.8/10.8**, lum 88.7/90.0 -> 84.1/84.2, sat 0.332 -> 0.341.

### CROP — I LOOKED AT IT, AND THE EYE AGREES

`node tools/_cropimg.mjs shots/_envs-{A2,B2}.png /tmp/crop{A,B}.png 60 660 320 740 1.6 100`
(near street wall + shopfront row, ~25-45 m out).

B's near field is genuinely deeper: the awning undersides at x 480-720 go dark instead of
mid-blue, the mullion reveals around the yellow and teal shop windows have a real shadow side,
the left-hand piers separate into a lit and a shaded face, and the parked car's green and the
shopfront teal are visibly more saturated. A is a flat blue-grey wash over the same geometry.
This is the metric and the image moving together. **Honest caveat: the whole frame still reads
cool/teal** — the near-field lift is gone but the residual cast is not, and that is the next gap
(section 6).

---

## 4. TARGETS — HIT / MISSED

| # | target (wave-o) | result |
|---|---|---|
| 1 | `--band 0.05,0.55` dark% >= 18 with lum 83-92 | **MISSED.** 7.80 -> **10.43**, lum 87.9 -> **83.2 (inside the bound)**. Roughly a third of the way. |
| 2 | `--band 0.38,0.55` dark% >= 15 with lum >= 85 | **MISSED.** 6.9 -> 10.8, lum 89.4 -> 84.1 (just under). |
| 3 | scale persistence, dark% within 10% at `--normw 960` | **PASS**, 2.4%. |
| 4 | far-band sobel 12-22 | **HELD**, 16.43 -> 17.30. |
| 5 | `shadow-ab` road MAD > 12 | **HELD**, 14.76. |

**And target 1 as written is UNREACHABLE with every airlight lever at its limit.** Re-derived on
the current tree: shipping 7.6, `#air=3` 7.7, `#air=0` **11.0**, and the wave-o critic's
canyon-maxed + `#air=0` combination reached **16.8** against 24.3 — with the far-band gate
already broken at 24.31. My change gets 10.4 while *keeping* the gate. **The remaining ~8 points
of dark% do not exist anywhere in `world.js`'s atmosphere or occlusion terms.** Recommend the
wave-Q critic retarget dark% to a re-derived, reachable band and move the real ask to section 6.

`AIR_D_START` is not a tuned number: `#airs=30` and `#airs=90` (single renders, so read against
2a's noise) give dark% 10.4 and 10.7 with far sobel 16.57 and 17.76 — the whole 30-90 m range
passes gate 4 and lands in the same place. 55 is the middle of a flat region, not a peak.

---

## 5. PROPOSED REPLACEMENT FOR THE RETIRED `sat` TARGET — `cSpread`, WITH ITS PAIRED CONTROL

Added to `tools/_facademeas.mjs` (new column, nothing removed; `--blk`, default 16 px).
**cSpread** = rg-chromaticity, median-filtered over 16x16 px blocks, then the mean Euclidean
distance of a block from the band's median block, x1000. Blocks that are majority-sky are dropped.

Why it cannot be satisfied by the airlight cast: an additive cast is a **contraction of every
block toward one chromaticity**, so it can only ever SHRINK a spread. `sat` measures distance
from *neutral* — which a uniform blue cast increases. cSpread measures distance from *each
other* — which only distinct paints can increase. rg-chromaticity is intensity-normalised, so it
also cannot be gamed by the exposure/dark% levers.

### PAIRED CONTROL — HAZE HELD IDENTICAL, PAINT SWUNG BOTH WAYS

Three renders in one window, peers `d077724b88c0...` **identical before and after all three**,
same `world.js` except the paint tables:

| build (identical airlight) | `sat` | **cSpread** |
|---|---|---|
| **GREY** — `STYLE_TRIM`+`PAINT_NEUTRAL`+`PAINT_COLOUR`+`PODIUM_TRIM`+fallback all `0xb0b0b0` | **0.395** | **37.53** |
| shipping B | 0.348 | 56.13 |
| **SMOKE** — neutrals+pale podium `0xff00ff`, all trim+fallback `0x00ff00` | 0.430 | 66.43 |

**cSpread is monotone in paint with the haze frozen: 37.5 / 56.1 / 66.4.** `sat` is not — and the
GREY row is a fresh, independent, third disproof of it: **painting every mass in the city one flat
grey RAISES band sat by +0.047**, which is more than the entire Wave N palette edit could move it
and is over half the +0.082 that the full magenta/green cartoon achieves. `sat` cannot distinguish
a screaming cartoon from uniform grey. Do not reinstate it.

Haze sensitivity of cSpread, stated honestly: `#air=0` on build A gives 62.76 vs 41.56 shipping.
Haze does raise it — in the correct direction (haze genuinely destroys architectural colour), and
by less than the paint controls swing it. It is not invertible the way `sat` is.

**PROPOSED TARGET: `_facademeas --band 0.05,0.55` cSpread >= 90.**
Anchors, measured this round on 1920-normalised references: **dd-01 163.01, dd-02 131.76,
dd-04 128.14**; ours 42.50 -> **53.17**. Unlike `sat` (whose entire lever measured +0.046 in Wave
N and +0.082 here) this metric has enormous headroom and the smoke test does **not** saturate it,
so it can actually be driven. 90 is a deliberately sub-reference first step; the wave-Q critic
should re-derive it.

**Companion, also proposed: `darkAll%` >= 9** (dd-01 10.46, dd-02 18.07; ours 4.28 -> 6.24),
replacing raw `dark%` for anything that touches atmosphere — see 2b.

---

## 6. TO RETIRE / RESTATE, AND THE BIGGEST REMAINING GAP

**RETIRE (new):** the wave-o table's `canyon MAXED = +0.9 dark%` ceiling — not because the
conclusion is wrong (occlusion is still not the lever) but because the measurement is inside the
noise band proven in 2a. Restate it as "unresolvable at n=1; re-measure at n>=4 if anyone wants
to reopen it."

**RESTATE:** `_facademeas dark%` -> `darkAll%` for any atmosphere comparison (2b).
**CONFIRM RETIRED, third proof:** `_facademeas` band `sat` (5, GREY row).

**BIGGEST REMAINING ENVIRONMENT GAP — the frame is still tinted, and the tint is no longer the
airlight.** With the near-field haze removed the crop still reads uniformly cool teal: the near
storefronts, piers and the parked car all sit on the same blue-green axis. The airlight is now
distance-gated, so what remains is the **indirect fill's own colour**, `FILL_FRAG` at
`world.js:802-843` driven by `uFillSky (0.60,0.77,1.10)` / `uFillGnd (1.00,0.90,0.74)` /
`uFillK 0.78` at `world.js:2894-2898`, plus `uBounce (0.052,0.062,0.082)` and `uReflect 0.55`
feeding the Fresnel tint at `:910`. That is a **multiplicative** term on the indirect lobes, so
unlike the airlight it cannot be split by distance — it applies the same blue to a 25 m shopfront
and a 200 m tower. cSpread is the metric that will see it move (42.5 -> 53.2 so far against
128-163) and `darkAll%` is the one that will see the value structure. **Next round: the fill
tint's chromatic spread, not its amount** — measured with cSpread, with the GREY/SMOKE pair above
as the standing control.

**Blocking dependency, route to the orchestrator:** `post.js:606-621`'s unseeded `Math.random()`
(2a). Until it is seeded, every environment number costs 8 renders instead of 2.

## 7. WHAT I DID NOT DO

- Did NOT touch `uCanyon` / `uShadeAmt` (retired lever) or any paint table.
- Did NOT touch `game/sky.js` or `game/post.js`. The post.js defect is reported, not fixed.
- Did NOT chase band `sat`.
- Did NOT re-run the street-band (target 2) measurement at n=4; it rests on the n=2 `_envp` pair
  and should be re-derived under 2a's discipline.
