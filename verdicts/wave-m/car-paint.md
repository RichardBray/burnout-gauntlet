# WAVE M VERDICT — car-paint (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/car.js

PIECE: car-paint   ROUND: m1
SCENE: car-paint-closeup   OURS: shots/car-paint-m1.png   REF: reference/car-paint-closeup-04.jpg (+ -03)
ALSO: shots/car-paint-m1-wet.png, shots/car-paint-m1-dusk.png.
Refs `sips -Z 1920` to /tmp/_r04m.jpg (1920x1200) and /tmp/_r03m.jpg. lint ok.

BLIND CALL: ours, instantly, and for a NEW reason. **The glass corduroy is gone** — the Wave K
gap is closed. What gives us away now is the red paint: at 1:1 every red panel is covered in a
dense ~3 px pepper of dark AND bright dots, at identical density in the lit wheel-arch highlight
and in the shadowed rocker. Ref-04's red fender is a perfectly smooth gradient with a single
crease specular and no visible grain at all. Ours reads as bedliner/spatter, not clearcoat.

VERDICT: real wins

## NUMBERS
- **HEADLINE — flake lighting-coupling ratio** (`_paintmeas.mjs`, grainRMSpct of a lit patch
  over a shadowed patch on the SAME panel, at 1920):
  Ours `shots/car-paint-m1.png` hi `0.1094 0.1563 0.6111 0.6852` = 4.73 (mean 72.7) /
  sh `0.0938 0.1354 0.7130 0.7500` = 4.38 (mean 46.7) → **1.08**.
  Ref `/tmp/_r04m.jpg` hi `0.4583 0.5 0.5500 0.5833` = 6.09 (mean 115.9) /
  sh `0.4010 0.4320 0.6330 0.6670` = 3.85 (mean 61.0) → **1.58**.
  Ours holds 1.09 at 960 (`sips -Z 960`) — perfectly scale-invariant, which is itself the tell:
  real sparkle must decay as cells go sub-pixel.
- Glass, target 1 **MET and overshot.** Ours `0.5156 0.625 0.350 0.412`: p50 35.8, p90 **49.1**,
  p99 **65.7**, specDiff 1.84, grainRMS 2.47 (targets ≤80/≤110/≤2.8/≤3.5). Ref-03
  `/tmp/_r03m.jpg 0.3333 0.4271 0.6083 0.6625` = 40.6/72.3/100.5/2.48/2.94. We are now BELOW ref
  on both tails and autocorr lag1 is 0.533 vs ref 0.123 — the pane is mushy, not lamellar. Fine.
- Flank split, target 3 **NOT MOVED.** `_px.mjs` up `0.0833,0.1563,0.5139,0.5509` p50 81.2 /
  lo `0.0833,0.1563,0.6481,0.6852` p50 71.3 = **1.14** (k1 was 1.12). Ref-04 wingTop/wingSide
  160.8/92.3 = 1.74; ref-03 `0.1979,0.2396,{0.6458,0.6625}/{0.7125,0.7292}` 75.3/54.6 = 1.38.
- Cross-scene glass: dusk `0.445 0.633 0.5926 0.6185` p99 206.1 grainRMSpct 17.5 (was 242.6/38.2).
  Wet `0.422 0.568 0.581 0.632` p99 213.7 (was 233.9).

## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch.

## BIGGEST REMAINING GAP: the flake material map is UNGATED
`flakeMaps` (`game/car.js:603-635`) writes a per-cell roughness/metalness map — metalness
**0.58 → 1.00**, roughness **×1.00 → ×0.22** (`car.js:631-632`) — consumed by stock three.js
`metalnessmap_fragment`/`roughnessmap_fragment` with **no `flakeGate`**. The normal map IS gated
(`car.js:1277-1307`), the matx map is not. Metalness 1.0 zeroes a cell's diffuse albedo, so a
flake cell becomes a pure local-env mirror: bright dot where the env is bright, **black dot where
it is not**. That is a lighting-independent contrast amplifier, which is exactly the flat 1.08
ratio. The comment at `car.js:585` already diagnosed this once ("dark speckle... red glitter, not
paint") and moved sparkle to the normal map, but left the matx map in place.
Fix: multiply the matx deviation from binder by the same `flakeGate`, or collapse
`BINDER_MET`→`FLAKE_MET` toward each other and let the gated normal map own the sparkle alone.

## TARGETS FOR NEXT ROUND
1. **Flake lighting-coupling ratio ≥ 1.45** on the four regions above at 1920, AND the ratio must
   FALL below 1.20 at 960. Adding or removing uniform noise cannot move this ratio.
2. Shadow-patch grainRMSpct `0.0938 0.1354 0.7130 0.7500` **≤ 3.9** (ref 3.85, ours 4.38) while
   holding hi ≥ 4.7.
3. Flank split `_px.mjs` up/lo p50 ratio **1.35-1.60** (ours 1.14). Untouched two rounds running.
4. Glass: do NOT tune further. Hold p90 in 49-75 on `0.5156 0.625 0.350 0.412`.

## RETIRED/CORRECTED
- **RETIRED `grainRMSpct` + `grainPeriodPx` as the flake metric** (k1 target 4). Ours 6.39 /
  18.9 px vs ref-04 4.94 / 8.4 px, yet ref-04's fender has visibly ZERO grain and ours is
  obviously peppered. The window is gradient-dominated: ref's grainRMSpct RISES to 7.18 at 960
  on the identical normalized region. It measures the panel's shading ramp, not flake. Replaced
  by target 1.
- **RETIRED the wet-night p99 ≤150 target** (k1 target 2). The rect `0.422 0.568 0.581 0.632`
  no longer lands on glass — at 1920 it straddles the roof/backlight edge and the white livery
  stripes, which are what supply p99 213.7. By eye the wet-night rear screen is now clean.
- Glass amplitude gap **CLOSED**. Do not spend a Wave N round on it.
