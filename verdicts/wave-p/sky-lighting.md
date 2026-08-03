# WAVE P BUILDER — sky-lighting (p1) — game/sky.js

PIECE: sky-lighting  ROUND: p1  FILE: `game/sky.js` (only file edited in `game/`)
SCENE: dusk-highway-chase  REF: `reference/dusk-highway-chase-01.jpg`
A = `shots/_skyp-A1.png` / `_skyp-A2.png`  B = `shots/_skyp-B1.png` / `_skyp-B2.png`

## WHAT I CHANGED, MECHANISM FIRST

The twilight arch is a band a few degrees tall on the horizon, but nothing in the code said so.
`pa` was evaluated on `dot( V, S )`, and at dusk the sun is 0.9 deg **under** the horizon, so
that dot product is an **azimuth** measurement with almost no elevation content. Measured on the
shipped build, at the reference column's azimuth (u = 0.1132, i.e. 20.4 deg off the sun):

| view elevation | phase arg `dot(V,S)` | `pa` (g = 0.70) |
|---|---|---|
| 20.8 deg, 20.4 deg off azimuth | 0.8706 | **0.2874** |
| 0.92 deg (the sodium band), 34.6 deg off | 0.8232 | **0.2070** |

The **elevated** ray scored a *higher* phase value than the band itself. Result: the arch
multiplied the 20.8 deg row by 1.21x and the 89 deg zenith by 1.07x — a flat warm floor, not a
band.

**And it cannot be fixed inside `pa`.** The arch source is `( sR * pr + sM * pa ) * arch`, and
`pr` is the molecular phase function `3/(16 PI)( 1 + cos^2 )`, whose **total dynamic range over
the whole sphere is 2:1**. A source localised to a few degrees is not representable in it at any
`ARCH_G`. Proven with the replica: zeroing `pa` outright still only walks the 20.8 deg row from
R 72.4 to 65 of a needed 61. This is the project's dominant bug class (a quantity outside the
range of its own consumer) seen from the other side — the consumer is too *narrow-range*, not the
producer too large.

So the band's vertical profile went on the **source amplitude**, where it reaches both species:

```
sky.js:536   float archEl = exp( -max( asin( clamp( mu, -1.0, 1.0 ) ), 0.0 ) / ARCH_EV );
sky.js:556   vec3 arch = uMsBeam * ( 1.0 - exp( -sdep / ARCH_HSH ) ) * archEl
sky.js:557             * pow( max( tMs, vec3( 1e-6 ) ), vec3( ARCH_TINT ) );
```

Azimuth stays in `pa` (unchanged), which is what `dot( V, S )` was already measuring. `archEl` is
view-direction-constant so it is hoisted out of the 40-step march: zero added cost.

### CONSTANTS — BEFORE -> AFTER, literal values (Rule 5)

```
sky.js:502   ARCH_EV   NEW CONSTANT  ->  0.06981317   (4.0 deg in radians)
sky.js:995   dusk msBeam        2.5  ->  3.2          (RENORMALISATION, see below)
sky.js:499   ARCH_G    0.70  ->  0.70   UNCHANGED
sky.js:500   ARCH_TINT 0.25  ->  0.25   UNCHANGED
sky.js:501   ARCH_HSH  0.80  ->  0.80   UNCHANGED  (0.10 NOT reinstated)
sky.js:998   skyGain   0.55  ->  0.55   UNCHANGED
sky.js:1067  exposure  1.30  ->  1.30   UNCHANGED
sky.js:1026  fog d0    0.0030 -> 0.0030 UNCHANGED
```

`msBeam 2.5 -> 3.2` is not a gain. `archEl` removes flux from **every** row including the horizon;
3.2 puts the sodium row back exactly where it already passed (s row 210.1,184.7,105.3 sat 0.499
-> 210.3,185.1,105.6 sat 0.498 — held to 0.4/255). 3.2 **without** `ARCH_EV` puts the 20.8 deg row
at R 78, so do not read it as headroom.

`ARCH_EV` lower bound, derived not authored: the shadow layer is 785 m thick and a horizon ray
stays inside it for ~20 km (segment probe: `sdep > 0` out to t = 19.7 km at 0.92 deg elevation),
so the sunlit band cannot subtend less than `atan( 0.785 / 20 )` = **2.2 deg**. 4.0 deg is above
that bound and **nothing hinges on the exact value** — every `ARCH_EV` in 3.0-8.0 deg passes all
the row targets once `msBeam` is renormalised (sweep table below). That flatness is the evidence
it is not a tuned number.

### ALSO FIXED: the false grade comments (mandated, Rule 5)

`sky.js:1067-1074` claimed `lift/dither/hiDesat/contrast/sat` are "CURRENTLY INERT ... dead code",
and `sky.js:78-93` claimed the output pass is "NOT IN THE PIPELINE" with `main.js:56 =
ACESFilmicToneMapping`. **Both false.** Greped:

```
game/main.js:13   import { createSsaoPass, createBloomPass, createOutputPass } from './post.js';
game/main.js:75   renderer.toneMapping = THREE.NoToneMapping;     (NOT ACESFilmic)
game/main.js:128  const outputPass = createOutputPass(toneMode);
game/post.js:35   import { toneLift, toneGrade } from './sky.js';
game/post.js:414  defines: this.mode === 'agx' ? { TONE_AGX: '' } : {}   <- tonemapper only
game/sky.js:1551-1555  toneLift/toneGrade written every apply()
```
`post.js:414` switches only the **tonemapper**; the grade block at `post.js:224-240` runs on the
default ACES path too. Both comment blocks rewritten to state what the code does. **My own
end-to-end predictor reproduces the render only with the grade applied** (independent proof it is
live): predicted z 61,92,103 sat 0.411 vs rendered 61.5,92.2,103.2 sat 0.404.

## PAIRED A/B — A,B,A,B INTERLEAVED, PEER HASHES CONFIRMED STABLE

`boost.js` md5 moved (229e0a08 -> 982dde37) mid-round, which **voided my first unpaired
baseline**; the whole set below was re-rendered interleaved. Peer digest
(`md5 game/*.js | grep -v sky.js | md5 -q`) = `4705c7a3205ff16c76bd43778d5baaef` sampled
**immediately before and immediately after each of the eight renders — all eight identical.**
Both rounds agree to 0.1/255 on every region (A1 == A2, B1 == B2 exactly).

`node tools/_px.mjs shots/_skyp-{A1,B1,A2,B2}.png --region z=0.55,0.65,0.00,0.04 --region
valley=0.55,0.65,0.16,0.20 --region v1=0.55,0.65,0.14,0.18 --region v2=0.55,0.65,0.18,0.22
--region mid=0.55,0.65,0.24,0.28 --region s=0.75,0.82,0.46,0.48`
ref column `x=0.66,0.74`, same y bands.

| region | view elev | A (ship) | **B (new)** | REF | target | verdict |
|---|---|---|---|---|---|---|
| `z` y0.00-0.04 | 20.8 deg | 72.9,98.5,104.3 sat 0.301 | **61.5,92.2,103.2 sat 0.404** | 56.5,94.1,99.8 sat 0.434 | R within 6; sat >= 0.38 | **PASS / PASS** (R delta 5.0) |
| `valley` y0.16-0.20 | 15.1-13.4 | 115.3,125.7,113.6 sat 0.097 | **101.8,117.8,112.3 sat 0.136** | 140,154,119.9 sat 0.221 | sat >= 0.18 | **MISS 0.136** (cloud-limited, see below) |
| `v1` y0.14-0.18 | 16.0-14.3 | sat 0.135 | **sat 0.199** | sat 0.190 | — | above ref |
| `v2` y0.18-0.22 | 14.3-12.5 | sat 0.102 | **sat 0.145** | sat 0.247 | — | improved, still short |
| `mid` y0.24-0.28 | 11.6-9.8 | 114.8,124.3,106.7 sat 0.142 | 100.5,115.9,105.3 sat 0.133 | 194.6,191.3,130.4 sat 0.330 | — | sat -0.009, darker |
| `s` y0.46-0.48 | 1.5-0.6 | 210.1,184.7,105.3 sat 0.499 | **210.3,185.1,105.6 sat 0.498** | 248.6,226.2,124.2 sat 0.500 | keep | **HELD to 0.4/255** |

**Elevation localisation, replica, arch gain in R relative to `msBeam 0`** (u = 0.1132):

| elev | 0 | 1 | 3 | 5 | 8 | 12 | 15 | 21 | 45 | 89 |
|---|---|---|---|---|---|---|---|---|---|---|
| A ship | 2.46 | 1.74 | 1.45 | 1.39 | 1.34 | 1.28 | 1.26 | 1.21 | 1.12 | **1.07** |
| **B new** | 2.87 | 2.24 | 1.44 | 1.24 | 1.09 | 1.02 | 1.01 | **1.005** | 1.00 | **1.00** |

The brief asked for "lights the bottom 5 deg and dies by 15". B: 1.24x at 5 deg, 1.01x at 15 deg,
1.00x at the zenith. A had a flat 1.07-1.26x tail all the way up.

**Camera geometry, so the next round can re-derive the rows** (probe.mjs at 1920x1080): camera
pitch **-0.358 deg**, vertical fov **44.36 deg**, so frame y -> elevation is
y0.00 = 21.8, y0.04 = 20.2, y0.16 = 15.1, y0.20 = 13.4, y0.26 = 10.7, y0.47 = 1.04.
The whole measurement column x = 0.55-0.65 sits at LUT **u = 0.1132** (20.4 deg off the sun's
azimuth), NOT u = 0.5. This matters: at u = 0.5 the shipped arch's gain profile is 1.66x -> 1.07x
(looks localised) and at u = 0.1132 it is 2.46x -> 1.21x (is not). Any future sky claim must state
its u.

**Regression presets — arch is inert outside dusk, verified by render not by argument.**
`uMsBeam = 0` for midday/night/dawn so `arch = 0 * archEl = 0`; replica max linear delta
**0.0e+0** for both. Renders A,B,A,B at 1920x1080, same peer digest:
- midday `daytime-downtown`, `--region sky=0.44,0.50,0.10,0.20`: 212.1,231.3,244.9 sat 0.134 in
  **all four** renders, identical to 0.1.
- night `wet-night-asphalt`, `--region sky=0.44,0.52,0.08,0.16`: 50.6,78,115.2 sat 0.560/0.561
  in all four. `--region hor=0.44,0.52,0.40,0.46`: 83.0 / 82.9 / 82.8 / 82.7 across A,B,A2,B2 —
  **monotone in render order, uncorrelated with variant**, so it is scene-side drift, not mine.
  Flagging it because 0.3 exceeds the project's +/-0.04 noise figure.

**Bake convergence IMPROVES.** NS 40 vs NS 200 over 6 azimuths x 48 LUT rows, post-grade code
levels: max drift **A 2.20 -> B 1.00**. Max adjacent-LUT-row step 145.1 -> 140.7 levels (both at
u 0.8, elev -0.1 — that is the sub-horizon ground-bounce boundary, pre-existing, not the arch).

## EXPOSURE / IRRADIANCE — READ THIS BEFORE QUOTING ANY DUSK BRIGHTNESS NUMBER

`exposure` 1.30 and `skyGain` 0.55 are **untouched**. But `scene.environment` is PMREM'd from the
sky (`sky.js:1559-1561`), so four other pieces must re-baseline. Numbers, linear, pre-`skyGain`,
from the validated replica (12 azimuths x 24 elevations, cosine-weighted):

| quantity | msBeam 0 | A (shipped Wave N/O) | **B (this round)** | B vs A |
|---|---|---|---|---|
| upward cosine irradiance, lum | 0.5287 | 0.5683 (**1.075x** of beam0) | **0.5331** (1.008x of beam0) | **0.938x** |
| upward, rgb | 0.360,0.564,0.673 | 0.404,0.605,0.687 | 0.366,0.569,0.674 | — |
| sunward horizontal-normal, lum | 0.5083 | 0.6079 (1.196x) | **0.5529** (1.088x) | **0.910x** |
| horizon LUT row u0.113 el0, R | 0.6126 | 1.5080 | **1.7587** | **1.166x** |

**Plain statement for car-paint / damage / environment / road: sky diffuse irradiance at dusk goes
DOWN 6.2% (0.938x) for an upward-facing surface and DOWN 9.1% (0.910x) for a horizon-facing one,
relative to the tree Wave O measured.** The Wave O cross-piece note ("msBeam 2.5 raised sky
diffuse irradiance 1.075x, +66% on the low rows") is now **cancelled**: B sits at 1.008x of the
pre-arch baseline. The environment also goes slightly cooler (B/R 1.700 -> 1.844; beam-0 was
1.867). Meanwhile the sodium band's own radiance goes **UP 1.166x** in linear R — the arch is
concentrated where it belongs — but that does not show in the screen row (210.1 -> 210.3) because
ACES compresses it.

## TARGETS: WHAT I HIT, WHAT I MISSED

- **HIT** `z` R within 6 of 56.5: 72.9 -> **61.5**, delta 5.0.
- **HIT** `z` sat >= 0.38: 0.301 -> **0.404** (ref 0.434).
- **HIT** `s` sat, "PASSES, leave it": 0.499 -> **0.498**, and the row's brightness moved
  +0.2/+0.4/+0.3 — held, not traded.
- **HIT** the brief's mechanism target ("lights the bottom 5 deg and dies by 15"): see the table.
- **MISS** valley y0.16-0.20 sat >= 0.18: 0.097 -> **0.136** of 0.18 (ref 0.221). **It is
  cloud-limited, not arch-limited, and I have the paired proof:** with `alto/cirrus/low` forced to
  0 and everything else identical, the SAME build reads valley sat **0.261** (`_skyprobe --noclouds
  c`, `shots/_skyp-B1-noc.png`) against A's clear-sky 0.177. The shipping deck destroys 0.125 of
  chroma — 48% of the clear-sky value. The arch fix delivered +0.084 clear-sky (0.177 -> 0.261,
  which passes 0.18 with room); the deck then eats it back down to 0.136. Same story at `mid`:
  clear-sky 0.133 -> 0.176, veiled 0.142 -> 0.133.
- **MISS / regression to flag honestly:** the whole upper dome is now *darker*, and the reference
  is *brighter*. valley 115.3 -> 101.8 against ref 140.0; mid 114.8 -> 100.5 against ref 194.6.
  Saturation moved toward the ref, luminance moved away. This is inherent to the target set I was
  given (the z target is "reduce R", the valley target is "raise sat") and I did not spend
  exposure to hide it, because four pieces depend on `scene.environment`. The retired
  "sat-0.30 crossing <= 0.28" also drifted 0.345 -> 0.353 — retired, recording it anyway.

## BRIEF CORRECTIONS

1. **The brief's own proposed fix #2 is a NO-OP. Do not let a later wave try it.** "evaluate `pa`
   against the arch's own low-elevation direction" — implemented exactly (A = `normalize(vec3(S.x,
   0, S.z))`, i.e. the sun's azimuth at elevation 0) it moves the 20.8 deg row from **72.4 to
   72.8** and leaves the sodium row bit-identical. Reason: the dusk sun is already only 0.9 deg
   under the horizon, so `S` and its horizon projection differ by 0.9 deg. Fix #1 ("attenuate by
   the sample's altitude above the shadow layer") is also **already in the code** — that is what
   `( 1 - exp( -sdep / ARCH_HSH ) )` does, and it zeroes above the 785 m layer. Neither suggestion
   was the fix.
2. **"a 21-deg ray sits in the ARCH_G 0.70 forward lobe and collects nearly the full arch" is
   overstated but the conclusion is right.** The 20.8 deg row collected 1.21x, not "nearly the
   full arch" (the horizon collected 2.46x). The defect is not that the lobe is too wide, it is
   that `dot( V, S )` measures azimuth, so the lobe **inverted** — the 20.8 deg row's phase value
   (0.2874) *exceeded* the sodium band's own (0.2070). The +16.4 red and the 0.434 -> 0.301 sat
   crush both reproduce exactly, so the brief's numbers are sound; only the mechanism sentence is.
3. **The `warmL` cloud tap is a second, independent arch amplifier that nobody has flagged.**
   `sky.js:771  warmL = lutAt( 0.02, 0.030 )` taps the single hottest LUT texel and feeds it to
   every cloud pixel up to 25 deg elevation at up to `phase` = 7 gain. The arch moved that one
   texel from **0.819,0.462,0.184 to 1.484,0.841,0.261 (R +81%)** while the sky behind it moved
   +7%. It is not what damaged `z` (`z` carries no cloud — clouds-off changes it by 0.1/255) but it
   is most of what makes the veil cream. B reduces it, incidentally, to ~0.83x of A's value.
4. **An arch defect on the ANTI-SOLAR horizon that no brief has named.** With the shipped
   `dot(V,S)` form the arch multiplied the u = 1.0 horizon row by **3.93x**, landing it at code
   236,215,136 — *brighter than the sodium band on the sun side*, a second sunset behind the
   camera. B brings it to **1.23x** / 173.7,151.6,83.6. Not measured in any target region, so it
   was invisible to the scoreboard.

## TOOL AUDIT (the one budgeted per round) — EIGHTH BROKEN TOOL, FOUND AND FIXED

**`tools/_skyprobe.mjs --noclouds` has never worked, in any wave.** `#shot=1` makes `main()`
`return ctx` at `main.js:326` **without starting an animation loop**, so the tool's
`page.evaluate` mutated the preset and called `sky.apply('dusk')` on uniforms that **nothing ever
drew again**; `page.screenshot()` returned the pre-mutation frame. Proof: with
`p.clouds.alto = cirrus = low = 0` forced, `_skyprobe --noclouds c` matched a plain `shot.mjs`
render to **0.1/255 on all five sky regions** (z 72.9,98.5,104.3 / valley 0.097 / s 0.499, both).
Fixed at `tools/_skyprobe.mjs:66-77` — explicit `scene.updateMatrixWorld(true)`, 4x
`composer.render()`, an rAF, one more `render()`, mirroring the shot path. After the fix the same
call moves valley 0.097 -> 0.177, and the fixed tool is what produced the cloud-limited proof
above. **Any past claim resting on a `_skyprobe --noclouds` render is void.** (`--noclouds h` and
`--noclouds t`, the halo kills, were broken the same way.)

Also worth recording: **`tools/_cropimg.mjs` takes PIXEL coordinates, not fractions**, and silently
writes a 0-byte PNG when given fractions (`0.40 0.90 0.00 0.30` -> a 2x0 canvas, "wrote" printed).
Not fixed — just do not pass it fractions.

## WHAT I DID NOT DO / WHAT THE NEXT ROUND SHOULD TAKE

1. **The dusk cloud deck. This is now the single biggest gap and it is quantified.**
   `sky.js:1032` (`alto: 0.38, cirrus: 0.16`) + `:1041` (`low: 0.30`) cost the valley
   **0.125 of chroma (0.261 clear -> 0.136 shipped, target 0.18, ref 0.221)** and cost `mid`
   0.043. The reference is **cloudless** in this column and the Wave O blind call turned on exactly
   this ("a grey-cream cirrus/alto veil across the upper middle"). The crops confirm it by eye:
   `shots/_crop-B.png` is clean teal above y ~110 px and cream veil below; `shots/_crop-R.png` is
   an unbroken teal -> lemon ramp. I left it because my brief named one gap and because touching
   coverage and the arch in the same round would have muddied this A/B. **A builder that takes it
   should note it moves `scene.environment` again.**
2. **`warmL = lutAt( 0.02, 0.030 )` at `sky.js:771` should follow the pixel's own elevation the
   way `coolL` does** (`:752` already taps `lutAt( mix(u,0.72,0.30), mix(l,1.10,0.22) )`). r8 fixed
   exactly this bug for `coolL` and left `warmL` on the hottest texel. That is the mechanism, and
   it is one line.
3. **The upper dome is now ~30-95 code levels darker than the reference** (valley 101.8 vs 140.0,
   mid 100.5 vs 194.6) while its saturation is close. That is a `skyGain` / `exposure` question
   and therefore a **cross-piece** one — it must not be taken by a sky builder unilaterally in a
   batch, because it re-baselines every dusk-lit piece a second time.
4. **Do not reinstate `ARCH_HSH 0.10`.** Left at 0.80 with its Wave-O-corrected justification now
   written into the comment (the two unreproducible numbers are marked as such in the code, so a
   later wave reading the comment cannot mistake them for licence).

`./tools/lint.sh` -> `lint ok`, re-run as the last action after the final render, and every
constant above re-greped against the saved file at that point.
