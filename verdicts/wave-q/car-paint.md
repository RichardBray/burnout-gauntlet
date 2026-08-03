# WAVE Q CRITIC — car-paint (auditing `verdicts/wave-p/car-paint.md`)

VERDICT: real wins

Tree audited: `game/car.js` md5 `8fe0417f7b95c86f376c5fedabd04d8a`, peer hash (md5 of the 14
non-`car.js` `game/*.js` md5s) `80fdf869b82f0a22d045820a2c8f04ab`, identical before and after every
render below. `./tools/lint.sh` -> `lint ok`. All measurements: scene `car-paint-closeup`, camera =
scene default (pure side profile, dusk), `node tools/shot.mjs --scene car-paint-closeup --w 1920
--h 1080` unless stated. Damage figures: `tools/damage-shot.mjs`, viewport **1600x1000** (that tool
ignores `--w/--h`).

---

## 1. THE BLIND CALL, AND WHAT IN THE CROP DECIDED IT

Camera situation matched to **`car-paint-closeup-03`** — "pure side profile ... dusk industrial
backdrop". That is our camera. (Wave M/N/O/P all anchored on `-04`, which is a *three-quarter
front*. Noted, not scored.)

Crops compared before any number, both `_cropimg.mjs ... 3 50`, both a flat door/flank panel at
comparable panel-metres per pixel:
- ref-03 `430 870 690 830`
- ours `shots/q-crit-cur1.png 850 1290 500 640`

**The reference door carries a hard-edged reflected horizon: a bright band with a fast transition
running the length of the door, a mirror highlight on the door handle, and a dark ground reflection
along the rocker. Ours carries a smooth featureless red wash — no reflected structure of any kind,
no highlight on any feature, no bright/dark split.** Our door reads as matte vinyl. That single
difference decided it, before I opened a tool.

`cannot tell` is not close. The paint's *identity* in the reference is a sharp clearcoat returning
legible environment, and we now return none.

---

## 2. RULE 5 — CLEAN

| claim | tree | status |
|---|---|---|
| `car.js:1667  clearcoatRoughness: 0.20` | line 1667, literal `clearcoat: 1.0, clearcoatRoughness: 0.20,` | OK |
| `car.js:1723  clearcoatRoughness: 0.20` | line 1723, same literal | OK |
| `car.js:601  FLAKE_RGH = 0.22` UNCHANGED | line 601, `const FLAKE_RGH = 0.22, BINDER_RGH = 1.00;` | OK |
| wave-N opts `flakeMip 0.12 / flakeFloor 0.50 / matxFloor 0.00 / matxLo 1.20 / matxHi 3.20 / normFloor 0.45 / gain 6.0 / ccGain 1.6` | all present at `car.js:1700` | OK |
| `car.js:1643  metalness: 0.27, roughness: 0.43` | unchanged | OK |
| `_stripemeas.mjs` additive-only, `anis` byte-equivalent | **proved by output**: I re-derive ref-04's published `0.56` and `0.99` to the last digit with the current tool | OK |

No unexplained edit found in `car.js`.

**One documentation defect the builder left behind.** `tools/_stripemeas.mjs:11-16` still reads
`anis ~ 1.0 -> isotropic; flake` and still lists `hi ... -> 0.56  sh ... -> 0.99` under the heading
"Reference anchors". Both are retired by the builder's own audit and by mine. The next agent to
open that file will read a lie. **Fix the header when you next touch the file.**

---

## 3. RULING ON THE REVERSAL — **THE REVERT WAS CORRECT. THE WAVE-O BRIEF WAS WRONG.**

Reproduced from a byte-verified copy of the shipped tree (`/tmp/car-SHIPPED.js`), one file edit per
arm, one render per arm, peer hash `80fdf869…` before and after all four:

| arm | `clearcoatRoughness` | `FLAKE_RGH` | hi `anisAC3` | hi `anisAC1` | hi `resRMS` | hi `anis` | hi mean |
|---|---|---|---|---|---|---|---|
| A `shots/q-A1.png` | 0.090 | 0.22 | **0.281** | 0.050 | 5.68 | 3.00 | 82.3 |
| B `shots/q-B1.png` | 0.090 | **0.45** | **0.515** | 0.121 | 4.41 | 3.59 | 81.6 |
| C `shots/q-C1.png` (SHIPPED) | **0.20** | 0.22 | **0.125** | -0.012 | 5.49 | 2.82 | 76.7 |
| D `shots/q-D1.png` (new) | 0.20 | **0.45** | **0.260** | 0.023 | 3.95 | 3.47 | 75.9 |

Region `hi = 0.1094 0.1563 0.6111 0.6852` (90x81 px), `node tools/_stripemeas.mjs`.

Every wave-P figure reproduces: A 0.281 vs builder 0.281/0.279; B 0.515 vs 0.520/0.515; C 0.125 vs
0.129/0.122; `anisAC1` 0.050 / 0.121 / -0.012 vs 0.051 / 0.121 / -0.013. Determinism claim holds.

**But the builder's MECHANISM is wrong, and the correction matters.** Calibrating against my
synthetic controls (§4: an injected vertical comb scores `anisAC3` ~= 2.0 x comb-variance-fraction),
decompose each arm's residual into a comb part and an isotropic part:

| arm | total resRMS | **comb rms** | **isotropic (flake) rms** |
|---|---|---|---|
| A (0.090 / 0.22) | 5.68 | **2.13** | 5.27 |
| B (0.090 / 0.45) | 4.41 | **2.24** | 3.80 |
| C (0.20 / 0.22) | 5.49 | **1.38** | 5.32 |
| D (0.20 / 0.45) | 3.95 | **1.42** | 3.68 |

Read down the columns. **`FLAKE_RGH` 0.22->0.45 leaves the comb amplitude untouched (+5% at 0.090,
+3% at 0.20) and destroys 28-31% of the flake.** It does not "make the mirrored window strip more
coherent" and it does not "fuse the bars" — it has *no measurable coupling to the comb at all*. It
**unmasks** the comb by deleting the sparkle that was hiding it. Symmetrically,
`clearcoatRoughness` 0.090->0.20 cuts the comb 35% and leaves the flake alone (+1%). Two clean
orthogonal effects, each replicated at two settings of the other.

So: the revert is upheld, `FLAKE_RGH 0.45` is confirmed an active regression at two operating
points, **and the wave-O diagnosis is worse than "wrong direction" — `FLAKE_RGH` is not on the
causal path.** Recording the builder's corrected mechanism as UNMASKING, not fusing, because the
"blurring makes reflections more coherent" story is a general-sounding claim that would mislead the
next builder about roughness anywhere else in the tree.

**A metric caveat the builder should have stated and did not:** `anisAC3` is a *normalised*
correlation and therefore amplitude-blind. Arm B's +87% is 100% denominator. **Never quote
`anisAC3` without `resRMS` beside it.** Targets below are stated jointly.

---

## 4. TOOL AUDIT (the one budgeted) — `_stripemeas`, with paired controls

Generator `/tmp/mksyn.mjs`, 1920x1080 8-bit grey PNG, base 120, triangular noise sd ~6; comb =
`+A*sin(2*pi*x/6)` (vertical) or `/6` in y (horizontal); `ramp` adds a 40-code x ramp and 30-code y
ramp on top of `iso`. Two seeds each. Measured at ours-hi shape (90x81) and ref-04-hi shape (81x35).

| frame | 90x81 `anis` | 81x35 `anis` | 90x81 `anisAC3` | 81x35 `anisAC3` |
|---|---|---|---|---|
| iso s1 / s2 | 1.23 / 0.96 | 1.72 / 1.94 | +0.013 / -0.005 | -0.028 / -0.020 |
| ramp s1 / s2 (control: detrend works) | 1.22 / 0.96 | 1.72 / 1.92 | +0.010 / -0.004 | -0.023 / -0.018 |
| **vcomb A=8** s1 / s2 | 11.77 / 10.30 | 11.05 / 11.97 | **+1.184 / +1.137** | **+1.120 / +1.143** |
| vcomb A=2 s1 / s2 | 3.43 / 2.81 | 3.21 / 3.77 | +0.203 / +0.157 | +0.126 / +0.160 |
| **hcomb A=8** s1 / s2 | 0.11 / 0.10 | 0.16 / 0.17 | **-1.135 / -1.105** | **-1.159 / -1.118** |

**RETIREMENT OF `_stripemeas.anis` AND THE `0.56` / `0.99` REF-04 ANCHORS: UPHELD, INDEPENDENTLY,
ON THREE SEPARATE GROUNDS.**

1. **Shape-dependent null, confirmed.** Isotropic null is ~1.10 at 90x81 and ~1.83 at 81x35 —
   the builder's `sqrt(nCols/nRows)` is the right form (the 4-px skirt makes the effective shapes
   82x73 -> 1.06 and 73x27 -> 1.64). So `hi anis <= 1.30` demanded that ours score **below the null
   of a differently-shaped patch**. It was never satisfiable except by luck.
2. **The ref-04 anchors are not paint. I cropped them and looked.**
   `_cropimg.mjs /tmp/ref04-1920.jpg … 880 960 660 700 8 10` (the `hi` anchor, `sips -Z 1920`):
   the top eight rows are the dark roof/background and a **hard horizontal white silhouette edge
   across the full patch width**; the right third is the **hard-edged white/silver graphic spike**.
   There is essentially no flat paint in it. `resRMS 16.55` on a flake patch is the giveaway.
   `anisAC3 -0.711` reproduced exactly. The `sh` anchor (`770 830 759 800`) is better but carries a
   dark shadow wedge in one corner and a bright diagonal graphic streak through the other —
   `anisAC3 +0.521`, i.e. *more* vertically combed than ours ever measured.
   Its `anis 0.56` also sits **3.3x below its own 1.83 null**, which is arithmetically what a strong
   horizontal edge does. The number was never a paint number.
3. **It scored a confirmed fix as a regression.** My own 960 pair: `anis` 1.64 (A) -> **2.28 (C)**,
   i.e. "39% worse", while `anisAC3` goes 0.069 -> -0.019 and the crop shows the comb gone.

**THE REPLACEMENT `anisAC1`/`anisAC3` IS ACCEPTED — WITH TWO CORRECTIONS TO THE BUILDER'S CLAIMS.**

Accepted because it passes the paired control the brief demands: forced vertical comb -> +1.12 to
+1.18 at **both** patch shapes (shape-invariance within 5%); forced horizontal comb -> -1.10 to
-1.16; isotropic -> ~0; a pure shading ramp -> unchanged from isotropic, so the 9x9 detrend does its
job; monotone in comb amplitude (A=2 -> ~0.16, A=8 -> ~1.15).

Corrections:
- **"Null 0.00 +/- 0.02 at every shape and scale" is FALSE at 960.** On the 44x42 patch the 960
  measurement actually uses, my isotropic seeds give `anisAC3` **-0.063 and -0.092** — a
  systematic null of about **-0.08 +/- 0.02**, not 0. (Small-patch edge asymmetry between the
  clipped 9x9 kernel and the lag-3 numerator window.) Sensitivity also drops ~40%: the A=2 comb
  scores 0.081-0.151 there against 0.157-0.203 at 90x81. **Null-correct the 960 number or measure
  the same 90x81 PIXEL patch at 960 by widening the fraction.** Null-corrected, my 960 pair reads
  +0.15 -> +0.06, i.e. the fix is scale-persistent, but by 60%, not by the raw -128% the numbers
  suggest.
- **`anisAC` is not cross-quotable between our PNGs and the reference JPEGs.** On ref-04 hi,
  `acX1 = 0.881` and `acY1 = 0.560` — JPEG smoothing correlates the residual in *both* directions
  at near-unity. The difference statistic survives, but its scale does not. This independently
  supports the builder's conclusion that stripe anisotropy has **no valid external anchor** in this
  reference set. Judge it A/B internally and by eye. Accepted.

---

## 5. THE ISOLATION CHAIN, RE-RUN — CARRIER CONFIRMED, **CONTENT REFUTED AND REPLACED**

All via `tools/_carpaint-eval-shot.mjs`, live single-variable override on top of
`paintMat.clearcoatRoughness = liveryMat.clearcoatRoughness = 0.090` (the A leg), followed by
`car.refreshEnv()`. Baseline for this harness `shots/q-ov-A.png`: **anisAC3 0.271, resRMS 5.73,
mean 80.9** — matches the file-edited A1 (0.281 / 5.68 / 82.3), so the harness is a valid proxy.

| override | anisAC3 | resRMS | mean | reading |
|---|---|---|---|---|
| (A leg baseline) | 0.271 | 5.73 | 80.9 | — |
| `setCcGain(0.0)` | **0.053** | **5.97** | 57.8 | **CLEAN. Comb gone, flake held. Carrier = clearcoat indirect lobe. CONFIRMED.** |
| `envMapIntensity = 0` | **0.495** | **0.87** | 31.3 | **BAD CONTROL — DISCARD IT.** Panel went black; residual is nothing, and the *number* went UP. The builder read "bars vanish" off a control that deleted 61% of the panel's luminance. |
| all 23 emissive materials -> 0 | 0.268 | 5.72 | 80.8 | no effect |
| hide the 14 meshes forming the on-screen lit-window strip at y 405-435 (verified gone from the frame) | **0.280** | 6.12 | 83.5 | **no effect** |
| hide `world.group` entirely | 0.052 | 7.54 | 87.5 | content is in `world.js` |
| hide children 0-73 (ground + block pads) | 0.185 | 6.42 | 78.2 | partial |
| hide children 74-104 (towers/blocks) | 0.252 | 6.16 | 82.4 | ~none |
| hide children 105-131 | 0.235 | 5.74 | 81.2 | ~none |
| hide children 132-137 (road paint/kerb/rails) | 0.286 | 5.99 | 83.6 | none |
| hide children 138-140 (overpass deck + edges) | 0.063 | 20.08 | 166.0 | **confounded** — opens the sky, mean x2 |
| **hide child 141 ALONE** | **0.097** | **5.84** | **83.2** | **THE CARRIER'S CONTENT. -64%, flake and mean both held, and the visible frame is pixel-unchanged.** |

**Child 141 is not the window strip. It is the OVERPASS PIER ROW — `game/world.js:2713-2716`:**

```
const pier = inst(new THREE.CylinderGeometry(1.5, 1.7, 1, 12), concMat, 60);
for (let i = 0; i < 44; i++) {
  push(pier, -1300 + i * 60, 5.8, HZ - 62, 0, 0, 1, 11.6, 1);
```

44 concrete cylinders, radius 1.5-1.7 m, **11.6 m tall, spaced exactly 60 m**, at `z = HZ-62 =
-762`. Verified world bbox `x -1301.7..1281.7, y 0..11.6, z -763.7..-760.3`. Camera is at
`(242.3, 1.1, -697.8)` looking toward the car at `(240, 0, -693.5)`, i.e. **the pier row stands 64 m
directly BEHIND the camera** — precisely the specular direction of the camera-facing flank, at
exactly shoulder-to-roof height.

**A strictly periodic row of vertical columns is what makes a vertical comb. A horizontal band of
windows is not.** The builder inferred its content from what it could see in the frame at
y 400-440; the object actually responsible is off-camera and its removal changes no visible pixel.
I made the same mistake first (my window-strip control excluded it via a `distance > 100` filter)
and only the child-by-child bisect found it.

This is the sixth "the metric/diagnosis was reading the wrong object" find in this project. It is
also *why* every past attempt to reason about this comb from the frame failed.

---

## 6. THE SHIPPED FIX BOUGHT ITS WIN WITH THE PIECE'S OLDEST OUTSTANDING GAP

`node tools/_px.mjs --region up=0.0833,0.1563,0.5139,0.5509 --region lo=0.0833,0.1563,0.6481,0.6852`
(the wave-M flank-split regions), scene `car-paint-closeup`, 1920x1080:

| arm | up p50 | lo p50 | **split** | lo p99 |
|---|---|---|---|---|
| A (cc 0.090, piers present) | 86.2 | 79.0 | **1.09** | 138.4 |
| **C (cc 0.20, SHIPPED)** | 85.8 | 83.2 | **1.03** | **106.7 (-23%)** |
| piers hidden, cc 0.090 | 86.0 | 78.2 | **1.10** | **148.5 (+7%)** |

Target window 1.35-1.60 (ref-03 `0.1979,0.2396,…` = 1.38; ref-04 wingTop/wingSide = 1.74).

**The shipped fix moved the flank split AWAY from target and cost 23% of the rocker's reflected
peak.** The environment-side fix removes the same comb (0.271 -> 0.097) while *improving* both.
`clearcoatRoughness 0.20` works by defocusing the only lobe on the car that can carry a legible
reflected horizon — which is exactly the thing the blind comparison in §1 says we are missing. It
is a metric win paid for in the currency of the piece's four-round-old gap.

I am not asking for a revert this round: with the piers still in the scene, 0.090 puts a visible
grey-blue barred block over the wheel arch (I looked: `_cropimg.mjs shots/q-A1.png … 180 400 620
800 3 50`, present in A and B, absent in C and absent with the piers hidden). **0.20 is the correct
call while `world.js:2713` stands.** It should be revisited the moment it does not.

---

## 7. DUSK RE-BASELINE — STRUCTURAL CLAIM CONFIRMED, ABSOLUTES ARE NOT CROSS-QUOTABLE

`tools/probe.mjs --scene car-paint-closeup --w 1920 --h 1080`, white dielectric sphere
(`metalness 0, roughness 1.0`), 96x96 `FloatType` RT, `NoToneMapping`, `toneMappingExposure = 1`,
`readRenderTargetPixels`, mean over the 4148 non-background texels:

| quantity | mine | builder |
|---|---|---|
| car probe (`paintMat.envMap`) lum | 0.049292 | 0.10353 |
| `scene.environment` lum | 0.043401 | 0.09115 |
| **ratio probe : `scene.environment`** | **1.13574** | **1.136** |
| `paintMat.envMapIntensity` | 2.10 | 2.10 |
| `renderer.toneMappingExposure` | 1.30 | 1.30 |

**The ratio reproduces to five significant figures. The absolutes do not — mine are 0.476x the
builder's on an equivalent-looking harness.** So: **the correct handoff quantity is the RATIO
1.136; the absolute `lum 0.10353` is harness-dependent and must NOT be copied into another agent's
report.** (This is the same failure mode as `_debrismeas` absolutes.)

The load-bearing structural claim — `car-paint-closeup`'s paint reads the car's **own cube probe**
(`envUsers`, `car.js:1841-1845`, rebuilt by `refreshEnv()` at `car.js:1895`), **not
`scene.environment`** — is confirmed in code and by the 1.136 ratio. Sky's -6.2%/-9.1% move on
`scene.environment` therefore reaches the car only second-hand. I could not reproduce the builder's
"0.995x panel mean" to the decimal (my A leg reads 80.9-82.3 against its 84.1-85.2) because peers
have moved since; the direction and the mechanism stand.

---

## 8. HANDOFF TO `damage`, RE-ISSUED FULLY QUALIFIED — AND ONE DENOMINATOR RETIRED

Every figure: `node tools/damage-shot.mjs --scene <S> --do "d.setLevel(<L>)"`, **viewport
1600x1000** (the tool ignores `--w/--h`; default camera), then `node tools/_px.mjs --region
intactFlank=0.60,0.70,0.45,0.53 --region bonnetInner=0.29,0.43,0.30,0.41`, on the shipped tree
`car.js 8fe0417f…`, peers `80fdf869…`.

| scene | damage level | camera | `intactFlank` p50 | rgb | `bonnetInner` p50 |
|---|---|---|---|---|---|
| **car-paint-closeup** | **0.75** | damage-shot default, 1600x1000 | **47.7** | 136.9, 25.6, 32.8 | 68.5 |
| **car-paint-closeup** | **0.95** | damage-shot default, 1600x1000 | **46.0** | 132.8, 25.1, 32.8 | 56.2 |
| daytime-downtown | 0.95 | damage-shot default, 1600x1000 | ~~124.8~~ | 104.8, 121.4, 136.3 | ~~114.9~~ |
| daytime-downtown | 0.75 | damage-shot default, 1600x1000 | ~~124.8~~ | 104.8, 121.4, 136.3 | ~~114.9~~ |

**RETIRE the `daytime-downtown` `intactFlank` denominator outright. The region contains no car.**
Two proofs:
1. **Paired control.** `setLevel(0.75)` and `setLevel(0.95)` return **bit-identical** statistics —
   `rgb 104.8, 121.4, 136.3`, `p50 124.8`, `p01 33.3`, `p99 202.3` — on both regions. Damage level
   cannot move a region the car does not occupy.
2. **I cropped it and looked.** `_cropimg.mjs shots/q-dmg-daytime-downtown-0.95.png … 860 1220 380
   620 2 40`: hazy downtown street, "OPEN 24 HRS" and "GOLDSTARS" storefront signage, a green
   traffic-light pole, distant traffic. The hero car is not in frame there at all. The rgb is
   **blue-grey**; our car is red.

So the "105.1 on `daytime-downtown`/L0.95" figure that prompted this re-issue is itself measured on
street facade, and the "2.3x wrong" framing understates the problem — it is not a different
denominator, it is a different object. `car-paint-closeup` is the **only** scene in which
`intactFlank 0.60,0.70,0.45,0.53` is on paint (verified by crop: deformed red flank, correct).

**Binding for the damage builder:**
- Denominator: **`intactFlank` p50 = 47.7, scene `car-paint-closeup`, damage level 0.75,
  damage-shot default camera, 1600x1000.** At level 0.95 in the same scene it is 46.0 (-3.6%);
  quote whichever level you tune at.
- `bonnetInner 0.29,0.43,0.30,0.41` p50 is 68.5 @ L0.75 / 56.2 @ L0.95 in `car-paint-closeup` and
  is the loose one (the builder measured a 13% spread within one arm). Three renders per arm or
  do not use it.
- Env probe for `partUnder`: quote the **ratio car-probe : `scene.environment` = 1.136**, and
  re-derive the absolute in your own harness — mine and the builder's differ by 2.1x on the same
  stated method.
- `syncFromPaint` (`damage.js:878-885`) copies `paintMat.envMap` by reference only.
  `clearcoatRoughness` is a `paintMat` scalar and is not on `partPaint`/`partUnder`/`dmgMat`/
  `shardMat`. p1 did not move anything you consume.

---

## 9. BIGGEST REMAINING GAP

**`car.js:1667` — `clearcoatRoughness: 0.20`. The paint's only sharp specular lobe has been widened
to mip ~4 to hide a reflection of `world.js:2713`'s 60 m-periodic pier row, so the flank now returns
no legible environment at all: `_px` up/lo p50 = 1.03 against ref-03's 1.38 and ref-04's 1.74, and
rocker p99 down 23% (138.4 -> 106.7). The reference's paint identity IS the reflection — a hard
band with a fast transition at the body horizon plus a mirror highlight on the door handle — and we
have replaced it with a tonal wash.**

The lobe is the wrong place to fix it, because the lobe is not the defect. The defect is that the
scene puts a periodic picket fence in the flank's specular direction, and the only reason the paint
had to go matte is to blur it out.

---

## 10. WAVE R OWNERSHIP — **ENVIRONMENT, EXPLICITLY. NOT CAR.**

Stated plainly, because a mis-assigned cross-piece target has cost this project multiple waves:

**Wave R's fix for the comb belongs to `world.js`, at `world.js:2713-2716`.** The evidence is a
single-object control with both confounds excluded: hiding that one mesh drops `anisAC3` 0.271 ->
0.097 (-64%) with `resRMS` 5.73 -> 5.84 and mean 80.9 -> 83.2, i.e. it costs nothing, where the
car-side fix costs 23% of the rocker's reflected peak and moves the flank split the wrong way.

**Two warnings that the environment builder must be briefed with, or this round is wasted:**
1. **The offending object is not on screen.** It is 64 m behind the camera. Any measurement of the
   `car-paint-closeup` *frame* — sobel, facade band, prop density, anything — is blind to it. The
   only valid measurement is `_stripemeas` `anisAC3` on the **car's** hi patch
   `0.1094 0.1563 0.6111 0.6852`, with `resRMS` quoted beside it.
2. **The builder's nominated target — "break the lit window strip's periodicity" — is the wrong
   object and would score zero.** I tested exactly that: 14 meshes hidden, strip verifiably gone
   from the frame, `anisAC3` 0.271 -> 0.280. Do not issue it.

The lever is the piers' 60 m regularity and their contrast against the dusk sky: jitter the spacing
(e.g. +/- 8-12 m), or vary height/radius per pier, or both. 44 identical columns on an exact 60 m
pitch is not a thing that exists on a real overpass.

`PROBE_RES` (`car.js:1853`) is **not** the lever and car-paint should not spend a round on it.

---

## 11. NEXT-ROUND TARGETS

All on scene `car-paint-closeup`, default camera, `node tools/shot.mjs --scene car-paint-closeup
--w 1920 --h 1080` (and `--w 960 --h 540` where stated). Bands, not one-sided limits.

**T1 — ENVIRONMENT (`world.js:2713-2716`), the comb, measured on the car.**
`node tools/_stripemeas.mjs <png> 0.1094 0.1563 0.6111 0.6852`.
Report `anisAC3` **and** `resRMS` as a pair. With `car.js:1667` temporarily set to 0.090 (so the
measurement is not masked), hit `anisAC3` in **-0.05 .. +0.12** with `resRMS` held in **5.3 .. 6.3**.
Paired control that must accompany it: the same pair with the pier mesh hidden — your fix should
land within 0.03 of that. Reference floor is my measured 0.097 / 5.84.

**T2 — CAR-PAINT, the flank split. Four rounds old; this is now the headline.**
`node tools/_px.mjs --region up=0.0833,0.1563,0.5139,0.5509 --region lo=0.0833,0.1563,0.6481,0.6852`.
`up p50 / lo p50` into the band **1.30 .. 1.60** (ref-03 1.38, ref-04 1.74; currently 1.03).
Hold band: `lo p99` in **130 .. 175** (currently 106.7; A-leg 138.4; piers-hidden 148.5) — this
stops the ratio being met by crushing the rocker instead of brightening the upper flank.
Pair with the crop `_cropimg.mjs <png> /tmp/x.png 850 1290 500 640 3 50` against ref-03's
`430 870 690 830`: **the door must show a bounded reflected band with a visible transition, not a
gradient.** The number does not pass without the crop.

**T3 — conditional revert, only after T1 lands.**
Once `anisAC3` is inside T1's band at `clearcoatRoughness 0.090`, sweep `car.js:1667`/`:1723` back
down and take the **sharpest** value that keeps `anisAC3 <= 0.12` and `resRMS >= 5.3`. Report the
sweep, not just the chosen value. Do not do this before T1.

**T4 — holds (all currently MET on the shipped tree; do not regress).**
- sh `0.0938 0.1354 0.7130 0.7500`: `skew` <= 0.4 (now 0.09), `darkPct` <= 18 (now ~16).
- glass `_paintmeas 0.5156 0.625 0.350 0.412` p90 in band **49-75** (now 51.2).
- wing `_paintmeas 0.10 0.20 0.48 0.78` `hlFWHMpx` in band **10-14** (now 11).
- wave-N `matxGate` chain at `car.js:1341/1342/1352/1376/1390/1391/1435/1683` untouched.

**Scale check, restated because the builder's version is not usable as written.**
Render at 960x540 and measure the **same 90x81 PIXEL patch** by widening the fraction to
`0.1094 0.2031 0.6111 0.7593`, OR keep `0.1094 0.1563 0.6111 0.6852` (44x42) and subtract the
measured small-patch null of **-0.08**. Do not compare a raw 44x42 `anisAC3` to a raw 90x81 one.

**Not a target, but do not re-use it:** the wheel/rim patches
`0.2396 0.3646 0.6019 0.8241` and `0.8125 0.8958 0.5741 0.7130` are **dominated by spoke geometry**
(`skew` 4.4-5.0, `resRMS` 13) and are bit-identical across pier-removal *and* the clearcoat change.
They cannot see a reflection. The builder's claim that `chromeMat`/`rimMat`/`discMat` still mirror
the strip is therefore **unmeasured** — neither supported nor refuted. If wave R wants to chase it,
validate a patch against a paired control first.

---

## 12. RETIRED / RESTATED THIS ROUND

- **UPHELD (independently re-proved):** `_stripemeas` target 1 `hi anis <= 1.30`, the ref-04
  `0.56` / `0.99` anchors, and `_stripemeas.anis` as a scale-persistence statistic. Retired.
- **UPHELD:** `FLAKE_RGH 0.45` is a regression. Do not re-try. **RESTATED:** its mechanism is
  *unmasking* (it deletes 28-31% of the flake and leaves the comb amplitude within 5%), not fusing.
  `FLAKE_RGH` has no measurable coupling to the comb.
- **NEW — RETIRED:** the builder's `envMapIntensity = 0` isolation step. It removes 61% of the
  panel's luminance; `anisAC3` on it reads 0.495, i.e. the control's own metric says the opposite of
  what the builder read off it. `setCcGain(0)` is the valid form of that control.
- **NEW — RETIRED:** the `daytime-downtown` `intactFlank 0.60,0.70,0.45,0.53` denominator (and its
  `bonnetInner` twin). The region is downtown street facade, not car. Proved by a level-0.75 /
  level-0.95 bit-identical paired control and by crop. **Seventeenth.**
- **NEW — RESTATED:** `anisAC3`'s null is **-0.08 +/- 0.02** on the 44x42 patch used at 960, not
  0.00 +/- 0.02; and `anisAC` is not cross-quotable between PNG renders and reference JPEGs
  (ref-04 `acX1 0.881`).
- **NEW — RESTATED:** the car-probe irradiance handoff must be quoted as the **ratio 1.136**, never
  as the absolute `lum` — two harnesses following the same written method differ by 2.1x.
- **NEW — CORRECTED:** the comb's content is `world.js:2713-2716`'s overpass **pier row** (44
  cylinders, 60 m pitch, 64 m behind the camera), not the lit-window strip. The window strip
  contributes **zero** (0.271 -> 0.280 with it hidden).
- **NOTED:** `tools/_stripemeas.mjs:11-16` still documents `anis ~ 1.0` and the retired 0.56/0.99
  anchors as live. Correct the header.
- **NOTED:** our camera is `car-paint-closeup-03`'s (pure side profile), not `-04`'s (three-quarter
  front). Four waves of anchors were taken from `-04`.
