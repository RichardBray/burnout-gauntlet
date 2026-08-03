# WAVE N BUILDER REPORT — environment (n1) — game/world.js

## PIECE / FILE / WHAT I CHANGED — mechanism first

The brief's mechanism (give `PAINT_NEUTRAL` chroma) was implemented in full and **it does not
move the headline metric.** I then proved *why*, and that finding is the deliverable.

Three neutral tables were achromatic, not one. Raised all three to HSV sat 0.18-0.27 in three
stone families (warm cream/sand, pinkish limestone, cool blue-grey), each entry preserving its
predecessor's **max channel byte-for-byte** so value is unchanged and no term gains range —
a chroma shift, not a gain (bug-class check: nothing downstream sees a larger number).
`PAINT_CHANCE` deliberately untouched, per the brief's toy-town warning.

## CONSTANTS — BEFORE -> AFTER (verified by re-grep AFTER the final render)

```
world.js:1252  STYLE_TRIM.glass     0x8e979f (sat 0.107) -> 0x7c8e9f (0.220)
world.js:1252  STYLE_TRIM.office    0xa89f8c (0.167)     -> 0xa8977c (0.262)
world.js:1252  STYLE_TRIM.concrete  0xb0a998 (0.136)     -> 0xb0a288 (0.227)
world.js:1252  STYLE_TRIM.brick     0x9a6a56 — UNCHANGED (already sat 0.442)
world.js:1358  STYLE_TRIM fallback  0xa9a192 (0.136)     -> 0xa99b80 (0.243)
world.js:1327  PAINT_NEUTRAL
   0xd9d5c8 (0.078) -> 0xd9cba6 (0.235)   0xd2cec0 (0.086) -> 0xd2bc9e (0.248)
   0xc9c6bc (0.065) -> 0x9fb3c9 (0.209)   0xb6b4ae (0.044) -> 0x92a4b6 (0.198)
   0xbfbdb4 (0.058) -> 0xbfae8f (0.251)   0xcac4b4 (0.109) -> 0xcab19f (0.213)
world.js:1347  PODIUM_TRIM (6 pale entries; the two saturated shop paints unchanged)
   0xe0dacb (0.094) -> 0xe0d3b3 (0.201)   0xc9c2b2 (0.114) -> 0xa1b4c9 (0.199)
   0xd4cdbd (0.108) -> 0xd4c2a1 (0.241)   0xdcd4c0 (0.127) -> 0xdcc9a4 (0.255)
   0xe8e4d8 (0.069) -> 0xe8dcba (0.198)   0xefece2 (0.054) -> 0xefe3c4 (0.180)
world.js:1314  PAINT_CHANCE  {glass 0.05, brick 0.12, office 0.44, concrete 0.44} — UNCHANGED
world.js:1304  PAINT_COLOUR  — UNCHANGED
```
Also corrected a lying docstring at `:1286` ("weighted so roughly a third of the masses take real
colour"); the split is 0.05/0.12/0.44/0.44. Rule 5.

## PAIRED A/B — peer hashes verified byte-stable across BOTH renders

Ran `md5 game/[a-v]*.js` immediately before render A and immediately after render B; the pair
below is the one that printed no diff. Three earlier attempts were discarded because car.js /
boost.js / damage.js changed mid-pair — reported so nobody trusts them.

| metric (exact args) | BEFORE | AFTER | target |
|---|---|---|---|
| `_facademeas --band 0.05,0.55` sat | 0.353 | **0.339** | >=0.48 **MISS** |
| same, dark% | 7.2 | 8.1 | >=18 **MISS** |
| same, lum | 83.9 | 87.0 | (ref dd-01 83.0) |
| `_px --region a=0.00,0.10,0.30,0.50` sat | 0.228 | 0.220 | >=0.40 **MISS** |
| `_px --region rblock=0.62,0.78,0.03,0.28` sat | 0.215 | 0.204 | — |
| NON-REG `_facademeas --sky 999,110 --x 0.560,0.750 --band 0.180,0.440` sobel | 16.56 | **16.62** | 12-22 **HELD** |

`./tools/lint.sh` = `lint ok` before every render and as the last action. Shot: `shots/environment-n1.png`.

## THE FINDING — the facade-palette lever has a HEADROOM OF +0.046 AND THE METRIC IS BROKEN

Smoke test: `PAINT_NEUTRAL` + the six pale `PODIUM_TRIM` forced to `0xff00ff` and all of
`STYLE_TRIM` to `0x00ff00` — HSV sat **1.0** over the majority of the frame's architecture.
`_facademeas --band 0.05,0.55` reads **sat 0.399**. So the whole lever spans 0.353 -> 0.399.
**Target 1 (>=0.48) is unreachable through the palette by construction.** The palette is
confirmed LIVE (`push()` -> `setColorAt`, `:1055`); this is not a dead-code case.

Why chroma goes *down* when I add chroma: the metric's "saturation" on our render is mostly the
**blue airlight cast**, not paint. A grey mass under blue additive haze reads as saturated blue;
a warm cream mass partially cancels it and reads neutral. Two independent variants confirm —
constant-max-channel (shipped) 0.353 -> 0.339, and a constant-**luminance** variant
(`0xe4d7b0/0xb0c4df/0xcdbc9a/0xdccea7/0xa3b5cc/0xd7c0aa`) 0.351 -> 0.335. Not a value problem.

**Sixth instance of the project's signature failure.** `_facademeas` band sat is measuring
haze blueness and shadow fraction, not architectural colour.

## BRIEF CORRECTIONS (evidence)

1. **"In reference dd-01/-02 there is NO achromatic mass" is FALSE.**
   `_px reference/daytime-downtown-01.jpg --region cream=0.755,0.805,0.30,0.55` -> **sat 0.125**;
   `--region white=0.60,0.65,0.33,0.55` -> **0.221**. dd-01's 0.551 band mean comes from a few
   extreme-chroma heroes (mint tower 0.663, orange billboard, green awning, deep blue sky)
   beside **24.3% genuinely dark pixels** — not a uniformly chromatic neutral population.
   Our dark% is 8. **Value structure, not palette chroma, is the dominant term.**
2. Targets 1, 2 and 3 as written cannot be met by anything in `world.js:1280-1301`.

## CROSS-FILE ROUTE — nothing to do, already landed

`world.js:1004-1005` already reads `_sky.fogParams[0]` first, with a defensive chain
(`sky.preset.fog.d0` -> `scene.fog.density` with the 0.001 placeholder explicitly rejected ->
`AIR_D0_FALLBACK`). `sky.js:1470` writes `fogParams[0] = p.fog.d0` live. Symbol IS present.
Read-only, verified. **`game/sky.js` NOT touched.** The brief's `world.js:2749` line reference
is stale — the only remaining `scene.fog` reads are `:1008` (inside the guarded fallback) and
`:2858`.

## WHAT I DID NOT DO / NEXT ROUND

- Did NOT raise `PAINT_CHANCE` (toy-town risk) — and it would not have helped: see the +0.046 ceiling.
- Did NOT touch the airlight (`AIR_GAIN=6`), per the brief.
- **Next round should retire target 1 as written and attack dark% (8 -> 24) instead**: canyon
  occlusion / contact shade on the street walls. That is the term the reference actually has and
  we do not, and HSV saturation rises automatically with it. Second lever: a handful of
  extreme-chroma HERO masses (sat >0.6 at the mint-tower level) rather than lifting the whole
  population — that is the shape dd-01 actually has.
- The shipped change is kept because it moves the palette toward the reference's real cream/sand/
  blue-grey stone families at ~zero metric cost, and the crop A/B (right block, x 1150-1900,
  y 20-420) reads visibly warmer and less uniformly blue-grey. But it is a **marginal** win and
  I am not claiming otherwise.
