# WAVE M VERDICT — environment (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/world.js

PIECE: environment   ROUND: m1
SCENE: daytime-downtown   OURS: shots/environment-m1.png
REF: reference/daytime-downtown-01.jpg (primary — high noon, buildings both sides, our camera situation), -02, -04

BLIND CALL: Ref is real.
Cue: dd-01 puts a mint tower, a teal block, an orange billboard and a cream low-rise in ONE frame.
Ours converges every mass on the same pale blue-grey; the brightest coloured building in our frame
carries less chroma than dd-01's *neutral* concrete.

VERDICT: real wins

## NUMBERS (all refs are natively 1920x1080; `_facademeas` self-normalises to 1920)
- **HEADLINE — facade-band chroma.** `_facademeas --band 0.05,0.55` (full width, default sky mask):
  ours **sat 0.357** | dd-01 **0.551** | dd-02 **0.501** | dd-04 **0.556**. Ours = **0.65x**.
  Same run: dark% ours **9.6** vs 24.3 / 22.9 / 36.4. Our architecture has no blacks.
- **Coloured mass, per-object.** `_px --region a=0.00,0.10,0.30,0.50` ours **sat 0.224**;
  `--region b=0.905,0.99,0.02,0.21` ours **0.129**. dd-01 mint tower `0.667,0.755,0.27,0.57`
  **0.663**; dd-01 cyan tower `0.155,0.215,0.13,0.45` **0.452**. **3x deficit.**
- **Airlight is NOT the chroma lever — proved by paired A/B via `--hash air=N`** (no code edit):
  midfar sat 0.229 (air=6, shipping) / 0.211 (air=3.5) / 0.210 (air=2); near sat 0.426 / 0.435 / 0.451.
  A 3x density change moves facade chroma by <=0.025. **Leave AIR_GAIN=6 alone.**
- Scale-persistence, midfar sobel `--sky 999,110 --x 0.560,0.750 --band 0.180,0.440`:
  ours 16.62@1920 -> 24.27@960 (1.46x); dd-04 3.50 -> 4.80 (1.37x). Ratio holds ->
  our residual edge energy is **real structure, not aliasing**. Native-960 render: 18.88.
- `shadow-ab.mjs --scene daytime-downtown`: road **MAD 13.3224** meanOn 89.98 / off 100.62;
  facade MAD 10.2151. Above the >12 floor (k1 baseline 13.87-13.95 — mild drift, passing).
- `lint.sh` = `lint ok`.

## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch.
Wave L's code DID land and DID work: `uHazeD` now reads `sky.fogParams[0]` with a fallback chain
that explicitly rejects the 0.001 placeholder (`world.js:1003-1012`), and `atmoTail` is a real
additive `mix(rgb, uHaze, fq*uHazeW)` (`world.js:922-924`). Mid-far sobel, k1's exact args and mask:
**26.60 -> 19.94 (-25%)**.

## BIGGEST REMAINING GAP: the facade palette is authored at reference chroma but only ~44% of masses draw from it
`world.js:1280-1301`. `PAINT_COLOUR` entries are correct (0x4fbf94 is sat 0.59), but `PAINT_NEUTRAL`
sits at sat 0.06-0.09 and `PAINT_CHANCE` is `{glass 0.05, brick 0.12, office 0.44, concrete 0.44}`,
so a clear majority of every mass in frame is achromatic stone. In dd-01/-02 there is no achromatic
mass — even the "grey" towers are cream, sand or blue-shifted. Give the NEUTRALS chroma (sat 0.18-0.28
cream/sand/blue-grey), do not just raise PAINT_CHANCE, or the block turns into a toy town.

## TARGETS FOR NEXT ROUND
1. `_facademeas --band 0.05,0.55` sat **0.357 -> >=0.48** (refs 0.501/0.551/0.556).
2. `_px --region a=0.00,0.10,0.30,0.50` sat **0.224 -> >=0.40**.
3. Same band dark% **9.6 -> >=18**. From canyon occlusion, NOT from crushing the grade.
4. NON-REGRESSION: midfar sobel `--sky 999,110 --x 0.560,0.750 --band 0.180,0.440` must stay
   **12-22**. Do NOT push it below 12.
5. NON-REGRESSION: `shadow-ab.mjs` road MAD **>12**.

## RETIRED/CORRECTED
- **k1 target 1 ("midfar sobel under 10") and target 2 ("far sobel must fall below near") are RETIRED.**
  Both were derived from dd-04 ALONE — a dusk frame whose mid-far region is a fog-shrouded tower at
  300 m+. Identical args on the two bright-day downtown refs: **dd-01 sobel 30.18, dd-02 15.34**;
  ours 16.62 sits BETWEEN them and BELOW the closest-matched camera situation. Depth ordering RISES
  in both bright-day refs (dd-01 near 18.84 -> far 30.18 = 1.60x; dd-02 14.77 -> 15.34 = 1.04x).
  Chasing "under 10" would take us further from dd-01, not closer. **Fifth instance of the signature
  failure: the metric was measuring the wrong object.**
- **k1 target 3 (VP lum 194.6 -> under 150) is RETIRED.** dd-04 at the *same* region args
  `--x 0.42,0.58 --band 0.40,0.48` reads **lum 204.4**; ours is 200.2. The reference is brighter
  than we are there. k1 compared our VP against a different region of the ref.
- **`_facademeas`'s sky mask is unsafe on our post-airlight render.** Airlight makes facades
  blue-dominant and bright, so `--sky 8,110` masks **69.5%** of our midfar band as sky (ref: 2.5%)
  and keeps only the darkest, highest-contrast survivors — inflating sobel 16.62 -> 19.94.
  Use `--sky 999,110` for any our-vs-ref architecture band that is already bounded to facade.
