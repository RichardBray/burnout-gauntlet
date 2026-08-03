# WAVE R BUILDER — sky-lighting

PIECE: sky-lighting   FILE OWNED: `game/sky.js` (and nothing else)
SCENE: `dusk-highway-chase`, chase cam, 1920x1080. `tools/shot.mjs --scene dusk-highway-chase`.
REF: `reference/dusk-highway-chase-01.jpg` (1728x1080).
Tree at start: `md5 game/sky.js` = `5e3c2d9a61f7c84e4ec40439cb55870c`, mtime 2026-08-03 08:47.
NOTE: this is NOT the wave-Q audit hash `69f00e3cc014a2e8ec7ad886481663ca`. `sky.js` was edited
after the wave-Q audit by a killed round-13 agent and those bytes are baked into baseline commit
`e1c1e82`, so `git diff` cannot recover them. Step 0 below reads for them.
`_px.mjs` revision used throughout: (recorded below after md5).

INTENT (stated before measuring): T0 horizon registration first, as a measurement-only gate.
Then decide `skyGain` on the registered anchor, publish the cross-piece irradiance handoff as
ratios, and hold the sodium row.

## STEP 0 — ABANDONED-EDIT AUDIT OF `game/sky.js`
(in progress — appended below as each region is read)

Tool revisions used (md5, all verified by hash not docstring):
`_px.mjs` **6b0e73db0aa999c527ab6fdd7cba5b7f** (the wave-R full-population 2551-bin histogram
build, so p01/p50/p99 are exact and width-independent; NOT the wave-Q `be244caf` build).
`_skyprobe.mjs` f4312fd3f24d6edc7061cddd375230aa. `_cropimg.mjs` df45028c577131d33ab5f08edce86738.
`_anisonull.mjs` 6523633ab1ef98478a4471b09f361c82.
Every `sat` figure below is `satPx` (per-pixel) unless it is explicitly labelled `meanCast`.

### The line refs ALL MOVED. Wave-Q's addresses are +26/+27 and one is +19.

`git status` says `game/sky.js` is CLEAN against `e1c1e82`, so the round-13 edits are baked into
the baseline commit and `git diff` cannot recover them. I located them by re-greping every constant
and every line ref wave Q published:

```
wave-Q ref        wave-Q content                     ACTUAL in this tree
sky.js:499-502    ARCH_G/TINT/HSH/EV                 :499-502   UNMOVED, all four literals match
sky.js:536        archEl = exp(-max(asin..)/ARCH_EV) :536        UNMOVED, identical
sky.js:556        arch = uMsBeam * (1-exp(-sdep/HSH)) * archEl  :556  UNMOVED, identical
sky.js:796        coolL = lutAt(mix(u,0.72,0.30), mix(l,1.10,0.22))  :796  UNMOVED, identical
sky.js:815        warmL = lutAt(0.02, 0.030)         :834  MOVED +19 **AND THE CODE CHANGED**
sky.js:995        msBeam 3.2                         :1021  MOVED +26, literal 3.2 matches
sky.js:998        skyGain 0.55                       :1024  MOVED +26, literal 0.55 matches
sky.js:1026       fog d0 0.0030                      :1052  MOVED +26, literal matches
sky.js:1042       clouds alto 0.38 / cirrus 0.16     :1068  MOVED +26, literals match
sky.js:1049       clouds low 0.30                    :1076  MOVED +27, literal matches
sky.js:1067       exposure 1.30                      :1093  MOVED +26, literal matches
```

The +19 at `warmL` and the +26 below it localise the round-13 insertions to exactly two places.

### ABANDONED EDIT 1 — `game/sky.js:834`, `warmL`. THIS IS A REAL CODE CHANGE, IT IS WAVE-Q'S T3,
### AND IT WAS NEVER MEASURED. Decision: KEEP ONLY IF MY OWN A/B CONFIRMS IT (see T3 below).

```
BEFORE (wave-Q tree, quoted by verdicts/wave-q/sky-lighting.md as sky.js:815):
  vec3 warmL = lutAt(0.02, 0.030) * (uCloudMix.z * sunReach);
AFTER  (this tree, sky.js:834, written 08:47 by the killed round-13 agent, no verdict):
  vec3 warmL = lutAt(mix(u, 0.02, 0.70), mix(l, 0.030, 0.78)) * (uCloudMix.z * sunReach);
```

Plus a 19-line justification comment at `sky.js:815-833`. The comment's *arithmetic* is
independently checkable and I checked it before deciding: it claims the old fixed tap is
`[1.3262, 0.7627, 0.2465]` (B/R 0.186) and the new tap at the measurement column becomes
`(u 0.048, 4.49 deg) = [0.5249, 0.4663, 0.2416]` (B/R 0.460). Verified below against
`sky.sampleLut` in-page, not taken on trust.
This is exactly wave-Q's **T3** ("make `warmL` follow the pixel's own (u,l) the way `coolL` at
`:796` already does"), implemented as written. So it is *justifiable* — but per the wave-R
addendum §0 an unmeasured edit may not be inherited silently, so I reconstruct the pre-edit line
byte-exactly and run it as leg A of a paired A/B. It is claimed only if it passes T3's band.

**One defect inside it, and it is the same rule-5 class the round it came from was told to fix:**
`sky.js:833` ends "uCloudMix.z (clouds.sunGain) is unchanged — see :1042." `:1042` is inside the
`DEFAULT_CLOUDS`/dusk comment prose in THIS tree; the dusk `sunGain: 0.46` is at **:1068**. The
round-13 agent copied wave-Q's own stale address forward. Corrected in place.

### ABANDONED EDIT 2 — `game/sky.js:1012-1018`, comment only. Decision: KEEP.

A seven-line insertion inside the `msBeam` comment that retracts wave-Q's **DEFECT 1** (the tree
was claiming the sodium row rendered `210.9,187.4,109.1 meanCast 0.483` when it renders
`210.3,185.1,105.6 meanCast 0.498`) and additionally records that the `y 0.46-0.48` box is 12%
geometry and is a hold gate only. Both statements are wave-Q's own findings, stated correctly, and
**no constant is touched**: `msBeam: 3.2` at `:1021` and `skyGain: 0.55` at `:1024` both still read
their wave-Q literals. This is the mandated comment correction, done right. Kept and claimed.

### NO OTHER ABANDONED EDIT EXISTS IN THIS FILE.

Grep for the round-13 signatures the addendum lists — a forced debug uniform, an added
early-return/bypass, an unexplained nudged constant — returns nothing:
`grep -n "TODO\|XXX\|DEBUG\|debug\|FIXME\|HACK\|temporar\|WIP\|forced\|bypass" game/sky.js` has
exactly one hit, `:1663`, which is prose about shadow history. Every literal wave Q published
re-greps to its wave-Q value. So the round-13 sky agent made exactly one code change (`warmL`) and
one comment change, and it got killed before it could render either.

---

# T0 — HORIZON REGISTRATION. **BOTH PUBLISHED HORIZONS ARE WRONG, INCLUDING OURS.**

This is the gate and it comes first. No sky constant was changed before it landed.

## T0a. OUR horizon is y **0.4923**, not 0.5077. Wave Q inverted the sign of its own term.

`probe.mjs`, live camera matrix, 1920x1080:
`fov` (vertical) **44.359026 deg**, `aspect` 1.7778, forward-vector pitch **-0.358119 deg**,
`camY` 2.1656 m.
Horizon NDC y = `tan(0.358119 deg) / tan(22.1795 deg)` = 0.0062511 / 0.4074513 = **+0.015336**.
Positive NDC is the UPPER half of the frame, so
**y_frac = 0.5 - 0.015336/2 = 0.49233.**
Wave Q wrote `0.5 + 0.01533/2 = 0.5077`. The pitch is NEGATIVE (the camera looks DOWN by
0.358 deg), and looking down moves the horizon UP the image. Wave Q's own arithmetic put it DOWN.

Confirmed against the render, not just the matrix (`shots/_r-ourhor.png`, crop x 700-1300,
y 480-620 of `shots/_r-sky-B0.png`, looked at): the road deck's farthest visible pixels are at
**y 540-545**, and the gantry-sign undersides at y 528. A ground plane cannot appear above its own
horizon, so our horizon is at **y <= 540 = 0.500**. 0.4923 (= y 532) satisfies that; wave Q's
0.5077 (= y 548) does NOT — it would sit 8 px BELOW visible road. **0.5077 is falsified twice.**

## T0b. The REFERENCE horizon is y **0.455 +/- 0.020**, not 0.593-0.602. The wave-Q anchor is the
## wrong object, and it is the wrong object in the exact way STANDING-CONSTRAINTS §0 warns about.

**HARD BOUND, crop-verified, and it alone kills 0.593-0.602.** `shots/_r-far2.png`
(`_cropimg.mjs reference/dusk-highway-chase-01.jpg ... 330 760 470 550 5 10`) and its wider
parent `shots/_r-far.png` (`150 700 480 640 3 20`). LOOKED AT: at x 330-500 there is plainly
lit pale tarmac carrying white lane dashes up to **y 520-545**, and a kerb line, a yellow centre
line and a multi-lane surface below it. The ground plane is therefore visible at y 520.
**Horizon_ref <= 520/1080 = 0.481.** Wave Q's 0.593-0.602 (y 640-650) is excluded by
**0.11-0.12 of frame height**, i.e. by more than the entire offset it claimed to have found.

**WHAT WAVE Q ACTUALLY MEASURED.** Its primitive was "the distant ground plane behind the barrier,
and the bases of both hills" in `x 1200-1728, y 500-700`. I re-cropped that region at 2x with no
grid (`shots/_r-refR.png`, `1150 1728 500 780 2 100000`) and at 6x with a 10 px grid
(`shots/_r-h1.png` `1150 1450 600 690`, `shots/_r-h2.png` `1550 1728 600 690`) and looked at all
three. **Neither hill's base is in frame.** Both silhouettes descend and terminate against the
hero car's rear spoiler (x 1280-1700, y 630-680), the roadside barrier row, and the billboard wall.
At x > 1600 there is no line at all, only flat blue haze (`_r-h2.png` is featureless). The
"flat continuation at y 630-650" that was read as a hill base is the **occluding edge of near-field
geometry**, exactly like the retired chain-link fence, windscreen and traffic-light anchors.
A second, independent falsification: if y 640 were the horizon and the tarmac at y 520 were real
ground, the ground would sit 120 px ABOVE its own horizon. Geometrically impossible.

**BEST ESTIMATE, from a named, re-derivable, scene-generic invariant.** `tools/_cammeas.js:41`
defines `invariant = roofGap / cpGap` = `(y_roof - h) / (y_contact - h)`. Both offsets scale as
`1/distance`, so distance, focal length and aspect all cancel and the ratio reduces to
`1 - H_roof/H_cam` — camera height over roof height only. That is why STANDING-CONSTRAINTS 2i
calls depression "scene-generic". The retired-and-passed chase-camera piece carries the
reference-derived value **0.29-0.30**. Solving for the horizon:
`h = (y_roof - k*y_contact) / (1 - k)`.
Measured on the reference by crop (`shots/_r-car.png` `1100 1728 600 1080 1.8 25`, and
`shots/_r-tyre.png` `1420 1728 950 1080 4 20`), **stating which point per 2i's rule**:
roof PANEL top (top of the rear glass, x 1200-1260) **y 657/1080 = 0.6083** (the spoiler, the
topmost point, is y 645 and is NOT what I used); lowest car point, the rear diffuser/bumper edge
at x 1560-1660, **y 1050/1080 = 0.972** — the tyre contact itself is off the bottom of frame,
so this is an upper bound on y_contact and therefore a lower bound on h.
`h = (0.6083 - 0.295*0.972)/0.705` = **0.4550**. Sweeping y_roof 0.605-0.612, y_contact 0.95-1.00
and k 0.29-0.30 gives **h_ref = 0.436 .. 0.474**.

**RULED: h_ref = 0.455 +/- 0.020**, consistent with the hard bound 0.481 and self-consistent with
the tarmac at y 520 being a surface street ~570 m out and ~12 m below an elevated deck
(1.2 deg of depression).

## T0c. THE OFFSET, ITS SIGN, AND WHICH OF THE TWO BRIEFED DEFICITS IS CORRECT.

`offset = h_ours - h_ref = 0.4923 - 0.455 =` **+0.037 (range +0.018 .. +0.056) of frame height.**
Wave Q published **+0.087 in the OPPOSITE SENSE**: it shifted the reference rows DOWN by 0.087
(sampling the ref nearer its horizon, i.e. brighter). The correct correction shifts them **UP** by
~0.037 (sampling the ref FARTHER from its horizon, i.e. **darker**).

**So of the two figures the brief asked me to choose between — 55 R (frame-fraction) or 111 R
(elevation-registered) — the answer is: the frame-fraction figure is approximately right and the
111 R figure is wrong, and it is wrong in the direction that made the gap look twice as bad as it
is.** It inherited two independent errors, our sign error and a wrong-object reference anchor,
which happened to compound. I did not average them; I re-derived both ends.

Row-anchor conversion, `el = (h - y) * vfov`, our vfov 44.359:

| our band | our centre y | our elevation |
|---|---|---|
| y0.00-0.04 (`z`)     | 0.02 | **20.94 deg** |
| y0.06-0.10           | 0.08 | 18.30 |
| y0.12-0.16           | 0.14 | 15.64 |
| y0.16-0.20 (`valley`)| 0.18 | 13.86 |
| y0.18-0.22 (`v2`)    | 0.20 | **12.97** |
| y0.24-0.28 (`mid`)   | 0.26 | **10.31** |
| y0.30-0.34           | 0.32 | 7.65 |

**REF vfov: I COULD NOT PIN IT, so per T0's instruction the ref rows are a BAND.** Basis for the
band, stated: the reference is 1728x1080 = exactly 1.600:1. Two readings are defensible and they
bracket the answer. (i) 1728x1080 is 0.90 x 1920 wide, i.e. plausibly a side-crop of a 16:9
capture, which leaves the VERTICAL fov untouched at ~44.4 deg. (ii) a console racer's horizontal
fov of 65-75 deg on a 16:10 frame gives vfov 43.4-51.2 deg. Our own hfov is 71.8 deg, which on
16:10 would be 48.7. **Band used: vfov_ref 43-52 deg, centre 47.5.** Ref sample row is then
`y_ref = 0.455 - el/vfov_ref`.

Reference row profile, measured once at 0.02 resolution so any later re-registration can re-read it
without re-rendering (`node tools/_px.mjs reference/dusk-highway-chase-01.jpg --region
yN=0.66,0.74,N,N+0.02`, `_px` 6b0e73db, centre = N+0.01):

```
c0.01 55.0,92.5,100.1 satPx 0.451   c0.19 147.3,158.9,121.4 satPx 0.236
c0.03 58.0,95.7,99.5  satPx 0.417   c0.21 161.0,168.2,124.6 satPx 0.259
c0.05 64.0,100.6,100.9 satPx 0.368  c0.23 175.3,177.2,126.8 satPx 0.285
c0.07 73.2,106.0,103.2 satPx 0.310  c0.25 188.0,186.9,129.2 satPx 0.312
c0.09 82.5,113.7,106.2 satPx 0.275  c0.27 200.8,195.6,131.5 satPx 0.345
c0.11 93.9,121.6,108.4 satPx 0.228  c0.29 212.6,204.2,133.2 satPx 0.373
c0.13 106.4,130.1,111.7 satPx 0.182 c0.31 222.7,211.4,134.5 satPx 0.396
c0.15 119.2,139.3,115.1 satPx 0.175 c0.33 232.1,217.2,134.6 satPx 0.420
c0.17 132.7,149.0,118.4 satPx 0.205
```
Wave Q's frame-fraction figure for y0.00-0.04 (56.5,94.1,99.8) is the mean of my c0.01 and c0.03.
**Reproduced exactly. Rule 5 on the reference measurements: CLEAN.**

Registered reference rows (h_ref 0.455, linear interpolation of the table above):

| our el | ref y @vfov43 | ref R | ref y @47.5 | ref R | ref y @52 | ref R |
|---|---|---|---|---|---|---|
| 20.94 | -0.032 (off frame) | — | 0.0141 | 55.6 | 0.0523 | 64.7 |
| 18.30 | 0.0294 | 57.9 | 0.0697 | 73.2 | 0.1030 | 89.7 |
| 15.64 | 0.0913 | 83.4 | 0.1263 | 103.9 | 0.1542 | 122.0 |
| 12.97 | 0.1533 | 121.5 | 0.1813 | 141.0 | 0.2056 | 158.6 |
| 10.31 | 0.2152 | 164.7 | 0.2381 | 180.4 | 0.2567 | 192.3 |
| 7.65  | 0.2772 | 205.6 | 0.2939 | 220.0 | 0.3079 | 227.0 |

**At vfov 43 the 20.94 deg row registers OFF THE TOP of the reference frame** (y -0.032). That is
itself evidence against the low end of the vfov band: the reference does contain sky at 21 deg
elevation, so vfov_ref >= ~46 deg. Recorded, not used to narrow the band, because it depends on
h_ref.

---

# T1 — DOME RADIANCE AT MATCHED ELEVATION. **MISS, AND THE MISS IS A SHAPE MISS, NOT A LEVEL MISS.**
# THIS IS THE ROUND'S RESULT. skyGain WAS MEASURED, PROVEN TO BE THE WRONG LEVER, AND NOT SHIPPED.

Target as briefed: our 13.0 deg row R in **[0.85, 1.15] x** the ref's 13.0 deg row R, same for
10.3 deg. Both BANDS; overshoot fails.

## The ladder, ours/ref, at the central registration (h_ref 0.455, vfov_ref 47.5)

`shots/_r-final-1920.png`, `--region 0.55,0.65,y,y+0.02`, `_px` 6b0e73db:

| el (deg) | ours R (sg 0.55) | ref R | ours/ref | verdict vs [0.85,1.15] |
|---|---|---|---|---|
| 20.94 | 61.3  | 55.6  | **1.10x** | PASS |
| 18.30 | 69.9  | 73.2  | **0.95x** | PASS |
| 15.64 | 79.4  | 103.9 | 0.76x | miss |
| **12.97** | **86.8** | **141.0** | **0.62x** | **MISS (T1a)** |
| **10.31** | **99.0**  | **180.4** | **0.55x** | **MISS (T1b)** |
| 7.65  | 135.3 | 220.0 | 0.61x | miss |

T1 as scored: **T1a 0.62x, T1b 0.55x, both MISS.** (Wave Q's estimate to beat was 0.47x / 0.42x on
its own broken registration; on a correct registration today's tree is 0.62x / 0.55x, so the gap
was over-stated by ~1.3x, and it is still a large gap.)

**The shape statement, which is the actual finding:** we hold 20.9 deg and 18.3 deg INSIDE the band
and then lose the ramp monotonically below. Our span 20.94 -> 7.65 deg is 61.3 -> 135.3 = **2.17x**;
the registered reference's is 55.6 -> 220.0 = **3.96x**. **We have 55% of the reference's vertical
gradient.** Both anchors agree on this, which is what makes it safe: on the raw frame-fraction
anchor ours/ref runs 1.09 / 0.85 / 0.67 / 0.54 / 0.49 / 0.57 top-to-bottom — same sign, same shape,
different magnitude. The registration moves the size of the gap and not its character.

## THE KILL-CONTROL ON skyGain (§1e). ONE RENDER, AND IT REFUSES THE BRIEF'S OWN LEVER.

`sky.js:1067 skyGain 0.55 -> 1.00`, nothing else touched (`shots/_r-sg1.00.png`, dusk is the only
preset carrying 0.55 so the substitution is unambiguous; verified `grep` line 1024 in that build;
peer md5 stable across the window: boost `6ba0188a`, road `247833a5` before and after):

| el (deg) | sg 0.55 | sg 1.00 | ref | sg0.55 ratio | **sg1.00 ratio** |
|---|---|---|---|---|---|
| 20.94 | 61.3 | 96.7 | 55.6 | 1.10x PASS | **1.74x — 74% OVERSHOOT, breaks a passing row** |
| 18.30 | 69.9 | 108.7 | 73.2 | 0.95x PASS | **1.49x — breaks a passing row** |
| 15.64 | 79.4 | 121.2 | 103.9 | 0.76x | 1.17x (just over) |
| 12.97 | 86.8 | 129.7 | 141.0 | 0.62x | 0.92x PASS |
| 10.31 | 99.0 | 143.7 | 180.4 | 0.55x | 0.80x still MISS |
| 7.65  | 135.3 | 180.0 | 220.0 | 0.61x | 0.82x still MISS |

**A flat multiplier cannot close a shape deficit.** skyGain 1.00 fixes one row, breaks two that
already passed, and leaves the two rows nearest the horizon still failing. It also costs chroma
everywhere the piece is judged on it — `valley` satPx **0.225 -> 0.172**, out of its live 0.19-0.27
band — because the ACES shoulder desaturates as it brightens. Extrapolating the measured response
(`R ratio 1.488x` for a `1.818x` gain, so `R ~ gain^0.72`), the skyGain that would put 10.3 deg
inside the band is ~1.20, at which 20.9 deg lands near **2.0x** the reference. There is no value of
skyGain that satisfies the ladder.

**skyGain: 0.55 -> 0.55. NOT SHIPPED. `sky.js:1067` unchanged, verified by `git diff`.**
Consequence, and it is the good news: **no dusk-lit piece has to re-baseline.** See the handoff.

## AND IT IS NOT THE CLOUD DECK EITHER — the round-13 behaviour, repeated.

`tools/_skyprobe.mjs` (md5 `f4312fd3`) — **fix verified by reading the code, not the docstring**
(rule 5): `:66-77` carries `scene.updateMatrixWorld(true)`, `4x composer.render()`, one `rAF`, one
final `render()`. Paired control on this tree:
- **NULL leg**, `--noclouds x` (mode letter matches no branch, so the preset is untouched but the
  whole re-render path runs), `shots/_r-noc-null.png`: **byte-identical to `shot.mjs`** on all six
  rows and on `s` — `z 61.3,92.1,103.2 / valley 88.7,114.4,112.9 satPx 0.225 / s 210.3,185.1,105.6`.
  The added renders do not perturb the frame. Tool re-cleared this wave.
- **FORCED leg**, `--noclouds c` (alto/cirrus/low all 0), `shots/_r-noc-c.png`:

| el (deg) | shipped | all decks OFF | delta |
|---|---|---|---|
| 20.94 | 61.3 | 62.3 | +1.0 |
| 18.30 | 69.9 | 69.6 | -0.3 |
| 15.64 | 79.4 | 78.8 | -0.6 |
| 12.97 | 86.8 | 92.1 | +5.3 |
| 10.31 | 99.0 | 110.9 | +11.9 |
| 7.65  | 135.3 | 137.4 | +2.1 |
| valley satPx | 0.225 | **0.263** | +0.038 |

**Deleting all three cloud decks moves the ramp span from 2.17x to 2.21x, against the 3.96x the
registered reference needs.** The decks are worth at most 11.9 R on one row and 0.038 satPx. So the
shape deficit is neither `skyGain` nor the decks: **it is in the atmosphere bake** — the candidates,
in the order the ladder implicates them, are the ozone tent (`ozone: 1.0`), `rayleigh`/`turbidity`,
the `msW` multiple-scattering fudge at `sky.js:528`, and the aerial terminal's own gain. That is the
next round's headline and it is now a measured, not a guessed, nomination.

## THE EYE, PAIRED WITH THE METRIC (§3). THEY AGREE.

Two 576x400 crops, no grid, `_cropimg.mjs ... 100000`, same column the numbers use:
`shots/_rc-X.png` = ours `1056 1632 0 400`, `shots/_rc-Y.png` = ref `1140 1716 0 400`. Looked at
both. **Y is an unbroken teal-to-lemon ramp that never stops climbing and ends saturated lemon.
X starts at almost exactly the same teal and then STALLS — by the bottom of the crop it is a pale
sage-olive, not lemon.** That is the 2.17x-vs-3.96x span, visible. The metric has NOT come loose
from the thing it represents. One improvement is also visible and it is `warmL`'s: the cirrus wisps
crossing X now read as soft grey-blue cloud rather than wave Q's "dirty grey-brown".

---

# T2 — SODIUM-ROW HOLD ON A CLEAN BOX. **PASS on the hold. The `<= 12` spread gate is not met, for
# a benign and named reason. AND THE GATE AS ISSUED IS SELF-ANCHORED (§1d) — flagged, not gamed.**

`s2 = 0.75,0.82,0.435,0.450`. **Cropped and looked at first**, as mandated:
`_cropimg.mjs shots/_r-final-1920.png shots/_r-chk-s2.png 1440 1574 470 486 6 100000`. It is
**clean sky** — a soft olive-sodium gradient with faint horizontal cloud banding. **No power lines,
no lamp heads, no tower-block edge.** The box is confirmed geometry-free, so wave Q's replacement
region is endorsed.

| box | leg A (wave-Q tree) | leg B (shipped) | delta | p99-p01 |
|---|---|---|---|---|
| `s2` 0.75,0.82,0.435,0.450 | 188.3,172.1,101.3 satPx 0.462 | **187.9,172.0,101.1 satPx 0.462** | **-0.4 R** | 17.6 |
| `s` 0.75,0.82,0.46,0.48 (old, 12% geometry) | 210.3,185.1,105.6 satPx 0.498 | **210.3,185.1,105.6 satPx 0.498** | **0.0 R** | 29.9 |

Hold gate `+/-4/255`: **PASS, -0.4 R.** Spread gate `<= 12`: **17.6, MISS** — but the crop shows the
17.6 is the cloud deck's own horizontal banding inside a 16-px-tall box, not geometry, so the gate
number was set too tight for the region it was set on. Restate it as `<= 20` or measure it on
`--noclouds c`; do not chase it.

**AND THE GATE ITSELF NEEDS RE-ISSUING, per §1d.** "Mean R within +/-4/255 of the pre-change render"
is anchored on OUR OWN previous value, and it forbids the only correction the reference asks for
here: wave Q measured the reference's own `s`-box population at **248.6** against our 210.3, so we
are **38 levels too DARK at the sodium row too**, and a +/-4 hold on our own history locks that
deficit in permanently. Measured, `skyGain 1.00` takes `s` 210.3 -> **233.5** and `s2`
187.9 -> **220.3**, i.e. TOWARD the reference — so this gate would have scored a genuine
improvement as a regression. It is only because skyGain fails T1 on shape that the two are not in
conflict this round. **Next critic: re-derive T2 as a reference-anchored band around 248.6 on a
crop-verified box in BOTH frames, registered in elevation, and keep a hold only as a
do-not-regress floor.**

---

# T3 — `warmL` FOLLOWS THE PIXEL'S OWN (u, l). **HIT, AND IT IS THE ROUND-13 EDIT, NOW MEASURED.**

The pair of record is **A2 vs B2**, rendered minutes apart in an interleaved A,B,A,B window.
Peer md5 (`boost.js road.js car.js world.js`) captured immediately before and immediately after
each render:
- **A1 VOID and discarded**: `road.js` moved `5aef7e18 -> 247833a5` inside its window. Reported per
  the wave-P recovery protocol rather than kept.
- **A2, B1, B2**: peers identical before and after, all three
  (`6ba0188a / 247833a5 / 8fe0417f / 023e9cd0`).
- **B1 == B2 to the digit on every row.** Determinism is 0.00, as §1h says.

```
sky.js:834 (was :815 in wave Q's addressing)
BEFORE  vec3 warmL = lutAt(0.02, 0.030) * (uCloudMix.z * sunReach);
AFTER   vec3 warmL = lutAt(mix(u, 0.02, 0.70), mix(l, 0.030, 0.78)) * (uCloudMix.z * sunReach);
```

| region | A2 (pre-edit) | B2 (shipped) | target |
|---|---|---|---|
| `valley` 0.55,0.65,0.16,0.20 satPx | **0.137** | **0.225** | band **0.19-0.27**, ceiling 0.263 → **HIT** |
| `mid` 0.55,0.65,0.24,0.28 satPx | 0.137 | **0.168** | must not fall below 0.133 → **HELD** |
| `s` satPx / R | 0.498 / 210.3 | 0.498 / **210.3** | +/-4 R → **HELD to 0.0** |
| `z` 0.55,0.65,0.00,0.04 | 61.5,92.2,103.2 satPx 0.404 | 61.3,92.1,103.2 satPx 0.406 | -0.2 R |
| `v2` R | 99.4 | **88.9** | **-10.5 R, the cost** |
| `mid` R | 100.5 | **95.2** | -5.3 R |
| `valley` R | 101.8 | **88.7** | -13.1 R |

It closes **68%** of the cloud veil's chroma penalty ((0.225-0.137)/(0.263-0.137)), against a target
of "close half". Overshoot is bounded by the clear-sky ceiling 0.263 and we are under it.

**LEG A REPRODUCED EVERY WAVE-Q SHIPPED FIGURE TO THE DIGIT** — `z 61.5,92.2,103.2 satPx 0.404`,
`valley 101.8,117.8,112.3 satPx 0.137`, `v2 99.4`, `mid 100.5,115.9,105.3`, `s 210.3,185.1,105.6
satPx 0.498`. That is the proof that (a) my byte-exact reconstruction of the pre-edit line is
correct and (b) **this one line was round 13's only code change in `game/sky.js`** — had there been
another, leg A could not have landed on wave Q's numbers.

**Rule 5 on the round-13 comment's own arithmetic, verified rather than trusted.**
`node tools/probe.mjs --expr "sky.sampleLut(...)"` on the shipping dusk LUT:
```
old fixed tap  lutAt(0.02, 0.030)        [1.326172, 0.762695, 0.246460]  B/R 0.1859  claim [1.3262,0.7627,0.2465] OK
new tap        lutAt(0.048, 4.49 deg)    [0.524902, 0.466309, 0.241577]  B/R 0.4603  claim [0.5249,0.4663,0.2416] OK
LUT u0.1132 el 0 (the cross-piece tap)   [1.754883, 1.046875, 0.305908]  wave Q's B leg was 1.7549  OK
```
All three match. The comment is honest, and the `u0.1132` agreement re-confirms by measurement
that `skyGain` and `msBeam` are untouched.

**The cost is real and I am not hiding it: T3 takes 10.5 R out of the row T1 needs most.** Kept
anyway, for two stated reasons: the blind-crop failure this piece is judged on is chroma ("the wisps
read as a dirty grey-brown over a teal sky"), and the luma deficit is a gradient-SHAPE problem that
no cloud-shading term can fix (proven above: all three decks deleted moves the span 2.17x -> 2.21x).
Trading 10.5 R of an unreachable target for 0.088 satPx of a reachable one is the right trade, and a
future round that finds the bake lever should re-check this line once the ramp is correct.

---

# T4 — `ARCH_EV`. **DELIBERATELY NOT TOUCHED, and here is why that is now the right call.**

T4 was contingent on T0. T0 landed with the offset **1/2.4 the size wave Q assumed and in the
OPPOSITE direction**, which removes the premise of T4's prediction ("once the frames are registered
`ARCH_EV` will be constrained hard and in the opposite direction, because the registered reference
holds 82% of its horizon R at 13 deg"). On the corrected registration the reference holds
**141.0/220.0 = 64%** of its 7.65 deg R at 12.97 deg, not 82%. More decisively, wave Q's own paired
control stands and I did not need to repeat it: the whole arch is worth **0.2/255** at the `z` row
and **7.5/255** at y0.18-0.22. A parameter with 0.2/255 of authority cannot be tuned against a
33-53 R deficit, and spending renders on it while the ramp is 55% of the reference's would be the
scoreboard talking. **`ARCH_EV` remains unconstrained by the target set and I say so rather than
defending 4.0.**

## SCALE GUARD (required)

Native 960x540 re-render of the shipped tree, identical fractional regions
(`shots/_r-final-960.png` vs `shots/_r-final-1920.png`):
```
             1920                          960
z       61.3,92.1,103.2 satPx 0.406   61.2,92.1,103.2 satPx 0.407
valley  88.7,114.4,112.9 satPx 0.225  88.7,114.4,112.9 satPx 0.226
v2      88.9,113.4,110.7 satPx 0.216  89.0,113.5,110.8 satPx 0.216
mid     95.2,114.3,105.3 satPx 0.168  95.0,114.2,105.2 satPx 0.168
s      210.3,185.1,105.6 satPx 0.498 210.4,185.2,105.7 satPx 0.498
s2     187.9,172.0,101.1 satPx 0.462 187.7,172.0,101.4 satPx 0.460
```
Max deviation **0.3/255**, max satPx deviation **0.002**. **No aliasing carrier.**

## ANISOTROPY

**No anisotropy statistic was introduced or quoted this round**, so `tools/_anisonull.mjs`
(md5 `6523633a`) has nothing to null and was correctly not invoked. Recorded explicitly so the next
critic does not read its absence as an omission.

---

# CROSS-PIECE IRRADIANCE HANDOFF

**HEADLINE: `skyGain` WAS NOT SPENT, so the dusk environment is essentially UNCHANGED and
`car-paint`, `environment` and `hud` DO NOT need to re-baseline.** Every number below is a RATIO
(§1i). Absolutes are harness-dependent and are deliberately not quotable from this report.

Ratios are **B / A** where **A** = the tree wave Q audited (`warmL = lutAt(0.02, 0.030)`,
reconstructed byte-exactly and verified by reproducing every wave-Q row figure) and **B** = the tree
this round ships.

## Method, named so it can be re-derived (§1g)

Not the offline replica and not `sampleLut` — `sampleLut` cannot see this change at all, because
`warmL` lives in the dome FRAGMENT shader's cloud branch and not in the baked LUT. Measured instead
by rendering the environment source itself:
`envScene` rebuilt exactly as `sky.js:1507-1510` does (same geometry, same `skyMat`, `scale 10`),
into a **128-px HalfFloat `WebGLCubeRenderTarget`** with `NoToneMapping` and
`LinearSRGBColorSpace`, read back per face with `readRenderTargetPixels(rt,...,face)`, and
integrated with the exact cube-map solid angle `dw = (4/N^2)/|d|^3`. Sanity: the six faces sum to
**12.566559 = 4pi**. Weights: upward cosine `max(n.y,0)`; sunward-horizontal `max(n . sunH, 0)` with
`sunH` the sun direction projected to the ground plane; sodium band = the mean radiance over
azimuth 15-26 deg off the sun at elevation 0-3 deg. Script kept at `/tmp/irr5.js`.
Determinism: the ENV cube is **bit-reproducible** across separate boots (leg B run three times,
identical to 16 digits); the full-scene car probe varies at **2e-8** relative.

## TOOL AUDIT (this round's one audit, §"budget one tool audit per round") — A CUBE-FACE ORIENTATION
## BUG IN MY OWN PROBE THAT WOULD HAVE INVERTED THIS ENTIRE HANDOFF. Recorded so nobody repeats it.

My first pass paired the face `(u,v)` basis with `readRenderTargetPixels` rows as
`o = ((N-1-j)*N+i)*4`. That convention reported **upward cosine irradiance bit-identical (1.0000x)
and placed the whole A/B difference BELOW the horizon.** It is wrong, and the falsification is
internal, not stylistic: under it the below-horizon bins carried **0.139** of sunward-horizontal
luminance against **0.022** for the entire sky, i.e. a near-black ground (`ground: 0x0f1217`) coming
out 6x brighter than a dusk sky — impossible. **Cube-map textures use the opposite vertical
convention to 2D textures**, so the correct pairing is `o = (j*N+i)*4`. Under the corrected
convention every number becomes coherent: the below-horizon bins drop to 0.0045 / 0.0081, the A/B
difference lands **entirely in the 0.2-24.8 deg elevation bins** — exactly the wedge
`sunReach = smoothstep(0.30,0.86,cs) * (1 - smoothstep(0.05,0.42,h))` gates `warmL` to — the
`> 24.8 deg` bin and both below-horizon bins are bit-identical, and upward B/R comes out **1.790**
against wave Q's independently-derived LUT-quadrature **1.833** (2.3%), which is the cross-check
that the convention is now right. **A cube-integration handoff must be validated by binning the
integrand in elevation before the ratio is published; the bare ratio looked plausible in both
conventions and was wrong in one of them.**

## `scene.environment` (PMREM of `envScene`, `sky.js:1639`) — RATIOS, B / A

| quantity | ratio B/A |
|---|---|
| **upward-cosine irradiance** | **0.99700x** (-0.30%) |
| **sunward-horizontal-normal irradiance** | **0.99133x** (-0.87%) |
| **net upward** (same integral, stated separately as briefed) | **0.99700x** |
| **upward B/R** | **1.00853x** (1.7903 -> 1.8056, marginally cooler) |
| **sodium band** (15-26 deg az off sun, 0-3 deg elev) | **0.99904x** (-0.10%) |

Elevation-binned sunward-horizontal luminance, to show WHERE the 0.87% is (and that nothing else
moved):
```
bin (n.y)      < -0.1     -0.1..0    0..0.004   0.004..0.1   0.1..0.42    > 0.42
A            0.0044922  0.0081465      0       0.0575320    0.0605269   0.0303865
B            0.0044922  0.0081465      0       0.0573044    0.0593580   0.0303865
             identical  identical             -0.40%       -1.93%      identical
```

## The car's OWN cube probe — RATIO ONLY (§1i: "never the absolute `lum`")

Replica of `car.js:1898-1934`: cube camera on the FULL `scene` at the car's position + `PROBE_Y`
0.95 m, same integration. This is a replica, not `car.js`'s own render target — stated because
§1g requires a measurement to name its probe.

| quantity | ratio B/A |
|---|---|
| **upward-cosine irradiance** | **0.99930x** |
| **sunward-horizontal-normal** | **0.99880x** |
| **upward B/R** | **1.00127x** (0.85169 -> 0.85277) |
| **sodium band** | **0.99998x** |

**Every axis is inside 1%, and inside 0.15% at the car.** Wave Q's car-probe handoff ratio of
**1.136** is a wave-O -> wave-Q figure and is NOT superseded or moved by this round; wave R
multiplies it by 0.9993.

## What the next dusk-lit piece should carry, verbatim-quotable

> Wave R did NOT move `skyGain` (0.55) or `exposure` (1.30) or `msBeam` (3.2) — verified by
> `git diff`, not by prose. Relative to the tree wave Q measured, dusk sky irradiance is
> **0.997x** for an upward-facing normal and **0.991x** for a sunward horizontal normal, upward
> B/R **1.009x**, sodium band **0.999x**, and the car's own probe **0.9993x / 0.9988x**.
> **This is a NULL handoff. Do not re-baseline.** Wave Q's caveat — "if the registration finding is
> acted on these move again, and by much more than 6-9%" — is **DISCHARGED**: the registration
> finding was acted on, it turned out to make the deficit SMALLER, it disqualified `skyGain` as the
> lever, and the environment did not move.

---

# STANDING-CONSTRAINTS AMENDMENTS THIS ROUND EARNS (for whoever maintains §2a)

1. **CORRECTED, and it invalidates the current first bullet of §2a: our horizon is y 0.4923, not
   0.5077** (sign error on the pitch term, falsified twice: by the arithmetic and by visible road at
   y 540). **And the reference horizon is y 0.455 +/- 0.020, not 0.593-0.602** — the 0.593-0.602
   anchor is the OCCLUDING EDGE of the hero car's spoiler, the barrier row and the billboard wall,
   not either hill's base; neither base is in frame. **Fourth retired reference anchor. It belongs
   in §0 beside the fence, the windscreen and the traffic light.**
2. **THEREFORE UN-SUSPEND the frame-fraction row anchors**, with a stated correction of
   **-0.037 +/- 0.020 of frame height applied to the REFERENCE rows (upward, i.e. darker)**, and a
   `vfov_ref` band of 43-52 deg. The offset is now SMALLER than `ARCH_EV` (4.0 deg ~ 0.090 frame),
   which was the stated reason for the suspension. Registration does not invert any sign; it makes
   the deficit ~25% smaller than the frame-fraction reading.
3. **RETIRED: "`skyGain` is the single lever that moves the ladder" and the 1.8-2.2x / 55 R / 111 R
   framing of the headline gap.** Kill-control measured: `skyGain 1.00` overshoots the 20.9 deg row
   to 1.74x and the 18.3 deg row to 1.49x — both rows already PASS at 0.55 — while 10.3 deg is still
   0.80x. **REPLACED BY a SHAPE target: the 20.9 -> 7.65 deg span ratio, ours 2.17x against the
   registered reference's 3.96x, band 3.4-4.5x**, with the six per-row ratios above as the holds and
   an explicit no-overshoot clause on the two rows that already pass.
4. **RETIRED as the second-order candidate: the dusk cloud deck, for the SHAPE gap.** All three
   decks at 0 moves the span 2.17x -> 2.21x. (Its wave-Q demotion for the LUMA gap stands, and its
   0.038 satPx on `valley` is real and is now banked by T3.)
5. **RESTATE T2.** "Mean R within +/-4/255 of the pre-change render" is self-anchored (§1d) and
   forbids the correction the reference demands (ref sodium population 248.6 vs our 210.3).
   Re-derive as a reference-anchored band on a crop-verified, elevation-registered box.
   Also relax the `s2` spread gate from `<= 12` to `<= 20`: the measured 17.6 is the cloud deck's
   own banding in a 16-px-tall box, crop-verified free of geometry.
6. **NEW TOOL HAZARD:** any cube-map readback handoff must bin the integrand in elevation before the
   ratio is published — see the tool audit above. Both vertical conventions produce a
   plausible-looking ratio and one of them is wrong.
7. **CORRECTED LINE REFS AGAIN, because they moved by +26/+27 and one by +19 when round 13 edited
   this file, and the wave-Q addresses are now all stale:** `warmL` **:853** (was :834 pre-comment,
   :815 in wave Q); `coolL` **:796**; `ARCH_*` **:499-502**; `archEl` **:536**; `arch` **:556**;
   `msBeam` **:1040**; `skyGain` **:1067**; `fog d0` **:1095**; `alto/cirrus` **:1111**;
   `low` **:1119**; `exposure` **:1136**. Re-greped after my final save, not copied forward.

# BEFORE / AFTER CONSTANT TABLE — check it with `git diff`, it is short on purpose

```
NO CONSTANT IN game/sky.js CHANGED THIS ROUND.
sky.js:1067  skyGain   0.55   -> 0.55   (measured, refused, reason in-file and above)
sky.js:1040  msBeam    3.2    -> 3.2
sky.js:499   ARCH_G    0.70   -> 0.70
sky.js:500   ARCH_TINT 0.25   -> 0.25
sky.js:501   ARCH_HSH  0.80   -> 0.80
sky.js:502   ARCH_EV   0.06981317 -> 0.06981317
sky.js:1095  fog d0    0.0030 -> 0.0030
sky.js:1136  exposure  1.30   -> 1.30
sky.js:1111  clouds alto 0.38 / cirrus 0.16 -> unchanged
sky.js:1119  clouds low 0.30 -> unchanged

CODE: sky.js:853  warmL  KEPT as the round-13 agent left it, now measured and claimed (T3).
      No revert. Byte-identical to what commit e1c1e82 already contains.
COMMENTS ONLY (the whole of my diff): sky.js:833-852 the warmL measurement block + the :1042 ->
      :1068 address fix; sky.js:1043-1066 the skyGain refusal with its kill-control numbers.
```

## ARTEFACTS

`shots/_r-final-1920.png`, `shots/_r-final-960.png` (scale guard) — both rendered AFTER the final
save. `shots/_r-t3-A2.png` / `_r-t3-B2.png` (the T3 pair of record), `_r-t3-B1.png` (repeat),
`_r-sg1.00.png` (the skyGain kill-control), `_r-noc-null.png` / `_r-noc-c.png` (tool null + decks
off), `_r-sky-B0.png`. Crops: `_r-far.png` / `_r-far2.png` (the T0 hard bound — the visible tarmac),
`_r-refR.png` / `_r-h1.png` / `_r-h2.png` (the occluded hill bases, i.e. what wave Q measured),
`_r-car.png` / `_r-tyre.png` (the roof-panel and lowest-point reads), `_r-ourhor.png` (our own
visible-road bound), `_r-chk-s2.png` (the T2 box, geometry-free), `_rc-X.png` / `_rc-Y.png` (the
blind eye pair).

## FINAL STATE — rendered after the final save, per §1j

```
game/sky.js   md5 3be2158499352dc56cc19175ce65efff   mtime 2026-08-03 11:47:41
shots/_r-final-1920.png                                mtime 2026-08-03 11:47:47   (AFTER the save)
shots/_r-final-960.png                                 mtime 2026-08-03 11:42:56   (see note)
```
The 960 scale guard was rendered at 11:42:56 against md5 `468754d8`; the only change between
`468754d8` and the shipped `3be21584` is one COMMENT line (`see :1068` -> `see :1111`, my own
stale-address fix, caught by re-greping after the final save). The 1920 leg was re-rendered at
11:47:47 on the shipped bytes and reproduces `z 61.3,92.1,103.2 satPx 0.406 / valley
88.7,114.4,112.9 satPx 0.225 / s 210.3,185.1,105.6 satPx 0.498` **to the digit**, so the guard
stands. Per §1j an mtime mismatch is a trigger to re-verify, not an automatic void, and it is
settled here by md5 + a reproducing render rather than by mtime.
```
peers at the final render: boost.js 6ba0188a65464eda1296d2f6f425f73a,
road.js 2fe706e00ef62fb290d5d3e924923104 (road-surface and boost-fx are editing live; both of my
scored A/B windows were hash-clean, and A1 was voided and reported when road.js moved inside it).
```
