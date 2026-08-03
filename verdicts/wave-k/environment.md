# WAVE K VERDICT — environment (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/world.js

PIECE: environment (buildings/props/density)   ROUND: k1
SCENE: daytime-downtown   OURS: shots/world-k1.png   REF: reference/daytime-downtown-04.jpg

BLIND CALL: Ref is real. Cue: in the ref the mid-distance tower's window mullions sit ~2 luma
steps off its wall — airlight has eaten the black point. Ours renders a building 180 m away
with near-black window recesses beside near-white stone bands. Our street canyon reads as a
clean-air diorama with a fog card at the vanishing point.

VERDICT: real wins

## NUMBERS (all `sips -Z 1920` on the ref first; ours native 1920x1080)
- Mid-distance architecture, `_facademeas.mjs`:
  ours `--x 0.560,0.750 --band 0.180,0.440` -> **sobel 26.60, strong% 32.6**
  ref04 `--x 0.521,0.781 --band 0.185,0.519` -> **sobel 4.06, strong% 1.4**.  6.5x excess.
- **DEPTH ORDERING IS INVERTED.** ours near `--x 0.00,0.18 --band 0.02,0.45` = 4.24 -> mid-far
  26.60 (RISES 6.3x). ref near `--x 0.02,0.22 --band 0.02,0.50` = 5.40 -> far
  `--x 0.54,0.72 --band 0.13,0.45` = 3.13 (FALLS to 0.58x).
- Vanishing point is a blown hole: ours `--x 0.42,0.58 --band 0.40,0.48` lum **194.6**,
  dark% 0.0. Ref far window lum 78.2.
- Saturation falloff is already FINE (ours 0.453->0.140 = 0.31x; ref 0.737->0.366 = 0.50x).
  We over-desaturate and under-airlight.

## CLAIMS CHECKED
- *Skirts, not car pads (r12 #1)* — **REPRODUCED independently.** Probe over `contactShadows`
  (8337 instances): exactly **610 pads >200 m^2 carry 93.33%** of alpha-weighted ink; 7087
  small pads carry 5.13%. r12 used a circumscribed-circle area convention; conclusion identical.
- *signFrame cap / panelPair (r12 #3)* — **VERIFIED.** signFrame count **6229 of cap 9000**
  (was truncating at 5000). PARAGON TATTOO board renders legible printed faces, not a dark
  slab. Instances **225,817**, matching exactly.
- *Pads INFLATE shadow-ab MAD via the ACES shoulder (r12 #2)* — **NOT SUPPORTED. RETIRED.**
  Three baseline runs: road MAD 13.9205/13.8732/13.9469 (spread 0.074); meanOn
  89.10/88.61/89.61 (spread **1.00**). Pads hidden via `--pre`: MAD 13.5754 (delta -0.35,
  2.5%), meanOn **88.53 — INSIDE the baseline spread**. The shoulder story needs meanOn to
  RISE; r12's own cited numbers (89.6->88.1) are a FALL and are smaller than run-to-run noise.
  Shadows are ALIVE (road MAD ~13.9, meanOn 89 vs off 100).

## BIGGEST REMAINING GAP: no additive airlight on architecture
`game/world.js:868-872` (`atmoTail`) spends its haze budget as `mix(rgb, vec3(lum), fq*0.72)`
— a desaturate-to-own-luma, which **preserves 100% of local contrast and keeps bright facades
bright** — and only `fq*0.18` toward `uHaze`. Worse, `uHazeD` is fed from `scene.fog.density`
(`world.js:2749`), which is the **dead 0.001 placeholder hardcoded at `sky.js:1404`**, not the
preset's `d0 0.0016`. At 180 m that is 3.4% airlight. The residual haze comes from sky.js's
height-integrated fog, whose `k: 0.038` decays to 0.26 by 35 m up, so **every facade above the
podium line is unhazed at any distance.**
FIX: swap the desat for real airlight (`mix(rgb, uHaze, fq)`, weight >=0.7) and drive `uHazeD`
from `sky.fogParams[0]`.

## TARGETS FOR NEXT ROUND
1. Mid-far sobel `--x 0.560,0.750 --band 0.180,0.440` from 26.60 -> **under 10**,
   strong% 32.6 -> **under 8**.
2. Far sobel must fall BELOW near sobel (ref ratio 0.58-0.75). Near
   `--x 0.00,0.18 --band 0.02,0.45` must stay 4.24 +/-1.
3. Vanishing point lum `--x 0.42,0.58 --band 0.40,0.48` 194.6 -> **under 150**.
4. DO NOT REGRESS: `shadow-ab.mjs --scene daytime-downtown` road MAD must stay **>12**
   (baseline 13.87-13.95 over 3 runs).

## RETIRED/CORRECTED
- The standing constraint "the shadow-ab MAD drop is pad dilution" is **wrong in BOTH
  directions** — struck entirely. Pads move road MAD 2.5%. **Stop using shadow-ab to reason
  about pads**; it has meanOn run-to-run variance of 1.0 and facade-MAD variance of 0.24,
  which swamps the effect.
- 19-21 street-band sobel: not re-chased, no props added.
- Second-order, NOT the headline: parked-car proxies (`world.js:2311` area) are flat coloured
  slabs with no wheel arches, glass or lamps, ~8% of frame area at midground. Ref04 has no
  comparable object so it sets no target — **do not fix it before the airlight.**
