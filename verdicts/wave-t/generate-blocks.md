# WAVE T - `generate-blocks`. Graph faces -> city blocks. Round 3.

Round 2 PASSED with two defects (`verdicts/wave-t/generate-blocks-critic-r2.md`). Both are fixed
here, plus the two smaller corrections the critic asked for. **Round 3 changes no block:** the 868
blocks, 1.848 km2 and 0.5050 m minimum clearance are byte-identical to round 2. Every change is in
the index, in the harness, or in this document.

Round 1 FAILED. The critic's summary was that the block list was correct and the apparatus that
certified it was not, and that is exactly right. `verdicts/wave-t/generate-blocks-critic.md` is the
full verdict; this file is rewritten against it.

Deliverables, still two files, nothing else in `game/` touched:

- `game/map/blocks.js` (831 lines) - crossing repair, planar face traversal, kerb inset, rectangle
  fill, frontage rings on big faces, and a deduplicating block spatial index.
- `tools/_mapblocks.mjs` (398 lines) - the harness, `node tools/_mapblocks.mjs`, exit 0 on green.

I edited no file in `game/` but `game/map/blocks.js`. No three.js import, no `fetch` on the build
path, no DOM. Note for a critic reading `git status`: `game/world.js`, `game/road.js` and
`game/util.js` show as modified and `game/_world_old_tmp.js` as untracked. **None of those are
mine** - they arrived from the `generate-mesh` peer while I was working, and `verdicts/wave-t/generate-mesh-s0.md`
is theirs too. `physics.js`, `traffic.js`, `camera.js` and `paradise.json` are untouched by anyone.

```progress-metrics
Euler chi: 2 (was -4), V 692 E 937 F 247
blocks: 868 from 240 faces
block area: 1.848 km2 (was 3.708, slabs removed)
solid slabs over 200 m both sides: 0 (was 51 carrying 54.7% of area)
tarmac overlap: 0 of 7561948 samples (0.5 m grid + corners)
min clearance to tarmac: 0.5050 m against KERB_MARGIN 0.5
index.at duplicates at pad 1.0: 0 of 8000 probes (was 1054)
build: 352 ms whole map, 342 ms of it raster fill
```

---

## ROUND 3: THE TWO DEFECTS, AND TWO CORRECTIONS

### R3-F1. `index.at(x, z, pad)` returned DUPLICATES for every `pad > 0`, and my check only ever called it at `pad = 0`.

The critic measured **1054 of 8000 probes wrong at `pad = 1.0`, up to 6 extra copies of one block**;
never missing, never spurious, purely duplicated. A block spanning several cells is registered in each
of them and `at()` pushed it once per cell.

**The check could not have caught it.** At `pad = 0`, `reach = ceil(0 / 128) = 0`, one cell is read,
and duplication is structurally impossible. I ran 20,000 probes, half of them deliberately on block
boundaries, against the one parameter value where the bug cannot exist. That is this project's
permanent rule 2 - a metric that can be satisfied without the thing it claims to measure - and it is
the second time in this piece I have done it. It matters concretely because `physics.js:922` uses
`hx = b.w / 2 + 1.0`, a pad of exactly 1.0, and `traffic.js:1068` bounces per hit with no early
return, so three duplicate hits on one wall is three sign flips in one step.

**Fixed** at `game/map/blocks.js:754-804`: mark-and-sweep with a generation counter, not a `Set` per
call, because the intended caller runs at `SUBSTEP = 1/240` per car and allocating a Set 240 times a
second is exactly the garbage a streaming world does not need. `reach === 0` short-circuits to the
single-cell path so the bookkeeping is not paid where it cannot be needed. `seen` is an `Int32Array`,
so `gen` is reset at `0x7fffffff` (`blocks.js:791`) rather than being allowed to truncate and alias a
stale mark - ~100 days at 240 Hz, long enough never to be reproduced and short enough not to be
impossible.

**Check fixed too**, and this is the half that matters more. `tools/_mapblocks.mjs:321-370` now sweeps
`pad` over `[0, 1.0, 5, 50, 200]` - including 1.0 because that is what `physics.js` uses, and 200
because it exceeds a whole 128 m cell so `reach = 2` - compares results against the linear scan as
MULTISETS, and counts missing, spurious and duplicate **separately** so the failure mode is named
rather than totalled. Two asserts, `_mapblocks.mjs:366` and `:367`; the pad list is the literal at `_mapblocks.mjs:333`.

| pad | before (critic, 8000 probes) | after |
|---|---|---|
| 0 m | 0 bad | 0 bad |
| **1.0 m** | **1054 bad probes, all duplication, worst 6 extra copies** | **0 bad, 0 duplicate** |
| 5 m | not tested | 0 bad, 0 duplicate |
| 50 m | not tested | 0 bad, 0 duplicate |
| 200 m (`reach = 2`) | not tested | 0 bad, 0 duplicate |

```
  pad     0 m:     0 bad probes of 8000  (missing 0, spurious 0, DUPLICATE 0, worst 0 extra copies)
  pad     1 m:     0 bad probes of 8000  (missing 0, spurious 0, DUPLICATE 0, worst 0 extra copies)
  pad     5 m:     0 bad probes of 8000  (missing 0, spurious 0, DUPLICATE 0, worst 0 extra copies)
  pad    50 m:     0 bad probes of 8000  (missing 0, spurious 0, DUPLICATE 0, worst 0 extra copies)
  pad   200 m:     0 bad probes of 8000  (missing 0, spurious 0, DUPLICATE 0, worst 0 extra copies)
  ok    index.at() finds exactly the right blocks at every pad in [0,1,5,50,200]  0 missing or spurious
  ok    index.at() returns each block AT MOST ONCE at every pad  0 duplicate entries
  pad     0 m: index.at 158 ns/query vs linear scan 2342 ns/query (15x)
  pad     1 m: index.at 453 ns/query vs linear scan 1875 ns/query (4x)
```

The speed figure is now quoted per pad and it is lower than round 2's headline 38x, because round 2
timed only the `pad = 0` single-cell path and compared it against a linear scan that also did no
padding. At `pad = 1.0` - the real consumer's case - it is **4x**, nine cells against 868 blocks. That
is the honest number and it is smaller than the one I published.

### R3-F2. The minimum-clearance assert read its expected value out of the thing under test.

Round 2: `check(minClear >= S.params.kerbMargin - 1e-6, ...)`. The bar was the live constant, so
`KERB_MARGIN 0.5 -> 0.05` moved the bar with it and passed at exit 0 - the one mutation of eight the
critic got through. It is also the only assert in the file that ignored the `BASELINE` principle
stated in my own comment at `_mapblocks.mjs:52`: "the number has to be typed twice, in two files, by
someone who looked at it."

**Fixed:** `minClearance: { v: 0.5050, band: 0.02 }` at `tools/_mapblocks.mjs:68`, asserted through
the same `band()` path as every other figure (`_mapblocks.mjs:300`).

Mutation, applied and reverted, `game/map/blocks.js` md5 `22f5b355fe549d8b079335a176637b93` before and
after:

```
=== MUTANT: KERB_MARGIN 0.5 -> 0.05  (blocks.js:38)
  FAIL  minClearance within baseline  0.0609 m vs 0.505 m (-87.95%, band +-2%)
FAIL - 1 check(s)     exit 1
```

0.0609 m is the critic's independently measured value for that mutant, to four decimal places.

### R3-F3. `_mapblocks.mjs`'s justifying comment for the anti-wall assert was false. Corrected plainly.

Round 2's comment said that without `largestBlock < BIG_FACE_AREA`, "`BIG_FACE_AREA` could be raised
to infinity and the slab spine would come straight back with every other check still green". **That is
false.** The critic ran `bigFaceArea: Infinity` and it is caught twice over without that line:
`solid.length === 0` fires on 8 slabs and the `blockArea` band fires at +100% against +-5% (`_mapblocks.mjs:211` is the slab check).

That is the second prose-versus-code error I have written in this piece, and the first one was in the
paragraph forty lines above it. The comment at `_mapblocks.mjs:185-198` now says so, in those terms.
The assert is **kept, but at a literal 40000** rather than at `S.params.bigFaceArea` - which had the
F2 disease too, raising its own bar with the parameter - and kept only on the stated grounds that
`blockArea +100%` does not say "there is a wall in the map" and a named assert does. Redundant, and
labelled redundant.

### R3-F4. Caveat 5b was misfiled, and the measurement that produced it repeats a mistake `digitise` already documented.

The critic found that face 108, which my round-2 prose named as the largest 5b "untraced street grid",
is the White Mountain quarry - bare rock, spoil heaps, no streets. Two things were wrong and they are
different:

1. **A bookkeeping error of mine.** Face 108 measured 23.0%, which is BELOW my own 25% cut, so it was
   never in 5b by my own method. I sorted the candidates by area and wrote up the biggest without
   re-checking it against the cut. The prose contradicted the table in the same section.
2. **The method is unsound, and worse than "crude".** I re-rendered the reference under the largest
   candidates and looked. Face 78 (palmbay, my 30.8%) is a bare rocky bluff. Face 34 (silverlake, my
   29.4%) is vegetated hillside and water. **My mask reads bright bare rock as road** - which is
   precisely the failure `verdicts/wave-t/digitise.md` records and warns about: *"measuring how much
   of the ROAD MASK had no graph edge near it returned 43.6%, and the picture showed that was rock
   faces, surf, beach and building roofs. A coverage metric over a noisy mask measures the noise."* I
   reused that mask and reproduced that error, in a section whose whole purpose was to hand `digitise`
   a work list.

**So the numeric split is withdrawn.** There is no "11 faces / 1.064 km2 of untraced city" claim any
more; that number was manufactured by a cut on a continuum between two measures that disagree by more
than the width of the decision. What replaces it is below, and it is shorter and checkable.

---

## WHAT CHANGED IN ROUND 2, AND THE NUMBERS EITHER SIDE

| | round 1 | round 2 |
|---|---|---|
| **Euler `V - E + F`** | **-4**, six faces merged, genus 3, unchecked | **2**, asserted |
| V, E, F | 688, 929, 237 | 692, 937, 247 |
| faces kept | 234 | **240** |
| crossings repaired | 0 of 4 | **4 of 4**, in a copy of the doc |
| self-crossing polylines | not checked | 0, now checked |
| stage areas asserted | **0 of 6** | **6 of 6 plus 2 counts**, literal baseline + band |
| harness survives deleting 53% of output | **yes, exit 0** | **no, 5 failures** |
| blocks | 693 | **868** |
| total block AABB area | 3.708 km2 | **1.848 km2** |
| largest block | **352 x 872 m, 306944 m2** | **140 x 112 m, 15680 m2** |
| blocks over 200 m on BOTH sides (slabs) | **51, 2.029 km2, 54.7% of area** | **0** |
| blocks over 200 m on one side (frontage strips) | 51 | 31, 0.234 km2, 12.7% |
| tarmac violations | 0 / 15002577 @ 0.5 m | **0 / 7561948 @ 0.5 m** |
| min signed clearance | not reported | **0.5050 m** |
| block spatial index | none | published; **round 3** dedups it and measures 15x at `pad 0`, 4x at `pad 1.0` |
| unindexed AABB tests/s at 240 Hz | 166,320 (not stated) | **208,320, stated and indexed** |
| build time | 260 ms | 352 ms |

---

## F1. EULER. FIXED BY REPAIRING THE EMBEDDING, NOT BY ADJUSTING THE COUNT.

The critic measured `chi = V - E + F = 688 - 929 + 237 = -4` where a planar embedding requires
`1 + components = 2`, so six faces were welded into three. The cause was the four shared-node
crossings round 1 found and chose to leave alone.

**The four crossings are now split**, in a deep COPY of the document, by `splitAtCrossings` at
`game/map/blocks.js:674`. A node goes in at each crossing point and both crossing edges are cut
there. `paradise.json` is not touched and is not touchable by this piece: its edge ids are published
and `queries` already ships against them, so the repair is in memory and the reported crossing table
below keeps the ORIGINAL edge ids so it stays a work list for whoever rebuilds the graph.

```
repair: APPLIED - 4 node(s) inserted in a COPY of the doc, V 688 -> 692, E 929 -> 937,
        shortest resulting edge 15.12 m

Euler characteristic
  V 692  E 937  F 247  components 1
  chi = V - E + F = 2, planar requires 1 + components = 2
  ok    V - E + F === 1 + components (the embedding is planar)  chi 2 vs 2
```

`V - E + F === 1 + components` is now a hard `check()` at `tools/_mapblocks.mjs:125`, with
`components` computed off the document by union-find (`componentCount`, `blocks.js:782`), plus a
zero-band baseline assert on `chi` itself so it cannot drift. **It can be seen failing rather than
taken on trust:** `node tools/_mapblocks.mjs --no-split` reproduces round 1's embedding exactly and
exits 1 with four failures.

```
*** --no-split: crossings NOT repaired, this is round 1 behaviour and must fail Euler ***
  chi = V - E + F = -4, planar requires 1 + components = 2  => 6 face(s) merged, genus 3
  FAIL  V - E + F === 1 + components (the embedding is planar)  chi -4 vs 2
  FAIL  chi within baseline  -4 vs 2
  FAIL  facesWalked within baseline  237 faces vs 247 faces
  FAIL  keptFaces within baseline  234 faces vs 240 faces
exit 1
```

Every number matches the critic's independent `tools/_critic-split.mjs`: F 247, kept faces 240,
chi 2. Two side effects worth recording because they are the merge unwinding:

- **`droppedTiny` goes 2 -> 6, 612 -> 1276 m2.** The four extra dropped faces are the crossing
  LENSES - the small overlap regions that were previously swallowed into their neighbours and are
  now their own faces, all under `MIN_FACE_AREA = 400 m2`. That is the merge being undone, visible
  in the arithmetic.
- **The blocks are unaffected**, as the critic predicted and as `--no-split` confirms directly. The
  raster fill is even-odd over the ring plus a global corridor clearance, so the merge cancelled.
  Round 1's "do not split" call was right about the blocks and wrong about the traversal.

The crossing table, original edge ids, unchanged and now repaired rather than tolerated:

| edges | shared node | node position | crossing | distance from node |
|---|---|---|---|---|
| 130 x 195 | 198 | 1360.3, -441.4 | 1369.4, -467.4 | 27.6 m |
| 228 x 232 | 192 | 1467.4, -406.9 | 1510.9, -418.4 | 45.0 m |
| 455 x 459 | 403 | -1246.7, 116.9 | -1177.2, 119.2 | 69.6 m |
| 488 x 531 | 440 | 785.6, 265.9 | 792.8, 247.2 | 20.1 m |

**Also closed: the self-crossing hole the critic named.** Round 1's `findCrossings` skipped every
pair on the same edge (`if (s.e === t.e) continue`), so a polyline folding back through itself was
invisible. It now skips only CONSECUTIVE segments, which genuinely cannot properly cross, and
reports `selfCrossing` as a third category. Measured: 0, same as the critic's brute force. It cost
nothing, and "it happens to be zero" was not the same as "it is checked".

## F2. THE PLANAR-AREA IDENTITY WAS A TAUTOLOGY. MY ROUND-1 REPORT SAID OTHERWISE. IT WAS WRONG.

Round 1 of this file said, of the outer face's area equalling the sum of the interior faces:

> It is a real check on the traversal, not a tautology: a traversal that mis-orders one node's
> half-edges produces faces that still close and still have plausible areas but no longer sum.

**That claim is false, and it is false algebraically, not marginally.** Summing the shoelace terms
over every face traverses each geometric segment exactly once in each direction, so the total is
identically zero for ANY rotation system, planar or broken. There is no traversal error it can
detect. The critic proved it by running the exact mutation my sentence described - swapping two
entries in one node's sorted list - and watching the identity pass at 5844201.3 vs 5844201.3 to one
decimal place with two additional faces merged and every other check green.

That is this project's permanent rule 3 failure, in the file whose job was to prevent it, written by
me. The correction:

- The assert is **removed** from `tools/_mapblocks.mjs`. The value is still PRINTED, labelled in the
  output line itself as "identically equal for any rotation system - NOT a planarity check", with
  the algebra in a comment above it so the next reader cannot re-derive the mistake.
- Euler is the check that has the property the identity claimed. Every unrepaired crossing merges
  two faces and drops F by exactly one, and nothing the traversal does can hide it.

## F3. THE HARNESS PASSED WITH 53% OF THE DELIVERABLE DELETED. NOW IT DOES NOT.

Round 1 printed six stage areas and asserted none of them. The critic dropped every face over
100,000 m2 - 3.13 km2 and 298 blocks - and `node tools/_mapblocks.mjs` exited 0, because the only
guard was `check(S.keptFaces > 100)` and 218 cleared it.

There is now a literal `BASELINE` table at `tools/_mapblocks.mjs:54-69` with a two-sided band on
every stage figure and both counts. Two-sided because silent GROWTH is as much a symptom of a broken
fill as silent shrinkage, and because a one-sided floor is the rubber stamp wave-S rule 7 bans.

| key | `_mapblocks.mjs:line` | baseline | band | why that band |
|---|---|---|---|---|
| `chi` | `:54` | `2` | `0` | An integer identity. There is no legitimate value but 2. |
| `facesWalked` | `:55` | `247` | `0` | Determined by `paradise.json` and Euler together; if it moves, one of those two moved. |
| `keptFaces` | `:56` | `240` | `+-3 faces` | As above minus `MIN_FACE_AREA`; stated in faces, not percent, because it is a small integer and 1% of 240 is meaningless. |
| `interiorArea` | `:57` | `5853075 m2` | `+-1%` | A pure function of the document and the traversal - no threshold, no raster, no packing. Only a graph or traversal change can move it and both should be deliberate. |
| `keptFaceArea` | `:58` | `5851799 m2` | `+-1%` | As above plus `MIN_FACE_AREA`, which removes 0.02% of the area. |
| `insetArea` | `:59` | `4217616 m2` | `+-3%` | Additionally depends on `SHOULDER`, `KERB_MARGIN` and the 4 m raster. |
| `blockArea` | `:60` | `1847856 m2` | `+-5%` | Depends on all of the above plus `MIN_BLOCK_SIDE`, `BIG_FACE_AREA`, `RING_DEPTH` and the maximal-rectangle packing, which is the most brittle step in the file. |
| `blockCount` | `:61` | `868` | `+-5%` | As `blockArea`; the count moves further than the area because packing trades one large rectangle for several small ones. |

Re-running the critic's F2 mutation - one `if (area > 100000) continue;` in the face loop - now
gives:

```
  ok    interiorArea within baseline  5853075 m2 vs 5853075 m2 (-0.00%, band +-1%)
  FAIL  keptFaceArea within baseline  2720170 m2 vs 5851799 m2 (-53.52%, band +-1%)
  FAIL  keptFaces within baseline     224 faces vs 240 faces  (-6.67%, band +-3)
  FAIL  insetArea within baseline     1587760 m2 vs 4217616 m2 (-62.35%, band +-3%)
  FAIL  blockArea within baseline      992944 m2 vs 1847856 m2 (-46.27%, band +-5%)
  FAIL  blockCount within baseline        451 blocks vs 868   (-48.04%, band +-5%)
FAIL - 5 check(s), exit 1
```

`game/map/blocks.js` md5 `9be76ec4033ae9f64306d1866de3cace` before that mutation and after
restoring it; verified both times.

Three more asserts were added that round 1 lacked, each of which closes a way to make the output
worse while staying green:

- **`largestBlock < BIG_FACE_AREA`** (`_mapblocks.mjs:181`). Without it, raising `BIG_FACE_AREA` to
  infinity brings the slab spine straight back with everything else green.
- **No block over 200 m in BOTH dimensions** (`_mapblocks.mjs:193`). The direct statement of "no
  walls", currently 0.
- **`minClear >= KERB_MARGIN`** (`_mapblocks.mjs:280`). See F-tarmac below.

## F4. THE SLAB SPINE IS GONE. BIG FACES NOW EMIT A FRONTAGE RING.

The critic's overlay showed what no number in round 1 said: the 51 giant blocks were not a
scattering of mountain interiors, they were a spine of solid slabs running the length of the map,
and `physics.js:922` makes each one a single collidable AABB. A wall down the middle of the city.

**Fixed here, in `blocks.js`, because it is a block-shape problem.** A face at or above
`BIG_FACE_AREA` is filled only within a band of `RING_DEPTH` metres inward from its kerb inset; the
interior is left as open ground. Buildings line the streets that bound a face; the middle of a
352 x 872 m un-roaded loop is quarry, mountainside or water and must be drivable.

The band is computed by running the same corridor-clearance test twice: once at the true paved
half-widths, which is what makes the block legal, and once with every road fattened by `RING_DEPTH`.
A cell that passes the first and fails the second is within `RING_DEPTH` of the kerb, which is
exactly the frontage. `blocks.js:483` and `blocks.js:497`. Correctness lives entirely in the first
test, so the band needs no Lipschitz slack and cannot push a block toward the road.

| | before | after |
|---|---|---|
| blocks | 693 | **868** |
| total AABB area | 3.708 km2 | **1.848 km2** |
| largest block | **352 x 872 m = 306944 m2** at -812, -64 | **140 x 112 m = 15680 m2** at 286, 868 |
| longest single side | 872 m | 432 m |
| deepest short side | 352 m | 112 m |
| blocks over 200 m on both sides | **51, 2.029 km2, 54.7% of block area** | **0** |
| blocks over 200 m on one side | 51 | 31, 0.234 km2, 12.7% - frontage strips, a terrace row, not a wall |
| faces filled as a ring | - | 34 |
| interior left open and drivable | 0 | **1.656 km2** |
| unindexed AABB tests/s at 240 Hz | 166,320 | **208,320** |
| tarmac violations after the change | 0 / 15002577 | **0 / 7561948** |
| min signed clearance | not measured | **0.5050 m** |

**The tarmac oracle was re-run and is the reason to trust this**, because the critic is right that a
perimeter ring has far more block boundary near a kerb than a slab does and is therefore the change
most likely to push a rectangle into the road. It did not: 0 of 7,561,948 samples at 0.5 m pitch plus
explicit corners, and the minimum signed clearance moved only from 0.5084 m to 0.5050 m, still above
`KERB_MARGIN = 0.5` and now asserted to be.

The AABB-test figure rose because there are more, smaller blocks. That is the correct trade -
208,320 cheap tests against an indexed lookup beats 166,320 tests one of which is a 0.31 km2 wall -
and the index below is the answer to the count.

**The evidence is the picture, not the table.** `verdicts/wave-t/generate-blocks-round2-overlay.png`
is the round-2 overlay drawn with the critic's own `tools/_critic-blockoverlay.mjs`, so it is
directly comparable with `generate-blocks-overlay.png` beside it. The red spine is gone. The White
Mountain quarry, the Silver Lake water and the mountainside interiors are open ground again with
magenta frontage around their bounding roads. What red remains is 31 thin strips lying ALONG streets,
which is a row of buildings. `generate-blocks-round2-harbour.png` is the critic's exact harbour crop
(`--crop 900,300,1700,850 --scale 6`): the two slabs that lay across the visible street grid are now
rings, and the untraced streets underneath are open.

```
node tools/_mapdump.mjs reference/map/ign-map.jpg /tmp/ign
node tools/_critic-blockoverlay.mjs /tmp/ign /tmp/ov --scale 2
node tools/_mappng.mjs /tmp/ov verdicts/wave-t/generate-blocks-round2-overlay.png
```

## F5, SPLIT IN TWO, BECAUSE THEY HAVE DIFFERENT OWNERS

*(Rewritten in round 3. The numeric split published in round 2 is WITHDRAWN - see R3-F4 above for why
and for the specific faces it got wrong.)*

Round 1 filed one caveat over all the giant faces and called them "the un-roaded interiors of large
loops - mountainside, water, quarry". The critic found on the overlay that this is only true of some,
and that in the harbour the slabs lay on a street grid plainly visible in `reference/map/ign-map.jpg`
and absent from the graph. Both tarmac oracles are blind to that by construction: both define tarmac
as the graph.

There are 34 ring faces, 4.278 km2 of face, 632 blocks, 1.298 km2 of block. They fall into two kinds
with two different owners, and **the code treats them identically** - `big` is one flag, both get a
frontage ring - so the classification is a routing label in prose and costs nothing at runtime.

### 5a. GENUINELY OPEN GROUND. Owner: `generate-mesh`.

Quarry, mountainside, lake and water enclosed by roads and not subdivided by them. The traversal is
right, the ring is right, and **1.656 km2 of interior is now open and drivable rather than walled.**
The critic's `generate-blocks-critic-r2-lake.png` is the case that matters: the 78.5 ha face 37 that
round 1 filled with a 352 x 872 m solid AABB, and that round 1's own report called a quarry, is
**open water with boats on it**. Round 3's own re-inspection adds face 78 (a bare rocky bluff), face
34 (vegetated hillside and water) and face 108 (the White Mountain quarry) to this category, all
three of which my round-2 measurement had misfiled or nearly misfiled.

What `generate-mesh` needs to know is one sentence: **the interior of a ring face is not a building
plot.** It is terrain. `faces[i].big` is on the returned face record for exactly this.

### 5b. UNTRACED STREET GRID. Owner: `digitise`.

City that `paradise.json` has no streets for, so the traversal faithfully reports one large face where
the picture shows a grid. **Five faces, confirmed by looking at the reference under each one**, not by
a threshold:

| face | district | face area | blocks | block area | what the reference shows in the open interior |
|---|---|---|---|---|---|
| 90 | downtown | 15.3 ha | 22 | 5.0 ha | street grid with buildings, plus a canal |
| 130 | harbor | 15.7 ha | 22 | 6.1 ha | dense built city, internal streets visible |
| 63 | palmbay | 11.6 ha | 23 | 5.8 ha | built city with through streets |
| 171 | downtown | 10.9 ha | 11 | 4.2 ha | street and plaza with buildings |
| 146 | downtown | 6.2 ha | 8 | 2.6 ha | a north-south street with buildings either side |
| **total** | | **0.598 km2** | **86** | **0.237 km2** | |

**This is a floor, not a total.** I inspected the largest candidates only; the remaining 29 ring faces
were not individually confirmed either way, and three of the ones I did inspect (81, 87, 221) are
genuinely ambiguous - 221's apparent interior road is the RAILWAY, which `digitise` deliberately does
not trace and which `verdicts/wave-t/digitise.md` records as correctly uncovered. **No total km2 of
untraced city is claimed.** The five above are the ones a `digitise` session could start on without
first re-deciding whether they qualify.

**DECISION, taken by the coordinator and recorded so nobody reopens it: the harbour is NOT being
re-traced this session.** What stops the gap shipping as a wall is F4: these faces get a frontage ring
like any other big face, so the untraced streets under them are open ground the car drives on, not a
slab it hits at 70 m/s. The cost of the gap is now cosmetic - a plaza where a street grid should be -
instead of structural.

## THE BLOCK INDEX, PUBLISHED FOR `rewire`

`world.blocks` stays a flat array - decision 5 of `tools/WAVE-T-GENERATE-PLAN.md` makes its shape a
contract - so the index is published ALONGSIDE it, on the result as `index`, and a consumer that
ignores it behaves exactly as today.

The motivating numbers, which the critic put on the record and round 1 did not:
`game/physics.js:921-958` `collide(h)` is `for (const b of blocks)` with no index, driven from
`physics.js:1953` inside the `SUBSTEP = 1/240` substep loop, returning on first hit so the common
no-contact case is a full scan. `game/camera.js:251` scans the same array per frame and
`game/traffic.js:1068` per wrecked vehicle. `world.js:16`'s seven-entry grid publishes 36 blocks =
**8,640 AABB tests/s**; this piece publishes 868 = **208,320/s**.

```
block index (published as `index` alongside the flat array, never instead of it)
  868 blocks in 377 cells of 128 m, 1632 entries, 4.33 per cell
  ok    index.at() finds exactly the right blocks at every pad in [0,1,5,50,200]  0 missing or spurious
  ok    index.at() returns each block AT MOST ONCE at every pad  0 duplicate entries
  pad     0 m: index.at 158 ns/query vs linear scan 2342 ns/query (15x)
  pad     1 m: index.at 453 ns/query vs linear scan 1875 ns/query (4x)
```

`buildBlockIndex` at `blocks.js:735`. 128 m cells rather than `graph.js:53`'s 64 m because blocks are
much larger objects than road segments and at 64 m a 432 m frontage strip would register in 18 cells.
`index.at(x, z, pad)` returns the indices of every block whose AABB, grown by `pad`, contains the
point, **each at most once** - `pad` is there because `physics.js:922` uses `hx = b.w / 2 + 1.0`.
Dedup is mark-and-sweep against a generation counter (`blocks.js:754-804`), not a `Set` per call.
Correctness is asserted against a linear scan across five pads, as multisets, with duplicates counted
separately, at `tools/_mapblocks.mjs:366-367`. Round 2 checked only `pad = 0` and shipped a
duplication bug; see R3-F1.

**The speedup is 4x at the pad the consumer uses, not 38x.** Round 2's 38x timed the single-cell
`pad = 0` path against an unpadded linear scan. At `pad = 1.0` the index reads nine cells and comes
out at 453 ns against 1875 ns. Both numbers are printed per pad now so the headline cannot be taken
from the flattering one.

**Boot cost, stated and not fixed.** `createBlocks` is all-or-nothing: 352 ms whole-map, 342 ms of it
raster fill. The critic measured the current `boot world` stage at 242 ms via `tools/_loadtime.mjs`,
so this more than doubles that stage and spends 7% of the 5.0 s budget before a chunk exists. The
fill is per-face and trivially partitionable by chunk and the traversal (3.3 ms) is not and should
stay global - but that work has not been done, so 352 ms is the number that stands. It went UP from
round 1's 260 ms, and the reason is the ring band: a big face now runs the corridor-clearance test
twice per cell.

---

## FULL RESULT

| | |
|---|---|
| crossings: non-adjacent / shared-node / self | **0 / 4 / 0** - all repaired |
| V, E, F after repair | 692, 937, 247 |
| **Euler chi** | **2**, required 2 |
| half-edges | 1874 = 2 x 937, each used exactly once |
| every face closed | 247/247 |
| outer faces (negative signed area) | exactly 1, enclosing 5.853 km2 |
| faces dropped as degenerate | 6, totalling 1276 m2 |
| faces kept | 240 |
| faces filled as a frontage ring | 34 |
| faces that yielded no block | 96, 0.219 km2 |
| blocks | **868** (3.62 per face) |
| largest / smallest block | 140 x 112 m = 15680 m2 / 20 x 20 m = 400 m2 |
| blocks overlapping each other | 0 pairs |
| **block samples on tarmac** | **0 / 507850** @ 2 m; **0 / 7561948** @ 0.5 m |
| **minimum signed clearance** | **0.5050 m** at -1368.0, 668.0 (block 611, face 133) |
| build time | 352 ms (traversal 3.3, crossing scan + split 5.3, corridor index 1.3, raster fill 342.2) |

### THE AREA FIGURE AT EVERY STAGE, now asserted as well as printed

```
extent            4000 x 2861.4 m = 11.446 km2
interior faces    5.853 km2  (51.1% of extent)
after tiny drop   5.852 km2  (240 faces; dropped 6 below 400 m2, 1276 m2 total)
inset (off kerb)  4.218 km2  (72.1% of face area; the rest is the paved corridor)
ring interior     1.656 km2  left OPEN on 34 big faces - drivable ground, not a block
block AABBs       1.848 km2  (72.1% of fillable inset)
building line     0.855 km2  (bw x bd, 7 m pavement each side)
NOT enclosed      5.593 km2  (48.9%) - outside the road network: ocean, mountainside, map margin
```

The 48.9% shortfall against the extent is NOT the paved corridor: the extent is a bounding box and
nearly half of it is water, mountainside and margin that no road encloses. The paved corridor is the
27.9% gap between face area and inset area, 1.634 km2, against 78.81 km of centreline at a median
14 m width, which is 1.10 km2 of painted road before shoulders. Right order.

### Per-district

| district | faces | face km2 | blocks | block km2 |
|---|---|---|---|---|
| mountain | 49 | 1.867 | 260 | 0.474 |
| silverlake | 50 | 1.275 | 220 | 0.399 |
| harbor | 47 | 1.096 | 164 | 0.378 |
| palmbay | 48 | 0.843 | 121 | 0.310 |
| downtown | 46 | 0.770 | 103 | 0.287 |

Length-weighted majority of each face's own bounding edges (`majorityDistrict`). Inherits the caveat
in `verdicts/wave-t/digitise.md` that the five districts are a Voronoi partition of hand-placed
seeds, not traced boundaries.

---

## EVERY CONSTANT. Round-1 values are the BEFORE where one exists.

| constant | BEFORE | AFTER | `file:line` | why this number |
|---|---|---|---|---|
| `SHOULDER` | `3.0` | `3.0` | `game/map/blocks.js:26` | Not an independent choice - must equal `SHOULDER = 3.0` at `game/map/graph.js:16`, where `surfaceAt` says tarmac ends. Mutation table below shows drift costs 5633 tarmac samples. |
| `KERB_MARGIN` | `0.5` | `0.5` | `game/map/blocks.js:38` | `surfaceAt` compares `d2 <= hp*hp` inclusively, so an exact inset sits ON tarmac. Now VALIDATED rather than argued: measured minimum clearance 0.5050 m, asserted `>= 0.5` at `tools/_mapblocks.mjs:280`. |
| `WALK_W` | `7.0` | `7.0` | `game/map/blocks.js:48` | Lifted unchanged from `LAYOUT.walkW = 7.0` at `game/world.js:22`, used as `world.js:1232` uses it. |
| `MIN_FACE_AREA` | `400` | `400` | `game/map/blocks.js:58` | = `MIN_BLOCK_SIDE^2`. A face below it cannot hold one legal block. Now drops 6 faces / 1276 m2 (was 2 / 612) because the crossing split un-merged four lenses. |
| `FILL_PITCH` | `4.0` | `4.0` | `game/map/blocks.js:69` | Quantisation invisible against a 14-49 m road. At 8 m the fill lost 0.24 km2 and at 16 m 0.64 km2 in the round-1 sweep. |
| `MIN_BLOCK_SIDE` | `20.0` | `20.0` | `game/map/blocks.js:78` | `bw = w - 14`, so under 14 m the building line goes negative. Now guarded by an explicit invariant, not by coincidence: `blocks.js:132` throws if `minSide <= 2 * walkW`. |
| **`BIG_FACE_AREA`** | *(none)* | **`40000`** | `game/map/blocks.js:94` | **NEW.** A 200 x 200 m face. Below it a face is a plausible city block whose interior is built over; above it the ground is enclosed by roads but not subdivided by them, and the interior must be open. Manhattan blocks are ~80 x 270 m = 21600 m2, so 40000 is already generous for "one block". |
| **`RING_DEPTH`** | *(none)* | **`40.0`** | `game/map/blocks.js:104` | **NEW.** Frontage band depth. Gives `bw = 40 - 14 = 26 m` of building between two 7 m pavements, and 20-30 m is the usual floor-plate depth because that is how far daylight reaches from a facade. Deeper wastes the drivable interior the band exists to create. |
| `CELL` (corridor index) | `64` | `64` | `game/map/blocks.js:426` | Same pitch and reasoning as `game/map/graph.js:53`. |
| `CELL` (crossing broad phase) | `64` | `64` | `game/map/blocks.js:609` | As above; 2373 segments is 2.8 M pairs brute force. |
| **`CELL` (block index)** | *(none)* | **`128`** | `game/map/blocks.js:736` | **NEW.** Twice `graph.js`'s 64 m because blocks are much larger than road segments; at 64 m a 432 m frontage strip registers in 18 cells. Measured 4.33 entries per cell. |
| `PROBE` | `2` | `2` | `tools/_mapblocks.mjs:33` | Half the fill pitch, so no free mask cell hides between samples. `--probe 0.5` rerun reported above. |
| `CELL` (overlap broad phase) | `64` | `64` | `tools/_mapblocks.mjs:210` | Block-vs-block pairing. |
| **`BASELINE`** | *(none)* | **9 literals** | `tools/_mapblocks.mjs:54-69` | Round 2 added 8; round 3 adds `minClearance` (below). Per-key band justification in F3 above. |
| **`BASELINE.minClearance`** | *(round 2: `S.params.kerbMargin`, self-relative)* | **`0.5050 m, +-2%`** | `tools/_mapblocks.mjs:68` | **ROUND 3.** The measured minimum signed clearance from any block corner to any paved corridor, as a LITERAL. Round 2 compared it to the live `KERB_MARGIN`, so moving the constant moved the bar; `0.5 -> 0.05` passed at exit 0. Now fails at -87.95%. |
| anti-wall assert bar | `S.params.bigFaceArea` | **literal `40000`** | `tools/_mapblocks.mjs:199` | **ROUND 3.** Same disease as the clearance assert: raising `bigFaceArea` raised its own bar. Now typed a second time on purpose. |
| index dedup generation reset | *(none)* | `0x7fffffff` | `game/map/blocks.js:791` | **ROUND 3.** `seen` is an `Int32Array`, so the generation counter must not be allowed to truncate and alias a stale mark onto a live one. ~100 days at 240 Hz - too long to ever reproduce, too short to argue away. |

Nothing outside these two files was modified. `git status` for my paths shows `game/map/blocks.js`
and `tools/_mapblocks.mjs` plus the two new overlay PNGs in `verdicts/wave-t/`.

**Correction to a round-1 claim.** Round 1 said `tools/lint.sh` "shows as modified in `git status`".
It does not - the widened glob at `tools/lint.sh:13` was committed in `77d8d71`. The substance was
right (the `game/map/*.js` gap is closed, and it was not my edit) but the literal was wrong, and the
critic was right to flag it.

## MUTATION EVIDENCE

Every mutation applied and reverted. `game/map/blocks.js` md5 was
`9be76ec4033ae9f64306d1866de3cace` through rounds 1-2 and is `22f5b355fe549d8b079335a176637b93` after
round 3's index fix; verified before and after each mutation in the round it was run.
`game/map/paradise.json` md5 `be746f30ffa169d190acd297d30f0abf`, unchanged throughout all three
rounds.

| mutant | caught? | how |
|---|---|---|
| `--no-split` (round 1's embedding) | **yes, exit 1** | chi -4 vs 2, plus `facesWalked` and `keptFaces` bands |
| drop faces over 100000 m2 (the critic's F2) | **yes, exit 1** | 5 baseline bands, -46% to -62% |
| `shoulder: 0` (desync from `graph.js:16`) | yes | 5633 tarmac samples (round-1 sweep) |
| `shoulder: 0, kerbMargin: 0` | yes | 8443 tarmac samples (round-1 sweep) |
| reversed bearing sort | yes (critic) | 236 negative faces |
| twin `h ^ 1` -> `h` | yes (critic) | 0/688 faces closed |
| `next` successor not predecessor | yes (critic) | 236 negative faces |
| every block shifted 6 m east | yes (critic) | 7849 tarmac samples |
| **`KERB_MARGIN` 0.5 -> 0.05** | **was NOT caught in round 2** | **now caught, exit 1**: `minClearance` 0.0609 m vs literal 0.5050, -87.95% against a +-2% band. 0.0609 is the critic's independently measured value for that mutant. |
| **`index.at` at `pad = 1.0`** | **was NOT caught in round 2** | **now caught**: the sweep counts duplicates separately at five pads. The critic's 1054-bad-probe result is 0 after the dedup. |
| `bigFaceArea: Infinity` | yes (critic), twice over | 8 slabs via `solid.length === 0`, plus `blockArea` +100% - NOT via the assert whose comment claimed to be needed for it. Comment corrected, see R3-F3. |
| split inserted at wrong vertex (`c.k + 1`) | yes (critic), exit 1 | chi -4 and 2 negative faces |
| `pointInRing` removed from the fill | yes (critic), exit 1 | insetArea +68%, blockArea +78%, 1333 overlapping pairs |
| frontage band inverted | yes (critic), exit 1 | blockCount -42.9%, largest 219776 m2, 4 slabs |
| `KERB_MARGIN` -0.25 | yes (critic), exit 1 | 198 tarmac samples |
| swap two entries in one node's list | **was NOT caught in round 1** | **now caught, verified**: it merges two faces, chi drops to 0 (genus 1), and `chi` + `facesWalked` (245 vs 247, band 0) both fail. `keptFaces` alone does NOT catch it - 239 is inside its +-3 band - which is why `facesWalked` carries a zero band. |

## WHAT IS STILL WRONG OR APPROXIMATE

1. **`paradise.json` still contains the four crossings.** They are repaired in memory on every build,
   which costs 5.3 ms and is invisible to consumers, but the file on disk is still non-planar and any
   OTHER tool that walks faces will hit the same -4. Table above is the work list. Owner: `digitise`,
   or whoever next rebuilds the graph.
2. **At least five ring faces, 0.598 km2, are city that was never traced** - F5b, and that is a floor
   with no total claimed, because round 2's numeric split was withdrawn (R3-F4). Deferred by decision
   this session; mitigated, not fixed. Owner: `digitise`.
3. **The tarmac probe in my harness is a re-derivation, not a fully independent oracle** - both sides
   ultimately use `width/2 + 3.0`. The critic closed that properly with `tools/_critic-tarmac.mjs`, a
   float64 brute-force over all 2373 segments sharing no code with `graph.js`. **I re-ran it against
   round 2's 868 blocks rather than leaving it for the next reader**, and it agrees to the metre and
   the coordinate:

   ```
   2373 segments, float64, no index. pitch 2 m.
   samples 507850 in 9.0 s
   violations (sample strictly inside a paved corridor): 0
   MINIMUM CLEARANCE over all samples: 0.5050 m
     at block 611 (32x32, face 133) sample -1368.00, 668.00
   ```

   Same 0.5050 m, same block, same point as my own harness reports. The residual caveat is the one
   both oracles share and neither can close: "tarmac" means "tarmac according to `paradise.json`",
   which is item 2 above.
4. **352 ms of all-or-nothing boot cost**, up from 260. Stated above with the mechanism. Not fixed.
5. **31 blocks are over 200 m on one side, 0.234 km2, and this is DEFERRED ON PURPOSE - it is not an
   oversight and `rewire` should not be surprised by it.** They are frontage strips: short side min
   20 m, median 32 m, max 64 m, and 30 of the 31 sit on a ring face. Longest is 432 x 20 m. None is
   over 200 m in both dimensions, which is asserted at `_mapblocks.mjs:211`.

   The critic accepted the deferral, on the ground that a frontage strip along a road is a different
   object from a slab across open ground: round 1's 352 x 872 m box SEALED a face interior with no
   route through it, whereas a 432 x 20 m strip is a wall you drive alongside on a face whose 1.66 km2
   interior is now open. That is a granularity judgement, not a traversability one.

   **RECORDED AS A KNOWN INPUT TO THE DRIVE PROBE.** A 432 m single AABB is a 432 m unbroken collision
   face and the probe will graze it. Both the critic and I would cut these at ~200 m before
   `generate-mesh` builds facades on them. If the probe dislikes it, the fix is a maximum strip length
   and **it belongs in this file**, not in `rewire`.
6. **96 faces produce no block**, 0.219 km2, up from 92. The critic measured the cause and round 1
   reported only half of it. Re-measured on round 2 with the critic's own `tools/_critic-empty.mjs`:
   **55 of the 96 have a mean width (2A/P) under 20 m and are genuinely too narrow** - the
   explanation round 1 gave for all of them - and **29 have 400 m2 or more of inset ground surviving
   the kerb inset and still emit nothing**, because an axis-aligned 20 m minimum will not fit in
   curved, non-convex free space. Total stranded inset ground in empty faces is 28912 m2 = 0.029 km2.
   That second group is correct under-covering, and it is the group that would grow if
   `MIN_BLOCK_SIDE` ever moved. Whole-map inset ground with no block over it is 2.370 km2 of the
   4.218 km2 inset, but most of that is now the deliberate ring interiors, not fill failure.
7. **Round 2's F5 numeric classification is withdrawn entirely** - see R3-F4. The mask-based measure
   reads bright bare rock as road, which is the exact error `verdicts/wave-t/digitise.md` records, and
   I reproduced it in the section whose job was to hand `digitise` a work list. What replaces it is
   five faces I looked at, with no total claimed.
8. **`index.at`'s speedup is 4x at `pad = 1.0`, not the 38x I published in round 2.** Round 2 timed
   only the single-cell path. Nine cells against 868 blocks is a real but modest win, and if `rewire`
   needs more the answer is a smaller cell, not a different structure.
9. **The index is built but nothing consumes it.** `physics.js`, `camera.js` and `traffic.js` are all
   still linear scans; wiring them is `rewire`'s. Until then, both the duplication defect and its fix
   are in code with no callers, which is why the critic could call this defect narrow and why the
   check being wrong mattered more than the code being wrong.

## RE-RUNNING IT

```
node tools/_mapblocks.mjs               # 2 m probe grid, ~1.3 s, exit 0
node tools/_mapblocks.mjs --probe 0.5   # 7.6 M samples, ~4 s
node tools/_mapblocks.mjs --no-split    # round 1's embedding; MUST exit 1 on Euler
node --check game/map/blocks.js tools/_mapblocks.mjs
node tools/_critic-tarmac.mjs           # the critic's independent float64 oracle - re-run, agrees
node tools/_critic-euler.mjs            # Euler straight off paradise.json (still -4 on disk)
```
