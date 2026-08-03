# WAVE K VERDICT — road-surface (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/road.js

PIECE: road-surface   ROUND: k1
SCENE: wet-night-asphalt   OURS: shots/road-k1.png   REF: reference/wet-night-asphalt-01.jpg
(measured via shots/k1/ref01-1920.jpg = `sips -Z 1920`)

BLIND CALL: picked the reference instantly. At 1.4x zoom on the road
(`_cropimg.mjs shots/road-k1.png ... 1382 1920 756 1080 1.4`) our wet surface is covered in
per-pixel salt-and-pepper dither in a faint diagonal lattice — it reads as compression noise,
not tarmac. Ref's wet asphalt is smooth at pixel scale with a broad, soft, multi-pixel ripple.

VERDICT: real wins

## NUMBERS (all ref-01 @1920; region args are frame fractions, x 0.72-1.0 avoids the car in BOTH images)
- dark `0.72,1.0,0.88,0.94` hfRmsNorm: ref 12.48, ours 13.38/13.40/13.45 (three renders).
- bright `0.72,1.0,0.94,1.0`: ref 12.00, ours 10.27/10.23/10.26.
- Run-to-run sd is **0.036 (dark) / 0.021 (bright)**, not +/-0.35.
- **SCALE-PERSISTENCE P** = hfRmsNorm(same region, both images `sips -Z 960`) / hfRmsNorm(@1920).
  ref dark 12.98/12.48 = **1.040**, bright 11.07/12.00 = **0.923**.
  ours dark 10.24/13.38 = **0.765**, bright 8.56/10.27 = **0.834**.
  Our grain dies on a 2x box downsample; the reference's does not.
- rowBandRel: ref 0.0389 dark / 0.0353 bright, ours 0.0262 / 0.0216 (~66%).
  colBandRel ref 0.0145/0.0124, ours 0.0106/0.0086 (~71%).
- `_px.mjs` depth ladder x 0.72-1.0, y bands d1 .70-.76 ... d5 .94-1.0:
  ref p01 12.8/13.2/14.9/33.1/43.2, sub-16 3.2/2.5/1.6/0.1/0%.
  ours p01 49.7/49.2/49.3/47.7/46.9, sub-16 **0% at every depth**.
  ref sat 0.32-0.43, ours 0.07-0.17.

## CLAIMS CHECKED
- Reproduced: dark-half grain is mirror-driven; band amplitude ~66-71% under (builder's
  0.0235-vs-0.0349 figure is the right deficit ratio).
- NOT reproduced: +/-0.35 dark-region render noise. With a frozen tree it is +/-0.04. The r11
  swing (0.82 -> 1.11 -> 1.31) is CROSS-PIECE COUPLING, not noise — the metric is precise but invalid.
- CONTRADICTED: "the chip-lens hypothesis was tested and FAILED" — the chip lens is still
  shipping at `road.js:1148-1163` and is the aliasing source.

## ADJUDICATION OF THE METRIC-RETIREMENT RECOMMENDATION: ACCEPTED, with a stronger reason
Retire the dark/bright ratio not only because the dark half is mirror content, but because
**the region labels are geometric, not photometric**: ref means are 82.3 vs 114.1 (1.39x),
ours 89.8 vs 95.8 (1.07x). Those two bands are not dark and bright in our frame, so 1.04 was
never a target we could hit. Worse, we now *exceed* the absolute anchor (13.38 vs 12.48)
**using aliasing** — a fourth instance of this project's signature failure.

## BIGGEST REMAINING GAP: `game/road.js:1161-1163` — the CHIP LENS
It jitters the planar-mirror UV by up to +/-6 texels *per pixel*
(`gChipN * vec2(0.30,2.4) * uReflTexel`) into a full-res, high-contrast neon reflection.
That is unfiltered point-sampling of a high-variance signal: it manufactures pixel-scale
hfRms (beating the anchor) while producing dither, and it is why the mirror-off dark half
collapses to 1.28. Its code comment still justifies itself with the RETIRED 10.89/11.48
anchors. FIX: keep the chip disturbance but sample the mirror at a mip/blur level matched to
the warp magnitude, or move the chip term into `roughnessFactor`/specular BRDF instead of the
reflection UV — so grain is created at >=3 px scale.

## TARGETS FOR NEXT ROUND
1. P_dark >= 0.95, P_bright >= 0.92. Derive: `_bandmeas.mjs --region 0.72,1.0,0.88,0.94`
   then `0.72,1.0,0.94,1.0`, on the shot AND on a `sips -Z 960` copy of it; ref = 1.040/0.923.
   From 0.765 / 0.834.
2. THEN rowBandRel dark >= 0.035, colBandRel >= 0.013. **Do not chase these before P is
   fixed** — aliasing is currently the cheapest way to move them.
3. Secondary (dry-patch absence, ref-01, `_px.mjs --region d3=0.72,1.0,0.82,0.88`):
   p01 <= 20 and sub-16 >= 1.0% while d5 p01 stays >= 40. Ours 49.3 / 0.00%. Our wet road has
   a hard luminance floor at ~48/255 at EVERY depth — INDEX.md's "mix of dry matte patches and
   glossy wet patches" is absent.

## RETIRED/CORRECTED
- **RETIRED: dark/bright hfRmsNorm ratio 1.04** and the absolute anchors 12.48/12.00 as
  scores. Keep them only as inputs to P.
- **CORRECTED: dark-region render noise is +/-0.04, not +/-0.35.**
- Secondary scene `dusk-highway-chase` sets NO grain target: our near-road mean is 36.0 vs
  ref-01's 78.1 (`--region 0.30,0.70,0.86,1.0`), so hfRmsNorm's mean-normalisation inflates
  2.2x there. The dry road reads well by eye; do not touch it.
