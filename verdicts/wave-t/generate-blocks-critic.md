# CRITIC - wave T, `generate-blocks`, round 1. **FAIL.**

Narrow fail, and I want the shape of it clear before the list.

**The deliverable is good.** I re-derived the block-vs-tarmac assertion with my own oracle that
shares no line of code with `game/map/graph.js` and it agrees: zero violations, and the minimum
clearance over 972,027 samples is 0.5084 m, which is `KERB_MARGIN = 0.5` holding to four decimal
places. The overlay says these are the blocks of that city. I could not break the block list.

**The acceptance apparatus is not.** Two of the harness's headline assertions are satisfiable
without the property they claim to measure, and I proved both by mutation. The graph traversal that
`tools/_mapblocks.mjs` certifies is **not planar** - it has Euler characteristic -4, genus 3, and
six merged faces - and every check in the harness passes on it happily. `verdicts/wave-t/generate-blocks.md:70`
states in terms that this cannot happen. It can, and it did, in the shipped artefact.

That is permanent rule 2 of this project, hit twice, in the file whose job is to prevent it.

Everything I ran is committed as `tools/_critic-*.mjs` and re-runnable.

---

## Headline numbers I measured myself

| | builder | me | |
|---|---|---|---|
| half-edges, each used once | 1858 | 1858 | agrees |
| faces walked | 237 | 237 | agrees, and **237 is wrong** - see F1 |
| **Euler `V - E + F`** | not checked | **-4** (should be 2) | **F1** |
| non-adjacent crossings | 0 | 0, by full O(n^2) brute force over all 2373 segments | agrees |
| shared-node crossings | 4 | 4, same four edge pairs | agrees |
| self-crossing polylines | not checked | 0 | fine |
| exact bearing ties at a node | not checked | 0 (one near-tie, 0.895 deg, node 440) | fine |
| tarmac violations, `graph.js` oracle | 0 / 972,027 | 0 / 972,027 | reproduced |
| **tarmac violations, MY independent oracle** | - | **0 / 972,027** | **F-none** |
| **minimum clearance to any paved corridor** | not reported | **0.5084 m** | see below |
| blocks | 693 | 693 | agrees |
| blocks over 200 m a side | 51, 2.029 km2, 54.7% | 51, 2.029 km2, 54.7% | agrees |
| faces yielding no block | 92, 0.209 km2 | 92; 52 genuinely narrow, 28 are fill failures | F5 |
| build | 260 ms | 259.4 ms | agrees |
| determinism | asserted | identical over 3 runs | fine |

---

## F1. THE TRAVERSAL IS NOT PLANAR. SIX FACES ARE MERGED. THE HARNESS CANNOT SEE IT. `game/map/blocks.js:182-195`, `tools/_mapblocks.mjs:87-88`

`tools/_critic-euler.mjs`, straight off `paradise.json`:

```
V=688 E=929 components=1 selfLoops=0 parallelExtra=0  deg0=0 deg1=0 min=2 max=9
Euler predicts F = E - V + 1 + C = 243
harness walked   F = 237                  deficit = 6
chi = V - E + F = -4  =>  2 - 2g  =>  genus g = 3
```

I verified the cause rather than asserting it. `tools/_critic-split.mjs` inserts a node at each of
the four shared-node crossings in a **copy** of the doc and re-runs `createBlocks`:

```
after split: V=692 E=937  Euler F = 247
walked faces = 247   chi = 2               <- planar
kept faces 240 (was 234)
```

So the four crossings the builder chose to leave in are costing exactly six faces, and
`verdicts/wave-t/generate-blocks.md:32` reports "234 faces kept" for a quantity whose correct value
is 240. Two of the merged pairs are visible as proper self-intersections in the emitted ring
(`tools/_critic-faces.mjs`: faces 35, 65, 113, 129 have 2-4 proper ring self-crossings).

**Now the part that makes this a FAIL rather than a footnote.** `generate-blocks.md:67-70` says:

> The outer face's area equals the sum of the interior faces to 0.1 m2 ... It is a real check on the
> traversal, not a tautology: a traversal that mis-orders one node's half-edges produces faces that
> still close and still have plausible areas but no longer sum.

**That is false, and it is false algebraically.** Summing the shoelace terms over all faces sums each
geometric segment once in each direction, so the total is identically zero for *any* rotation system,
planar or not. Proof by the exact experiment the sentence describes - swap two entries in one node's
sorted list (`tools/_critic-euler`-style mutation, applied and reverted):

```
688 nodes, 929 edges -> 1858 half-edges, 235 faces walked    (two more faces merged)
  ok  exactly one outer (negative-area) face  1 found
  ok  outer face area == sum of interior faces (the planar identity)  5844201.3 vs 5844201.3
  ok  ZERO block samples land on tarmac
```

Every traversal check green, on a rotation system with two additional merged faces. The shipped
artefact is in exactly that state, six faces deep.

**Failure scenario.** `generate-mesh` is told there are 234 faces with a district each, and it is
going to build frontages, signage and neon per face. Six of those faces are two real city blocks
welded into one non-simple ring, with a single length-weighted district vote covering both. Face 28
(silverlake, 0.251 km2, 104 vertices, 7 repeated vertices) is one object where the city has two, and
nothing downstream will ever be told. There is no number in this pipeline that would show it, which
is the whole reason the check was supposed to exist.

**Mitigating, and I checked it rather than assuming it:** the *block* output is unaffected. Comparing
the shipped 693 blocks against the 693 from the split graph as a set of `(cx,cz,w,d)`:

```
as SETS: shipped-only 0   split-only 0   common 693
```

Bit-identical. The raster fill is even-odd over the ring plus a global corridor clearance, so the
merge cancels. The builder's "measured, not asserted" instinct was right about the blocks. It was
wrong about the traversal, and the report claims the traversal was verified.

**What must change.** `tools/_mapblocks.mjs` gains, as a hard `check()`:
`V - E + F === 1 + components`, computed off the doc, failing loudly. And
`generate-blocks.md:67-70` is deleted or corrected, because it currently tells the next reader that a
tautology is a proof.

---

## F2. THE HARNESS PASSES WITH HALF THE MAP DELETED. `tools/_mapblocks.mjs:89`

Mutation the builder did not run: drop every face whose area exceeds 100,000 m2 (one clause added to
`blocks.js:242`). Result:

```
after tiny drop   2.720 km2  (218 faces; dropped 18 ... 3133526 m2 total)
block AABBs       1.276 km2
395 blocks over 218 faces
ok    ZERO block samples land on tarmac  0 violating samples
PASS                                                          <- exit 0
```

**3.13 km2 of face and 298 blocks - 53% of the deliverable - deleted, and `node tools/_mapblocks.mjs`
exits 0.** The only guard is `check(S.keptFaces > 100, ...)` at line 89, and 218 clears it.

The area block at `tools/_mapblocks.mjs:79-86` prints all six stage figures beautifully and asserts
on **none** of them. `digitise` earned that printout by catching 40 km of road with it; printing it
without asserting on it is the observability without the alarm.

**Failure scenario.** Any future change to `fillFace`, `MIN_FACE_AREA`, `MIN_BLOCK_SIDE` or the ring
test that silently loses faces ships green. That is `push()`'s silent drop, one level up, and
`WAVE-T-GENERATE-PLAN.md:33-39` says this project has already done it four times.

**What must change.** Assert floors on `keptFaceArea`, `insetArea`, `blockArea` and `blockCount`,
with the current values as the literal baseline and a stated tolerance.

For the record, the four mutations that DID fail correctly (all reverted, `game/map/blocks.js` md5
`ec615a386d08f145f69e77bc41b1a04a` before and after):

| mutant | caught? | how |
|---|---|---|
| reversed bearing sort (`H[b].bearing - H[a].bearing`) | yes, exit 1 | 236 negative faces |
| twin `h ^ 1` -> `h` | yes, exit 1 | 0/688 faces closed |
| `next` takes successor not predecessor (`slot[t] + 1`) | yes, exit 1 | 236 negative faces |
| every block shifted 6 m east | yes, exit 1 | 7849 tarmac samples |
| **drop faces over 100000 m2** | **NO, exit 0** | **F2** |
| **swap two entries in one node's list** | **effectively no** | **F1** - all traversal checks green; only the determinism check tripped, and only because my mutation used a `globalThis` latch |

---

## F3. THE 51 GIANTS ARE NOT WHAT THE REPORT SAYS THEY ARE, AND THEY ARE MORE THAN HALF THE OUTPUT

Count and share confirmed exactly: 51 blocks over 200 m on a side, 2.029 km2, 54.7% of all block
area. Largest 352 x 872 m at -812, -64.

`generate-blocks.md:260-268` calls them "the un-roaded interiors of large loops - mountainside,
water, quarry". I looked at where they are.

The largest one is honest: cropping the overlay to `-1100,-600 .. -450,450` shows a 352 x 872 m red
rectangle sitting on the White Mountain quarry, genuinely open ground with a few untraced tracks.
Fine as a description.

**The harbour ones are not.** Cropping to `900,300 .. 1700,850` puts two >200 m red blocks squarely
on top of a dense, fully built harbour-front grid with its internal streets plainly visible in
`reference/map/ign-map.jpg` underneath the fill. These are not mountainside and they are not water.
They are city that `digitise` did not trace at street level, and the face traversal is faithfully
reporting the absence of roads as the absence of a subdivision.

That distinction matters for the routing decision. "The roads enclose half a square kilometre of
unbuilt mountain" is a legitimate thing to hand to `generate-mesh`. "The roads enclose a city block
grid we never digitised" is a defect with a different owner and a different fix, and merging the two
under one caveat sends `generate-mesh` looking for a mesh answer to a data problem.

**Failure scenario, unchanged from the builder's own:** `game/physics.js:922` is
`for (const b of blocks)` with `hx = b.w / 2 + 1.0`. A 352 x 872 m entry is a 0.31 km2 solid wall.

**Not a defect in this file.** Routing it onward is the right call. Correct the characterisation, and
split the caveat in two so the harbour cases reach whoever owns `paradise.json`.

---

## F4. 693 UNINDEXED AABBs AT 240 Hz, AND 260 ms ALL-OR-NOTHING AT BOOT

Two downstream costs, neither of which is this piece's to fix, both of which it creates and neither
of which is quantified in the report.

**Frame time.** I read the three consumers as instructed. `game/physics.js:921-958` `collide(h)` is a
**linear scan over every block with no spatial index**, called from `physics.js:1953` inside the
substep loop, and `SUBSTEP = 1/240` at `physics.js:676`. It returns on the first hit, so the common
no-contact case is a full scan. `game/world.js:16` is `grid: [-480,-320,-160,0,160,320,480]`, seven
entries, so today's world publishes **36 blocks**. This piece publishes **693**. That is 8,640
AABB tests per second becoming **166,320**. `game/camera.js:251` `resolveColliders()` scans the same
array per frame for the collision cast, and `game/traffic.js:1068` scans it per wrecked vehicle.
Nobody has said this number out loud yet. Say it in the verdict and route it.

**Boot time.** `createBlocks(doc)` is all-or-nothing by construction: `blocks.js:149` walks all 1858
half-edges before anything, and `blocks.js:238` loops every face. There is no per-chunk entry point.
I ran `node tools/_loadtime.mjs`: the current `boot world` stage is **242 ms**. Adding 260 ms
whole-map, 251 ms of it raster fill, **more than doubles that stage** and spends 5.2% of the 5.0 s
budget before a chunk exists. The builder says the fill "is per-face and trivially partitionable by
chunk" - that is true and it is the right answer, but it has not been done, so the number that stands
today is 260 ms of unavoidable boot cost.

Contract itself: confirmed consumable as-is. `{cx, cz, w, d, bw, bd}` with two additive extras
(`district`, `faceId`) that no consumer reads. `MIN_BLOCK_SIDE = 20.0` at `blocks.js:78` gives
`bw = 20 - 14 = 6 > 0`, and `_mapblocks.mjs:120` asserts it, so `bw`/`bd` cannot go negative or zero
while `minSide >= 20`. The coupling is real but guarded: it is `minSide > 2 * walkW` that keeps it
true, and nothing states that invariant in either file. One line, cheap.

---

## F5. THE 92 EMPTY FACES ARE NOT ALL "TOO NARROW". `tools/_mapblocks.mjs:118`

`tools/_critic-empty.mjs`:

```
empty faces: 92 / 234, area 0.209 km2
  52 have mean width (2A/P) < 20 m           <- genuinely too narrow, the report's explanation
  28 have >= 400 m2 of inset ground surviving the kerb inset and still emit nothing
  total freeArea stranded in empty faces: 27904 m2
  largest: face 3, 2064 m2 free, mean width 34.5 m, 13 vertices
```

So 40 of the 92 are not narrowness, they are the axis-aligned 20 m minimum failing to fit in curved
and non-convex free space. **This is small and it is correct behaviour** - 0.028 km2, and the fill is
deliberately under-covering. Whole-map uncovered inset ground is 0.510 km2 of 4.218 km2, matching the
builder's 12.1% exactly.

**Fine. Not a defect.** Listed only because `generate-blocks.md:270-274` gives one cause for 92 faces
when the measurement gives two, and the second one is the one that would grow if `MIN_BLOCK_SIDE`
ever moved.

---

## Fine, verified, no action

- **The independent tarmac oracle agrees, and tightly.** `tools/_critic-tarmac.mjs`: 2373 segments in
  float64, no grid, no `createRoadGraph`, brute-force point-to-polyline over all of them, 972,027
  samples in 16.0 s. **0 violations. Minimum signed clearance 0.5084 m.** A boolean cannot tell
  "clears by 10 m" from "clears by a nanometre"; that 0.5084 says the inset is tight against
  `KERB_MARGIN = 0.5` and holding, with 0.0084 m of slack from the 4 m raster quantisation. This is
  the strongest single result in the piece and the builder undersold it by reporting only the boolean.
  Caveat both of us share: "tarmac" means "tarmac according to `paradise.json`", and the overlay shows
  blocks planted on real roads the graph never traced. No oracle in this tree can close that.
- **Planarity scan is sound.** My O(n^2) brute force over all 2,814,378 segment pairs, including the
  degenerate touching cases `blocks.js:561`'s strict test excludes, finds exactly the same 0 and 4.
  It also finds 0 self-crossing polylines, which `findCrossings` skips at `blocks.js:558`
  (`if (s.e === t.e) continue`) - a real hole in that function, currently costing nothing.
- **Determinism.** Three runs, identical output. No `Math.random`. `Date.now`/`performance.now` at
  `blocks.js:91` reaches only `stats.timing`, never a block. Map/Set iteration is insertion order over
  a deterministic doc.
- **The four crossing coordinates in the report are correct**, including the `tt = d1/(d1-d2)`
  parameterisation at `blocks.js:562`, which I expected to be the wrong segment's parameter and is not.
- **Constants match their docstrings.** `SHOULDER = 3.0` `blocks.js:26` == `graph.js:16`.
  `WALK_W = 7.0` `blocks.js:48` == `LAYOUT.walkW = 7.0` `world.js:22`, used the same way as
  `world.js:1232`. All nine grepped, all literal, none lying.
- **Scope.** No `game/` file touched but the new module. `git status` shows `game/road.js` and
  `game/util.js` modified by peers, not this piece.
- Small correction: `generate-blocks.md:249-256` says `tools/lint.sh` "shows as modified in
  `git status`". It does not; the widened glob at `tools/lint.sh:13` was committed in `77d8d71`.
  Harmless, but it is a claim about a literal that is not true.

---

## THE OVERLAY

`verdicts/wave-t/generate-blocks-overlay.png`, 2698 x 1930, 2x supersample over
`reference/map/ign-map.jpg` dimmed to 0.40. Magenta = a block. **Red = a block over 200 m on a side.**
Cyan/green/yellow = the road graph by class, drawn on top. White rings = the four shared-node
crossings. Regenerate, and crop anywhere, with:

```
node tools/_mapdump.mjs reference/map/ign-map.jpg /tmp/ign
node tools/_critic-blockoverlay.mjs /tmp/ign /tmp/ov --scale 2
node tools/_mappng.mjs /tmp/ov verdicts/wave-t/generate-blocks-overlay.png
# and e.g.  --scale 6 --crop 900,300,1700,850 --dim 0.8
```

**In plain words: yes, these are the blocks of that city.** The magenta tiles the land between the
green road lines and stops at it. Every block sits in a hole in the network, not across one. The
coastline is respected all the way round - the harbour front, the southern spit, the eastern
peninsula - and there is no magenta in the water anywhere I can find. The western mountain roads get
sparse ribbon blocks following the switchbacks, downtown and Silver Lake get dense small grids, the
motorway interchanges get proper crescent-shaped wedges inside their loops. Zoomed to 8x on the two
eastern crossings, the blocks near them are unremarkable: they sit inside interchange loops, well
clear of every ribbon. Nothing about those four points is visible in the picture, which matches the
0.5084 m clearance measurement and matches the set-identical block comparison. **The builder's caveat
5 - "every number in this file would pass just as happily on 693 rectangles in the wrong city" - is
answered. They are not in the wrong city.**

**Two things the picture says that no number in the pipeline said.**

First, the red. At full-map zoom the red is not a scattering of mountain interiors; it is a **spine
of solid slabs running the length of the map**, from the western quarry through the centre to the
harbour. Fifty-one rectangles carrying 54.7% of the block area, and each one becomes a single AABB in
`physics.js:922`. Reading it as a collision map rather than a plot map, this is not a city with some
oversized lots in it. It is a city with a wall down the middle. That is the honest visual statement of
what is being routed to `generate-mesh`, and it is a bigger thing than the caveat's wording suggests.

Second, and I would not have found this any other way: in the harbour crop the red slabs are lying on
**visible untraced streets**. The reference underneath shows a block grid; the graph has nothing
there; the traversal correctly reports one face; the fill correctly reports one 200 m block. Every
stage behaved. The output is still a slab over a street grid. Both tarmac oracles are blind to it by
construction, because both define tarmac as the graph. The picture is the only thing in this tree that
can see it, which is precisely the lesson `digitise` paid for.

---

## WHAT THE BUILDER MUST CHANGE TO PASS

Four items. None is large. None touches the block list, which is correct.

1. **Add the Euler assert to `tools/_mapblocks.mjs`.** `V - E + F === 1 + components`, components
   computed off the doc. It fails today at -4 against 2. Then either split the four crossings, or
   state the deficit as a known, quantified, six-face defect and assert on the exact number so it
   cannot grow. `tools/_critic-euler.mjs` and `tools/_critic-split.mjs` do both halves already.
2. **Delete or correct `verdicts/wave-t/generate-blocks.md:67-70`.** The signed areas sum to zero for
   any rotation system. It is a tautology. Saying it is not, in the one document the next reader will
   trust, is worse than not checking.
3. **Assert on the area figures at `tools/_mapblocks.mjs:79-86`, do not just print them.** Floors on
   `keptFaceArea`, `insetArea`, `blockArea`, `blockCount`. A harness that a face-deleting mutation
   passes with exit 0 is not a harness.
4. **Split caveat 1.** The quarry giants and the harbour giants are two different problems with two
   different owners. Quote the 166,320 unindexed AABB tests per second and the 242 ms -> 502 ms boot
   world stage in the same paragraph, so `generate-mesh` inherits numbers instead of adjectives.

`game/map/blocks.js` was mutated six times during this review and restored byte-exactly each time.
md5 `ec615a386d08f145f69e77bc41b1a04a` at the start of this document and at the end of it.
