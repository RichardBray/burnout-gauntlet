# WAVE M VERDICT — damage-model (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/damage.js

PIECE: damage-model   ROUND: m1
SCENE: daytime-downtown via
  `node tools/damage-shot.mjs --scene daytime-downtown --out shots/damage-model-m1-<L>.png --do "d.setLevel(L)" --cam "3.9,1.6,4.2|0,0.75,0.3|40" --w 1920 --h 1080`, L=0.4/0.7/0.95
OURS: shots/damage-model-m1-{0.4,0.7,0.95}.png (m1.png = the 0.7)   REF: reference/crash-cam-03.jpg (1920x1080 native), crash-cam-02.jpg (sips -Z 1920)
`./tools/lint.sh` = lint ok.

BLIND CALL: real, instantly. Ours reads as a **black rubber tarp** thrown over the nose.
cc03's torn bonnet is mid-grey primer with a broad bright-to-dark sweep across it, a hard
specular line on the stamped swage, near-black creases, and debris. Ours is one uniform
blue-black flap of soft rounded swells.

VERDICT: real wins

## WHAT WAVE L ACTUALLY LANDED (code read, damage.js mtime 04:12)
The k1 fix shipped: `bonnetGeo` is now `slabGeo(24,18,[0,1,0],0.022,...,RIB_D*bonnetRib)`
(`:881`), the `partDark` 5-cm duplicate is gone, and `partUnder` (`:825`) is a real primer
material with albedo+AO maps, `metalness 0.16 / roughness 0.72 / envMapIntensity 2.0`,
drawn as slab group 1. It is a genuine improvement. It did not fix the read.

## NUMBERS
HEADLINE, **scale-persistent (1920 and 960, sips -Z 960)** so aliasing cannot fake it —
floor depth inside the exposed bonnet interior, `p01/p50`:
- ours `shots/damage-model-m1-0.95.png --region bonnetTight=0.26,0.38,0.285,0.355` =
  **0.73** @1920 (26.7/36.8) and **0.71** @960.
- `reference/crash-cam-03.jpg --region innerTight=0.5833,0.6771,0.3704,0.5741` =
  **0.057** @1920 (3.9/68.2) and **0.072** @960.
  **Ours is ~11x too shallow at BOTH scales. The panel contains no dark.**
- Within-panel range `(p99-p01)/p50`: ours 1.09 / ref 2.59 (same rects, 1920).

Colour proof that the panel is env-specular-dominated, not albedo-lit: `partUnder`'s albedo
is warm (B/R = 0.925 by construction, `:806`), but the rendered panel is
rgb 37.5,41.8,50.8 → **B/R = 1.36, i.e. 1.46x bluer than its own albedo allows.** The
surface is being painted by the sky dome through `envMapIntensity 2.0`, and three's
`aoMap` barely attenuates specular IBL — so the AO map's authored 0.02..1.0 range is
flooded and never reaches the image. Classic gain-vs-range bug (rule 4).

Zero sheet edge remains at every torn boundary: `slabGeo`'s `edge()` (`:264-268`) drives
`h = thick*0.5*e` to **0 at u/v = 0 or 1**, so the two skins MEET at the outline. At this
camera the bonnet is 1.4 m over ~500 px, so 22 mm = 8 px — resolvable, and absent.

K1 TARGET 1 (brightness): **MET.** exposedInner p50 / intactFlank p50
(`--region bonnetInner=0.29,0.43,0.30,0.41 --region intactFlank=0.60,0.70,0.45,0.53`)
= 37.9/109.8 = **0.345** at L0.95 and 0.39 at L0.7; cc03 = 71.7/199.4 = 0.359.
K1 TARGET 1b (p50/p01 >= 3.0): **FAILED, 1.46.**
K1 TARGET 2 (props): **UNMOVED for the grille.** `node tools/_propmeas.mjs --scene
daytime-downtown --levels 0,0.7,0.95 --cells 5`: prop2 median **+164 mm @L0.7, +213 @L0.95**
(was 158/211). Prop1 improved 323 -> 285 @0.7 and 35 @0.95. Target is <= 40 mm.

PER-LEVEL: L0.4 has **no torn panel at all** — bonnet still closed, skin crumple only, so
the exposed-interior metrics are undefined there. L0.7 tents the bonnet open (ratio 0.39);
L0.95 only darkens it (0.345) and detaches more debris.

## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch.

## BIGGEST REMAINING GAP: the bonnet underside is lit ENTIRELY by sky specular, so its AO and its ribs never reach the image
Mechanism, in `game/damage.js` only: `partUnder` at **:825-831**. `envMapIntensity 2.0` on a
`metalness 0.16 / roughness 0.72` surface makes the sky IBL the dominant term, and three
applies `aoMap` almost entirely to indirect *diffuse* — so the authored AO (min 0.02,
`:812-815`) and the 40 mm `RIB_D` sections are washed out to a flat blue-black flap. Cut
`envMapIntensity` to ~0.8, take `metalness` to ~0.05 so the panel is diffuse-led, raise the
albedo mid so p50 holds, and bake the section shadowing into the **albedo** (which nothing
can bypass) as well as the AO. Second, in `slabGeo` (**:264-268**) stop tapering `edge()` to
zero: floor it at ~0.35 so 8 px of sheet edge survives at the outline.

## TARGETS FOR NEXT ROUND
1. **`p01/p50` inside `bonnetTight=0.26,0.38,0.285,0.355` on the L0.95 shot: <= 0.30**, and
   the SAME value within +/-0.06 when measured on a `sips -Z 960` copy. Ref: crash-cam-03
   `innerTight=0.5833,0.6771,0.3704,0.5741` = 0.057 / 0.072. Currently 0.73 / 0.71.
2. Rendered **B/R of the bonnet interior <= 1.10** (`--region bonnetTight=...`, same shot),
   proving the panel is albedo-led not sky-led. Currently 1.36 against an albedo B/R of 0.925.
3. HOLD k1 target 1: exposedInner p50 / intactFlank p50 in **0.33-0.45** (args above). Do
   not trade it away chasing 1 and 2.
4. Grille median-cell lead <= 40 mm at L0.7 and L0.95 (`_propmeas.mjs --cells 5`).
   Currently +164 / +213 mm, untouched by Wave L.

## RETIRED/CORRECTED
- **DEMOTE `exposedInner p50 / intactFlank p50` from headline.** It now reads 0.345 against
  cc03's 0.359 — a match — while the panel reads as a black tarp. It is a mean-only
  statistic and a uniformly dim flap satisfies it exactly. Keep it only as a guardrail
  (target 3); the headline is now the scale-persistent floor-depth `p01/p50`.
- `grainPeriodPx` stays retired (k1). Nothing this round reinstates it.
- k1's own fix text ("a rim that closes to zero at the outline") was **wrong** and Wave L
  implemented it faithfully; that is why there is still no visible sheet edge.
