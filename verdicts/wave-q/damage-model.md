# WAVE Q CRITIC — damage-model (auditing `verdicts/wave-p/damage-model.md`)

VERDICT: real wins

Tree audited: `game/damage.js` md5 `cd22a4c2dd745633093a55923343f63f` — **byte-identical to the
builder's reported final md5** and to `/tmp/damage-B.js`.
Peer hash (md5 of the 14 non-`damage.js` `game/*.js` md5s) `7db7477848699348f05cbf1f919eaaa5`,
identical before and after every render below.
**Peers have MOVED since wave P** (builder's peer hash was `2f4f4458…`; `car.js`, `world.js`,
`crash.js`, `boost.js`, `sky.js`, `audio.js`, `road.js`, `post.js`, `hud.js` all have later mtimes).
I re-measured the whole B leg on the new peer set and **every wave-P B figure reproduced to the
digit** — cross-piece coupling into these regions is zero this round.

Measurement tooling, stated once: `node tools/damage-shot.mjs`, viewport **1600x1000** (default),
and `node tools/_px.mjs` at revision md5 **`be244cafe4297b22429622ab63fe0833`** (the wave-Q
revision: `sat` is printed as `meanCast`, and `satPx`, `sub40`, `sup200` are new). The `meanCast`
computation is unchanged from the revision wave P used, so the builder's `sat` figures are
directly comparable. **Every measurement in this report is on that `_px` revision.**

Two cameras appear below and they are NOT interchangeable:
- **CAM-D** (the damage builder's) = `--cam "3.9,1.6,4.2|0,0.75,0.3|40"`
- **CAM-0** = `damage-shot.mjs` default (no `--cam`)

---

## 0. PROCESS FAULT CHECK — mtime vs the renders of record. CLEARED, BY MD5.

`game/damage.js` mtime is **07:23:23**. The renders of record are `damage-p-A1/B1/A2/B2.png` and
`_p-A-final/_p-B-final.png` at **07:07-07:08**, and `/tmp/damage-B.js` was cut at 07:09. The file
was therefore saved *after* its pair was rendered — the road critic's fault pattern.

**It does not void the pair.** `diff /tmp/damage-B.js game/damage.js` is empty and both md5 to
`cd22a4c2…`. A wave-Q agent copied the file to `/tmp/damage-B-q.js` at 07:21 (same md5) and
restored it byte-exactly at 07:23. The shipped bytes ARE the measured bytes. No re-run required.
Recorded because a byte check, not the mtime, is what settles this — the next critic should run
the same two commands rather than discard on mtime alone.

---

## 1. THE BLIND CALL, AND WHAT IN THE CROP DECIDED IT

Camera situation matched to `crash-cam-03` — "extreme close crash cam, white car crushed head-on".
Ours: scene `daytime-downtown`, `d.setLevel(0.95)`, CAM-D, 1600x1000, `shots/qc-B-dd095.png`.
Crops taken and read before any number:
- ref `node tools/_cropimg.mjs reference/crash-cam-03.jpg /tmp/qc-X.png 1120 1300 400 620 4 9999`
- ours `node tools/_cropimg.mjs shots/qc-B-dd095.png /tmp/qc-Y.png 450 630 270 410 4 9999`
  (and a wider `400 800 260 420 3 9999`)

**The reference panel has three hard edges in it and ours has none.** cc03's inner face is a broad
mid-grey plane carrying (a) a bright flange line with a transition of two or three pixels, (b) a
legible pressed box-section outline — a rounded rectangle you can trace — and (c) about eight
debris flecks with *crisp* silhouettes. Ours is a uniformly soft, near-black undulating sheet:
four broad longitudinal troughs with smoothly-shaded dark bands, five soft flecks, **no flange line
anywhere in frame**, and only the faintest lighter smudge where the box-section pad is. It reads as
a black rubber drape over a former, not as pressed steel. That decided it before I opened a tool.

**Credit where it is due: the builder's own eye gate is genuinely MET.** The six-tent radial web —
two longitudinals, a rail and an X of diagonals on a near-black field — is *gone*. That is a real
subtractive win and I reproduce it. But "the web is gone" and "the plane reads as a plane" are two
different gates, and only the first has been passed. The gap moved; it did not close.

---

## 2. RULE 5 — CLEAN ON EVERY CONSTANT. **NOT CLEAN ON TWO REPORTED MEASUREMENTS.**

### Constants: all 24 before/after literals re-grepped. No discrepancy.

| claim | tree | status |
|---|---|---|
| `:758 RIB_D = 0.040` UNCHANGED | literal present | OK |
| `:760-761` NEW `ribPad` flat-topped pad | present, smoothstep shoulder | OK |
| `ribTent` DELETED, all six tents DELETED | `grep -n ribTent game/damage.js` → **no hits** | OK |
| `:781-783 return ribPad(u,0.40,0.085,0.070) * ribPad(v,0.52,0.220,0.090)` | exact | OK |
| `:791 Math.min(...)*12` | exact | OK |
| `:798-810` `hash` / `CN = 11` / `fleckAt`, `hash > 0.93`, `(px/0.30)^2+(py/0.11)^2` | exact | OK |
| `:814-818 flangeAt`, peak `d = 0.055`, half-width `0.034` | exact | OK |
| `:827 root = max(0, 1 - |r-0.35|/0.33)` | exact | OK |
| `const seam = ribTent(...)` DELETED | no hit (`:2172` `seam` is an unrelated local) | OK |
| `:840 g = 0.86 + 0.14*r^0.8 - 0.09*mottle` | exact | OK |
| `:841 g *= 0.78 + 0.22*wash` | exact | OK |
| `:846 g *= 1 - 0.45*root^1.3` | exact | OK |
| `:847 g *= 0.55 + 0.45*rim` | exact | OK |
| `:853 g += 0.88*flange*(1-g)` | exact | OK |
| `:854 g *= 1 - 0.92*fleck` | exact | OK |
| `:862 g8*0.930` UNCHANGED / `:863 g8*0.830` | exact | OK |
| `:867 a = 0.72 + 0.28*r^0.65` | exact | OK |
| `:868 a *= 1 - 0.60*root^1.3` / `:869 a *= 0.40+0.60*rim` | exact | OK |
| `:870 a = a + 0.90*flange*(1-a)` / `:871 a *= 1-0.55*fleck` | exact | OK |
| `:886 rough = 0.90 - 0.30*r^1.4 - 0.50*flange` | exact | OK |
| `:889 ao.data[o+2] = 0;` — metal flange REVERTED | exact; annotation at `:877-885` present | OK |
| `:903 roughnessMap: undAoTex, roughness: 1.0` / `:904 metalness: 0.10` | exact | OK |
| no `metalnessMap` on `partUnder` | only hit is `:639`, a different material | OK |
| `:914 envMapIntensity: 2.0` | exact — **wave N's standing result untouched** | OK |
| `:966 slabGeo(24, 18, …)` (the `du = 0.0417` premise) | exact | OK |
| `tools/damage-shot.mjs:36-38` `const vpW = Number(args.w) || 1600` | present, default 1600x1000 | OK |

No unexplained edit in `damage.js`. `./tools/lint.sh` → `lint ok`.

### But two reported MEASUREMENTS do not survive.

**(a) The "diffuse ceiling" was never measured.** The report states the ceiling "at albedo 1.0 /
AO 1.0" is `bonnetTight` p99 **105.5** and `bonnetInner` p99 **112.9**. Those two numbers appear
*verbatim, in the same report*, as the shipped B leg's own p99s (A/B table row 4, and the
metal-flange table). They are the shipped tree's values, not a forced-white measurement.
Measured properly — §4 below — the ceiling is **160.5 / 158.5**.

**(b) The reference denominator is not paint.** §3.

Both are the same failure the brief calls SELF-ANCHORING: a number taken from our own current leg
and then quoted as an external limit.

---

## 3. THE DENOMINATOR — **MY BRIEF'S PREMISE IS WRONG, AND SO IS THE CAR-PAINT RETIREMENT AS ISSUED.
THE REAL BREAK IS ON THE REFERENCE SIDE.**

I was instructed that the `daytime-downtown` `intactFlank` region contains no car and that the only
valid denominator is `intactFlank` p50 = 47.7 on `car-paint-closeup`. **I cropped everything before
trusting anything, and the instruction is a camera error.**

### 3a. At CAM-0 the car-paint critic is right. At CAM-D it is wrong.

| frame | scene | level | camera | `intactFlank 0.60,0.70,0.45,0.53` | rgb |
|---|---|---|---|---|---|
| `shots/q-dmg-daytime-downtown-0.75.png` | daytime-downtown | 0.75 | **CAM-0** | p50 **124.8** | 104.8,121.4,136.3 |
| `shots/q-dmg-daytime-downtown-0.95.png` | daytime-downtown | 0.95 | **CAM-0** | p50 **124.8** | 104.8,121.4,136.3 |
| `shots/qc-B-dd075.png` | daytime-downtown | 0.75 | **CAM-D** | p50 **112.0** | 137.4,115.6,37.0 |
| `shots/qc-B-dd095.png` | daytime-downtown | 0.95 | **CAM-D** | p50 **105.1** | 129.6,108.9,36.0 |

**Paired control, and it separates the cameras cleanly.** At CAM-0 the L0.75 and L0.95 statistics
are bit-identical — the car-paint critic's tell, and I reproduce it exactly. At CAM-D they are
**not**: the region moves 6.2% with damage level, which a region containing no car cannot do.

**And I cropped both.**
`_cropimg.mjs shots/q-dmg-daytime-downtown-0.95.png … 960 1120 450 530 4 9999` (CAM-0): hazy
storefronts, "GOLDSTARS" signage, a traffic-light pole. No car. Confirmed.
`_cropimg.mjs shots/qc-B-dd095.png … 900 1180 410 570 3 40` (CAM-D): the hero car's **yellow rear
quarter panel**, filling the frame, with the rear arch and a shut line visible. It is car paint.
(Our car is yellow in `daytime-downtown` and red in `car-paint-closeup`; wave O's "yellow flank
luma 105.4" was correct and is what CAM-D sees.)

So the car-paint critic retired the region by **scene and level while omitting camera** — the third
parameter that the damage builder had, in the very handoff being answered, just proved was load
bearing. **RESTATE, do not retire: the CAM-0 retirement is upheld and the CAM-D region is valid.**

Substituting `car-paint-closeup`'s 47.7 into a `daytime-downtown` numerator, as I was instructed to
do, would have crossed scenes. Self-consistent same-frame ratios are:

| scene | level | camera | `bonnetInner p50` | `intactFlank p50` | ratio |
|---|---|---|---|---|---|
| daytime-downtown | 0.95 | CAM-D | 61.3 | 105.1 | **0.583** |
| daytime-downtown | 0.75 | CAM-D | 58.6 | 112.0 | 0.523 |
| car-paint-closeup | 0.75 | CAM-0 | 68.5 | 47.7 | **1.436** |
| car-paint-closeup | 0.95 | CAM-0 | 56.2 | 46.0 | 1.222 |

### 3b. **THE REFERENCE ANCHOR IS SHATTERED GLASS. EIGHTEENTH.**

The `ref 0.648` behind target 2 comes from `verdicts/wave-o/damage-model.md:46`:
`refFlank 0.156,0.292,0.278,0.389` on `crash-cam-03`, p50 105.3. I reproduce it exactly
(`_px reference/crash-cam-03.jpg --region refFlank=0.156,0.292,0.278,0.389` → rgb 100.9,120.0,113.0,
p50 **105.3**, p99 222.7).

**Then I cropped it** (`_cropimg.mjs reference/crash-cam-03.jpg /tmp/qc-refflank.png 300 561 300 420
3 9999`). It is the white car's **shattered windscreen** — cracked glass over a dark cabin interior,
with a dozen debris fragments floating across it and a slice of A-pillar/roof at the right edge.
There is no intact flank and essentially no paint in it. The `p99 222.7` with `>=200: 4.96%` is the
giveaway: that is specular glass, not a body panel.

**So `ref 0.648` = (bonnet inner face) / (broken windscreen).** The band 0.55-0.70 that wave P hit
was never a paint-to-paint ratio.

### 3c. The ratio is denominator-arbitrary even if you pick a real panel.

Candidate intact paint on cc03, same frame, same light (`_px reference/crash-cam-03.jpg`):

| cc03 region | what it is | p50 | implied "ref ratio" (68.2 / p50) |
|---|---|---|---|
| `0.30,0.42,0.20,0.32` | white car roof, sky-lit | 205.6 | **0.33** |
| `0.72,0.86,0.05,0.16` | green car rear quarter | 57.6 | **1.18** |
| `0.02,0.14,0.28,0.52` | white car rear flank, shadow side | 34.9 | **1.95** |

**A 6x swing on the choice of denominator.** And on our side the same fractional region reads
105.1 (yellow, `daytime-downtown`) or 47.7 (red, `car-paint-closeup`) — **2.2x apart on the same
car**, because the denominator is a body-colour luma. A statistic that divides a primer-grey
underside by a body colour cannot be anchored between a white reference car and a yellow/red ours.

### **DOES THE HEADLINE SURVIVE? NO.**

The *number* survives perfectly — 0.410 → 0.583 reproduces to the digit on a moved peer set, and
the denominator really is on the car at CAM-D, contrary to my brief. What does not survive is the
**target**: 0.55-0.70 is anchored to a region of cc03 containing shattered glass, and the statistic
swings 6x on the reference side and 2.2x on ours. Hitting it means nothing. **RETIRED — see §7.**

---

## 4. ADJUDICATING THE CLAIMED-UNSATISFIABLE TARGET 1 — **THE PROOF IS REFUTED.**

Claim: `bonnetTight (p99-p01)/p50 >= 2.30` is jointly unsatisfiable with target 2, because p99 is
capped at a diffuse ceiling of 105.5 (bonnetTight) / 112.9 (bonnetInner), giving best-case
p50 = (112.9 - 27.7)/2.30 = 37.0 against target 2's required 57.8.

**I measured the ceiling. It is not 105.5.** One variable, live override on the shipped tree,
scene `daytime-downtown`, L0.95, CAM-D, 1600x1000 (`shots/qc-ceiling.png`):

```
node tools/damage-shot.mjs --scene daytime-downtown --cam "3.9,1.6,4.2|0,0.75,0.3|40" \
  --out shots/qc-ceiling.png --do "d.setLevel(0.95); g.scene.traverse(o=>{const ms=o.material?
  (Array.isArray(o.material)?o.material:[o.material]):[]; for(const m of ms){ if(m.isMeshStandardMaterial
  && m.envMapIntensity===2.0 && m.metalness===0.10 && m.side===2){ m.map=null; m.aoMap=null;
  m.roughnessMap=null; m.color.set(0xffffff); m.needsUpdate=true; } }});"
```

(The traversal predicate `envMapIntensity===2.0 && metalness===0.10 && side===DoubleSide` uniquely
selects `partUnder`, `damage.js:898-915`.)

| region | shipped B | **albedo 1.0 / AO 1.0 / no roughnessMap** | builder's claimed "ceiling" |
|---|---|---|---|
| `bonnetTight` p01/p50/p99 | 28.9 / 62.5 / 105.5 | **56.0 / 114.8 / 160.5** | 105.5 |
| `bonnetInner` p01/p50/p99 | 27.7 / 61.3 / 112.9 | **41.9 / 106.4 / 158.5** | 112.9 |

The real ceiling is **+52%** on `bonnetTight` and **+40%** on `bonnetInner`. Redo the arithmetic:

  best-case p50 for ratio >= 2.30  =  (160.5 - 28.9) / 2.30  =  **57.2**
  target 2 demands p50 >=  0.55 x 105.1  =  **57.8**

**57.2 vs 57.8 — within 1%.** The targets are marginal, not mutually exclusive. The "37.0 < 57.8,
there is no value of p50 that satisfies both" claim is **void**, and the recommendation to retire
target 1 *on those grounds* is withdrawn.

What IS confirmed is the grade half of the argument, and it reproduces: our frame p01 **25.7** with
**0.00%** of pixels under luma 16, against cc03's frame p01 **4.0** with **9.36%** under 16
(`_px --region full=0,1,0,1` on both). cc03's inner face reaches 2.587 because its p01 is 3.9. That
part of the headroom is grade-owned and is not in `damage.js`. **Target 1 is restated, not retired
— see §7.** It is also one-sided (`>=`), and its p99 term is corrupted by the tool defect in §5.

---

## 5. TOOL AUDIT (the one budgeted) — **`_px.mjs` PERCENTILES ARE A FIXED-COLUMN SUBSAMPLE.**

`tools/_px.mjs:60` pushes a luminance sample only when `(n & 31) === 0`, where `n` is a running
pixel counter over the whole region. That is every 32nd pixel **in raster order**. When the region
width is a multiple of 32 the sampled set collapses to a **fixed set of columns**, identical on
every row. At the default 1600x1000 viewport all three damage regions are exactly that:

| region | x0..x1 px | width | columns actually sampled |
|---|---|---|---|
| `bonnetTight 0.26,0.38` | 416..608 | **192 = 6x32** | 6 |
| `bonnetInner 0.29,0.43` | 464..688 | **224 = 7x32** | 7 |
| `intactFlank 0.60,0.70` | 960..1120 | **160 = 5x32** | 5 |

### Paired control — synthetic, `/tmp/qcsyn.mjs`

1600x1000 grey PNG, vertical comb of period 32, duty 4/32, values 240 and 40. **True population:
12.5% at 240, 87.5% at 40 → true p01 = 40, true p50 = 40, true p99 = 240, true mean = 65.**

| region width | comb phase | reported p01 / p50 / p99 | reported rgb | reported `>=200` |
|---|---|---|---|---|
| **192** (bonnetTight's exact width) | 0, 8, 16, 24 | **40 / 40 / 40** | 65 | 12.5% |
| **192** | 28, 30, 31 | **240 / 240 / 240** | 65 | 12.5% |
| **191** (one px narrower) | any of the above | **40 / 40 / 240** (correct) | 64.1 | 12.04% |

**The entire percentile triple is determined by the phase of the feature against the sampling
lattice — 6x wrong in one direction or the other — while the population is identical.** One pixel
of width restores the correct answer, because the columns then walk row to row. `rgb`, `sub40` and
`sup200` are correct in every cell: the mean- and area-based statistics are sound, only the
percentiles are broken.

### Magnitude on the real frames (`shots/qc-B-dd095.png`, dd / L0.95 / CAM-D)

| statistic | width 192/224/160 (as reported all round) | width -1 px | delta |
|---|---|---|---|
| `bonnetInner` p50 | 61.3 | 58.9 | **-3.9%** |
| `bonnetInner` p99 | 112.9 | 107.5 | **-4.8%** |
| `bonnetTight` p99 | 105.5 | 107.4 | +1.8% |
| `bonnetTight` p01 | 28.9 | 27.9 | -3.5% |
| `bonnetInner / intactFlank` | 0.583 | 0.563 | **-3.4%** |

**This is larger than the +/-3% scale-persistence the builder used as its evidence that the numbers
are real, and it is invisible to A/B repetition: "A1 == A2 to the digit" is a deterministic
subsample being deterministically wrong, not accuracy.** Every p01/p50/p99 in the wave-N, wave-O
and wave-P damage reports carries this, and the tail statistics (the whole target-1 argument, and
the metal-flange 105.4 → 89.6) carry it worst.

**RETIRED: `_px` p01/p50/p99 as tail statistics on any region whose pixel width is a multiple of
32.** Replacement, in priority order: (1) fix the sampler — bin every pixel into a 256-entry
histogram, exact for 8-bit and cheaper than the array sort it already does; (2) until then, use
`sub40` / `sup200`, which are whole-population and are verified correct by the control above;
(3) if a percentile must be quoted, quote it beside the same region one pixel narrower and treat
the pair's spread as the error bar. The metal-flange "15% worse" should be read as directional.

---

## 6. THE BUILDER'S NOMINATED NEXT GAP — **TESTED, AND NOT ENDORSED.**

`damage.js:972 buckle = 0.052 * ridge(...)` → `0.020`, one variable, file edit, rendered, then
restored byte-exactly (md5 back to `cd22a4c2…`; `/tmp/qc-damage-SHIPPED.js` held the original).
Scene `daytime-downtown`, L0.95, CAM-D, 1600x1000, `shots/qc-buckle020.png`.

| statistic | buckle 0.052 (shipped) | buckle 0.020 | |
|---|---|---|---|
| `bonnetInner` p50 | 61.3 | **59.5** | -2.9%, inside the §5 error bar |
| `bonnetInner / intactFlank` | 0.583 | **0.566** | moves AWAY from 0.648 |
| `bonnetTight (p99-p01)/p50` | 1.226 | **1.203** | slightly worse |
| `intactFlank` p50 | 105.1 | 105.1 | unmoved (control: the edit is local) |

Crop (`400 800 260 420 3 9999`): the small ripples across the upper third do flatten. **The two
folds that carry every large light and dark band survive completely unchanged** — they are
`:976 crease = 0.085 * max(0, 1 - |z - hinge|/0.20)` and `:977 bend = -0.10 * v * v`, not `buckle`.

So the nominated move is numerically null-to-negative and visually marginal. **Do not issue it as a
headline.** If bonnet geometry is touched at all it is `:976` / `:977`, and the case for that is an
eye case, not a metric one.

---

## 7. BIGGEST REMAINING GAP

**`damage.js:867` — `let a = 0.72 + 0.28 * Math.pow(r, 0.65)` puts a blanket 28% ambient occlusion
on the ENTIRE inner-face field, including the open, sky-facing flat that carries no structure at
all, and `aoMapIntensity: 1.0` (`:900`) applies all of it to indirect diffuse — which `:906-913`
establishes is the only light this face receives. That single term is what holds the panel 46%
below its own measured ceiling and is why it reads as black rubber rather than primed steel.**

The arithmetic, all measured above. A field texel has `r = 0` (outside the pad), `root = 0`,
`rim = 1`, `flange = 0`, so it gets albedo `0.86 - 0.09*mottle` scaled by `0.78 + 0.22*wash`
≈ **0.70-0.82**, and AO exactly **0.72**. 0.82 x 0.72 = 0.59 of ceiling; 0.59 x the measured
ceiling p50 114.8 = **68**, against the shipped **62.5**. The AO floor alone accounts for the value
deficit.

And the deficit is what the eye is reading. cc03's inner face sits at p50 **68.2** against a frame
median of **57.2** — the panel is *brighter* than its own frame's midpoint, which is why it reads as
a lit plane. Ours sits at **61.3** against a frame median of **85.1** — well below. A plane that is
darker than everything around it reads as a hole, and no amount of subtractive work on the rib
field can fix that.

---

## 8. NEXT-ROUND TARGETS

All: `node tools/damage-shot.mjs --scene daytime-downtown --do "d.setLevel(0.95)"
--cam "3.9,1.6,4.2|0,0.75,0.3|40" --out <png>`, viewport **1600x1000** (default), then
`node tools/_px.mjs <png> --region …`, `_px` md5 `be244cafe4297b22429622ab63fe0833`.
**Every percentile must be quoted beside its one-pixel-narrower twin (§5); if the pair disagrees by
more than 5% the number is unusable.** Bands, not one-sided limits.

**T1 — HEADLINE. Field value against the frame's own median. Replaces the retired flank ratio.**
`--region bonnetInner=0.29,0.43,0.30,0.41 --region full=0,1,0,1`, report
`bonnetInner p50 / full p50`.
Reference cc03: 68.2 / 57.2 = **1.192** (both re-derived by me above, same file, same tool).
Ours now: 61.3 / 85.1 = **0.720**. Band **1.00 .. 1.35**.
Why this denominator: it is the whole frame, so it cannot be "the wrong object", and it is
invariant to the body colour that broke the flank ratio (yellow 105.1 vs red 47.7 on the same car).
Headroom is proven, not assumed: at albedo 1.0 / AO 1.0 the same ratio is 106.4 / 85.1 = **1.25**,
inside the band, so the target is reachable without touching the grade.
Perturbation twin: `--region bonnetInner2=0.29,0.4294,0.30,0.41`.

**T2 — HARD EDGE. The gate the value target cannot see.**
`bonnetInner sup200` into the band **0.2 .. 1.2 %** (cc03 `refInner 0.5833,0.6771,0.3704,0.5741`
scores **0.58%**; ours scores **0.00%**). `sup200` is whole-population and is control-verified in
§5, so it is safe where p99 is not. The flange authored at `:814-818` currently renders as nothing.
**Crop gate, and the number does not pass without it:**
`_cropimg.mjs <png> /tmp/x.png 400 800 260 420 3 9999` against
`_cropimg.mjs reference/crash-cam-03.jpg /tmp/r.png 1120 1300 400 620 4 9999`.
ONE continuous bright line must be legible with a transition under ~4 px.
**Do not target the dark tail.** cc03 has 9.36% of the frame under luma 16 and we have 0.00%; that
is the authored lifted-black grade and it belongs to the grade owner.

**T3 — TARGET 1, RESTATED AS A BAND AND RE-DERIVED, NOT RETIRED.**
The wave-P unsatisfiability proof is withdrawn (§4). But `(p99-p01)/p50` is a tail statistic on a
32-multiple region and is the single worst-affected number in the piece. **Re-derive it from cc03
using trimmed, population-safe terms**: report `bonnetTight sub40 %` and `sup200 %` as a pair
(cc03 `refInner`: **11.43% / 0.58%**; ours: **8.65% / 0.00%**), band **8-15% / 0.2-1.2%**. If a
ratio is still wanted after `_px`'s sampler is fixed, use `(p90-p10)/p50` on the fixed tool and
re-derive the anchor from cc03 in the same report that issues it. **Do not re-issue `>= 2.30`.**

**T4 — GUARDS. Bands, with the correct statistic. All currently held; do not regress.**
- `bonnetInner` B/R in **1.08 .. 1.18** (cc03 `refInner` 65.9/58.8 = **1.121**; ours 68.6/59.0 =
  **1.163**). Computed from `rgb`, which the §5 audit clears.
- `bonnetInner satPx` into **0.14 .. 0.21** (cc03 `refInner` **0.175**; ours **0.150**).
  **This replaces the `sat` guard.** `sat` is now printed as `meanCast` and is the retired
  mean-cast statistic; keep the old 0.10-0.18 only as a legacy tie-back, never as the gate.
- `intactFlank` p50 at dd / L0.95 / **CAM-D** must stay in **100 .. 110** (now 105.1). This is a
  do-not-regress on the scene, not a target, and it is a *denominator for nothing* now that T1
  uses the frame median.
- `:914 envMapIntensity: 2.0`, `:904 metalness: 0.10`, `:889 ao.data[o+2] = 0`, `:903
  roughnessMap: undAoTex, roughness: 1.0` — all untouched. Wave N's standing result stands.

**T5 — THE MECHANISM TEST, one variable, A/B interleaved, peer-hashed.**
`:867  a = 0.72 + 0.28 * Math.pow(r, 0.65)`  →  `a = 0.94 + 0.06 * Math.pow(r, 0.65)`
(unocclude the flat field; keep the box-section feet cut at `:868` and the rim cut at `:869`).
Predicted `bonnetInner` p50 ~78-82, T1 ratio ~0.92-0.96. Report the A/B and the T2 crop. If the
predicted move does not appear, the value deficit is not in AO and the next probe is `:847` /
`:869`'s `rim` term.

**Do not re-issue:** `p01/p50 <= 0.30` (proven unreachable, grade-owned, reproduced in §4);
`_stripemeas.anis`; the `envMapIntensity = 0` isolation step (invalid — it deletes the only light
this face has, and `:909-912` already records the collapsed 24.9/25.7/26.7 result).

---

## 9. RETIRED / RESTATED THIS ROUND

- **NEW — RETIRED: `bonnetInner p50 / intactFlank p50` and its `ref 0.648` anchor.** The reference
  region `refFlank 0.156,0.292,0.278,0.389` on `crash-cam-03` (`verdicts/wave-o/damage-model.md:46`)
  is the white car's **shattered windscreen, cabin interior and floating debris** — cropped and
  looked at, `p99 222.7` with 4.96% over 200. Not paint. The ratio also swings **6x** on the choice
  of cc03 denominator (roof 205.6 / green flank 57.6 / shadow flank 34.9) and **2.2x** on ours
  (yellow 105.1 vs red 47.7), because its denominator is a body-colour luma and the reference car is
  white. **Eighteenth.** Replaced by T1 against the frame median.
- **NEW — RETIRED: `_px.mjs` p01/p50/p99 on regions whose pixel width is a multiple of 32.**
  `_px.mjs:60`'s `(n & 31) === 0` sampler degenerates to a fixed 5-7 column set for all three damage
  regions at 1600x1000. Paired synthetic control: the same 12.5%-bright comb reports
  `40/40/40` at one phase and `240/240/240` at another, against a true `40/40/240`; width-191
  reports it correctly. Real-frame magnitude ±4%, i.e. larger than the scale-persistence used as
  evidence. **Nineteenth.** Fix: 256-bin histogram over every pixel; interim: `sub40`/`sup200`.
- **NEW — WITHDRAWN: the wave-P proof that targets 1 and 2 are mutually exclusive.** The "diffuse
  ceiling at albedo 1.0 / AO 1.0" of p99 105.5 / 112.9 was never measured — those are the shipped
  B leg's own p99s, quoted from the report's own tables. Measured with `partUnder`'s maps stripped
  and colour forced white: **160.5 / 158.5**. (160.5 - 28.9)/2.30 = **57.2** against target 2's
  **57.8**. Marginal, not incompatible.
- **NEW — RESTATED, CROSS-PIECE: the wave-Q car-paint retirement of the `daytime-downtown`
  `intactFlank` region is CAMERA-SCOPED.** Upheld at the `damage-shot.mjs` **default** camera
  (bit-identical L0.75/L0.95, rgb 104.8,121.4,136.3, storefront signage — I reproduced both proofs).
  **Invalid at `--cam "3.9,1.6,4.2|0,0.75,0.3|40"`**, where the region is the hero car's yellow rear
  quarter panel and moves 6.2% with damage level (112.0 → 105.1). The retirement was issued with
  scene and level but no camera — the exact omission the damage builder had just proven fatal, one
  handoff earlier, in the opposite direction. **A damage denominator is a FOUR-parameter quantity:
  scene, level, camera, and the tool revision that measured it.**
- **NEW — RESTATED: the wave-P instruction to substitute `car-paint-closeup`'s 47.7 into a
  `daytime-downtown` numerator is invalid.** Same-frame ratios only: dd/L0.95/CAM-D = 0.583;
  cpc/L0.75/CAM-0 = 1.436; cpc/L0.95/CAM-0 = 1.222.
- **UPHELD: the metal-flange-in-ORM-`.b` negative result, and the revert is real in the tree.**
  `:889 ao.data[o+2] = 0`, `:904 metalness: 0.10`, no `metalnessMap` on `partUnder`, reasoning
  annotated at `:877-885`. Do not re-try. Read the "15% worse" as directional, not exact — it is a
  p99 delta on a column-aliased region (§5).
- **UPHELD: `tools/damage-shot.mjs`'s `--w/--h` fix is live** at `:36-38`
  (`const vpW = Number(args.w) || 1600`), default 1600x1000 preserved so historical fractional
  regions stay comparable.
- **UPHELD: `p01/p50 <= 0.30` stays retired and is grade-owned.** Reproduced: our frame p01 **25.7**
  with **0.00%** under luma 16; cc03's frame p01 **4.0** with **9.36%** under 16.
- **UPHELD: wave N's standing results.** `envMapIntensity 2.0` at `:914`, structure in albedo plus
  an ORM `roughnessMap`, no `metalnessMap` — all verified present and unmodified.
- **UPHELD: the wave-P sub-tessellation constraint.** `bonnetRib` is one `ribPad` product spanning
  7 segments in u and 11 in v on a `slabGeo(24, 18, …)`; `ribTent` and all six tents are gone from
  the file. Any feature narrower than `du = 0.042` / `dv = 0.056` must live in the 512 map.
- **UPHELD: `post.js` determinism, on a MOVED peer set.** Nine of the fourteen peers changed after
  wave P's renders and every B-leg figure still reproduces to the digit. Determinism is not the
  weak link; the sampler is.
- **NOTED — process:** `game/damage.js`'s mtime (07:23:23) is later than its renders of record
  (07:07-07:09), but the bytes are identical to `/tmp/damage-B.js` and to the reported md5
  `cd22a4c2…`. Settle this class of question with `diff`/`md5`, not mtime.
- **NOTED — the builder's nominated next gap is not endorsed.** `:972 buckle 0.052 → 0.020` tested
  and reverted byte-exactly: p50 61.3 → 59.5 (inside the tool's own error bar), ratio moves away
  from target, crop barely changes. The dominant folds are `:976 crease` and `:977 bend`.
