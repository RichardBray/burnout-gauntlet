# WAVE M VERDICT — sky-lighting (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/sky.js

PIECE: sky-lighting   ROUND: m1
SCENE: dusk-highway-chase   OURS: shots/sky-lighting-m1.png (1920x1080)   REF: reference/dusk-highway-chase-01.jpg (sips -Z 1920 -> /tmp/ref01-1920.png for the visual)

BLIND CALL: real, but for a NEW reason. The k1 grey band is GONE - our sky is now a genuine teal->sodium ramp.
The tell is now VALUE: ref-01's sodium wash is a near-clipped cream (248,227,124) that fills the bottom ~26% of
frame and reads as a light source; ours is a dim 206,166,89 confined to the bottom ~15%, with a dull green-grey
mid-sky above it. Ours reads as a painted backdrop, ref reads as luminance.

VERDICT: real wins

## NUMBERS (`tools/_px.mjs`, fractional regions; colour/luma only, no spatial-frequency claim)
- **HEADLINE - sodium-band vertical extent.** Column scan, 0.04 steps. Ours `x=0.55,0.65`
  first crosses sat 0.30 at **y = 0.358**; ref-01 `x=0.66,0.74` crosses at **y = 0.242**. Horizon is
  y ~= 0.505 in both. Extent **0.147 vs 0.263 = 0.56x**. Scale-persistent: re-rendered at 960x540, the
  crossing is at y = 0.358 again (sat 0.211 @0.32, 0.309 @0.36 at BOTH resolutions).
- **Peak horizon luma (Rec709).** ours `s=0.75,0.82,0.46,0.48` -> 190.2,159.8,87.3 = **161.0**.
  ref-01 `b=0.78,0.86,0.44,0.47` -> 248.4,226.1,126.1 = **223.6**. **0.72x.**
- k1 target 1 PASSES HARD (slight overshoot): ours `s` sat **0.541** (target >=0.33, ref-01 0.492);
  linear B/R **0.186** (target <=0.45, ref-01 0.221).
- k1 target 2 PASSES: `_skyprobe.mjs` dusk LUT e=0 side = 0.383,0.314,0.154, **B/R 0.402** (was 1.04, target <=0.60).
- k1 target 4 PASSES: zenith `z=0.55,0.65,0.00,0.04` -> 61.3,92.1,103.2, **B/G 1.12** (target 1.05-1.25; ref-01 1.06).
- Mid-sky is GREEN, ref's is cream: ours `0.55,0.65,0.24,0.28` -> 95.1,113.2,104.9, **R/G 0.84**;
  ref-01 `0.66,0.74,0.24,0.28` -> 194.6,191.3,130.4, **R/G 1.02**.
- Regression gates HOLD. midday (daytime-downtown) `0.44,0.50,0.10,0.20` sat **0.134** (gate 0.12-0.16);
  night (wet-night-asphalt) `0.44,0.52,0.08,0.16` sat **0.561** (gate >=0.50); night horizon
  `0.46,0.53,0.33,0.38` sat **0.441** (was 0.409).
- **FOG SYMBOL FOUND, for the environment piece: `sky.fogParams`** - `Float32Array [d0, k, y0, uni]`,
  declared `sky.js:107`, exported in the object at `:1388`, written from the preset every `apply()` at
  **`sky.js:1470-1473`**. Dusk d0 = **0.0030**, midday 0.0016. Live and correct. The `0.001` at `sky.js:1481`
  is still there but is now a documented dummy (`FogExp2` exists only to make three define `USE_FOG`);
  `world.js:1004 skyFogD0()` already reads `fogParams[0]` first. Environment piece is unblocked - use
  `sky.fogParams[0]`, READ-ONLY.

## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch. (Code confirms the k1 fix landed:
`sunLight()`/`msSpectrum()` at `sky.js:387-420`, `msW` 0.015 floor deleted at `:443`, `msTint: 0.10` on dusk at `:884`.)

## BIGGEST REMAINING GAP: the twilight tint carries NO RADIANCE, so the sodium wash has ref's colour at 0.72x its value and 0.56x its height
`game/sky.js:419` - `msSpectrum()` divides by its own Rec709 luma, so it is a pure hue rotation; and `:443`
`msW = uMs * clamp(sin(uSunElev)*1.6+0.34,...)` with dusk `ms: 0.055` (`:883`) was explicitly left un-retuned
(comment at `:406`). So the warm source at `:462` is `(sR+sM)*msW*msSpectrum` - it is multiplied by the SAME
density `(sR+sM)` as the Rayleigh single-scatter term, so warm and cool fall off with the identical 8 km scale
height and **their ratio is altitude-invariant by construction.** A flat gain on `uMs` cannot move the crossover
up; it only brightens the whole dome and will break the zenith B/G gate. The warm source must fall off SLOWER
than Rayleigh: weight it by the grazing-path geometry (perigee arc length, which grows with sample altitude) or
by the aerosol/Mie scale height, and/or add the true above-shadow-height direct term (sun is only -0.9 deg, so
horizon-grazing samples above a few hundred metres ARE sunlit).

## RETIRED/CORRECTED
- **RETIRING k1 target 3 (`no column row below sat 0.15`).** Ours bottoms at **0.144** (y 0.28-0.32); ref-01
  itself bottoms at **0.163** (y 0.12-0.16). A 0.15 floor is inside the reference's own margin and the valley
  DEPTH is no longer the defect. Replace it with the valley/crossover HEIGHT (target 1 below), which is
  scale-persistent (identical at 1920 and 960) and cannot be satisfied by a flat gain.
- The midday (`aerialSky 0.15`, `:1087`) and night (`0.30`, `:1137`) clamps were NOT deleted. Both presets
  still pass their gates, so this is not a defect today - but it is unpaid debt, and it means the ms fix has
  never been tested unclamped on those two.

## TARGETS FOR NEXT ROUND (re-derive with the args above)
1. Column scan `x=0.55,0.65`, 0.04 steps: sat 0.30 first crossed at **y <= 0.28** (ref-01 `x=0.66,0.74` = 0.242;
   now 0.358). Must hold at BOTH 1920x1080 and 960x540.
2. `s=0.75,0.82,0.46,0.48` Rec709 luma **>= 200** (ref-01 `b=0.78,0.86,0.44,0.47` = 223.6; now 161.0).
3. Do not trade chroma for it: `s` sat stays **0.45-0.58** and linear B/R stays **0.18-0.26**.
4. `0.55,0.65,0.24,0.28` R/G **>= 0.95** (ref-01 `0.66,0.74,0.24,0.28` = 1.02; now 0.84).
5. Non-regression: zenith `z=0.55,0.65,0.00,0.04` B/G stays **1.05-1.25**; midday `0.44,0.50,0.10,0.20`
   sat 0.12-0.16; night `0.44,0.52,0.08,0.16` sat >= 0.50.
