# wave T - `generate-mesh` S0 + S1. CRITIC. Commit `ce170c3`.

# PASS

The no-op claim is true, and it is true under a comparison I wrote myself rather than the builder's.
Every headline number in `verdicts/wave-t/generate-mesh-s1.md` reproduced independently, including
the ones that would have been easiest to fake.
Six findings below; none of them is a defect in the shipped frame, four of them are S2/S4 landmines,
one is a verdict overstatement of the STATE.md-rule-5 shape, and one is dead code.

The two specific fraud modes I was told to hunt are both closed:

- **The comparison is NOT the new tree against itself.** Section 1.
- **The comparison is NOT scoped to a matching subset**, and the 199,311 vs 203,540 gap is fully
  explained to the last instance. Section 2. It is not a gap in the proof; the stale figure is in the
  PLAN, not in the verdict.

I also closed a hole in the builder's proof that the builder did not declare: Pass A and Pass B are
instanced-only, and the city contains 279 non-instanced meshes - every road ribbon, kerb, block slab,
rail and deck - which S0's `buildRibbon` rewrite is exactly the code that builds. Section 3.

---

## 0. WHAT I RAN

Written from the claim, not from the builder's script. Nothing of theirs was executed.

| harness | what it does |
|---|---|
| `tools/_critic-mesh/cmp.js` + `tools/_critic-mesh-run.mjs` | loads `77d8d71`'s `world.js`, `road.js` and `util.js` as a second module set in one page, builds both cities, compares every instance and every plain mesh |
| `tools/_critic-mesh/census.js` + `tools/_critic-mesh-census.mjs` | censuses any historical `world.js`; also runs an **instrumented** HEAD checkout that counts `push()` drops |
| `tools/_critic-mesh/v-drops/world.js` | `77d8d71`'s bytes with a drop counter inside `push()` and inside all three hand-written cap guards |
| `tools/shot.mjs` in a `77d8d71` git worktree vs the working tree | 34 renders, 7 scenes x 2 passes x 2 trees + 6 extra `car-paint-closeup` |
| `tools/probe.mjs` in both trees | draw calls, programs, geometries, textures, scratch/live instance memory, post-boot chunk-add |

No game file was mutated. `game/world.js`, `game/road.js` and `game/util.js` md5 clean against
`HEAD` at the end of the run. `game/map/blocks.js` and `tools/_mapblocks.mjs` were not touched or
read for this review. No frame-time number is reported.

---

## 1. THE MODULES ARE GENUINELY TWO TREES

The HEAD copies are `git show 77d8d71:game/<f>.js` with **exactly one line changed each** - the
relative import path, so `head-world.js` imports `head-util.js` and not the working tree's. `diff`
against the raw `git show` output confirms one hunk, one line, in each of the three files.

Discriminators read out of the live page, not asserted:

| | HEAD module | new module |
|---|---|---|
| `createWorld` function identity | \- | **not `===`** |
| source length | 175,238 | 182,312 |
| `util.cellHash` | `undefined` | `function` (S0's deliverable) |
| `roadKit.ribbonInto` / `releaseHidden` | `undefined` / `undefined` | `function` / `function` |
| `world.chunkStats` | **object** `{chunks:1272, moved:188599, cell:200}` | **function** |

An import that had silently resolved to the working-tree file could not produce a `chunkStats`
object, and could not produce a `roadKit` without `ribbonInto`.

**And the harness is not vacuous.** Two controls:

- **Poison control.** Adding `1e-4` to one matrix element of one instance is detected:
  1 differing value out of 3,786,909. Adding `1e-3` to one vertex of one plain mesh is detected:
  1 of 30,684.
- **HEAD vs a SECOND HEAD build in the same page.** 0 differing values. The build is deterministic,
  so a zero against the new tree means something.

---

## 2. THE 199,311 vs 203,540 GAP - RESOLVED EXACTLY, TO THE INSTANCE

This was the number I was told was most suspicious. It is legitimate, and the arithmetic closes with
no remainder.

`tools/perf-probe.mjs:955-978` is the tool that produced 203,540. It traverses `world.group` and
does `totalInst += o.count` for an `InstancedMesh` **and `totalInst++` for every plain `Mesh`**. The
same run reports `plainObjs: 567`.

**203,540 - 567 plain meshes = 202,973 instanced.**

I then censused six historical trees with my own harness:

| commit | date | instances in `world.group` | what changed |
|---|---|---|---|
| `5c88d7c` | 08-03 | 209,457 | the tree just before the perf session |
| `40d2f1c` | 08-03 | **202,973** | frustum culling / the chunk cut lands; **the census comment is written here** |
| `e423cd6` | 08-05 | 202,333 | `-20%` NPC density (-640) |
| `b3c69d4` | 08-06 | 200,823 | parked cars halved, `NPC_DENSITY` 0.32 -> 0.16 (-1,510) |
| `e10d5ab` | 08-06 | **199,311** | T2 deletes the overhead wires (-1,512) |
| `d8841e0` / `77d8d71` | 08-07 | **199,311** | HEAD |

`567 + 640 + 1,510 + 1,512 = 4,229`. That is the gap, exactly.

So: **4,229 = 567 non-instanced meshes that the census tool counts as one instance each, plus 3,662
instances legitimately deleted by three later content commits.** Nothing is excluded from the
builder's comparison. My own whole-*scene* census (not just `world.group`) is also 199,311 on both
trees, so nothing is parented outside the compared subtree either.

**One correction, and it is to the PLAN, not to the verdict.**
`tools/WAVE-T-GENERATE-MESH-PLAN.md:73` derives its per-cell density estimate from "203,540
instances over the old 1.21 km2 world". That figure is 4 commits stale and inflated by 567 plain
meshes. The right number is 199,311, i.e. **6,644 instances per 200 m cell**, not 6,700 - immaterial
to the `RES = 1` decision, but the plan already flags this estimate as a GUESS and it should be
replaced with 199,311 before anyone sizes anything against it.

---

## 3. THE NO-OP, RE-MEASURED

### 3.1 Instances - what the builder measured, reproduced

| | HEAD | new |
|---|---|---|
| `InstancedMesh` objects in `world.group` | 1,341 | 1,294 |
| ... of which drawn (`count >= 1`, layer mask non-zero) | **1,294** | **1,294** |
| ... zeroed + `layers.disableAll()` (HEAD's cut sources) | 47 | 0 |
| instances drawn | **199,311** | **199,311** |
| triangles | **2,321,910** | **2,321,910** |
| distinct geometries | 28 | 28 |

1,294 = 1,272 cell meshes + 22 uncut pools, on both trees. HEAD's own `chunkStats.chunks` is 1,272
and `moved` is 188,599; the new `chunkStats().cells` is 1,272.

**Ordered comparison** (k-th traversed drawn mesh against k-th, geometry signature / material
signature / count / shadow flags / renderOrder / **`frustumCulled`** checked before any matrix, then
16 matrix floats + 3 colour floats per instance under `Object.is`):

> **0 shape mismatches over 1,294 meshes. 0 differing values out of 3,786,909.**

**Unordered multiset comparison**, which the builder did not run in this form and which is the
stronger statement: every instance reduced to `(draw-state signature, 16 matrix floats, 3 colours)`,
bagged, and the two bags differenced. This is independent of traversal order and of which cell mesh
an instance landed in, so a legitimate re-cut cannot hide inside it.

> **199,311 distinct rows. 0 rows present in one tree and not the other, in either direction.**
> (199,311 rows over 199,311 instances - there is not one duplicate row in the city, so this is
> effectively a set comparison and it is exact.)

Per-draw-state instance counts: 43 states, **0 count mismatches**.
My signature is structural, not uuid-based, and separates the 12 sign materials by canvas size, so
this is not the coarse-merge Pass A was worried about.

### 3.2 The 279 plain meshes - a hole in the builder's proof, now closed

Pass A and Pass B are `InstancedMesh`-only. The city also holds 279 non-instanced meshes (2,704
vertices, 1,356 triangles): every road ribbon and shoulder slab, the kerbs, the block slabs, the
rails, the deck, the piers. **S0 rewrote `buildRibbon`, which is the code that builds most of them.**
S0's own proof exercised `buildRibbon` in isolation against a replayed call list; it did not compare
the assembled city.

Compared in traversal order, element by element under `Object.is`: `position` / `normal` / `uv`
arrays and their concrete types, the index array and its type, `boundingSphere` centre and radius,
`matrixWorld` (all 16), material signature, `castShadow` / `receiveShadow` / `renderOrder` /
`frustumCulled` / `visible`, presence of `onBeforeRender`, and `userData`.

> **279 / 279 meshes, 0 shape mismatches, 0 differing values out of 30,684.**

The gap S0 left is closed and the answer is the same one S0 gave.

### 3.3 Draw calls, live, both trees

`renderer.info.autoReset = false`, one warm `composer.render()`, reset, five more, divided by five.

| scene | draw calls | triangles | programs | geometries | textures |
|---|---|---|---|---|---|
| daytime-downtown | **1372 -> 1372** | 2,430,910 -> 2,430,910 | 131 -> 131 | 392 -> 392 | 92 -> 92 |
| wet-night-asphalt | **2127 -> 2127** | 3,728,574 -> 3,728,574 | 132 -> 132 | 463 -> 463 | 96 -> 96 |
| dusk-highway-chase | **663 -> 663** | 905,134 -> 905,134 | 131 -> 131 | 392 -> 392 | 92 -> 92 |

Zero new materials (`roadKit.materials` is `city,highway` on both), zero new programs.
`new THREE.Mesh*Material` count: `world.js` 31 -> 31, `road.js` 3 -> 3. `canvasTexture(` 14 -> 14 and
2 -> 2. `roadKit.reflStats()` identical field for field on both trees, including the counters:
`{enabled:true, renders:5, skipped:436, rt:"640x360"}`.

Exact equality on 1372 calls is a stronger result than it looks: it means the frustum-culled set is
identical, which means every cell mesh's bounding sphere is identical, which means `finalize()`'s cut
is the same cut.

### 3.4 The seven scenes, against my own noise floor

`node tools/shot.mjs --w 1280 --h 720`, two passes per tree. No md5: STATE.md:161-167 records why,
and I re-observed it - the HEAD-vs-HEAD column below is a completely frozen tree.
`maxd` = largest per-channel 0-255 difference; `px` of 921,600.

| scene | HEAD noise (H1\|H2) | new noise (N1\|N2) | **HEAD\|new (H1\|N1)** | HEAD\|new (H2\|N2) |
|---|---|---|---|---|
| dusk-highway-chase | maxd 5, 72 px | maxd 5, 47 px | maxd 5, 71 px (0.0077%) | maxd 5, 51 px |
| boost-blur | maxd 1, 52 px | maxd 4, 41 px | maxd 4, 72 px (0.0078%) | maxd 1, 49 px |
| crash-cam | maxd 1, 12 px | maxd 2, 43 px | maxd 2, 35 px (0.0038%) | maxd 1, 24 px |
| wet-night-asphalt | maxd 8, 19 px | maxd 3, 31 px | maxd 8, 19 px (0.0021%) | maxd 3, 31 px |
| daytime-downtown | maxd 12, 101 px | maxd 11, 139 px | maxd 10, 113 px (0.0123%) | maxd 6, 72 px |
| car-paint-closeup | **maxd 17**, 14 px | maxd 2, 21 px | maxd 17, 22 px (0.0024%) | maxd 1, 3 px |
| hud-overlay | maxd 2, 40 px | maxd 1, 50 px | maxd 2, 35 px (0.0038%) | maxd 2, 43 px |

Every cross-tree delta is at or under the same-tree floor for that scene. Worst anywhere: 0.0123% of
pixels, against permanent rule 2's caveat of `<=0.005%` at `<=9/255` - and `daytime-downtown`'s own
frozen-tree noise is 0.0110% at maxd 12 in the same session, so the caveat is what needs updating for
this scene, not this commit.

**The bistable pixel, checked independently.** Ten `car-paint-closeup` renders, five per tree. I
searched every one of the 921,600 pixels for any that varies by more than 2 across all ten:

> **Exactly one: (331, 607), spread 17.** Nothing else in the frame exceeds 2.

It takes exactly two values, and HEAD produces both of them (H1 and H3 give 177/127/93; H2, H4, H5
give 194/141/100). Note `maxd 17` therefore appears in the **HEAD-vs-HEAD** column above. My five
new-tree renders all landed on 194/141/100; the builder's four included two at 177/127/93, so across
both sample sets both trees produce both values. The builder's account is correct and this is a
renderer bistability, not a consequence of the change.

### 3.5 Boot and console

17 new-tree renders through `tools/shot.mjs`, which pushes every `console` error and every
`pageerror` into a list and exits 1 if the list is non-empty (`tools/shot.mjs:49-73`). All exit 0.
`bash tools/lint.sh` -> `lint ok`.
And `lint ok` is not runnable, so the **playable** path was booted too: `node tools/_phantom-probe.mjs`
loads `#nomenu=1&scene=daytime-downtown&res=1` (no `?shot=1`), waits for `__ready`, runs 1.5 s of
real frames, and printed no `pageerror`.

---

## 4. THE 51 DELETED CAPS - RE-MEASURED, NOT TAKEN ON TRUST

I instrumented `77d8d71`'s own `push()` and, separately, all three hand-written cap guards that
bypass it (`rec()` at HEAD `world.js:2219`/`:2267`/`:2554`, the `slBulb` guard at `:2231`, the
`carWheel` guard at `:2589`) - the builder's account only covers `push()`.

> **`push()` drops: 0. Guard drops: 0. 69 pools. Sum of counts immediately before the cut: 199,311.**

Nothing was being clipped, so removing the caps cannot add geometry, and the no-op is not wrong in
the other direction either.

Worth recording, because it is the argument FOR the deletion: four pools were within 92-96% of a
cap that a builder had hand-sized for a 1.1 km square.

| pool | count / cap |
|---|---|
| `acMesh` (`world.js:1315` at HEAD) | 8,642 / 9,000 (96.0%) |
| `railPost` (`:2844`) | 480 / 520 (92.3%) |
| `braceMesh` (`:1891`) | 14,366 / 16,000 (89.8%) |
| `guardPost` (`:2442`) | 5,692 / 7,000 (81.3%) |
| `contactShadows` (`:2906`) | 5,861 / 5,869 - by construction, `contacts.length + 8` |

`contactMesh` is the one pool that keeps a literal size, it cannot go through the sink because
`layoutContacts()` rebuilds it on every time-of-day change, and its layout loop now counts instead of
dropping (`game/world.js:3156`). Measured live on three scenes: `overflow` = `{n: 0, pools: {}}`.

---

## 5. `finalize()`'s CELL CUT IS THE DELETED PASS

Read side by side against HEAD `world.js:3088-3122`, then measured.

| | HEAD's cut | `finalize()` |
|---|---|---|
| draw-state key | `${geo.uuid}\|${mat.uuid}\|${cast?1:0}${recv?1:0}\|${renderOrder}` | **character for character the same**, `game/world.js:1265-1266` |
| `CHUNK` | 200 | 200, `game/world.js:1232` |
| `CHUNK_MIN` | 400, `if (total < CHUNK_MIN) continue` (pool left whole, `frustumCulled = false`) | 400, `game/world.js:1236`; `if (total < CHUNK_MIN) { whole(ps); continue; }` at `:1297`, and `whole()` sets `frustumCulled = false` at `:1278` |
| "nothing to win" | `if (cells.size < 2 && srcs.length < 2) continue` | `if (grid.size < 2 && ps.length < 2) { whole(ps); continue; }`, `:1312` |
| cell key | `Math.floor(m.elements[12]/CHUNK),Math.floor(m.elements[14]/CHUNK)` | same, off `p._m[i*16+12]` / `[i*16+14]`, `:1307` |
| host | `srcs[0]` | `ps[0]`, `:1314` |
| white fill for a colourless pool in a coloured bucket | `new THREE.Color(1,1,1)` | `Float32Array(...).fill(1)`, `:1327` |
| cell mesh `frustumCulled` | default `true` (never assigned) | default `true` (never assigned) |

Measured equivalence, which is what actually settles it: **1,272 cells on both trees, 1,294 drawn
meshes on both, and my ordered comparison includes `frustumCulled` in the shape signature and reports
0 shape mismatches across all 1,294** - so every mesh matches on cull mode as well as on geometry,
material, count, shadow flags and render order, and every instance matches in the same slot of the
same mesh. Plus 1372/2127/663 draw calls exactly equal, which cannot happen if the bounding spheres
differ. The cut is not "subtly different"; it is the same cut.

---

## FINDINGS, MOST SEVERE FIRST

None of these blocks the PASS. Four are forward-looking; the last two are hygiene.

### F1 - MEDIUM. `finalize()` never releases the scratch buffers. The plan says it does.

`game/world.js:1259-1352`. Every pool descriptor keeps `p._m` (and `p._c`) attached for the life of
the world. Measured live on `daytime-downtown`, by traversing `world.group` for objects carrying
`_m`: **67 descriptors holding 18.45 MB of matrix scratch and 2.05 MB of colour scratch, retained
after `finalize()` has copied all of it into `InstancedMesh` buffers.**

`tools/WAVE-T-GENERATE-MESH-PLAN.md:600` specifies "Peak transient for the biggest pool ... 1.3 MB,
**freed at `finalize`**". It is not freed. The descriptor's own comment at `game/world.js:1174` calls
`_cap` "instances the scratch buffers currently hold", present tense, which is accurate and is
exactly the problem.

**Not a regression at S1**, and I want that on the record: total instance-matrix memory is DOWN,
because the cap-sized allocations are gone. Live `InstancedMesh` buffer bytes measured on the same
scene: **HEAD 45.02 MB -> new 13.45 MB**, so 13.45 + 20.50 = **33.95 MB against HEAD's 45.02 MB.**

**Failure scenario (S4).** `disposeChunk` does not exist yet. When it does, a chunk that is built,
disposed and rebuilt hands back its `InstancedMesh`es and keeps a doubled `Float32Array` per pool per
chunk. Nine resident cells thrashing over the plan's own "memory flat over a 10-minute drive" check
(`WAVE-T-GENERATE-MESH-PLAN.md:865`) then fails, and the shape of the failure - heap growth with a
flat object count - reads as a three.js `InstancedMesh` leak, not as a sink bug.
**Fix: two assignments at the end of `finalize()`, `p._m = null; p._c = null;`** Nothing reads them
after; `resolve()` goes through `sink.remap`, and `whole()`/the cell loop are the last readers.

### F2 - MEDIUM. "RISK 2 ... HANDLED" is a comment, not code. And the risk it documents does not exist.

`game/world.js:3271-3280`, and `verdicts/wave-t/generate-mesh-s1.md:334-344`.

What landed is `group.updateMatrixWorld(true); group.matrixWorldAutoUpdate = false;` - byte-equivalent
to HEAD `world.js:3164-3165` - plus a comment saying a future `buildChunk` must call
`rec.group.updateMatrixWorld(true)`. **Measured: exactly ONE object under `world.group` has
`matrixWorldAutoUpdate === false` on each tree** (1 of 1,690 at HEAD, 1 of 1,710 now). Nothing is
per-chunk. This is precisely the shape STATE.md rule 5 exists for: the prose moved, the constant did
not. The verdict is honest that "S1's behaviour is unchanged", so this is an overstated section
heading rather than a false claim - but a later reader will search for `rec.group` and find a comment.

**And the hazard itself is not real in this app, which nobody has checked.** I added a `Group` at
(100, 7, 200) to `world.group` after boot and called `scene.updateMatrixWorld()` - exactly what
`WebGLRenderer.render` does - with no forced update. Its `matrixWorld` translation came out
**(100, 7, 200)**, on BOTH trees. The reason is `Object3D.updateMatrix()`, which sets
`matrixWorldNeedsUpdate = true` unconditionally; the `Scene` recomposes every frame and passes
`force = true` down through the opt-out, so `matrixWorldAutoUpdate = false` on `world.group` is
inert. Corollary, and it is an inherited finding not this commit's: the "measured at 2.9 ms/frame"
saving that HEAD's comment (`world.js:3156-3163`) attributes to the opt-out is not being delivered.
Someone should re-measure that before S4 leans on it.

### F3 - LOW. The `hidePoles` fix is real, correct, and LARGER than the verdict says.

`game/world.js:2413-2426` new; HEAD `world.js:2206-2207`
(`for (const [m, i] of used) { m.setMatrixAt(i, dummy.matrix); ... }`, no `chunkRemap` lookup).

Confirmed on HEAD by knocking things over and counting instances at `y < -500`. The verdict tests 5
lamps + 5 parked cars and reports 55 -> 65. I tested **5 lamps + 5 traffic signals**:

| | HEAD | new |
|---|---|---|
| `slPole`, `slBulb`, `tlPole`, `tlLens` (draw states under `CHUNK_MIN`, never cut) | 5 + 5 + 5 + 15 = 30 | 30 |
| `slArm` -> `strutMesh:chunk` | **0** | **5** |
| `slHead` -> `signFrame:chunk` | **0** | **5** |
| `tlArm` -> `strutMesh:chunk` | **0** | **5** |
| `tlHead` -> `signFrame:chunk` | **0** | **5** |
| total | **30** | **50** |

So on HEAD a knocked-over **traffic light** also left its arm and its head hanging in mid-air, not
just a street lamp. The verdict attributes the whole gap to `slArm` and `slHead`; it is four pools,
not two. Under-claiming, but the verdict should say so because the next reader will use it to size
the regression.

**The fix is correct, not merely different.** Three checks: (a) idempotent - a second `hide()` on the
same lamp moves nothing further, 54 -> 54; (b) right slot - the 4 lamp instances and 6 signal
instances each resolve to a distinct `[mesh, index]`, spread across three `strutMesh:chunk` cells and
three `signFrame:chunk` cells, with no double-write; (c) no over-hide - the total moved is exactly 4
per lamp and 6 per signal. Cross-checked against `tools/HANDOFF-PARKED-CARS.md:115-120` (the
`chunkRemap` fix for cars) and re-ran `tools/_phantom-probe.mjs` on the working tree: after
`b.hide()` the only instance left near the parked car is `contactShadows`, which is the deliberate
"stain" ponytail at `game/world.js:2826`. No phantom.

### F4 - LOW. `resolve()` drops HEAD's write-to-source fallback, so a future miss fails silently.

HEAD `world.js:2624`: `const [tm, ti] = (r && r.get(i)) || [m, i];` - a missing remap entry meant
"write the source pool", which for an uncut pool was correct and visible.
New `game/world.js:2421` and `:2835`: `const t = resolve(m, i); if (!t) continue;` - a missing entry
means silently do nothing.

Safe today, and I verified it rather than assuming: `whole()` populates `sink.remap` for every uncut
pool as well (`game/world.js:1288-1290`), so all four never-cut pools still sink correctly (F3's
table). Every pool with `count >= 1` gets remap entries, and a pool with `count < 1` has no instances
to hide. **Failure scenario is future-only**: any code path that reaches `hide()` for an instance
that did not go through `finalize()` - a chunk hidden before it is finalized, an instance pushed
after - degrades to a no-op instead of a visible wrong-mesh write, which is strictly harder to
notice. One `console.warn` in the `!t` branch would close it.

### F5 - LOW. A dead cap constant survived the sweep.

`game/world.js:2050` `const SIGN_CAP = 1000;` has exactly one occurrence in the file: its own
declaration. `tools/lint.sh` does not catch it.
By my count HEAD carried **53** literal caps - 50 `inst()` call sites, `TOWER_CAP = 900`, podium's
inline `900`, and `SIGN_CAP = 1000` - of which 52 are gone. The verdict's table says "51 literal
caps ... **deleted**". The count is off by two and one of them is still in the file.

### F6 - LOW. `finalize()` dropped HEAD's multi-material guard, and its comment.

HEAD `world.js:3096`: `if (src.count < 1 || Array.isArray(src.material)) continue;`, with a comment
explaining that "silently merging two of them by a shared undefined uuid is exactly the kind of bug
that only shows up as one wrong-coloured object somewhere in the city".
New `game/world.js:1263`: `if (p.count < 1) continue;`.
No pool has an array material today, so there is no defect. But `pool()` does not reject one either,
and the draw-state key would be `undefined` for both `_mat.uuid` values, so two unrelated
multi-material pools would merge into one bucket. The guard cost one clause and the comment recorded
why it was there.

---

## WHAT I DID NOT CHECK

- **Frame time.** Forbidden by the play brief; peers are running.
- **`game/map/blocks.js` and `tools/_mapblocks.mjs`.** Off limits; a peer owns them.
- **S2 and later behaviour.** `world.settle()` and `disposeChunk` do not exist yet (`typeof
  world.settle === 'undefined'`), which is correct for S1 - they are S4's - but it means the plan's
  determinism check (`buildChunk -> snapshot -> disposeChunk -> buildChunk -> snapshot`) has nothing
  to run against yet.
- **The `neonSign` revert.** I confirmed the binding exists (`injectedRng` at `game/world.js:1060`,
  used at `game/world.js:2374` and nowhere else) and that the injected stream is consumed exactly
  once, which is what makes the S1 draw order identical. I did not re-measure the 45.3%; the
  instance-level equality above is what matters for S1 and the flip is explicitly not landed.

## THREE THINGS THE NEXT STEP SHOULD INHERIT

1. **`199,311`, not `203,540`.** Section 2. Fix `tools/WAVE-T-GENERATE-MESH-PLAN.md:73` before
   anything is sized against it.
2. **`p._m` is still alive after `finalize()`.** F1. Two lines, before `disposeChunk` is written, not
   after.
3. **`matrixWorldAutoUpdate = false` on `world.group` is inert** because the `Scene` forces the
   subtree every frame. F2. Whatever S4 does about chunk matrices, it should be based on a
   measurement rather than on HEAD's comment.
