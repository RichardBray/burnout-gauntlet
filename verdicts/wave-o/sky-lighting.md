# WAVE O CRITIC — sky-lighting (o1) — game/sky.js

PIECE: sky-lighting  ROUND: o1
SCENE: dusk-highway-chase  OURS: shots/sky-o1.png  REF: reference/dusk-highway-chase-01.jpg
BLIND CALL: **ref**. Its dome is a clean cloudless teal->lemon ramp saturated at BOTH ends; ours lays a grey-cream cirrus/alto veil across the upper middle and the crossover reads chalky, not sodium.
VERDICT: **real wins**

## CLAIMS CHECKED — all constants reproduce, all numbers reproduce

`ARCH_G 0.70` :464, `ARCH_TINT 0.25` :465, `ARCH_HSH 0.80` :466, `pa` :484-485, `arch` :512-513, `src` middle line :514-516, `uMsBeam` :295/:1314/:1338, `msBeam: 2.5` :944 (dusk only). Verified literals, not comments. No Rule-5 failure.
My independent render reproduces the builder's B column exactly: `s=0.75,0.82,0.46,0.48` luma **184.4** / sat **0.499** / lin B/R 0.217; `mid=0.55,0.65,0.24,0.28` R/G **0.923**; `z=0.55,0.65,0.00,0.04` B/G **1.059**; sat-0.30 crossing y **0.325**; valley y0.16 **0.097**, y0.20 **0.107**. Regressions hold: midday `0.44,0.50,0.10,0.20` sat 0.134; night `0.44,0.52,0.08,0.16` 0.561; night horizon 0.443. Arch is inert outside dusk.
I built my own replica of `scatter()`; it reproduces the shipped LUT at u=0.50/elev 0 to 3 dp (0.383,0.314,0.155). Everything below uses it.

## 1. THE Hsh=0.10 REJECTION — RIGHT CALL, WRONG EVIDENCE. DO NOT REINSTATE 0.10.

Endorsed: **ship 0.80, never 0.10.** But the recorded justification does not survive checking, and a later wave that discovers that must not read it as licence.
- Convergence IS real but small: over all 192 LUT rows x 6 azimuths, |NS40-NS400| maxes at **3.49 levels at HSH 0.10** vs **0.94 at HSH 0.80** — 3.7x worse, converged either way. The quoted "zenith 65->69->73 as NS 40->96->160" does NOT reproduce (I get 48.1->48.7->48.7).
- The "**136-level hard step**" does NOT reproduce at all. Max adjacent-LUT-row step is **6.01 levels at HSH 0.10 vs 7.81 at 0.80** — 0.10 is the *smoother* of the two.
Keep 0.80 on the honest ground: a 100 m gate inside a 785 m shadow layer sampled by a quadratic march whose *finest* step on a horizon ray is ~0.55 km is unresolved by construction, and it measurably degrades convergence 3.7x for a scoreboard win. **The builder's judgement was correct and its instinct is the behaviour to protect. Its two headline numbers are not reproducible and are hereby corrected.**

## 2. THE 22x RAMP — RETIRED, on better evidence than was given

Agreed, retired. The builder's stated bound is arithmetically wrong: sin(21)/sin(1.5) = **13.7x**, not 3.3x. Correct disproof, from the validated replica: msBeam 0/1/2.5/5/10/20/50 gives ramp 5.00/5.47/6.07/6.86/7.94/9.15/**10.5x** — asymptotic, never 22x — and by msBeam 50 the 21-deg row is code **179.5** against ref's 85. ARCH_HSH cannot buy it either (7.16x at 0.05). Gain raises the top of the dome as fast as the bottom.
**RETIRED: "22x red ramp / >=200 S luma / <=0.28 crossing".** Replaced by row-level RGB, ref `reference/dusk-highway-chase-01.jpg` column `x=0.66,0.74`, ours `x=0.55,0.65`:
- `z` y=0.00,0.04: ref **56.5,94.1,99.8 sat 0.434** — ours 72.9,98.5,104.3 sat 0.301. Target R within 6, sat >=0.38.
- valley y=0.16,0.20: ref **sat 0.221** — ours 0.097. Target >=0.18.
- `s`/`b` y~0.46: ref 248,226,126 sat 0.492 — ours 210,185,105 sat 0.499. Sat PASSES; leave it.

## BIGGEST REMAINING GAP

**The arch is not localised in elevation.** `pa` (`sky.js:484-485`) is evaluated on `dot(V, S_sun)`, so a 21-deg ray 30 deg off the sun sits inside the ARCH_G 0.70 forward lobe and collects nearly the full arch. Result: the shipped edit pushed the 21-deg row **+16.4 red** (61.3 -> 72.9 vs ref 56.5) and crushed zenith sat 0.434 -> **0.301**. Note the wave-N claim "our 21 deg row already matches ref within 5/255" was true of **A (msBeam 0)** and is **false of what shipped**. Fix in `sky.js:512-516`: attenuate the arch by the *sample's* altitude above the shadow layer (or evaluate `pa` against the arch's own low-elevation direction), so it lights the bottom 5 deg and dies by 15.
Second: the dusk cloud block `sky.js:981` (alto 0.38 / cirrus 0.16 / low 0.30) costs the valley >45% of its chroma — clear-sky replica 0.178 pre-grade vs 0.097 shipped, against a cloudless ref at 0.221.

## CROSS-FILE + EXPOSURE

`sky.fogParams[0]` **exists and is live**: `Float32Array [d0,k,y0,uni]` declared `sky.js:107`, exported `sky.js:1454`, written each `apply()` at `sky.js:1536` from `p.fog.d0`, dusk `d0: 0.0030` at `sky.js:975`. world.js read-only is safe.
**Scene exposure did NOT move**: `exposure: 1.30` (`sky.js:1016`), skyGain 0.55, both untouched. **But the environment did.** `scene.environment` is PMREM'd from the sky (`sky.js:1559-1561`), and msBeam 2.5 raises cosine-weighted sky diffuse irradiance **1.075x** (horizon LUT linear 0.383,0.314,0.155 -> 0.637,0.526,0.205, i.e. +66% on the low rows that dominate horizon-facing specular). Every piece reading `scene.environment` at dusk — car-paint, damage, environment, road — got more sky light this wave. Re-baseline before quoting any dusk brightness number.

## SIXTH MEASUREMENT/DOC DEFECT

`sky.js:1017-1021` carries a **WARNING that the per-preset grade is inert dead code** ("main.js ... imports nothing from post.js except createSsaoPass"). It is false and contradicts `sky.js:76` in the same file: `main.js:13` imports `createOutputPass`, `:128` builds it, and `toneLift`/`toneGrade` are written at `sky.js:1551-1555`. Delete that comment before it costs someone a round.
