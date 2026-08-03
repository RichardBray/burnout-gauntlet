# WAVE N BUILD REPORT — boost-fx / game/boost.js

## PIECE / FILE / WHAT CHANGED — mechanism first

The gap was correct and the fix landed: **the two max() branches were phase-jittered PER PIXEL.**
A mean averages its sampling phase away (variance falls as 1/N); a max IS one tap chosen by the
phase, so estimator variance reaches the image one-for-one as uncorrelated 1-px noise. Both the
`max(mean,peak)` branch and the 260 px speed-line branch used the mean's `j = ign(gl_FragCoord.xy
+ uTime*...)`.

Fix, three parts:
1. **Jitter the PERPENDICULAR coordinate, not the pixel.** `ang` is constant along a ray, so
   hashing it gives every pixel on one radial band the same station offset. Variance now lands
   ACROSS bands, which is where boost-blur-02's structure lives (105 px bands).
2. **Each peak station is a 3-tap along-ray mean, not one texel.** Band-limits the maximand to
   the station scale (~20 px feature, not "brightest texel").
3. **An over-unity shoulder on both max() branches** (the crash coupling, below).

## CONSTANTS — BEFORE -> AFTER, literal, with file:line (post-save re-grep)

| file:line | before | after |
|---|---|---|
| boost.js:134 | `float ang = atan(dir.y, dir.x);` at old `:349` | **hoisted** to `:134`; old site now a comment |
| boost.js:111 | (did not exist) | `const float PK_KNEE = 1.00;` |
| boost.js:112 | (did not exist) | `const float PK_CEIL = 1.60;` |
| boost.js:113 | (did not exist) | `vec3 shoulder(vec3 c)` |
| boost.js:394 | (did not exist) | `const float PK_BANDS = 12.0;` |
| boost.js:395 | (did not exist) | `float pj = fract(sin(floor(ang*PK_BANDS + 0.6*sin(ang*3.1+1.7))*12.9898+4.1)*43758.5453);` |
| boost.js:409 | `PK_REACH = 6.0` | `PK_REACH = 6.0` **UNCHANGED** |
| boost.js:410 | `const int NP = 24;` | `const int NP = 16;` (x3 sub-taps = 48 fetches) |
| boost.js:412 | (did not exist) | `float dsub = (0.94 / float(NP)) * 0.5;` |
| boost.js:416 | `float t = (float(i) + j) / float(NP);` | `float t = (float(i) + pj) / float(NP);` |
| boost.js:433 | (did not exist) | `pk = shoulder(pk);` |
| boost.js:461 | `float t = (float(i) - 0.5 + j) / 10.0;` | `float t = (float(i) - 0.5 + pj) / 10.0;` |
| boost.js:465 | `vec3 s = texture2D(...).rgb;` | `vec3 s = shoulder(texture2D(...).rgb);` |

`j` (`:319`) is unchanged and still used by the MEAN loop, correctly.

## OVER-UNITY RESPONSE (the crash.js coupling — crash.js NOT touched)

Confirmed the premise: this pass is added to the composer at `main.js:124`, **before** the output
pass, and `post.js:256` makes the composer target `HalfFloatType`. `tDiffuse` really does carry
crash.js's additive `r = 2.8`. A max() cannot roll that off — the roll-off must hit the value
before it is broadcast. `shoulder()` is a Reinhard knee on LUMA (chroma rides along, so a red
spark stays red), `out = KNEE + H*ex/(H+ex)`, `H = 0.60`:

| input | 0.9 | 1.0 | 1.5 | 2.0 | **2.8** | 10.0 | inf |
|---|---|---|---|---|---|---|---|
| output | 0.900 | 1.000 | 1.273 | 1.375 | **1.450** | 1.563 | **1.600** |

Unit slope at the knee, so nothing at or below 1.0 changes at all. Local gain at 2.8 is
`H^2/(H+ex)^2 = 0.0625` — **16:1 compression**; the whole 1.5..inf family collapses into 0.33 EV.
Plus the 3-tap station mean attenuates any sub-station impulse (a spark bar) by up to 3x before
selection. **A clipped spark now smears at 1.45, not 2.8, with headroom left for the taper.**
This holds whatever the crash builder does to its gain; the two fixes compose, they do not fight.

## PAIRED A/B

Peer churn defeated the strict protocol — 8 concurrent builders, and every window I opened saw
road.js/car.js/crash.js/world.js/hud.js move (car.js also went transiently non-parsing; I waited
it out). I therefore reconstructed the pre-edit file byte-exactly (**verified: md5 of my
reconstruction == the original `330fab82c0782a1a7f9d818a86639ee0`**) and ran **three interleaved
A,B rounds**, each pair inside a ~40 s window, peer hashes logged either side of each round.
Rounds 1 and 3 saw only car/damage/crash move (none in these patches); round 2 saw road+world
move and is the contaminated one. **All three rounds agree to 2 decimal places on the B side.**

`_smearmeas --foc 0.504,0.508`, `sips -z 540 960` for the 960 leg.

**Target 2, ANTI-STIPPLE — HIT, decisively.** `--patch 0.28,0.40,0.72,0.92`,
P = hpRms(960)/hpRms(1920):
| round | A hp1920 | A hp960 | **A P** | B hp1920 | B hp960 | **B P** |
|---|---|---|---|---|---|---|
| 1 | 17.37 | 12.52 | 0.72 | 15.29 | 20.75 | **1.36** |
| 2 | 23.44 | 13.44 | 0.57 | 15.42 | 20.96 | **1.36** |
| 3 | 20.31 | 11.65 | 0.57 | 12.98 | 17.49 | **1.35** |

**0.57 -> 1.36 against ref-02's 1.37.** Target was >= 1.0. Same patch radSmear@1920
2.8 -> 4.1. The energy that vanished is exactly the energy that used to die on downsample.

**Metric paired with the eye — they agree.** `_cropimg shots/_abA2.png 620 860 800 980 3 60` vs
`_abB2.png`: A is the diagonal 1-px dot screen the critic described, B is continuous soft bands.
This is the one place this round where the number and the image moved together.

**Target 1, near road — MISSED, badly, and slightly backwards.**
`--patch 0.02,0.25,0.70,0.85` @1920, A -> B across the three rounds:
radSmear `1.8/1.8/1.3 -> 1.9/1.9/1.5` (target **>=15**); aniso `3.02/3.09/2.80 -> 2.36/2.38/1.37`
(target **>=15**, and it went DOWN); hpRms `0.59/0.60/0.71 -> 0.51/0.51/0.52` (target **>=3.0**).

**Target 3, sink gate — improved, still missed.** `_heromask --scene boost-blur`, fx vs nofx
inside one run (inherently atomic), same patch: radSmear nofx 1.7, fx **1.1 -> 2.0**, so the
ratio goes **0.65 -> 1.18**. Target was >= 2.0. The pass has stopped being a radial-correlation
sink there but is not yet a source. hpRms in that patch went 2.58 -> 1.03 against nofx 11.26:
**on raw energy the pass is a WORSE sink than before**, which is the 3-tap mean's direct cost.

**Target 4, flame — NOT ATTEMPTED.** Nothing I changed touches the jet shader; Lcore p50 is
unmoved at ~93.6. Deliberate: my brief's named gap was the peak branch and the tree was too
unstable to spend renders on a second front.

## BRIEF CORRECTIONS

1. **`_heromask` and `shot.mjs` are not on the same scale and the wave-M brief mixed them.** The
   brief quotes "hpRms 1.96 -> 0.59" for the fx/nofx sink gate; my `_heromask` run reads
   **nofx 11.26 / fx 2.58** in that patch while `shot.mjs` reads 0.60. `_heromask` disables
   bloom/output so its greyscale is linear. **The sink gate is only meaningful as a ratio and
   only within one `_heromask` run.** Do not compare its absolute hpRms to a `shot.mjs` figure.
2. **The brief's diagnosis was right and its remedy was sufficient for the stipple, but the
   stipple and target 1 are two different problems.** Killing the jitter fixed the dot screen and
   could not have fixed the near road, because on the near road `max(pk - mean, 0)` is ~0
   regardless of phase: over 313 px of near-uniform tarmac there is nothing up-ray that is
   brighter than the local mean. The remaining gap is **content, not sampling**. The peak branch
   is a correctly-built operator with nothing to operate on there. Band-limiting it (correctly,
   per the brief) made it find even less, which is why aniso and hpRms fell.
3. **Retire bare aniso in patch 1 alongside bare hpRms.** A's aniso 3.02 was carried by the same
   stipple: at 960 the A render scores aniso **38.17** and radSmear **19.2** in that patch while
   B scores 37.82/19.1 — i.e. the "improvement" the downsample shows is a moire artefact present
   in both, and the 1920 aniso drop 3.02 -> 2.36 is the honest signal that stipple left. Fifth
   and sixth pieces caught buying a metric with high-frequency garbage; this is the sixth.

## WHAT I DID NOT DO / NEXT ROUND

- **Did not touch crash.js**, per instruction. `shoulder()` is unconditional and does not assume
  the crash gain fix landed.
- **Did not touch the flame / jet shader** (target 4) or the hero mask block (k1 target 2).
- **Did not chase target 1 with gain.** Adding reach or gain to a max that finds nothing is
  precisely the bug class the preamble names, and the brief explicitly forbids lengthening the
  kernel. The honest next lever is not in this branch: to tear the near road into bands there has
  to be up-ray contrast for a max to latch, and there presently is not — road.js's tarmac in that
  patch is near-uniform once the pass's own mean has run. **Next round should either (a) source
  the near-road band structure from the LANE PAINT specifically (a paint-aware term, not a
  luma max, since the paint is not the brightest thing on the ray), or (b) hand this to the road
  builder as a content gap and stop measuring it as a boost gap.** I would not spend another
  boost round on target 1 as currently framed.
- `PK_REACH` deliberately left at 6.0 and unverified as a lever; I changed one variable class.
- Final state: `lint ok`, `md5 game/boost.js = 229e0a08a3136458dbccc7b1276f9ed6`, constants
  re-grepped after the last render (table above is from that grep, not from memory).
