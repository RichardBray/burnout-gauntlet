# WAVE Q CRITIC — sky-lighting

PIECE: sky-lighting   AUDITS: `verdicts/wave-p/sky-lighting.md`
SCENE: `dusk-highway-chase`, chase cam, 1920x1080 (and 960x540 for the scale guard), default
damage level, `tools/shot.mjs --scene dusk-highway-chase`.
REF: `reference/dusk-highway-chase-01.jpg` (1728x1080), "Chase cam ~4 m behind and slightly above
a silver coupe on an elevated coastal freeway, sun just below the ridgeline".
Tree state at audit: `md5 game/sky.js` = `69f00e3cc014a2e8ec7ad886481663ca` (restored bit-identical
after every probe edit below).

## VERDICT: real wins

### The crop, before any number

Two 576x400 crops of the sky column, no grid, `tools/_cropimg.mjs`:
`shots/_qc-X.png` = ours `960 1536 0 400`, `shots/_qc-Y.png` = ref `864 1440 0 400`.

Y is an unbroken deep-teal-to-lemon vertical ramp: it never stalls, never changes hue direction,
and by the bottom of the crop it is a saturated lemon. X starts at almost exactly the same teal,
then **stops climbing** — by the bottom of the crop it has plateaued into a grey-green, and the
cirrus/alto wisps crossing it are a dirty grey-brown rather than a lit cloud. The thing that
decided it was the plateau, not the clouds: X has a ceiling on its ramp and Y does not.
Y is the reference.

## RULE-5 STATUS — CONSTANTS CLEAN, TWO DEFECTS IN THE TREE, FOUR HANDOFF LINE REFS WRONG

Every before/after literal in the Wave P report re-greped against the file:

```
sky.js:499   ARCH_G    0.70          MATCHES
sky.js:500   ARCH_TINT 0.25          MATCHES
sky.js:501   ARCH_HSH  0.80          MATCHES (0.10 not reinstated)
sky.js:502   ARCH_EV   0.06981317    MATCHES (new constant, 4.0 deg)
sky.js:536   archEl = exp(-max(asin(clamp(mu,-1,1)),0)/ARCH_EV)   PRESENT, hoisted above the march
sky.js:556   arch = uMsBeam * (1-exp(-sdep/ARCH_HSH)) * archEl    MATCHES
sky.js:995   msBeam    3.2           MATCHES
sky.js:998   skyGain   0.55          MATCHES
sky.js:1026  fog d0    0.0030        MATCHES
sky.js:1067  exposure  1.30          MATCHES
```

Both mandated comment corrections **CONFIRMED**: the module note now reads
"*** THE PER-PRESET GRADE IS LIVE. THIS NOTE USED TO SAY IT WAS DEAD. IT WAS WRONG. ***"
(`sky.js:78-95`) and the dusk grade block at `sky.js:1068-1076` now states the grade reaches the
image on the default ACES path. The greps it cites (`main.js:13/:75/:128`, `post.js:35/:414`) all
check out. The arch is code-level inert outside dusk: `msBeam` exists on **only** the dusk preset
and `sky.js:1392` defaults `uMsBeam` to `0.0`, so `arch = 0 * archEl` identically. That is a
stronger proof than the four regression renders and I did not repeat them.

**DEFECT 1 — a lying comment shipped in the tree, the exact class Wave P was mandated to fix.**
`sky.js:992-993` states the sodium row after the change is
`rgb 210.9,187.4,109.1 sat 0.483`. The shipped tree renders **`210.3,185.1,105.6 sat 0.498`**
(my measurement, and the verdict's own table agrees with me, not with the comment). The comment is
a stale intermediate and it under-reports the hold by 3.5/255 and over-reports a sat loss of 0.015
that did not happen. Fix the comment or delete the numbers.

**DEFECT 2 — the two handoff line refs the report gives the next round are both wrong.**
```
report says  sky.js:771  warmL = lutAt(0.02, 0.030)     ACTUAL sky.js:815   (:771 is comment text)
report says  sky.js:752  coolL                          ACTUAL sky.js:796
report says  sky.js:1032 alto: 0.38, cirrus: 0.16       ACTUAL sky.js:1042
report says  sky.js:1041 low: 0.30                      ACTUAL sky.js:1049
```
Same error is propagated verbatim into `STATE.md:69` and `:73`. The constants are right; only the
addresses are stale (copied forward from an earlier round rather than re-greped). Every other line
ref in the report (`:499-502`, `:536`, `:556`, `:995`, `:998`, `:1026`, `:1067`) is correct, which
is what makes this worth flagging: a reader has no way to tell which half is live.

**EDITS NO VERDICT EXPLAINS — none in `sky.js`.** But six other `game/` files have mtimes AFTER
`sky.js` (05:56): `world.js` 06:39, `hud.js` 06:47, `car.js` 06:48, `audio.js` 06:24,
`damage.js` 07:09, `crash.js` 07:12. My renders are on that later tree and still reproduce every
one of Wave P's B numbers to **0.1/255 on all six sky rows**, so nothing leaked into the sky
regions. Recording it so wave R does not read my figures as a frozen-tree A/B.

## WHAT REPRODUCED

`node tools/_px.mjs shots/_q-sky-1.png --region z=0.55,0.65,0.00,0.04 --region
valley=0.55,0.65,0.16,0.20 --region v1=0.55,0.65,0.14,0.18 --region v2=0.55,0.65,0.18,0.22
--region mid=0.55,0.65,0.24,0.28 --region s=0.75,0.82,0.46,0.48`

Every single Wave P B figure reproduced **exactly**: z `61.5,92.2,103.2 sat 0.404`,
valley `101.8,117.8,112.3 sat 0.136`, v1 sat 0.199, v2 sat 0.145,
mid `100.5,115.9,105.3 sat 0.133`, s `210.3,185.1,105.6 sat 0.498`. Rule 5 on the measurements:
CLEAN.

**Scale guard (required).** 960x540 re-render, same regions: z `61.5,92.1,103.2 sat 0.404`,
y18 `99.5,116.3,110.3`, y24 `100.3,115.7,105.2`, s `210.4,185.2,105.7`. Max deviation from 1920
is **0.2/255**. No aliasing carrier.

## TOOL AUDIT 1 — `_skyprobe --noclouds`: WAVE P'S FIX IS REAL. PAIRED CONTROL PASSES.

The fix at `tools/_skyprobe.mjs:66-77` is present in the tree (`updateMatrixWorld(true)`, 4x
`composer.render()`, an rAF, one more `render()`). I did not take that on trust. Paired control,
both legs at 1920x1080 on the same tree:

- **NULL leg** — `node tools/_skyprobe.mjs --noclouds x --out shots/_q-noc-null.png`. Mode letter
  `x` matches no branch, so the preset is untouched but the whole new re-render path still runs.
  Result: **byte-for-byte the same numbers as `shot.mjs`** on all six rows
  (z 61.5,92.2,103.2 / valley 0.136 / s 210.3,185.1,105.6). The added renders do not themselves
  perturb the frame.
- **FORCED leg** — `--noclouds c --out shots/_q-noc-c.png`. valley sat **0.136 -> 0.261**,
  mid sat 0.133 -> 0.176, mid R 100.5 -> 107.5, while `s` is unchanged to 0.0/255 and `z` moves
  0.404 -> 0.406.

Metric follows the forced extreme; null leg does not move. **The tool is fixed and Wave P's
cloud-limit proof STANDS, reproduced to three decimals.**

## TOOL AUDIT 2 (the primary one) — EVERY ROW ANCHOR IN THIS PIECE IS MISREGISTERED BY 3-5 DEG

This is the find. **The two frames do not share a horizon line, and no wave has ever checked.**

- **Ours**: `probe.mjs` gives camera pitch -0.358 deg, vfov 44.36 deg. Horizon NDC =
  `tan(0.358 deg)/tan(22.18 deg)` = 0.01533, so the horizon sits at **y = 0.5077**. Confirmed by
  eye in `shots/_qc-ourFull.png` (road vanishing point at y ~0.505).
- **Reference**: `shots/_qc-refhor.png` (`_cropimg.mjs reference/dusk-highway-chase-01.jpg ...
  1200 1728 500 700 2 50`) puts the distant ground plane behind the barrier, and the bases of both
  hills, at pixel y **640-650 of 1080 = y 0.593-0.602**.

Offset **0.072-0.102 of frame height**. At our own 44.36 deg vfov that is **3.2-4.5 deg**; over a
conservative 35-55 deg vfov band for the reference camera it is **2.5-5.6 deg**. Call it 3-5 deg.
**Wave P's ARCH_EV is 4.0 deg.** The registration error is the same size as the parameter the
whole round was spent choosing.

Re-measured with the ref rows shifted down by 0.087 to put them at OUR elevations
(`node tools/_px.mjs reference/dusk-highway-chase-01.jpg --region m00=0.66,0.74,0.087,0.127 ...`
in 0.04-tall steps), against our `0.55,0.65` column:

| our band | our elev | OURS (shipped) | REF, frame-fraction (as briefed) | REF, elevation-registered |
|---|---|---|---|---|
| y0.00-0.04 | 20.9 deg | 61.5,92.2,103.2 sat 0.404 | 56.5,94.1,99.8 sat 0.434 | **92.2,120.2,108.3 sat 0.233** |
| y0.06-0.10 | 18.3 | 69.1,99.3,107.4 sat 0.357 | 77.9,109.9,104.7 sat 0.291 | **130.6,147.5,117.7 sat 0.201** |
| y0.12-0.16 | 15.6 | 78.2,107.7,111.9 sat 0.301 | 112.6,134.6,113.4 sat 0.163 | **172.9,175.8,126.5 sat 0.281** |
| y0.18-0.22 | 13.0 | 99.4,116.2,110.2 sat 0.145 | 154.0,163.4,123.0 sat 0.247 | **210.5,202.8,133.0 sat 0.368** |
| y0.24-0.28 | 10.3 | 100.5,115.9,105.3 sat 0.133 | 194.6,191.3,130.4 sat 0.330 | **237.5,221.4,134.2 sat 0.435** |
| y0.30-0.34 | 7.7 | 145.3,145.4,115.9 sat 0.203 | 227.5,214.3,134.5 sat 0.409 | **247.5,228.2,130.0 sat 0.475** |

**The registration decides the SIGN of the headline target.** Unregistered, our top row is R +5.0
too bright and sat 0.030 too low — "PASS". Registered, the same row is R **31 too DARK** and sat
**0.171 too HIGH** — a fail in the opposite direction on both axes.

Independent confirmation that registration, not frame-fraction, is the right frame: one render at
`skyGain 0.55 -> 1.00` (`shots/_q-sg100.png`, sky.js restored after) puts the top row at
**97.0,134.7,146.4 sat 0.337** — 4.8/255 from the *registered* ref row (92.2) and 40/255 past the
*unregistered* one (56.5). Two different constants are "correct" depending on which anchor you
believe, and the piece has never chosen.

**Secondary anchor defect, smaller but real: the `s` box is not the same object in the two
images.** `x 0.75-0.82, y 0.46-0.48`. Cropped and looked at (`shots/_qc-sbox.png`,
`shots/_qc-sboxR.png`): in the reference it is pure flat sky, p99-p01 = **2.3 levels**. In ours the
lower third of the box is crossed by power lines, three lamp heads and the edge of a tower block,
p99-p01 = **30.1 levels**. Every other near-horizon box I tried in ours is worse
(`0.62,0.70,0.42,0.46` spread 100; `0.42,0.50,0.40,0.44` spread 125; `0.30,0.38,0.42,0.46` spread
112). The A/B "held to 0.4/255" claim survives — both legs eat the same geometry — but
"our sat 0.498 vs ref 0.500" is a coincidence between two different populations and must stop
being quoted as a match. Ours is also 38 levels darker (210.3 vs 248.6).

## TESTING THE BUILDER'S NOMINATED NEXT GAP — CONFIRMED BUT MIS-RANKED

The cloud-limit claim is **true and reproduced**: valley sat 0.136 -> 0.261 with the decks at 0,
against ref 0.221; the deck eats 0.125 of chroma off one 4%-tall row. I verified it with the fixed
tool and the null control above.

But it is not the biggest gap, and the same clouds-off render says so:

| row | shipped | clouds OFF | ref (frame-frac) | ref (registered) |
|---|---|---|---|---|
| valley sat | 0.136 | **0.261** | 0.221 | — |
| mid sat | 0.133 | **0.176** | 0.330 | 0.435 |
| mid R | 100.5 | **107.5** | 194.6 | 237.5 |
| y0.18-0.22 R | 99.4 | 89.6 | 154.0 | 210.5 |

Clouds-off buys **7.0 R** at `mid` against a deficit of **94 R** unregistered / **137 R**
registered. The deck is worth one row's saturation and nothing else. Ranking the dusk cloud deck
as "the single biggest gap" is the scoreboard talking: `valley` happens to be the one row where
the deck's 0.125 dominates.

## PAIRED CONTROL ON THE ARCH — IT HAS NO AUTHORITY LEFT WHERE THE TARGETS ARE

Two probe renders, `sky.js` edited then restored to md5 `69f00e3c...` and re-verified each time.

**Leg 1 — `msBeam: 3.2 -> 0.0` at `sky.js:995`, arch entirely deleted** (`shots/_q-mb0.png`):

| row | shipped | arch OFF | delta |
|---|---|---|---|
| z y0.00-0.04 | 61.5,92.2,103.2 sat **0.404** | 61.3,92.1,103.2 sat **0.406** | **-0.2 R, +0.002 sat** |
| y0.18-0.22 | 99.4 R sat 0.145 | 91.9 R sat 0.185 | -7.5 R |
| s | 210.3,185.1,105.6 | 190.2,159.8,87.3 | -20.1 R |

**Both of Wave P's headline zenith targets score BETTER with the arch deleted than with it
shipped.** R within 6 of 56.5: arch-off 61.3 (delta 4.8) beats shipped 61.5 (delta 5.0).
sat >= 0.38: arch-off 0.406 beats shipped 0.404. The whole arch is worth **0.2/255** at the z row.

**Leg 2 — `ARCH_EV 4.0 deg -> 12.0 deg`, msBeam left at 3.2** (`shots/_q-ev12.png`): z row
64.2,93.6,103.5 sat 0.380. R fails the `<= 62.5` gate; sat lands exactly on the 0.38 gate.
Sodium row moves only 210.3 -> 212.7, i.e. the `msBeam 2.5 -> 3.2` renormalisation is worth
~2.4/255 and is honestly described. At `y0.18-0.22` a 3x widening of the band buys **+7.2 R**
(99.4 -> 106.6) and *loses* saturation (0.145 -> 0.113).

So, to the brief's question — **is a target that every value in a 2.7x range satisfies a target at
all?** No, and the reason is worse than flatness. The z row passes for every `ARCH_EV` small enough
to switch the arch OFF at 21 deg; the "3.0-8.0 deg all pass" band is measuring the arch's ABSENCE,
not the parameter's irrelevance. The measured upper edge is between 8 and 12 deg, and the lower
edge is the 2.2 deg physical bound, so the honest statement is "any value in 2.2-~9 deg, because
the arch contributes 0.2/255 there either way." `ARCH_EV = 4.0` is not a tuned number and is not a
justified one either — it is unconstrained by the current target set, and once the frames are
registered it will be constrained hard and in the *opposite* direction (the registered reference
still holds 82% of its horizon R at 13 deg, which `exp(-13/4) = 0.04` cannot produce).

## CROSS-PIECE RE-BASELINE — RE-VERIFIED FROM THE LIVE ENGINE, NOT A REPLICA

Wave P's irradiance figures came from an offline replica. I re-derived them **in-page from the
baked LUT** (`sky.sampleLut`, 12 azimuths x 24 elevations, upward weight `sin(el)cos(el)`,
sunward-horizontal weight `cos^2(el)cos(az)` over the forward hemisphere; script kept at
`/tmp/_qirr.mjs`). Tree `A` was reconstructed exactly by setting `ARCH_EV = 1000.0` (so
`archEl == 1`) with `msBeam 2.5`; `beam0` by `msBeam = 0`. Absolute scale differs from Wave P's
(different normalisation); **the ratios are what four pieces need and they all confirm:**

| quantity | Wave P claim | my measurement | agree? |
|---|---|---|---|
| upward cosine irradiance, A / beam0 | 1.075x | **1.0756x** | yes |
| upward cosine irradiance, **B / A** | **0.938x** | **0.9381x** | yes |
| sunward horizontal-normal, A / beam0 | 1.196x | **1.1985x** | yes |
| sunward horizontal-normal, **B / A** | **0.910x** | **0.9109x** | yes |
| upward, B / beam0 (net of wave O) | 1.008x | **1.0090x** | yes |
| LUT u0.113 el0 linear R, **B / A** | **1.166x** | **1.1661x** | yes |
| LUT u0.113 el0 linear R, absolute | A 1.5080, B 1.7587 | A 1.5049, B 1.7549 | yes, 0.2% |
| upward B/R, A -> B | 1.700 -> 1.844 (beam0 1.867) | **1.691 -> 1.833** (beam0 1.858) | yes, 0.6% |

**RE-STATED FOR WAVE R, verbatim-quotable:** relative to the tree Wave O measured, dusk sky
diffuse irradiance is **0.938x (-6.2%)** for an upward-facing normal and **0.910x (-9.1%)** for a
sunward horizontal normal; the environment is slightly cooler (upward B/R 1.69 -> 1.83); the
sodium band's own linear radiance is **1.166x UP**. Wave O's "+1.075x" is CANCELLED — B is
**1.008x** of the pre-arch tree, i.e. dusk env is back where it was before wave O.
`exposure` 1.30 (`sky.js:1067`) and `skyGain` 0.55 (`sky.js:998`) are untouched — **verified by
grep, not by the report.** car-paint, damage, environment and road baseline off these.
Caveat wave R must carry: **if the registration finding above is acted on, these move again**, and
by much more than 6-9%.

## BIGGEST REMAINING GAP

**`game/sky.js:998` — `skyGain: 0.55`. The dusk dome's radiance between 8 and 21 deg elevation is
1.8-2.2x too low, and no arch parameter can reach it.** Measured: with the arch entirely deleted
(`msBeam: 0.0`) the y0.18-0.22 row reads 91.9 R and shipped reads 99.4 R, so the **whole** arch is
worth 7.5/255 there, against a deficit of 55 R (frame-fraction anchor) or 111 R (elevation
registered). Clouds-off buys another 7 R at `mid`. The single render that moves the ladder is
`skyGain 0.55 -> 1.00`: y0.18-0.22 99.4 -> 143.9, y0.24-0.28 100.5 -> 145.1, s 210.3 -> 233.5.
Wave P was right to refuse to spend it unilaterally — it re-baselines every dusk-lit piece a second
time — but it is the lever, and `sky.js:1042/:1049` (the cloud deck) and `sky.js:815` (`warmL`) are
both second-order to it.

**This gap cannot be scored until the anchor is fixed.** At `skyGain 1.00` the top row is 4.8/255
from the registered reference and 40/255 wrong against the briefed one.

## NEXT-ROUND TARGETS

**T0 — BLOCKING, measurement only, no `game/` edit. Register the two frames in elevation.**
Deliver, for `reference/dusk-highway-chase-01.jpg`: the eye-level horizon y-fraction with an
uncertainty (start from `shots/_qc-refhor.png`, x 1200-1728, y 500-700, the ground plane behind the
barrier), a stated vfov assumption with its basis, and a table converting each briefed y-band to
DEGREES OF ELEVATION. Then re-state every row target in degrees. My estimate to beat: ref horizon
**y 0.593-0.602**, ours **y 0.5077**, offset **3-5 deg**. If a builder cannot pin the ref vfov,
report the row targets as a BAND over vfov 35-55 deg. **No sky constant may be changed before this
lands.**

**T1 — dome radiance, stated as a BAND, at MATCHED elevation.** Method: `tools/shot.mjs --scene
dusk-highway-chase --out shots/<x>.png`, then `tools/_px.mjs <x>.png --region
e13=0.55,0.65,0.18,0.22 --region e10=0.55,0.65,0.24,0.28`, versus the ref at the T0-corrected
y-bands. Target once T0 lands: our 13.0 deg row R in **[0.85, 1.15] x** the ref's 13.0 deg row R,
and the 10.3 deg row likewise. Both are BANDS — overshoot fails. Today: 0.47x and 0.42x.

**T2 — hold the sodium row while doing it, on a CLEAN box.** The current `s` box is 12% geometry.
Use `--region s2=0.75,0.82,0.435,0.450` (above the wires; verify by cropping it first with
`tools/_cropimg.mjs shots/<x>.png shots/_chk.png 1440 1574 470 486 6 100000` and LOOKING) and
report its p99-p01 spread alongside the mean. Gate: mean R within **+/-4/255** of the pre-change
render, spread <= 12.

**T3 — `warmL` at `game/sky.js:815` (NOT :771).** `warmL = lutAt(0.02, 0.030)` taps a fixed near-sun
horizon texel and feeds every cloud pixel to 25 deg. Make it follow the pixel's own (u, l) the way
`coolL` at `:796` already does. Wave P's arithmetic on it checks out
(`archEl(1.72 deg) = 0.651` x `3.2/2.5 = 1.28` = **0.833x**, matching its claimed "~0.83x").
Measure with `_skyprobe --noclouds c` as the clear-sky reference: target is to close **half** the
veil penalty, i.e. valley sat from 0.136 to **>= 0.199** (band 0.19-0.27, clear-sky value 0.261 is
the ceiling), with `mid` sat not falling below 0.133.

**T4 — `ARCH_EV`, once T0 lands.** Re-derive it against the registered reference rather than
defending 4.0. Method: sweep `sky.js:502` over 4/8/12/16 deg with `msBeam` re-normalised each time
to hold T2, and report the y0.18-0.22 and y0.24-0.28 rows. Two of the four points already exist:
4 deg -> 99.4/100.5 R, 12 deg -> 106.6/108.4 R.

## RETIRED / RESTATED, WITH PROOF

1. **RETIRED as ARCH targets: `z` "R within 6 of 56.5" and `z` "sat >= 0.38".** Paired control:
   `msBeam: 0.0` (arch entirely deleted) scores **61.3 R / sat 0.406**, beating the shipped
   61.5 / 0.404 on both. A target that scores best with the feature removed does not measure the
   feature. They may survive as whole-sky targets after T0; they are dead as arch targets.
2. **RETIRED: "ARCH_EV is not tuned because every value in 3.0-8.0 deg passes."** The flatness is
   the arch's absence at that elevation (0.2/255 of authority), not the parameter's irrelevance.
   Measured upper edge 8-12 deg (12 deg -> z R 64.2, fails). Do not re-issue the flatness as
   evidence of anything.
3. **SUSPENDED: every row target anchored on frame-fraction** (`z`, `valley`, `v1`, `v2`, `mid`).
   Ref horizon y 0.593-0.602 vs ours 0.5077 = 3-5 deg of unregistered elevation offset, larger
   than `ARCH_EV` itself. Registering flips the sign of the headline target on both axes.
4. **RESTATED: the `s` anchor is a hold gate only, never a reference match.** Ours p99-p01 = 30.1
   (power lines, three lamp heads, a tower block edge); the ref's = 2.3 (pure sky). "our 0.498 vs
   ref 0.500" compares two different populations and is retired as evidence.
5. **RESTATED: the dusk cloud deck is not the biggest gap.** Clouds-off is worth 0.125 sat on one
   4%-tall row and **7 R** everywhere else, against a 94-137 R deficit at `mid`. Confirmed, but
   demoted below `skyGain`.
6. **CORRECTED IN THE TREE (defect, not retirement):** `sky.js:992-993` claims the post-change
   sodium row is `210.9,187.4,109.1 sat 0.483`; it renders `210.3,185.1,105.6 sat 0.498`.
7. **CORRECTED: four handoff line refs.** `warmL` is `:815` not `:771`; `coolL` `:796` not `:752`;
   `alto/cirrus` `:1042` not `:1032`; `low` `:1049` not `:1041`. `STATE.md:69` and `:73` carry the
   wrong ones.

## HAZARDS FOR WHOEVER RUNS WAVE R

- **`tools/_px.mjs` MUTATED TWICE DURING THIS AUDIT** — md5 `2cf33aa8...` at 07:23 and
  `be244caf...` at 07:29, by a concurrently running agent. Its output columns changed under me:
  `sat` became `meanCast` + a new per-pixel `satPx`, then a `>=200` column appeared. On these
  smooth sky regions `meanCast` and `satPx` agree to <= 0.005, so nothing in this report or Wave
  P's is affected — but **`sat` is now an ambiguous word across reports and every future sky
  figure must say which one it is.** Someone should also confirm no piece's scored history was
  built on the old single-column `sat` where the two definitions diverge.
- Six `game/` files have moved since `sky.js` (05:56); the sky regions are unaffected (0.1/255) but
  do not treat my numbers as a frozen-tree A/B.
- `tools/_cropimg.mjs` still takes PIXELS and still silently writes a 0-byte PNG on fractions.
  Third round in a row this has been logged. Pass a huge grid pitch (`100000`) when you want an
  un-annotated crop for a blind read.

## ARTEFACTS

`shots/_q-sky-1.png` (shipped, 1920), `shots/_q-sky-960.png` (scale guard),
`shots/_q-noc-null.png` (null control), `shots/_q-noc-c.png` (decks forced to 0),
`shots/_q-mb0.png` (`msBeam 0`), `shots/_q-ev12.png` (`ARCH_EV 12 deg`),
`shots/_q-sg100.png` (`skyGain 1.00`), crops `_qc-X/_qc-Y` (blind pair),
`_qc-ourFull/_qc-refFull`, `_qc-refhor` (the horizon evidence), `_qc-sbox/_qc-sboxR`,
`_qc-refS/_qc-ourS`. `game/sky.js` restored to `69f00e3cc014a2e8ec7ad886481663ca` and re-verified.
