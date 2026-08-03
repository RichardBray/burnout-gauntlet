PIECE: environment          ROUND: o1
SCENE: daytime-downtown     OURS: shots/environment-o1.png
REF: reference/daytime-downtown-01.jpg (also -02, -04)

BLIND CALL: real. Ours has no dark values anywhere — every storefront, pier and
window reveal sits at the same 85-95 luma blue-grey, so the block reads as one
massing model under a lightbox. dd-01/-02 have deep window interiors, shaded
canyon floors and awning undersides.

VERDICT: real wins

## CLAIMS CHECKED — all Wave N constants VERIFIED LITERAL (Rule 5)

`world.js:1252` STYLE_TRIM = `0x7c8e9f/0xa8977c/0x9a6a56/0xb0a288`, `:1327`
PAINT_NEUTRAL = `0xd9cba6,0x9fb3c9,0xbfae8f,0xd2bc9e,0x92a4b6,0xcab19f`, `:1347`
PODIUM_TRIM pale six, `:1358` fallback `0xa99b80`, `:1314` PAINT_CHANCE unchanged.
All as reported. No lying docstring.

CROSS-FILE: LIVE and CORRECT. `world.js:1003-1011` `skyFogD0()` reads
`_sky.fogParams[0]` first, then `preset.fog.d0`, then `scene.fog.density` with
`|d-0.001|>1e-9`, then `AIR_D0_FALLBACK`. Writer is **`sky.js:1536`** (exported
`:1454`), not `:1470` — line drifted. `world.js:2749` is stale; confirmed.

## SMOKE TEST REPRODUCED — TARGET RETIRED

I re-ran it in a copy of the tree (`game/` untouched; `lint ok`, no `0xff00ff`
constant in `game/world.js`). PAINT_NEUTRAL + the six pale PODIUM_TRIM ->
`0xff00ff`, all STYLE_TRIM + fallback -> `0x00ff00`. `_facademeas --band
0.05,0.55`: base **0.342 -> smoke 0.401**. Builder measured 0.353 -> 0.399.
Reproduced. The image is a screaming green/magenta cartoon and the metric moves
+0.059 against a 0.48 target.

**RETIRED: the environment `_facademeas` band-sat target (>=0.48). Do not
re-issue it.** The band sat is dominated by the additive blue airlight, not paint.

## RETIRING THE WAVE-N PROPOSAL TOO — canyon occlusion has NO headroom either

The builder's next gap (dark% 8 -> 24 via canyon occlusion) names a lever that
**already exists** — `world.js:815-831`, `uShadeAmt`/`uCanyon`, applied to the
indirect lobes only — and the `daytime-downtown` branch at **`world.js:2918-2919`
deliberately weakens it** (`uShadeY 27, uShadeAmt 0.80, uCanyon (0.16, 22)`
against defaults `0.60 / (0.46, 26)`).

Measured headroom, `_facademeas --band 0.05,0.55`, dark% | lum | far-band sobel
(`--sky 999,110 --x 0.560,0.750 --band 0.180,0.440`, non-reg 12-22):

| probe | dark% | lum | far sobel |
|---|---|---|---|
| shipping | 6.9 | 86.5 | 16.18 |
| canyon MAXED (`uShadeAmt 0.35`, `uCanyon (0.90,26)`) | **7.8** | 85.0 | — |
| `#air=3` | 6.5 | 90.2 | 18.24 |
| `#air=1` | 11.3 | 85.3 | — |
| `#air=0` | 11.6 | 84.8 | 23.84 **BREAKS** |
| canyon MAXED + `#air=0` | **16.8** | 79.3 | 23.30 **BREAKS** |
| ref dd-01 / dd-02 | 24.3 / 22.9 | 83.0 / 86.3 | 3.50 (dd-04) |

Maxing canyon occlusion buys **+0.9 dark%**. The additive airlight is a FLOOR
that occlusion cannot get under — bug-class rule 4 again. Also: air=0 makes the
frame visibly, obviously more colourful (the cream/terracotta/brick the Wave N
builder authored finally appears) while band sat goes **DOWN 0.342 -> 0.317** —
a second independent disproof of that metric.

## BIGGEST REMAINING GAP (mechanism)

`AIR_GAIN = 6.0` (`world.js:888`) is a **distance-only, height-independent** haze
calibrated solely on the 85-200 m far band, with **no near-field onset**. At
`d0*6 = 0.0096` a storefront 30 m away already takes ~25% haze, so the exact
pixels that must go dark are lifted. dark% and far-sobel are welded to one
scalar: gain 3 keeps sobel legal but dark% flat at 6.5; gain 0 frees dark% but
blows the non-reg to 23.8. **Split them**: give the airlight a start distance /
near-field floor (~50-60 m) so the far-band calibration survives while the
canyon can crush. File: `game/world.js:888` + `atmoTail` at `:900`.

## TARGETS FOR NEXT ROUND (none satisfiable by the airlight cast)

1. `_facademeas --band 0.05,0.55` **dark% >= 18 WHILE lum stays 83-92**
   (dd-01 24.3@83.0, dd-02 22.9@86.3; ours 6.9@86.5). The paired lum bound is
   the point — a global exposure crush cannot satisfy both.
2. Same tool, `--band 0.38,0.55` (street level): **dark% >= 15 with lum >= 85**
   (dd-01 15.2@100.2, dd-02 20.5@89.4; ours 4.9@95.8). Demands *local* occlusion.
3. SCALE-PERSISTENCE: re-run (1) with `--normw 960`; dark% must agree within 10%.
   Verified stable today: ours 6.3->6.5, dd-01 24.3->22.0, dd-02 22.9->22.0.
4. NON-REG, hard: far-band sobel `--sky 999,110 --x 0.560,0.750 --band
   0.180,0.440` must stay **12-22** (now 16.18). This is the gate that makes
   target 1 an airlight-shape problem and not an airlight-gain problem.
5. NON-REG: `shadow-ab` road MAD > 12.

Do NOT chase band sat. Do NOT spend the round on `uCanyon` alone — measured
ceiling +0.9 dark%.
