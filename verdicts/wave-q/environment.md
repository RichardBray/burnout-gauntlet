# WAVE Q CRITIC — environment (auditing `verdicts/wave-p/environment.md`)

VERDICT: real wins

---

## 0. PROVENANCE OF EVERY NUMBER BELOW

Tree audited: `game/world.js` md5 **`023e9cd05d5b6757112340855d21390a`** (= the builder's declared
post-edit md5), peer hash `md5 game/*.js | grep -v world.js | md5 -q` =
**`8f018c0b9edc7f629a318a2b5d479b4d`**, sampled before and after every render in this report and
held constant throughout. `./tools/lint.sh` -> `lint ok` at start and as the last action.
`world.js` was restored to `/tmp/world.SHIPPED.js` and md5-verified after each of the seven
file-edited arms below.

Scene: `daytime-downtown`, midday preset, scene-default camera (chase cam looking down a
boulevard), `node tools/shot.mjs --scene daytime-downtown --w 1920 --h 1080` unless stated.

**TOOL REVISIONS USED — stated per the peer-md5 rule, which this round applies to `tools/` too:**

| tool | md5 | used for |
|---|---|---|
| `tools/_facademeas.mjs` | `4412a587af7e1b8bd73c63710e03ad3e` | every band/cSpread/darkAll figure |
| `tools/_stripemeas.mjs` | `664493f70bddbeac7728c99a0e913686` | every `anisAC3` figure (§7) |
| `tools/shot.mjs` | `254bfc30aed36d83935d49dd6d70329d` | all `daytime-downtown` renders |
| `tools/_carpaint-eval-shot.mjs` | `6a2879ac49cf8f843b05a8c55100d692` | all live-override renders |
| `tools/shadow-ab.mjs` | `f9c8d6453515d088f207621f3fd40e31` | road-MAD gate |
| `tools/_cropimg.mjs` | `df45028c577131d33ab5f08edce86738` | crops |
| `tools/_px.mjs` | `be244cafe4297b22429622ab63fe0833` | **NOT USED.** See below. |

**On the `_px` mid-sweep mutation:** the revision on disk is the post-mutation one — `sat` has been
split into `meanCast` (the old, proven-broken mean-cast number) and a new per-pixel `satPx`
(`_px.mjs:44-69`, printed at `:82`). **I deliberately used `_px` for nothing in this report**, so no
figure here depends on which side of that mutation you are on. Any figure quoted from a wave-P or
earlier report that reads "`_px ... sat`" is a `meanCast` number and must be relabelled before reuse.

**MTIME AUDIT (the fault the road critic found in its own piece) — CHECKED, PAIR SURVIVES.**
`game/world.js` mtime is `3 Aug 07:26:57` (now `07:56:59` after my own edit-and-restore cycles);
the `_envs-{A,B}1..4` renders of record are `06:38:50-06:39:22` and `shots/environment-p1.png` is
`06:41:47`. **The file WAS saved after its pair was rendered.** Every file in `game/` carries a
`07:20-07:33` mtime, which is the signature of the other wave-Q critics' edit-and-restore arms, not
of a content change. Content is decisive and it clears: the md5 equals the builder's declared
post-render md5, and — see §2 — a fresh render of the shipped bytes on the CURRENT tree reproduces
the B leg. **The pair is not discarded.** The general rule still stands: mtime alone is not
evidence either way; the md5 plus a reproducing render is.

---

## 1. THE BLIND CALL, AND WHAT DECIDED IT

Camera situation: our render is a chase cam looking straight down a downtown boulevard. The
reference with that camera situation is **`daytime-downtown-02`** ("Downtown street canyon looking
down a boulevard"); `-01` is the nearest match for lighting (high noon). I compared against both.
(`reference/INDEX.md` calls `-04` "hazy bright day"; **it is not** — `-04` is a dusk/blue-hour frame
with a near-black sky. Noted in §9, because four waves of anchors have been taken from it.)

Crops, both `_cropimg.mjs ... 1.4 60`, both a near-to-mid facade row at comparable metres-per-pixel:
ours `shots/qc-env-1.png 1150 1900 20 500`, ref-01 `/tmp/ref01.png 1150 1900 260 740`
(`sips -Z 1920` first).

**In the reference crop I can count seven mutually unrelated chromaticities inside one 750x480 box:
a saturated green curtain-wall slab, an orange billboard, a green-and-yellow awning fascia with
bunting, red spandrel panels, white stucco, a rubble-stone plinth, a blue car — and hard black
inside the awning and the storefront. In ours, five buildings differ ONLY in the tint of the same
grey (cool grey, warm grey, pink-grey, cream), every one of them carries the identical window
rhythm and the identical cornice profile, and the darkest thing in the crop is a mid blue-grey.**

That decided it before any number. Our facade band is one prism repeated with the hue randomised.
It is not close, and `cannot tell` is not available.

The builder's own crop claim (§3 of its report) is honest and I reproduce it — the awning undersides
and mullion reveals in B genuinely do go dark where A had a flat blue wash. That is a real
improvement inside a frame that still loses the blind comparison on a different axis.

---

## 2. THE DETERMINISM FIX — INDEPENDENTLY VERIFIED, AND IT IS DETERMINISM ONLY

Every number in this report rests on it, so I re-derived it from scratch.

**Code (`game/post.js` md5 `21160a8f42b2ad03dadc4f8dbdc57f46`):** `SSAO_SEED = 0x5A0A5EED` at
`post.js:470`, `const rng = makeRng(SSAO_SEED)` at `:618`, three `rng()` draws at `:622` on the same
intervals (`*2-1`, `*2-1`, `*0.92+0.08`), `const a = rng() * Math.PI * 2` at `:632`. `makeRng` is
`util.js:8-16`, the existing mulberry32. `SSAO_KERNEL = 20` (`:458`) and every tuning constant at
`:601-609` unchanged. `grep -rn "Math\.random" game/` returns **five hits and all five are
comments** (`util.js:4`, `post.js:462`, `car.js:24`, `camera.js:188`, `damage.js:30`). Confirmed
exhaustive.

**Empirical, my own two cold boots on the current tree:**

```
node tools/shot.mjs --scene daytime-downtown --w 1920 --h 1080 --out shots/qc-env-{1,2}.png
node tools/_facademeas.mjs shots/qc-env-1.png shots/qc-env-2.png --band 0.05,0.55
```

| run | sobel | strong% | sat | lum | dark% | darkAll% | cSpread | sky% | band px |
|---|---|---|---|---|---|---|---|---|---|
| qc-env-1 | 12.99 | 13.9 | 0.351 | 82.5 | 10.8 | 6.47 | 53.01 | 40.2 | 619694 |
| qc-env-2 | 12.99 | 13.9 | 0.351 | 82.5 | 10.8 | 6.47 | 53.01 | 40.2 | 619694 |

**Identical to the last digit, including the integer band-pixel count** — and identical to the
`post-determinism.md` §5 line, measured by a different agent on a tree whose peer hash has since
moved. PNG md5s still differ (`85ccdda5…` / `9e29eb99…`), consistent with the reported ~100-pixel
GPU-side residual. **CONFIRMED.**

**DETERMINISM-ONLY, NOT A QUALITY CHANGE — the after-value lands strictly inside the 6-run
before-range on all four metrics the brief named, and none is at an edge:**

| metric | before range (n=6, unseeded) | after | percentile |
|---|---|---|---|
| dark% | 7.3 – 11.6 | **10.8** | 81st | inside |
| darkAll% | 4.22 – 7.19 | **6.47** | 76th | inside |
| lum | 80.4 – 86.7 | **82.5** | 33rd | inside |
| cSpread | 51.41 – 55.68 | **53.01** | 37th | inside |

**CONFIRMED as a determinism change.** The wave-P environment builder found the biggest defect of
the wave, in a file it does not own, and correctly refused to edit it. That is the behaviour to
reward and I am recording it as such.

**Consequence I am acting on, and every later critic should:** the builder's own A/B pair
(`_envs-*`, rendered `06:38-06:39`) PREDATES the fix (`post.js` mtime `06:55:28`). All eight of its
renders were made with the unseeded SSAO, which is why it needed an n=4 interleave. I re-ran the
whole thing as a deterministic n=1 pair. See §4.

---

## 3. RULE 5 — CLEAN. AND THE RENORMALISATION ALGEBRA — **THE NUMBER IS RIGHT, THE ARGUMENT IS WRONG.**

Every literal greped against the tree:

| claimed | tree | status |
|---|---|---|
| `world.js:896 AIR_GAIN 6.0 -> 8.2` | `:896 const AIR_GAIN = 8.2;` | OK |
| `world.js:897 AIR_D_START — -> 55.0` NEW | `:897 const AIR_D_START = 55.0;` | OK |
| `world.js:902 AIR_D_MAX 0.0105 -> 0.0144` | `:902 const AIR_D_MAX = 0.0144;` | OK |
| `world.js:895 AIR_D0_FALLBACK 0.0016` UNCHANGED | `:895` `0.0016` | OK |
| `world.js:898 AIR_W 0.85` UNCHANGED | `:898` `0.85` | OK |
| `world.js:778` `uniform float uHazeS;` | `:778`, in `ATMO_DECL` | OK |
| `world.js:954` the two-line `de`/`fq` form | `:954-955`, verbatim as quoted | OK |
| `world.js:1021 _airStart = hashNum('airs', AIR_D_START)` | `:1021` | OK |
| `world.js:1052 atmo.uHazeS { value: AIR_D_START }` | `:1052` | OK |
| `world.js:2922 atmo.uHazeS.value = _airStart` | `:2922` | OK |
| no paint table / `uCanyon` / `uShadeAmt` / `uFillK` touched | `:1251 :1327 :1338 :1346` all as quoted; `:2953-2956` midday canyon block untouched | OK |

**RULE-5 STATUS: CLEAN.** No unexplained edit in `world.js`. No comment read as evidence.

### 3a. THE ALGEBRA. I RE-DERIVED IT AND THE 200 m FIXED POINT IS REAL.

`de(200; S=55) = 200 - 55(1 - e^{-200/55}) = 146.4507 m`.
`0.0016 x 8.2 x 146.4507 = 1.92141` against `0.0016 x 6.0 x 200 = 1.92000`. Agreement 0.07%.
Numerically solving `G_new de(d) = G_old d` puts the crossover at **d = 199.55 m**. The preset clamp
holds too: `0.0144 x 146.45 = 2.1089` against `0.0105 x 200 = 2.1000`.
**The renormalisation is arithmetically what it claims to be.**

### 3b. BUT "de <= dist, SO NO TERM GAINS RANGE — RULE 4 SATISFIED BY CONSTRUCTION" IS **FALSE.**

The builder compared `de` against `dist`. The quantity that reaches the consumer is `uHazeD * de`,
and `uHazeD` went up 1.367x at the same time. The correct comparison is
`tau_new/tau_old = 1.3667 x de(d)/d`, which **rises monotonically to 1.3667 as d -> infinity.**

| d (m) | tau_old | tau_new | mix_old | mix_new | delta |
|---|---|---|---|---|---|
| 30 | 0.2880 | 0.0902 | 0.2127 | 0.0733 | **-0.1394** |
| 46.5 | — | — | — | — | **-0.1532** (max near-field relief) |
| 190 | 1.8240 | 1.7940 | 0.7128 | 0.7087 | -0.0042 |
| **200** | 1.9200 | 1.9214 | 0.7254 | 0.7256 | **+0.0002** (fixed point) |
| 250 | 2.4000 | 2.5661 | 0.7729 | 0.7847 | +0.0118 |
| **291.5** | — | — | — | — | **+0.0137** (max excess) |
| 500 | 4.8000 | 5.8385 | 0.8430 | 0.8475 | +0.0045 |
| 1200 | 11.520 | 15.022 | 0.8500 | 0.8500 | 0.0000 (both clamped by AIR_W) |

**Everything beyond 199.55 m gets MORE haze than the old form, not less, and the optical depth
gains 1.367x of range asymptotically.** The mix consequence is small — peak `+0.0137` at 292 m,
decaying to zero as `1-exp` saturates into the `AIR_W = 0.85` ceiling — so this is **a defect in the
argument, not a shipped regression.** It is exactly the shape the brief warned me about: a
"renormalisation" that quietly raises a gain 1.37x, with the rule-4 clearance written against the
wrong pair of quantities.

**Binding restatement for the next builder:** a renormalisation holds ONE point fixed. It does not
make a gain harmless. State which point is held and give the ratio at the two extremes of the
domain — here `0.09x` at 30 m and `1.367x` at infinity.

### 3c. THE VOIDED LEG AND THE SURVIVING LEGS — CONFIRMED, AND THE WHOLE SET IS NOW MOOT

The builder voided `_envs-B3` because a peer moved between A3 and B3, and disclosed its value. I
re-measured all eight `_envs` PNGs with the current tool (`4412a587…`) and reproduce its table to
the decimal, including the excluded row (B3: dark% 9.1, cSpread 53.32 — the builder's disclosure is
accurate and its exclusion was conservative, not convenient). Surviving legs A1/A2/A3/A4 and
B1/B2/B4 confirmed. **But all eight renders predate the SSAO seed (§2), so the whole interleave is
superseded by the single deterministic pair in §4.** I am not scoring the piece on it.

---

## 4. THE A/B, RE-RUN DETERMINISTICALLY AS AN n=1 PAIR

The A leg is reachable exactly through the URL levers the builder installed — `uHazeS = 0` makes
`de = dist` identically, so `#air=6&airmax=0.0105&airs=0` is the pre-edit shader bit-for-bit:

```
node tools/shot.mjs --scene daytime-downtown --w 1920 --h 1080 \
  --hash "air=6&airmax=0.0105&airs=0" --out shots/qc-env-A.png
node tools/_facademeas.mjs shots/qc-env-{A,1}.png --band 0.05,0.55
```

Rendered twice; `qc-env-A` and `qc-env-A2` printed identical lines. Peer held `8f018c0b…`.

| metric | A (pre-edit) | B (shipped) | delta | builder's n=4 claim |
|---|---|---|---|---|
| dark% | 7.9 | **10.8** | +2.9 | +2.6 ✓ |
| darkAll% | 4.33 | **6.47** | +2.14 (+49%) | +1.96 (+46%) ✓ |
| lum | 87.0 | **82.5** | -4.5 | -4.7 ✓ |
| cSpread | **42.50** | **53.01** | +10.5 (+25%) | 42.50 -> 53.17, +25% ✓ |
| sobel | 12.56 | 12.99 | +0.44 | +0.44 ✓ |
| band px | 566271 | 619694 | **+9.4%** | see §5 |

**Every claim in the builder's headline table reproduces at zero measurement noise, and its A-leg
cSpread mean of 42.50 lands on my deterministic A leg to the second decimal.** The effect is real
and its size was not overstated.

GATES, same pair, `--sky 999,110 --x 0.560,0.750 --band 0.180,0.440`:
far-band sobel A **16.50** -> B **17.41**, gate 12-22 **HELD**.
`node tools/shadow-ab.mjs` on the shipped tree: road MAD **14.8242** (gate >12) **HELD**;
facade 12.44, full 8.65.

STREET BAND `--band 0.38,0.55`: dark% 7.3 -> **9.2**, darkAll% 4.72 -> **6.27**, lum 90.1 -> 86.9,
cSpread 46.53 -> 51.88. (The builder's n=2 `_envp` figure of 10.8 was an unseeded-SSAO high draw;
the true value is 9.2. Target 2 is missed by more than the builder reported.)

SCALE PERSISTENCE — **and the builder's version of this test is weaker than it looks.** It
downsampled the 1920 PNG with `--normw 960`; that is a resampling test, not a rendering test. I did
both:

| | A | B | delta |
|---|---|---|---|
| 1920 native | 7.9 | 10.8 | **+2.9** |
| 1920 PNG, `--normw 960` (builder's method) | 8.2 | 11.1 | **+2.9** |
| **960 native render** | 6.0 | 8.9 | **+2.9** |

Absolute `dark%` is NOT scale-stable (10.8 vs 8.9 native = 17.6% disagreement, outside the 10%
gate). **The DELTA is, to within 0** — and cSpread's delta likewise (+10.5 at 1920, +10.8 at 960
native). **PASS on the effect, FAIL on the absolute.** Restated in §8: run scale persistence on the
A/B delta, natively rendered, not on a downsampled absolute.

---

## 5. `darkAll%` AND THE HAZE-FED DENOMINATOR — **CONFIRMED, ON MY OWN PAIR**

`dark%` divides by the non-sky population; the sky mask is `(B-R) >= 8 && luma >= 110`, a
blue-and-bright test the scene's own blue airlight feeds. On my deterministic pair, on an identical
1035720-px rectangle, the band population moves **566271 -> 619694 px (+9.4%)** across nothing but
an airlight change, and `sky%` moves 45.3 -> 40.2. On the `#air=0` arm it reaches **831351 px**, a
47% swing in the denominator. **Both numerator and denominator move with the thing being measured.
Confirmed. `dark%` is not comparable across any airlight change, including the entire wave-O `#air`
table, and `darkAll%` (fixed rectangle) is the correct replacement.**

---

## 6. TOOL AUDIT (the one budgeted) — `cSpread`, WITH FIVE PAIRED CONTROLS. **ACCEPTED AS A METRIC, TARGET REJECTED.**

### 6a. The four controls the metric must pass — it passes all four

All on `shots/qc-env-1.png` unless stated. Image-space controls via `/tmp/qc-imgop.mjs` (luma-
preserving saturation scale about `0.2126/0.7152/0.0722`, or an additive mix toward the haze colour).
Scene-space controls are file-edited `world.js` arms, rendered, then restored and md5-verified.

| control | what it forces | `sat` | **cSpread** | reading |
|---|---|---|---|---|
| saturation x0 | zero chroma | 0.000 | **0.89** | **correct null** |
| additive blue cast, 35% toward `(140,158,184)` | the airlight, maximally | 0.280 | **25.46** | **correct contraction (-52%)** |
| **GREY** — `STYLE_TRIM`+`PAINT_NEUTRAL`+`PAINT_COLOUR`+`PODIUM_TRIM`+fallback all `0xb0b0b0` | paint removed, haze frozen | **0.391** | **38.41** | |
| shipping | — | 0.351 | **53.01** | |
| **SMOKE** — neutrals+podium `0xff00ff`, trim+fallback `0x00ff00` | paint maxed, haze frozen | 0.454 | **80.24** | **monotone 38.4 / 53.0 / 80.2** |

**cSpread is monotone in paint with the haze frozen, has a correct null, and contracts under an
additive cast. It is a valid replacement for `sat`. ACCEPTED.**

**`sat` RETIRED — FOURTH INDEPENDENT DISPROOF, mine.** Painting every mass in the city one flat
grey **RAISES** band `sat` 0.351 -> **0.391 (+0.040)**, while cSpread correctly falls 53.01 ->
38.41. `sat` cannot distinguish a grey city from a coloured one, and it moves the wrong way. It is
now disproved by: the `#air=0` inversion (wave O), the constant-max and constant-luminance palette
variants (wave N), the wave-P GREY row, and this one. **Do not reinstate it under any name.**

### 6b. TWO OF THE BUILDER'S CLAIMS ABOUT cSpread ARE FALSE

1. **"rg-chromaticity is intensity-normalised, so it cannot be gamed by the exposure/dark% levers"
   — FALSE.** A flat `x0.7` gain moves cSpread 53.01 -> **44.48 (-16%)** (and `darkAll%` 6.47 ->
   **14.94**, `dark%` 10.8 -> 18.3). Quantisation and black clipping break the normalisation at low
   codes. **Corollary that matters more: the proposed companion target `darkAll% >= 9` is
   satisfiable by pulling exposure 30% and nothing else. It must carry a `lum` hold.**
2. **cSpread is LINEAR IN A GLOBAL CHROMA GAIN, so the target is satisfiable by a saturation knob
   with zero architectural change:**

| global saturation gain | `sat` | cSpread |
|---|---|---|
| x1.0 (shipping) | 0.351 | 53.01 |
| x1.5 | 0.479 | **79.37 (+50%)** |
| x2.0 | 0.577 | **99.86 (+88%)** |

**`cSpread >= 90` is reachable by a post-process saturation gain of x1.85 applied to the shipped
frame.** That is the sixteen-times trap in its purest form and it has to be closed before the
target is issued.

### 6c. THE CLOSURE — `cSpreadR`, AND IT IS GAIN-INVARIANT (verified)

Report cSpread **paired with the GREY arm on the same tree**, and quote the ratio
`cSpreadR = cSpread(shipping) / cSpread(GREY)`. A global chroma gain multiplies BOTH arms by the
same factor and cancels:

| arm | cSpread | under x1.5 saturation | factor |
|---|---|---|---|
| GREY | 38.41 | 56.34 | x1.467 |
| shipping | 53.01 | 79.37 | x1.497 |
| SMOKE | 80.24 | 120.68 | x1.504 |
| **cSpreadR (shipping/GREY)** | **1.380** | **1.409** | **+2.1% — invariant** |
| cSpreadR (SMOKE/GREY) | 2.089 | 2.142 | +2.5% — invariant |

**`cSpreadR` is invariant to a global chroma gain to within 2.5% and spans 1.38 (shipping) to 2.09
(max cartoon). It has NO external anchor** — you cannot render a photograph with grey paint — so it
is an internal A/B statistic only. Raw cSpread carries the external anchor. Quote both.

**Honest caveat, found by running the control on my own proposed fix (§7a): the spectral airlight
raises raw cSpread 53.01 -> 61.52 but moves cSpreadR 1.380 -> 1.311, because the chroma it recovers
is in the LIGHT (warm sunlit faces vs cool sky-lit ones), not in the paint. cSpreadR is a
paint-attribution statistic, not a quality statistic.** It must be issued as a required companion
diagnostic, not as a hard pass/fail hold — otherwise it scores a good fix as a regression, which is
the mistake `_stripemeas.anis` made for three waves.

### 6d. THE PROPOSED TARGET `cSpread >= 90`: **REJECTED — UNREACHABLE INSIDE THE GATES, AND ONE-SIDED**

The brief is right that every one-sided target this round has had to be restated. This one also
fails on reachability, which is worse:

| arm | cSpread | far-band sobel (gate 12-22) |
|---|---|---|
| shipping | 53.01 | 17.41 HELD |
| SMOKE (every mass magenta/green) | **80.24** | — |
| `#air=0` (airlight deleted) | 62.39 | **24.12 BROKEN** |
| **SMOKE + `#air=0`** (every lever at its extreme) | **102.60** | **24.00 BROKEN** |

**With the far-band gate held, the ceiling of every lever in `world.js` combined is 80.24. The
proposed 90 sits above it.** It is reachable only at `#air=0`, which breaks the gate — i.e. the
target is `sat >= 0.48` all over again: a number set above the demonstrated ceiling of the lever it
is meant to drive. Retire it unissued.

The builder also quoted only three of the four references. **`daytime-downtown-03` measures
cSpread 74.23** — below the proposed target. The real reference span is **74.23 – 163.01**, not
128-163.

| reference | camera | cSpread | band `sat` |
|---|---|---|---|
| dd-01 | high noon, downtown intersection | **163.01** | 0.551 |
| dd-02 | boulevard canyon (our camera situation) | **131.76** | 0.501 |
| dd-03 | downtown block, bright day | **74.23** | 0.373 |
| dd-04 | dusk, low three-quarter | **128.14** | 0.556 |
| **ours** | — | **53.01** | 0.351 |

**And most of the raw gap is a global chroma gain, not architecture.** References sit at `sat`
0.37-0.56 against our 0.35. Scaling our chroma to `sat` 0.577 (x2.0) alone takes cSpread to 99.86 —
about 65% of the distance to dd-04. That gain lives in the output grade, not in `world.js`. Do not
brief environment to close it.

### 6e. THE SUB-METRIC THAT ACTUALLY LOCATES THE PROBLEM — block-distance DISTRIBUTION

cSpread is a mean. Its distribution says something the mean hides. Same construction (16 px blocks,
rg-chromaticity block-median, distance from the band median x1000, majority-sky blocks dropped),
reported as quantiles:

| frame | p50 | p90 | p99 | %blocks > 60 | %blocks > 120 |
|---|---|---|---|---|---|
| **ours** | **29.8** | 122.5 | 186.2 | 36.4 | 10.6 |
| dd-01 | 93.4 | 346.2 | 775.2 | 64.9 | 41.8 |
| dd-02 | 85.9 | 326.2 | 774.2 | 69.4 | 30.7 |
| dd-03 | **56.0** | **125.1** | 390.1 | 46.7 | 11.2 |
| dd-04 | 113.6 | 214.0 | 410.5 | 80.2 | 48.1 |
| ours, SMOKE | 52.5 | 183.2 | 285.7 | 46.9 | 30.2 |

**Our p90 (122.5) is already inside dd-03's (125.1). Our p50 (29.8) is half of dd-03's and a
quarter of dd-04's.** The deficit is not "we lack a few hero masses" — it is that **half our facade
band lies within 30 milli-units of a single chromaticity.** That is the "one prism repeated with the
hue randomised" reading from §1, quantified, and it is a BULK property, which is why a palette edit
that adds a few chromatic heroes has twice failed to move the headline number.

---

## 7. THE BIGGEST REMAINING GAP — FOUND, AND PROVED WITH A ONE-LINE FIX

### 7a. FIRST: THE BUILDER'S NOMINATED GAP IS THE WRONG OBJECT. REFUTED.

The builder nominates the multiplicative fill tint — `FILL_FRAG` at `world.js:802-843`, driven by
`uFillSky (0.60,0.77,1.10)` / `uFillGnd (1.00,0.90,0.74)` / `uFillK 0.78` at `world.js:2929-2933`,
plus `uBounce (0.052,0.062,0.082)` and `uSkyWarm` at `:2955-2959` — as the carrier of the residual
cool cast, and says cSpread is the metric that will see it move.

**I tested exactly that. It moves nothing.** File-edited arm, midday branch only, every chromatic
fill term replaced by an achromatic one at matched luminance: `uFillSky -> (0.823,0.823,0.823)`,
`uFillGnd -> (0.880,0.880,0.880)`, `uSkyWarm -> luma(_fogC) x 1.15`, `uBounce -> (0.0653)^3`.
Rendered, then restored and md5-verified.

| arm | sobel | sat | lum | dark% | darkAll% | **cSpread** |
|---|---|---|---|---|---|---|
| shipping | 12.99 | 0.351 | 82.5 | 10.8 | 6.47 | **53.01** |
| **FILL FULLY ACHROMATIC** | 13.05 | 0.349 | 82.7 | 10.8 | 6.46 | **53.10 (+0.17%)** |

**Deleting the entire chromatic content of the indirect fill changes the frame by 0.17% of one
metric and nothing else.** The fill tint is not the carrier. This is the seventh
"the diagnosis was reading the wrong object" find in this project. **Do not issue it.**

### 7b. THE ACTUAL MECHANISM — `world.js:954-956`: THE AIRLIGHT IS ACHROMATIC EXTINCTION

```glsl
float de = dist - uHazeS * (1.0 - exp(-dist / max(uHazeS, 1e-3)));
float fq = 1.0 - exp(-uHazeD * de);                                    // <-- ONE scalar
gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(fq * uHazeW, 0.0, 1.0));
```

**`fq` is a single float applied identically to R, G and B.** Real aerial perspective is not: Rayleigh
extinction goes as lambda^-4, so over the same path the red channel is attenuated roughly 0.45x as
hard as the blue. A scalar `fq` extinguishes a terracotta facade's red at exactly the rate it
injects the haze's blue, so every mass converges on one chromaticity at the same rate — which is
precisely the low-p50 signature in §6e. `de` fixed *when* the convergence starts. It did not fix
*that everything converges to the same point*.

**PROVED. One line, no new constants, per-channel densities normalised on green so the mean is
held (`kq = vec3(0.625, 1.0, 1.389)` = the lambda^-4 ratio at 610/550/450 nm, /0.72):**

```glsl
vec3 kq  = vec3(0.625, 1.0, 1.389);
vec3 fq3 = 1.0 - exp(-uHazeD * kq * de);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(fq3 * uHazeW, 0.0, 1.0));
```

File-edited arm, rendered, restored, md5-verified. `kq` is **not tuned** — it is the textbook ratio,
first try.

| arm | sobel | sat | lum | dark% | darkAll% | **cSpread** | block p50 | **far-band sobel** |
|---|---|---|---|---|---|---|---|---|
| shipping | 12.99 | 0.351 | 82.5 | 10.8 | 6.47 | **53.01** | 29.8 | 17.41 **HELD** |
| **SPECTRAL (1 line)** | 13.05 | 0.398 | 83.7 | 10.7 | 6.51 | **61.52** | **42.8** | **17.80 HELD** |
| `#air=0` (airlight deleted) | 17.17 | 0.335 | 85.1 | 12.2 | 9.78 | 62.39 | 50.1 | 24.12 **BROKEN** |

**A one-line spectral split recovers 91% of the cSpread that deleting the airlight entirely
recovers (+8.51 of +9.38) and 62% of the block-p50 recovery (+13.0 of +20.3) — while holding the
far-band sobel gate, holding `lum` (+1.2), holding `dark%` (-0.1), `darkAll%` (+0.04) and `sobel`
(+0.06).** Deleting the airlight breaks the gate at 24.12. Far-band cSpread specifically moves
20.06 -> **28.59**, so the recovery is genuinely at mid and far range, which is where the
distance-split fix could not reach.

**BIGGEST REMAINING GAP: `world.js:955` — `float fq = 1.0 - exp(-uHazeD * de)` is a SINGLE
ACHROMATIC extinction coefficient. Every mass in the frame converges on one chromaticity at the
same rate regardless of its own colour, which is why half the facade band sits within 30
milli-units of a single point (p50 29.8 against dd-03 56.0, dd-04 113.6). A per-channel `kq`,
normalised on green so the mean is unchanged, is one line and buys cSpread 53.01 -> 61.52 with
every gate held.**

---

## 8. THE CROSS-PIECE PIER TARGET — REPRODUCED EXACTLY, AND **THE PRESCRIBED LEVER IS THE WRONG ONE**

### 8a. Reproduction — to the last digit

`node tools/_carpaint-eval-shot.mjs`, scene `car-paint-closeup`, live override
`paintMat.clearcoatRoughness = liveryMat.clearcoatRoughness = 0.090` then `car.refreshEnv()`.
`world.group.children[141]` logs as `Mesh` `count 44` — the InstancedMesh built at
`world.js:2712-2717`, 44 cylinders r 1.5-1.7, 11.6 m tall, exact 60 m pitch, at `z = HZ-62`.
Measured `node tools/_stripemeas.mjs <png> 0.1094 0.1563 0.6111 0.6852`.

| arm | anisAC3 | anisAC1 | resRMS | mean |
|---|---|---|---|---|
| baseline | **0.271** | 0.050 | 5.73 | 80.9 |
| **child 141 hidden** | **0.097** | -0.006 | 5.84 | 83.2 |

**Identical to the car-paint critic's 0.271 -> 0.097 / 5.73 -> 5.84 / 80.9 -> 83.2. CONFIRMED.**

### 8b. Two corrections to the finding as written

**"No visible pixel changed in the frame" is FALSE.** Hiding the mesh changes **11.06%** of the
frame's pixels, **0.20%** of them by more than 8/255, max channel delta **51**. The >8/255 region is
bounded by x 222-1718, y 383-742 — the car's body. The correct statement is: *no pixel outside the
car's env-mapped materials changes, and the change on the car reaches 51/255.* That distinction
matters because the next agent will use "pixel-unchanged" as a licence to delete the mesh.

**Deleting it is NOT free — the pier row contributes to three other scenes.** Hiding
`children[141]` and diffing against the unmodified frame:

| scene | pixels differing | >8/255 | max delta |
|---|---|---|---|
| `dusk-highway-chase` | 1.62% | **0.68%** | **146** |
| `crash-cam` | 2.24% | **0.79%** | 72 |
| `daytime-downtown` | 3.04% | 0.17% | 68 |

**Do not delete the mesh.**

### 8c. **THE PRESCRIBED LEVER IS MEASURABLY THE WEAKEST ONE, AND HALF OF IT IS A NULL**

The car-paint critic prescribes "jitter the spacing (e.g. +/- 8-12 m), or vary height/radius per
pier, or both". I tested all of it, live, seeded mulberry32 on the instance matrices, then
`refreshEnv()`:

| arm | **anisAC3** | resRMS | mean | vs base |
|---|---|---|---|---|
| baseline (44 @ exact 60 m, r 1.5-1.7, h 11.6) | **0.271** | 5.73 | 80.9 | — |
| jitter x +/-8 m | 0.226 | 5.69 | 81.1 | **-17%** |
| jitter x +/-15 m | 0.223 | 5.70 | 81.0 | -18% |
| jitter x +/-24 m (40% of pitch — periodicity destroyed) | 0.226 | 5.65 | 81.0 | **-17%, no further gain** |
| **per-pier height x0.85-1.15 and radius x0.75-1.25** | **0.275** | 5.76 | 81.0 | **+1% — NULL** |
| every 2nd pier removed (22 @ 120 m) | 0.173 | 5.77 | 82.0 | -36% |
| height x0.35 | 0.140 | 5.75 | 82.2 | -48% |
| merged into a continuous wall (radius x18) | 0.187 | **4.18** | **67.9** | **CONFOUNDED** — -27% resRMS, -16% mean |
| **radius x0.5** | **0.151** | 5.75 | 82.2 | **-44%** |
| radius x0.5 + jitter +/-12 m | 0.155 | 5.70 | 82.1 | -43% (jitter adds nothing on top) |
| **radius x0.45 + jitter +/-12 m + every 3rd pier dropped** | **0.130** | 5.76 | 82.4 | **-52%** |
| child 141 hidden (floor) | 0.097 | 5.84 | 83.2 | -64% |

**Jitter saturates at -17% by +/-8 m and buys nothing more out to +/-24 m — going from a perfect 60 m
comb to no periodicity at all does not improve on the first 8 m of jitter.** Per-pier height/radius
*variation* is a clean null (0.275 vs 0.271). **The carrier is not the 60 m pitch. It is the
occluded solid angle:** `anisAC3` tracks how much of the flank's specular hemisphere the row blocks
(hidden 0.097, h x0.35 0.140, r x0.5 0.151, half count 0.173, full row 0.271). Periodicity accounts
for about 0.045 of the 0.174 pier-attributable comb; sheer occlusion accounts for the other 0.129.

`anisAC3` is a lag-3 column-autocorrelation *difference*, i.e. a vertical-streakiness statistic, not
a periodicity statistic. A row of vertical cylinders makes vertical streaks whether or not they are
evenly spaced. That is why jitter cannot close it and why the wave-R brief must not ask for jitter.

**The lever that works is free in our own scene.** Pier radius x0.5, rendered in `daytime-downtown`:
**0.0059% of pixels differ, max channel delta 4/255, zero pixels above 8/255.** Invisible.

**And car-paint's T1 band `-0.05 .. +0.12` is unreachable without deleting the mesh** — the
mesh-hidden floor is 0.097 and the best non-destructive combination I found is 0.130. Restated in §9.

---

## 9. RETIREMENTS, RESTATEMENTS AND RULINGS

**RETIRED — target 1, `--band 0.05,0.55` dark% >= 18. AGREE with the builder. Now proved at zero
noise, not argued.** Absolute ceiling of every occlusion and atmosphere lever in `world.js`
simultaneously: canyon MAXED (`uShadeAmt 0.80->1.00`, `uCanyon (0.16,22)->(0.50,40)`) **plus**
`#air=0` reaches **dark% 13.0 / darkAll% 10.51** — and its far-band sobel is **24.00, gate BROKEN**.
Inside the gates the ceiling is 11.4. The remaining 5-7 points do not exist in this file.

**RETIRED — the companion `darkAll% >= 9`. It is unreachable inside the gates too** (in-gate ceiling
6.88, canyon-maxed) **and it is satisfiable by a 30% exposure pull with nothing else changed**
(6.47 -> 14.94 under a flat x0.7 gain). Restated in §10 as a band with a `lum` hold.

**"CANYON OCCLUSION BUYS +0.9 dark%" — I DISAGREE WITH RETIRING IT AS UNRESOLVABLE.** It was
unresolvable in wave P because the SSAO was unseeded. It is resolvable now and I resolved it in two
renders. Measured at zero noise, canyon MAXED buys **+0.6 dark% / +0.41 darkAll%**, and it **costs
6.5% of cSpread** (53.01 -> 49.54). **Retire it as DISPROVEN AND SUPERSEDED with that figure, not as
unresolvable** — the wave-O conclusion (occlusion is not the lever) was right, the number was 0.9
and is really 0.6, and the chroma cost was never recorded. Leaving it labelled "unresolvable"
invites someone to reopen it; labelling it measured closes it.

**RETIRED — the proposed target `cSpread >= 90`.** One-sided, above the in-gate ceiling of 80.24,
satisfiable by a x1.85 saturation gain, and derived from a reference set quoted at 128-163 when it
is actually 74.23-163.01 (`daytime-downtown-03` omitted). Restated in §10.

**ACCEPTED — `cSpread` as the metric.** Correct null (0.89 at zero chroma), correct contraction
under an additive cast (-52%), monotone in paint with the haze frozen (38.41 / 53.01 / 80.24). It is
strictly better than `sat` and it is the right successor.

**RETIRED — `_facademeas` band `sat`, fourth independent disproof.** GREY paint raises it +0.040
while cSpread correctly falls 14.6.

**CORRECTED — the wave-P rule-4 clearance on `world.js:954`.** `de <= dist` does not clear the
1.367x `AIR_GAIN` rise. Optical depth beyond 199.55 m is LARGER than the old form's, asymptotically
by 1.367x; peak mix excess +0.0137 at 292 m. Not a shipped regression, but the argument as written
is wrong and must not be reused as a pattern.

**RETIRED — the builder's nominated next gap, the multiplicative fill tint
(`world.js:802-843`, `:2929-2933`).** Fully achromatising it moves cSpread by +0.17% and nothing
else. Seventh wrong-object find.

**CORRECTED — the cross-piece pier prescription.** "Jitter the spacing, or vary height/radius"
saturates at -17% and its second clause is a null. The lever is occluded solid angle. See §8c.

**CORRECTED — "hiding the pier row changes no visible pixel."** It changes 11.06% of the
`car-paint-closeup` frame, 0.20% by >8/255, max 51 — all on the car — and it changes
`dusk-highway-chase` (max 146), `crash-cam` (max 72) and `daytime-downtown` (max 68).

**RESTATED — scale persistence for this piece.** Absolute `dark%` is not scale-stable (17.6%
disagreement between a native 1920 and a native 960 render). The A/B DELTA is (+2.9 at both, and
cSpread +10.5 / +10.8). Test the delta, natively rendered, not the absolute, and not a downsample.

**NOTED — `reference/INDEX.md` describes `daytime-downtown-04` as "hazy bright day".** It is a
dusk/blue-hour frame with a near-black sky; band `lum` 53.2, `dark%` 36.4, `sobel` 5.59. Four waves
of environment anchors have come off it. It is not a valid anchor for a midday scene's value or
chroma structure. Fix the line.

---

## 10. NEXT-ROUND (WAVE R) TARGETS

All on `daytime-downtown`, scene-default camera, `node tools/shot.mjs --scene daytime-downtown
--w 1920 --h 1080`, `tools/_facademeas.mjs` md5 `4412a587…`. Renders are deterministic: **2 renders
per arm, peer md5 sampled either side.** Every target is a BAND.

**R1 — HEADLINE. Chromatic extinction. `world.js:955`.**
Give `fq` a per-channel density. `node tools/_facademeas.mjs <png> --band 0.05,0.55`:
**cSpread into `60 .. 72`** (shipping 53.01; my untuned one-line proof lands 61.52; SMOKE, the
paint-table ceiling, is 80.24; dd-03 74.23).
Holds, all currently met and all must stay met:
- far-band sobel `--sky 999,110 --x 0.560,0.750 --band 0.180,0.440` in **12 .. 22** (now 17.41; my
  arm 17.80)
- `lum` in **78 .. 90** (now 82.5; my arm 83.7) — this is the anti-exposure hold
- `darkAll%` in **6.0 .. 8.5** (now 6.47; in-gate ceiling 6.88)
- `node tools/shadow-ab.mjs` road MAD **> 12** (now 14.82)
**Required companion diagnostic, not a hold:** the GREY paired control on the same tree
(`STYLE_TRIM`+`PAINT_NEUTRAL`+`PAINT_COLOUR`+`PODIUM_TRIM`+fallback all `0xb0b0b0`), and the ratio
`cSpreadR = cSpread(shipping)/cSpread(GREY)`. Currently 53.01/38.41 = 1.380. **State it. If
cSpread(GREY) itself rises by more than 1.15x, the gain came from a global chroma knob and the
result is void** — that factor is the verified signature (a x1.5 saturation gain moves GREY x1.467).
Do NOT require cSpreadR to rise: a light-side fix correctly lowers it (my arm: 1.311).
`kq = vec3(0.625, 1.0, 1.389)` is the textbook lambda^-4 ratio, untuned and first-try. Sweep it and
report the sweep; normalise on green so the 200 m mean is held, and **state the tau ratio at 30 m
and at infinity** (§3b), not just at the held point.

**R2 — CROSS-PIECE, ROUTED TO ENVIRONMENT. `world.js:2712-2717`, the overpass pier row.**
Measured on the CAR, not on this scene — the mesh is 64 m behind the `car-paint-closeup` camera and
no measurement of that frame's own content can see it.
`node tools/_carpaint-eval-shot.mjs --out <png> --js "const g=window.__game;
g.car.paintMat.clearcoatRoughness=0.090; g.car.liveryMat.clearcoatRoughness=0.090;
g.car.refreshEnv();"` then
`node tools/_stripemeas.mjs <png> 0.1094 0.1563 0.6111 0.6852`.
**`anisAC3` into `0.09 .. 0.17`, with `resRMS` in `5.5 .. 6.1` and `mean` in `80 .. 85` quoted
beside it.** Currently 0.271 / 5.73 / 80.9. Mesh-hidden floor 0.097 / 5.84 / 83.2.
**This restates car-paint's T1 band of `-0.05 .. +0.12`, which is unreachable without deleting the
mesh** (floor 0.097; best non-destructive arm I found 0.130).
**Lever, corrected: reduce the row's occluded solid angle in the flank's specular direction, not its
periodicity.** Validated arms: radius x0.5 alone -> 0.151; radius x0.45 + jitter +/-12 m + every
third pier dropped -> 0.130 / 5.76 / 82.4. Jitter alone saturates at 0.223-0.226 and per-pier
height/radius variation is a null (0.275). Do not spend the round on jitter.
**Mandatory cost gate — the mesh is visible in three other scenes and must not be deleted:**
render `daytime-downtown`, `dusk-highway-chase` and `crash-cam` before and after and report the
pixel diff. Pier radius x0.5 costs `daytime-downtown` **0.0059% of pixels, max 4/255, zero above
8/255**; anything at or below that is free. Deleting the mesh costs `dusk-highway-chase` 0.68% of
pixels at max 146 and is not acceptable.
Report `anisAC3` and `resRMS` as a pair, always. `anisAC3` is amplitude-blind.

**R3 — the bulk chromaticity deficit, as a diagnostic to report, not yet a target.**
Block-distance quantiles (16 px blocks, rg-chromaticity block-median, distance from band median
x1000, majority-sky blocks dropped): ours p50 **29.8** / p90 122.5 against dd-03 56.0 / 125.1 and
dd-04 113.6 / 214.0. **Our p90 is already at dd-03's; the missing thing is the MEDIAN.** Report p50
alongside cSpread. A palette edit that adds hero masses moves p90 and p99 and will not move p50 —
that is why wave N's palette round scored nothing, and the next builder should know it before
opening `world.js:1327`.

**R4 — holds, currently met, do not regress.**
far-band sobel 12-22 (17.41) · `shadow-ab` road MAD >12 (14.82) · scale persistence measured on the
A/B DELTA at native 960, within 10% (currently 0%) · band `px` reported on every row so a moving
denominator is visible.

**NOT A TARGET, do not re-issue:** `dark% >= 18`, `darkAll% >= 9`, `cSpread >= 90`, band `sat` in
any form, `uCanyon`/`uShadeAmt`, and the fill tint.
