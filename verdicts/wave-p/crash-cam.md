# WAVE P BUILDER REPORT — crash-cam

PIECE: crash-cam   FILE: `game/crash.js` (only game file touched)
ALSO TOUCHED: `tools/_debrismeas.mjs` — the budgeted tool audit, backwards compatible.
md5 `game/crash.js` BEFORE `a0b741957c1cc266c609e189acbf34ff` -> AFTER `b47c5192c0ee31797f073941d8b6e4c6`
`./tools/lint.sh` = `lint ok` before every render and as the last action.

## HEADLINE — MY BRIEFED TARGET WAS DERIVED FROM TWO INVALID ANCHORS. BOTH ARE RETIRED, WITH PROOF.

The wave-O target family (`patch A density 4.6 -> 10.1 per 1e4 px`, `areaMed 47 -> <= 15`,
ref `areaMed 6 / majMed 4.3`) is not reachable, not meaningful, and points the WRONG WAY.
Two independent defects, one at each end of the comparison.

**(1) The `crash-cam-01 --patch 0.00,0.30,0.63,0.73` anchor contains no debris and no sparks.**
That patch is x 0-576, y 680-788. Cropped and looked at
(`node tools/_cropimg.mjs reference/crash-cam-01.jpg /tmp/ref01-patchA.png 0 576 680 788 3 50`):
it is chain-link fence diamonds, a rusted stanchion, and the hero car's dazzle-stripe livery
with the word "SPEED" across it. The debris field in `crash-cam-01` is on the OTHER side of the
frame, x 1650-1900, y 400-700. So `majMed 4.3 / areaMed 6 / 65 blobs` is a measurement of wire
mesh and paint stripes. `meanContrast` on it is **-7.6**, i.e. the population is DARKER than its
surround — sparks are additive and cannot be. The sign of the statistic alone falsifies it.

**(2) On the one reference that does hold a real spark field, `--maxpx 4000` deletes the subject.**
`crash-cam-04 --patch 0.00,0.30,0.63,0.73` is a genuine mat of golden sparks (crop verified).
Same tool, same args, only `--maxpx` moved:

| `--maxpx` | blobs | fill | majMed | areaMed |
|---|---|---|---|---|
| 4000 (standard) | 63/157 | **3.17%** | 6 | 6 |
| 1e8 | 64/157 | **66.28%** | 6 | 6 |

The field percolates into ONE connected component holding 63% of the patch, and `maxpx` throws
it away. The reported statistics describe the crumbs left around the discarded slab. The new
`dropPct` column makes this a one-glance check: **reference drop = 95.2%, ours = 1.1-1.4%.**
The reference statistic is computed over 4.8% of its own mask, ours over 98.6% of ours. They
were never comparable. Chasing `areaMed -> 6` was chasing crumb size.

**Net effect: the direction of the brief was inverted.** Against a clean reference anchor
(below) our sparks are 3-10x too SMALL and 3x too DIM, not 6x too large.

## TOOL AUDIT (the budgeted one) — `_debrismeas.mjs`, TWO CORRECTIONS, DEFAULTS UNCHANGED

`--sign both|pos|neg` (default `both` = historical behaviour) and a new `dropPct` column.

- **The mask was unsigned.** `|L - bg| >= delta` accepts dark blobs as readily as bright ones.
  On our own crash-cam patch A at `uAmount = 0`, with the SPARK MESH HIDDEN, `--sign pos` still
  scores **17 blobs / fill 6.29%**, against 21 / 6.98% with sparks visible. **78% of the blobs
  and 90% of the fill in "the spark patch" are road markings and tarmac scuff.** With `--sign
  both` it is worse still (21 blobs hidden vs 27 visible). Every absolute `density` and
  `areaMed` figure quoted for patch A by wave O and by wave-P boost — mine included — is
  dominated by road paint. Only the visible-minus-hidden DELTA is spark-attributable.
- `dropPct` = share of masked pixels lost to `minpx`/`maxpx`. Large `dropPct` means the shape
  statistics are about the residue. See the ref-04 table above.

Both are pure additions; `--sign both` with no `dropPct` read reproduces every prior number
exactly (verified against the wave-O ref-04 line: `blobs 63/157 fill 3.17% majMed 6 areaMed 6
aspMed 6.39 aspP90 9.83`).

## RE-DERIVED ANCHOR AND TARGET

A reference spark statistic is only usable where `dropPct` is ~0. Found one:
`reference/crash-cam-04.jpg` (native 1920x1080, no `sips` needed),
`--sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000 --patch 0.229,0.333,0.620,0.722`
(x 440-640, y 670-780, the sparse right-hand end of the spark fan):

**blobs 10/10, fill 15.71%, drop 0%, majMed 43.3 px, areaMed 429, aspMed 8.37, contrast +60.5.**
Two neighbours agree: `--patch 0.00,0.12,0.620,0.700` -> 8/8, drop 0%, majMed 57.1, contrast
+55.4; `--patch 0.28,0.36,0.615,0.690` -> 9/12, drop 0.4%, majMed 30.3, contrast +45.0.

Size cannot be compared across these two frames — ref-04 is a ~4x tighter shot than our wide
crash-cam. So the target must be **scale-free**. Two candidates, and only one of them is open:

- **ASPECT — already met, do not chase it.** Reference `aspMed 8.37` (drop 0%); our probed
  geometric spark aspect is `p50 9.18` (`/tmp/crashmeas-o.mjs`). Our spark SHAPE is right.
- **CONTRAST — this is the real gap and it is my re-derived target.**
  Mean signed luma above local background, `--sign pos --bg 15 --delta 12`:
  **reference +45 to +60.5; ours +19.3 (before) / +22.1 (after).** Our sparks are ~3x too dim.
  Scale-free, sign-correct, `drop` ~0 at both ends, and it agrees with the eye instantly:
  reference sparks are blown-out gold, ours are dull orange dashes.

  **TARGET FOR THE NEXT ROUND: crash-cam spark mean signed contrast 22.1 -> 45+**, measured at
  `uAmount = 0`, spark-attributable (sparks-visible minus sparks-hidden in one boot), args
  exactly as above. Mechanism named in the next section.

## WHAT I CHANGED — ONE CONSTANT, MECHANISM FIRST

`crash.js:233 -> :249` **`aniso: 1` -> `aniso: 16`** on `streakTexture()`.

A spark quad projects to 12.5 x 1.4 px (probe `lenPx p50 12.523`, `widPx p50 1.426`) from a
64x64 texture. Pixel footprint in texture space: ~5.1 texels along v, ~45.7 along u. Isotropic
sampling takes the LOD from the worst axis — `log2(45.7) = 5.5`, mip 5, where the texture is
**2x2 texels**. All 64 authored rows of the profile Wave N built (the `pow(v,2.2)` tail, the
`STREAK_VC = 0.86` core row, the rounded nose) average into TWO alpha values, and the streak
renders as a flat bar with square ends. With anisotropy the LOD comes from the minor axis
instead — `log2(5.1) = 2.35`, mip 2 (16x16) with up to 9 taps across u — so sixteen rows of the
profile survive instead of two.

**This is the project's dominant bug class in the spatial domain:** an authored falloff finer
than what its consumer (the mip chain at `aniso 1`) can represent. Every other texture in
`crash.js` already runs 4-8; the streak was the only one at 1.

I also **corrected a false comment** at `crash.js:2160-2171` (now :2160-2193) without touching
the constants it describes — see RULE 5 below, and BRIEF CORRECTION 3 for why it was false.

## PAIRED ATOMIC A/B — TWO ROUNDS, A,B,A,B, PEER-HASH VERIFIED, PLUS A BUILT-IN NULL TEST

A reconstructed byte-exactly for round 2 (`md5 game/crash.js = a0b741957c1cc266c609e189acbf34ff`,
confirmed). Order: A(`pA0`), B(`pB1`), A(`pA2`), B(`pB3`), B(`pB5`, comment-only re-render).
`md5 game/*.js` taken immediately before and after each render window: **inside every window all
fifteen files including `game/damage.js` (`fcc3766d2e0dbd82a5f29d588016f390`) were byte-stable,
and across round 2 nothing but `game/crash.js` moved.** No void pairs.
`game/damage.js` moved `fcc3766d...` -> `cd22a4c2dd745633093a55923343f63f` only AFTER my last render
window closed (verified by a final `md5 game/*.js`), so no measurement here spans it.

Harness: `/tmp/crashmeas-o.mjs --tag <t>` (wave N's, reused unmodified). One boot renders four
1920x1080 frames: boost LIVE and `uAmount = 0`, each x sparks-visible and sparks-hidden.
**FRAME TYPE: full beauty frames**, spark-isolated by DIFFERENCE (visible minus hidden), never
by absolute. Live `uAmount = 0.27087161491258294`, `uSpeed01 = 0` (confirms boost's finding 4).
Geometry is unchanged by the edit and reproduced to four figures in all four runs:
`lenPx p50 12.523 / p90 33.58 / max 60.005`, `widPx p50 1.426`, `aspect p50 9.18`,
`peak r 1.0093`, `live 114 / 150`.

Metric: `node tools/_debrismeas.mjs --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000`
patch A = `0.677,0.807,0.389,0.519` (249x140 px), patch S = `0.30,0.75,0.42,0.72` (864x324 px,
the actual spark field around the wreck — patch A holds only 3-4 sparks).

**NULL TEST, unprompted and clean:** the sparks-HIDDEN control is **identical to the digit on
every statistic in every patch in both A and B, in both rounds** (patch A 17 blobs / 6.29% /
majMed 16.2 / contrast 14.9; patch S 361 blobs / 3.95% / majMed 4.4). An anisotropy change on
the spark texture provably moved nothing else in the frame. Round 2 also reproduced round 1
bit-for-bit on every figure, so the seeded-SSAO determinism claim holds here at 0.00.

### Spark-attributable results (visible minus hidden), A -> B

| config | patch | blobs | fill (pt) | other |
|---|---|---|---|---|
| `uAmount = 0` | A | 4 -> 4 | **0.69 -> 0.42 (-39%)** | aspMed 4.74 -> 5.90, aspP90 14.96 -> 18.24, contrast 19.3 -> 22.1 |
| `uAmount = 0` | S | 64 -> 68 | **0.40 -> 0.24 (-40%)** | contrast 19.6 -> 21.6 |
| boost LIVE | A | 1 -> 1 | 0.91 -> 0.78 (-14%) | areaMed 113 -> 105 |
| boost LIVE | S | **24 -> 45 (+88%)** | 0.28 -> 0.35 | majMed 6.6 -> 6.2, **majP90 38.6 -> 26.5** |

Read together: **same spark count, 40% less area, higher aspect** at `uAmount = 0` — the flat
bar became a tapered sliver, which is exactly and only what the mip fix predicts. Under the
shipping post chain the discrete spark count in the real spark field **nearly doubles (24 -> 45,
density 0.86 -> 1.61 per 1e4 px)** and the longest blobs shorten 31%, because slivers that used
to touch as fat bars and merge now resolve separately.

### EYE, PAIRED WITH THE METRIC
`node tools/_cropimg.mjs shots/o-pA2-B0-sparks.png ... 1300 1549 420 560 3 40` vs `o-pB3-B0-sparks.png`.
BEFORE: three uniform-width dull-orange bars with abrupt square ends, no hot core.
AFTER: three tapered slivers, each with a bright near-white core about a third back from the
head, fading to a sharp point at the tail. Number and image moved together.

## TARGETS: HIT / MISSED

1. `patch A density 4.6 -> 10.1 per 1e4 px` (wave-O headline): **RETIRED, not missed.** Both
   ends of the ratio are invalid (see HEADLINE). Not re-issued to anyone.
2. `areaMed under boost live 47 -> <= 15`: **RETIRED**, same reason — `6` is a crumb statistic
   and `47` is a road-marking statistic. The spark-attributable area did fall 39-40%.
3. `length p50 12.52 -> 8-12 px`: **NOT ATTEMPTED, and I recommend retiring it too.** It was
   derived from `crash-cam-04`'s `majMed 6` at 95.2% drop. The clean ref-04 anchor gives
   `majMed 43.3 px` at 0% drop, i.e. the reference's own sparks are 3.5x LONGER than our p50,
   not shorter — the target had the sign wrong. It is also not scale-transferable between a
   close shot and our wide shot, so I did not substitute a number for it.
4. Chip size, re-derived at `uAmount = 0` where measurement is trustworthy: **HIT** —
   spark-attributable fill -39% / -40% at unchanged count, in both rounds, both patches.
5. My own re-derived contrast target (22.1 -> 45+): **MISSED / OPEN.** Left deliberately open,
   see below.

## BRIEF CORRECTIONS (with evidence)

1. **"Your chips are ~6x the reference area before boost ever touches them" is false**, and so
   is the `crash-cam-01 majMed 4.3 / areaMed 6` figure it rests on. That patch is fence and
   livery (crop verified, `meanContrast -7.6`). Against a valid reference spark anchor our
   chips are 3-10x SMALLER and 3x dimmer.
2. **`_debrismeas` patch-A absolutes are not just non-cross-quotable between agents — they are
   not about sparks at all in ANY agent's frames.** Sparks hidden still scores 17/21 of the
   blobs. Boost's `boost-0 density 7.42 / areaMed 32-38` and the critic's `48 blobs / areaMed
   16` are both mostly road paint. Boost's paired RATIOS remain valid (its A and B share the
   same road paint, so it cancels); its absolute floors/ceilings should not be used as targets.
3. **`crash.js:2160-2166`'s stated reason for `r 2.8 -> 1.10` was false, and I corrected the
   prose in place while leaving the constants alone.** It claimed the additive write saturates
   the framebuffer above `1/2.8`. `RenderPass` draws into a `HalfFloatType` target
   (`main.js:107-111`) and three applies no tone mapping when the target is not the canvas
   (`main.js:68-75`), so 2.8 is STORED as 2.8; the only compression is the graded ACES output
   pass, a smooth shoulder, not a clip. The square-ended bars were the `aniso: 1` mip collapse,
   which is what I actually fixed. **I did NOT raise `r` — the brief forbade it and I obeyed —
   but the standing "do not exceed 1.10" constraint rests on a premise that is now disproven,
   and the next round should re-derive it rather than inherit it.**
4. The live consequence of the level is the **bloom feed**, not clipping. `post.js:274-278`
   thresholds HDR luma at 1.0 with a 0.45 knee, so glare starts at 0.55. At `r = 1.10` the
   median spark (`u = 0.5 -> heat 0.683 -> r 0.751`, times a sub-unity texel) never crosses the
   knee and receives no glare at all, which is precisely why our contrast sits at +22 against
   the reference's +60.
5. Confirmed from my side: `uSpeed01` is exactly 0 in crash-cam, and boost's smear fix is real —
   at boost LIVE the spark-attributable blob count in patch S is now 24-45 where the wave-O
   critic measured wholesale fusion.

## WHAT I DID NOT DO / FOR THE NEXT ROUND

- Did not touch `r`, `SPARKS` (150, 114 live), `len`/`wid`, `STREAK_VC`, the nose taper, any
  spawn-site `streak:` literal, `game/boost.js`, or any peer file.
- Did not raise spark density. With the fusion mechanism now understood as a mip artefact, more
  instances would have bought more bars, not more sparks.
- **THE SINGLE BIGGEST REMAINING CRASH-CAM GAP: the spark population is ~3x too dim and does not
  reach the bloom knee, so no spark in the frame carries glare.** Target `contrast 22.1 -> 45+`
  with the args in RE-DERIVED ANCHOR above. The fix is headroom that crosses 0.55-1.0 in HDR,
  and the right shape for it is a short-lived hot-head term (the youngest fraction of `u`)
  rather than a flat multiplier on the whole population — a flat multiplier is what produced
  the 2.8 era. Whoever takes it must state `uAmount`, frame type, and use `--sign pos` with the
  visible/hidden difference; absolutes on patch A are road paint.
- Second gap, unmeasured by me: the spark field is scattered evenly across the whole road
  including far from the wreck, where reference sparks cluster tightly at the contact point.
