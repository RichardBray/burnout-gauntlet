PIECE: damage-model      ROUND: o1
SCENE: `daytime-downtown` (NOT car-paint-closeup — see finding 6), `d.setLevel(0.95)`,
`--cam "3.9,1.6,4.2|0,0.75,0.3|40"`
OURS: `shots/damage-o1-daytime-downtown.png`   REF: `reference/crash-cam-03.jpg`
CROPS: `shots/_o1-ours.png` (px 380-660 x 260-420) vs `shots/_o1-ref.png` (px 1120-1300 x 400-620)

BLIND CALL: real, instantly. Ref's inner face is a broad flat mid-grey field with ONE soft
box-section outline, one bright diagonal flange line and ~8 near-black debris flecks. Ours is a
dense radial web of six ribs on a near-black field — it reads as crumpled foil, not pressed steel.

VERDICT: real wins

## CONSTANTS — ALL SIX VERIFIED PRESENT
`damage.js:806,809,810,815,816,817,824(0.930),825(0.780),839,856,857,867(2.0)` all read exactly as
reported. Rule 5 clean. `lint ok`.

## CLAIMS CHECKED (re-rendered on the frozen tree)
- B/R 1.121: **reproduces** — 50.6/44.1 = **1.147** vs ref refInner 1.121. HOLDS.
- `(p99-p01)/p50` 1.843: **1.706** measured (ref 2.587). Close; directionally real.
- `bonnetInner/intactFlank` 0.440: **0.431**. Reproduces.
- Disproof of the wave-M mechanism: **UPHELD and extended.** env is the panel's only light, and it
  is a live lever the builder only tested DOWNWARD. Live override on the frozen tree, env
  2.0/3.0/4.5 → bonnetTight p50 36.0/41.1/50.1, p99 87.1/114.2/138.6, `(p99-p01)/p50`
  1.706/2.148/2.249. So the ratio target is reachable by gain alone — **and that is a trap:**
  `shots/_o1-ours-env45.png` reads strictly WORSE than 2.0 (the rib web gets louder) and sat
  collapses 0.129 → 0.068 against ref 0.138. Rule 3 case. Do not ship env gain unguarded.

## FINDING 6 — THE WAVE-N REPORT NEVER NAMES ITS SCENE, AND ITS NUMBERS ARE SCENE-BOUND
`damage-shot.mjs` defaults to `car-paint-closeup` (dusk, paint `0xd8420f`). Every wave-N number is
from `daytime-downtown` (midday, `0xe2b414`). Same damage.js, same cam, bonnetTight B/R:
daytime-downtown **1.147**, car-paint-closeup **0.502**, crash-cam **0.697**. The `0.780` blue
multiplier at `:825` is tuned to cancel exactly one sky. **Every damage brief must state its scene.**
(Yellow flank luma 105.4 happens to equal ref white flank 105.3, so the ratio target survives.)

## TOOL FIXED
`damage-shot.mjs:33` now honours `--w/--h`, default still 1600x1000 so fractional history stays
comparable. Verified: `--w 2400 --h 1500` emits 2400x1500. Scale-persistence is now testable by
re-render, not by downscale.

## RETIRED / CORRECTED
- **`p01/p50 <= 0.30` RETIRED, not retargeted.** Confirmed: frame p01 = 25.7, 0% under luma 16.
  p01 is the grade floor, so the statistic measures the grade, not the panel. Do not re-issue it
  in any form, including 0.55.
- **Guardrail 3 (0.33-0.45) RETIRED — its stated "ref cc03 0.359" is unsupported** (it is a verbatim
  copy of the BEFORE column). Re-derived from cc03: refInner `0.5833,0.6771,0.3704,0.5741` p50 68.2,
  refFlank `0.156,0.292,0.278,0.389` p50 105.3 → **0.648**. Our 0.431 means the panel is ~1.5x too
  dark, not too bright. The old guardrail was actively defending the defect.

## BIGGEST REMAINING GAP (one)
`game/damage.js:790-842` authors STRUCTURE where cc03 has FIELD. The inner face needs to be a broad
mid-grey plane (p50 ≈ 0.65 of the flank) carrying one box-section outline, one hard flange
specular line and sparse near-black debris flecks. Delete rib web amplitude; spend the range on
one flange and on flecks.

## TARGETS FOR NEXT ROUND (all on `daytime-downtown`, L0.95, cam above; regions
`bonnetTight=0.26,0.38,0.285,0.355`, `bonnetInner=0.29,0.43,0.30,0.41`,
`intactFlank=0.60,0.70,0.45,0.53`)
1. **HEADLINE** `(p99-p01)/p50 >= 2.30` (ref 2.587), scale-persistent: re-render `--w 2400 --h 1500`
   and agree within 10%.
2. `bonnetInner p50 / intactFlank p50` into **0.55-0.70** (ref 0.648). Replaces guardrail 3.
3. GUARD, both must hold or 1 is void: B/R 1.05-1.20 (ref 1.121) **and sat 0.10-0.18** (ref 0.138).
   The sat guard is what blocks the env-gain cheat.
4. EYE GATE: on crop px 380-660 x 260-420, at most ONE longitudinal box section legible.
5. `intactFlank` is a same-frame denominator only. Never quote it as a level.
