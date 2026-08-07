# CRITIC - wave T, `generate-blocks`, round 2. **PASS**, with two defects to fix.

All five round-1 items are genuinely addressed, and not cosmetically. I re-ran every claim in the
builder's table and every one reproduces. The harness now has teeth: it caught seven of the eight
mutations I threw at it, including three it had never seen, and it fails at exit 1 on the deletion
mutation that walked straight through round 1.

The deliverable is verified correct by my own float64 oracle at **0.5 m pitch over 7,561,948
samples**: zero violations, minimum clearance **0.5050 m at block 611, (-1368.00, 668.00)** - the
builder's exact number, exact block, exact coordinate.

**And the overlay is transformed.** The slab spine is not thinner. It is gone. The thing round 1
shipped as a 352 x 872 m solid collision box turns out, with the blocks lifted off it, to be **open
water** - see `generate-blocks-critic-r2-lake.png`. Round 1 put a third of a square kilometre of
solid AABB on a lake and no number in the pipeline objected.

Two defects, both new, both narrow, both in code nothing consumes yet. Neither touches the block
list. Both are the same failure class this project keeps paying for, so both get named precisely.

---

## What I measured, against what was claimed

| | claimed | I measured | |
|---|---|---|---|
| `V - E + F` | 2, hard assert | **2**, and V-E+F recomputed by hand = 692-937+247 | agrees |
| components | 1 | **1** by my own BFS (builder uses union-find - both real, neither assumed) | agrees |
| V, E after split | 692, 937 | **692, 937**, and the arithmetic is right: 8 distinct edges cut once each = +4 nodes, +8 edges | agrees |
| `paradise.json` on disk | untouched | md5 `be746f30ffa169d190acd297d30f0abf` before and after | **untouched** |
| caller's doc | not mutated | deep `JSON.stringify` snapshot identical after build | agrees |
| new node ids | no collision | 688..691 against `maxNodeId` 687 | agrees |
| `droppedTiny` 2 -> 6 | 4 crossing lenses | **exactly +4**, 664.4 m2 over 4, mean 166 m2 | story holds |
| faces kept 234 -> 240 | +6 | +10 walked, -4 lens = **+6**, matching my round-1 count of 6 merged faces exactly | agrees |
| blocks / area | 868 / 1.848 km2 | **868 / 1.848 km2** | agrees |
| largest block | 140x112 m | **140x112 m = 15,680 m2** | agrees |
| slabs >200 m both sides | 0 | **0** | agrees |
| **tarmac, MY oracle @ 2 m** | - | **0 / 507,850**, min clearance 0.5050 m | clean |
| **tarmac, MY oracle @ 0.5 m** | 0 / 7,561,948 | **0 / 7,561,948**, min 0.5050 m, block 611, (-1368.00, 668.00) | **confirmed exactly** |
| build | 352 ms | **340 / 346 / 353 ms** over three runs | agrees |
| determinism | asserted | identical output over 3 runs | fine |
| index 38x | 38x | **38x**, 157 ns vs 6053 ns | agrees |
| `index.at` correct | 0 disagreements | **0 at pad=0. 1054 of 8000 at pad=1.0.** | **F1** |

---

## F1. `index.at(x, z, pad)` RETURNS DUPLICATES FOR EVERY pad > 0, AND THE CHECK THAT CLEARS IT ONLY EVER CALLS pad = 0. `game/map/blocks.js:756-771`, `tools/_mapblocks.mjs:307-321`

`at()` scans a `(2*reach+1)^2` neighbourhood and pushes every block whose grown AABB contains the
point, once per cell it finds it in. There is no dedup. At `pad = 0`, `reach = ceil(0/128) = 0`, one
cell is read, and duplication is structurally impossible. At any `pad > 0`, `reach >= 1`, nine cells
are read, and a block spanning several of them is returned several times.

`tools/_critic-r2-index.mjs`:

```
pad=1.0, 8000 probes: 1054 disagreements
  explained ENTIRELY by duplicate indices: 1054
  genuinely MISSING a block: 0
  genuinely SPURIOUS block:  0
  worst duplication: 6 extra copies, e.g. -> [482,491,482,482,491,482,482,482]

concrete: block 89 is 20x228 at -186,-438
  index.at(cx, cz, 0)   -> [89]
  index.at(cx, cz, 1.0) -> [89,89,89]   <- the same block, returned 3 times
```

Never wrong about *which* blocks. Always wrong about *how many times*.

**The check at `tools/_mapblocks.mjs:315-321` calls `B.index.at(x, z)` with the default pad.** It
runs 20,000 probes, half of them deliberately on block corners "because the boundary is where a grid
index goes wrong", and it compares results rather than timings - all of which is real and I verified
it. But it exercises exactly the one branch where the bug cannot exist. **A check scoped to the code
path that cannot fail is not a check.** That is permanent rule 2, and it is the same shape as round
1's tautology, in new code, in the function whose docstring at `blocks.js:721-734` names its intended
consumer.

**Concrete failure scenario, and it is the intended first use.** `blocks.js:725-729` says this index
exists for `rewire` to replace the linear scans in `physics.js:921-958`, `camera.js:251` and
`traffic.js:1068`. `physics.js:922` computes `hx = b.w / 2 + 1.0` - a pad of exactly 1.0. A `collide`
rewritten as `for (const i of index.at(x, z, 1.0))` is benign, because it `return`s on first hit. The
traffic wreck loop is not: `traffic.js:1068` iterates every block, and per hit it sets
`v.pos.x = blk.cx + sign*bx` and multiplies `v.wvx *= -WRECK_WALL_BOUNCE`. Three duplicate hits on
one wall is three sign flips and three position clamps in one step. A wrecked car against a long
frontage strip - and there are 31 of those, up to 432 m - would jitter or launch.

**Fix.** Dedup, or register-and-query canonically: push only if the query cell is the block's
first-registered cell. Two lines. Then extend the harness probe to sweep `pad` over `[0, 1, 5, 50]`,
because that is the only version of the check that could have caught this.

---

## F2. THE MINIMUM-CLEARANCE ASSERT IS SELF-RELATIVE, SO IT CANNOT DETECT A CHANGE TO THE CONSTANT IT GUARDS. `tools/_mapblocks.mjs:280-281`

```js
check(minClear >= S.params.kerbMargin - 1e-6, `minimum clearance is at least KERB_MARGIN (...)`)
```

The bar is `S.params.kerbMargin`, the live value. Move the constant and the bar moves with it. Every
other assert in this file is measured against a hard literal in `BASELINE` at `_mapblocks.mjs:53-62`,
and the comment at `:51-52` states the principle out loud - "the number has to be typed twice, in two
files, by someone who looked at it". This one assert does not follow it.

Mutation, applied and reverted:

```
=== MUTANT: KERB_MARGIN 0.5 -> 0.05
  exit=0
  PASS
```

The area bands do not save it either: `_critic-r2-kerb.mjs` measures `insetArea` moving only +1.05%
against a +-3% band.

**How bad, honestly.** Not very, and I checked rather than assumed. My float64 sweep:

```
kerbMargin  0.50: true min clearance 0.5050 m, violations 0
kerbMargin  0.05: true min clearance 0.0609 m, violations 0
kerbMargin  0.00: true min clearance 0.0228 m, violations 0
kerbMargin -0.25: true min clearance -0.2149 m, violations 99   <- harness DOES fail, exit 1, 198 tarmac samples
```

So the tarmac boolean is a real backstop and the failure mode is bounded: a positive kerbMargin
cannot put a block on the road, and a negative one is caught loudly. What is lost is the *purpose* of
the assert. `blocks.js:33-36` justifies 0.5 as float32-error headroom; at 0.05 that headroom is
gone as a designed property and nothing in the tree would say so. **Fix: compare to a literal 0.5 in
`BASELINE`, like everything else.**

---

## F3. THE LARGEST NAMED 5b FACE IS A QUARRY, NOT AN UNTRACED STREET GRID. `verdicts/wave-t/generate-blocks.md` caveat 5b

The builder's 5b table names face 108 (harbour, 22.1 ha, "23.0%" road pixels) as the largest case of
"city that `paradise.json` has no streets for". I measured it two ways.

Independently, sampling the reference RGBA at 6 m inside each ring and classifying by luminance and
saturation with none of `_maptrace.mjs`'s constants (`tools/_critic-r2-caveat.mjs`), face 108 comes
out at **15.2% grey-built, 84.6% bare/vegetated** - the third *least* built of all 34 ring faces.

Then I looked at it. `verdicts/wave-t/generate-blocks-critic-r2-face108.png`. It is the White
Mountain quarry: bare rock, spoil heaps, excavation terraces, and not one street.

Two more of the builder's four named 5b examples disagree with my measure by 8-13 points (face 78:
builder 30.8%, me 18.1%; face 130: builder 28.9%, me 27.2%; face 90: builder 31.3%, me 29.6%). My
classifier is a crude heuristic on a JPEG and I do not claim it is the truth. What the disagreement
establishes is that **the 25% cut assigns individual faces essentially arbitrarily** - two
independent measures of the same quantity differ by more than the width of the decision.

**Cost today: zero.** 5a and 5b receive identical treatment in the code - both are `big`, both get a
frontage ring. The split is a routing label in prose, not a branch. The builder already labels it "a
cut on a continuum" and "a one-off, not a committed tool", which is the honest framing.

**Why it still matters:** 5b is handed to `digitise` as a work list. Sending `digitise` to trace
streets in a quarry wastes a wave. Either re-measure with a method that survives a second opinion, or
drop the per-face table and say only "some of these 34 faces are untraced city, here is the set, look
at them".

---

## F4. `no block is as large as BIG_FACE_AREA` IS A SELF-RELATIVE ASSERT WHOSE JUSTIFYING COMMENT IS FALSE. `tools/_mapblocks.mjs:178-182`

The comment: *"Without it, `BIG_FACE_AREA` could be raised to infinity and the slab spine would come
straight back with every other check still green."*

I tested it. `tools/_critic-r2-ring.mjs`, `bigFaceArea: Infinity`:

```
Infinity:  693 blocks, 3.708 km2, largest 306944 m2, SLABS(both) 8
```

`check(solid.length === 0, ...)` at `_mapblocks.mjs:193` fires on those 8. So does the `blockArea`
band, at +100% against +-5%. **"Every other check" does not stay green; two of them fail loudly.**
The assert is redundant, and like F2 it measures against a parameter rather than a literal, so
raising `bigFaceArea` raises its own bar.

Small. Listed because it is precisely the thing this piece was failed for in round 1 - a comment
describing a property the code does not have - and because the builder corrected that instance
beautifully at `_mapblocks.mjs:139-146` and then wrote a new one forty lines later.

---

## F5. THE 31 LONG STRIPS: HONEST DEFERRAL, AND MATERIALLY UNLIKE ROUND 1. Not a defect.

Verified: 31 blocks over 200 m on one side, 0.234 km2, 12.7% of block area (round 1: 51 blocks,
2.029 km2, 54.7%). Longest 432 x 20 m.

```
short side: min 20  max 64  median 32
how many have a short side > 40 (i.e. not a frontage strip): 1 of 31
how many sit on a RING face: 30 of 31
```

So the builder's description is accurate: these are 20-36 m frontage bands, not slabs. **The
difference from round 1 is topological, not cosmetic.** Round 1's 352 x 872 m box sealed off the
interior of a face - there was no route through it. A 432 x 20 m strip is a wall you drive
*alongside*, on a face whose 1.66 km2 interior is now open. Deferring subdivision of these is a
judgement about block granularity, not about whether the map is traversable. That is a different
decision from round 1's and it is honestly framed.

I would still cut them at ~200 m before `generate-mesh` builds facades on them, because a 432 m
single AABB is a 432 m unbroken collision face and the drive probe will graze it, but that is a
preference and the builder said so first.

---

## F6. 352 ms, ALL-OR-NOTHING, AGAINST A 242 ms `world` STAGE

Measured 340 / 346 / 353 ms over three runs, up from 260 ms in round 1 - the frontage rings cost a
second `clears()` pass per cell on 34 faces. Still one whole-map call: `blocks.js:195` walks all 1874
half-edges and `:265` loops all 247 faces before anything is returned. There is no per-chunk entry
point and no partial result.

`node tools/_loadtime.mjs` puts the current `boot world` stage at **242 ms**. This adds 352 ms to it
before a single chunk exists - **242 ms becomes ~594 ms, 7% of the 5.0 s cold-load budget spent on a
data structure the streaming contract says should be built per chunk.** Unchanged from round 1 in
kind, 92 ms worse in degree. The fill is per-face and partitionable; the traversal (3 ms) is not and
should stay global. Still not done, still correctly flagged, and now large enough that
`generate-mesh` has to decide rather than inherit.

---

## Verified clean, no action

- **The frontage band cannot push a block roadward, and the argument is sound.** `blocks.js:494-499`:
  a cell must pass `clears(x, z, half, ...)` and `pointInRing` *first*, and the band test only adds a
  further `continue`. The ring mask is therefore a strict subset of the solid mask, by construction,
  not by measurement. I confirmed it empirically anyway - 3,472 ring-block corners against my
  independent oracle, 0 violations, min 0.5050 m, versus 0.5317 m for the solid build. The band
  changes which cells are kept, never where the kerb is.
- **`BIG_FACE_AREA = 40000` is not tuned to make an assert pass.** Sweeping it: 39,000 gives 868
  blocks / 1.848 km2 and 41,000 gives 865 / 1.852. No cliff at the shipped value - the mark of a
  threshold chosen on meaning rather than on test output. Slabs do not reappear until 200,000, so the
  anti-wall property has ~5x of margin. The one visible artefact of the cut is a coverage
  discontinuity: faces at 25-39 ha get 49-57% of their area as block, faces at 41-68 ha get 36-44%.
  Two near-identical faces either side of 4 ha get noticeably different treatment. Cosmetic, and
  neither side produces a wall.
- **`RING_DEPTH = 40` is a judgement, defensibly made.** Block count is non-monotonic in it
  (20 m -> 914, 28 m -> 974, 40 m -> 868, 60 m -> 878), which is the packer, not a physical optimum;
  block area is monotonic as it should be (1.081 -> 3.327 km2). 40 m preserves 1.656 km2 of drivable
  interior and yields the 26 m building depth the docstring claims. The floor stated at
  `blocks.js:102` is written as `2*WALK_W + MIN_BLOCK_SIDE - 2*WALK_W`, which is just
  `MIN_BLOCK_SIDE = 20`; the algebra is noise but the number is right, and 20 m does still fit blocks.
- **The split is deep, local and clean.** `paradise.json` md5 unchanged. Caller's doc unchanged. New
  ids 688-691 cannot collide. `shortestNewEdge` 15.12 m, asserted `>= 1.0`, so no degenerate stub.
  The `t` parameterisation at `blocks.js:641` is right on both segments (`d3/(d3-d4)` along s,
  `d1/(d1-d2)` along t), and the descending sort at `:703` handles two cuts on one segment correctly.
- **`componentCount` at `blocks.js:782-792` is computed, not assumed** - union-find over the edge
  list. My independent BFS agrees at 1. The Euler assert is real.
- **`selfCrossing` is now genuinely scanned.** `blocks.js:635` skips only the adjacent pair rather
  than the whole edge, which closes the round-1 hole. Still 0, but now checked rather than lucky.
- **The determinism check now also proves non-mutation of the caller's doc** (`_mapblocks.mjs:339-343`).
  Good addition; that is the failure mode a deep copy invites.
- **The block-index correctness check compares results, not timings** (`_mapblocks.mjs:319`,
  `got.join() !== want.join()`). Real - as far as it reaches. See F1.
- `bash tools/lint.sh` -> `lint ok`. `node --check` clean on both files. `git status` for `game/`
  shows only `?? game/map/blocks.js`.
- The builder's `generate-blocks-round2-harbour.png` is not byte-identical to my crop but is visually
  the same view from the same tool. Not doctored; also not independent evidence, since it is my
  `tools/_critic-blockoverlay.mjs` output. My own renders are the ones I judged on.

### Mutation results, eight total, four of them new this round

| mutant | caught | how |
|---|---|---|
| `--no-split` (round-1 embedding) | yes, exit 1 | chi -4 vs 2, facesWalked 237 vs 247 |
| split inserted at the wrong vertex (`c.k + 1`) | **yes**, exit 1 | chi -4, and 2 negative faces - Euler is not fooled by a cosmetically-applied repair |
| `pointInRing` removed from the fill | **yes**, exit 1 | insetArea +68%, blockArea +78%, 1333 overlapping pairs |
| frontage band inverted | **yes**, exit 1 | blockCount -42.9%, largest 219,776 m2, 4 slabs |
| `KERB_MARGIN` -0.25 | **yes**, exit 1 | 198 tarmac samples |
| `bigFaceArea: Infinity` | yes | 8 slabs, blockArea +100% |
| drop faces over 100,000 m2 (round 1's killer) | yes, exit 1 | 5 band failures |
| **`KERB_MARGIN` 0.5 -> 0.05** | **NO, exit 0** | **F2** |

`game/map/blocks.js` mutated seven times, restored byte-exactly each time. md5
`9be76ec4033ae9f64306d1866de3cace` at the start of this document and at the end of it.
`game/map/paradise.json` md5 `be746f30ffa169d190acd297d30f0abf`, unchanged throughout.

---

## THE OVERLAY, ROUND 2 AGAINST ROUND 1

Rendered with my own `tools/_critic-blockoverlay.mjs`, same colours, same crops, same dim as round 1,
so the two are directly comparable. Magenta = block, **red = over 200 m on a side**, green/cyan/yellow
= the road graph, white rings = the four crossings.

- `verdicts/wave-t/generate-blocks-critic-r2-lake.png` - the round-1 quarry crop
- `verdicts/wave-t/generate-blocks-critic-r2-face108.png` - the largest claimed 5b face
- compare against `verdicts/wave-t/generate-blocks-overlay.png` from round 1

**The spine is gone, not thinner.** In round 1 the full-map view was a chain of solid red slabs
running from the western mountain through the centre to the harbour, 54.7% of all block area,
readable as a wall down the middle of the city. In round 2 the red is 31 thin ribbons lying along
roads. Nothing in the frame reads as a barrier. That is a categorical change, not a reduction.

**The thing round 1 called a quarry is a lake, and round 1 had a solid collision box on it.** This is
the single most useful image of the round. Lift the 352 x 872 m block off and the reference
underneath is open water with boats on it. Round 1's own report described these faces as
"mountainside, water, quarry" and then shipped a solid AABB over them anyway. Round 2 leaves the
water entirely open and lines only the shore. The frontage there is ragged, follows the shoreline
road, and varies in depth - it reads as lakeside frontage, not as a stamped band.

**The harbour is the round-1 finding answered directly.** In round 1 two >200 m slabs sat on a fully
built harbour grid whose internal streets were plainly visible in the reference beneath the fill.
Those two faces are now rings: the untraced streets are open ground in the middle, blocks line the
traced roads, and the cost of the `digitise` gap has gone from structural to cosmetic exactly as the
builder claims.

**Do the rings read as city blocks or as a picture frame?** Both, and the split is honest. In built
districts - downtown, Silver Lake, the harbour front - the ring is broken, varies in depth, bends
with the road, and reads as a block. On the quarry and lake rims it reads as a frame: the face-108
crop shows two 424 x 20 m and 252 x 32 m red bars running dead straight along bare rock with nothing
in the reference to put a building on. That is a real artefact and it is the right kind of artefact -
it puts frontage where there is none, which `generate-mesh` can decline to build on, rather than
putting collision where the ground is open, which nothing downstream could have undone.

**Plain words: yes, and much more so than round 1.** Round 1's blocks were in the right city.
Round 2's blocks are in the right city *and* the map's water, quarries and untraced districts read as
what they are. Every magenta rectangle still sits in a hole in the road network, the coastline is
still clean the whole way round, and now the terrain is visible through the map instead of buried
under it.

---

## WHAT TO FIX, IN ORDER

1. **`blocks.js:756-771` - dedup `index.at`.** Then sweep `pad` in the `_mapblocks.mjs:307-321`
   probe. Today's check is scoped to the only pad value that cannot expose the bug, and `pad = 1.0`
   is what `physics.js:922` uses.
2. **`_mapblocks.mjs:280` - compare `minClear` to a literal `0.5` in `BASELINE`**, not to
   `S.params.kerbMargin`. One word. Every other assert in the file already does this.
3. **`_mapblocks.mjs:178-181` - delete the assert or fix the comment.** `bigFaceArea: Infinity` is
   caught twice over without it; the comment claims otherwise and is wrong.
4. **Caveat 5b - re-measure or de-specify.** Face 108 is a quarry. Do not hand `digitise` a work list
   two independent measurements disagree about by 8 points.

None of these is in the block list, and the block list is correct.
