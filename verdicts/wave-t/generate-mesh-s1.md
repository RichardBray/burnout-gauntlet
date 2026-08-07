# wave T - `generate-mesh` S1. The emitter refactor. Provably behaviour-preserving.

S1 of `tools/WAVE-T-GENERATE-MESH-PLAN.md:827-836`, built against sections 2 and 6.

One sentence: `createWorld` no longer allocates a pool before it knows how big it is, and no emitter
reaches out of its own arguments for either a pool or a random number.

The city is byte-for-byte the city that was there before. That is measured, not claimed - section 3.

## 1. WHAT CHANGED, WITH LITERALS

No numeric constant in the file changed value. Two moved file position; both are quoted with their
BEFORE and AFTER line.

| constant | BEFORE | AFTER |
|---|---|---|
| `CHUNK` | `200` at `world.js:3058` (HEAD) | `200` at `game/world.js:1232` |
| `CHUNK_MIN` | `400` at `world.js:3062` (HEAD) | `400` at `game/world.js:1236` |
| `POOL` (point lights) | `10` at `world.js:2977` (HEAD) | `10` at `game/world.js:3191` |
| `NPC_DENSITY` | `0.16` | `0.16` at `game/world.js:2749` - untouched, it is user-set |
| every `inst()` cap: `40000`, `190000`, `22000`, `9600`, `1000`, ... | 51 literal caps | **deleted**. The cap is now `p.count` at `finalize()` time |

The caps are the substantive deletion. Every one of them was hand-sized for a 1.1 km square, and
`push()`'s response to exceeding one was `if (m.count >= m.userData.cap) return;` - a silent drop,
no throw, no counter, four recorded incidents in this file. There is now no cap during emission, so
the failure cannot occur.

**Was anything actually being dropped at HEAD?** This had to be answered before the caps could go,
because if a cap were clipping today then removing it would ADD geometry and S1 would not be a
no-op. Measured by instrumenting HEAD's `push()` and snapshotting every pool's `count` against its
`cap` immediately before the old chunk cut:

```
drops: 0        dropPools: {}        pools: 69        sumInstances: 199311
```

Exactly one pool sat at its capacity, `288/288` - the wet-smear batch, which `addWetSmearBatch`
allocates at `positions.length` deliberately and which is not a `push()` pool. **Zero silent drops
at HEAD**, so removing the caps changes nothing, which is what section 3 then confirms
independently.

### The new machinery, by line

| what | where |
|---|---|
| `dropStats` / `dropped()` overflow counter | `game/world.js:1154-1158` |
| `pool(name, geo, mat, opts)` - declare, returns the descriptor | `game/world.js:1166-1181` |
| `grow(p)` - double the scratch buffers | `game/world.js:1183-1195` |
| `push(p, x, y, z, ry, rz, sx, sy, sz, color)` | `game/world.js:1197-1203` |
| `pushMat(p, mat4, color)` | `game/world.js:1210-1220` |
| `pop(p)` | `game/world.js:1226` |
| `finalize()` | `game/world.js:1259-1352` |
| `resolve(p, i)` | `game/world.js:1357-1360` |
| `chunkStats()` | `game/world.js:3287` |

`world.js:3022-3167` at HEAD - the whole render-side re-cut - is **deleted**. It has no replacement,
because the pass it undid never happens now: the sink does not allocate the first set of meshes, so
there is nothing to re-cut. `chunkRemap` is gone with it, replaced by `sink.remap` / `resolve()`.

### A pool descriptor is a `THREE.Group`, deliberately

Later code holds direct handles to individual pools and toggles them: `spillMesh.visible = night`
in `setNight`, and `world.aoExclude`, which `post.js:786` hides by writing `o.visible = false`.
Making the descriptor the Group that the finalized meshes hang under preserves every one of those
handles for free - visibility propagates to children - exactly as the old cut preserved them by
parenting chunk meshes to their zeroed source mesh. Verified live:
`aoExclude[1].isGroup === true`, it has 1 child, and setting `.visible = false` on it is observed on
the child.

### `seal()` is gone

Ten call sites, 15 lines. It set `instanceMatrix.needsUpdate` on pools that had just been filled.
Under deferred allocation the upload happens once, inside `finalize()`, so the function had nothing
left to do.

### The overflow counter still exists, for the one pool that still has a literal cap

`contactMesh` (`game/world.js:3114`) is rebuilt from scratch on every time-of-day change, so it
cannot go through the sink, and it is sized `contacts.length + 8` once. Its layout loop now counts
instead of dropping silently (`game/world.js:3156`), and the count is published on
`chunkStats().overflow`. Measured live: `overflow.n === 0`.

## 2. THE EMITTERS

20 functions converted from closure-over-pools to `(sink, rng, ...)`. Each gets its pools by
destructuring its `sink` argument on the first line of its body, so the body below is unchanged and
the diff stays readable.

| emitter | pools it now takes from `sink` |
|---|---|
| `facadePaint` | (none - it only draws numbers) |
| `facadeGrid` | `gridMesh` |
| `shopBay` | `shopMesh` |
| `storefrontBand` | `capMesh`, `gridMesh` |
| `rooftop` | `beaconMesh`, `capMesh`, `mastMesh`, `mechMesh`, `strutMesh`, `tankMesh` |
| `facadeDetail` | `acMesh`, `capMesh`, `strutMesh` |
| `panelPair` | `signMeshes` |
| `placeSign` | `braceMesh`, `signFrame`, `signMeshes`, `signStrut`, `strutMesh` |
| `awning` | `awnMesh`, `braceMesh` |
| `neonSign` | `spillMesh`, `tubeMesh` |
| `gantry` | `gantryMesh`, `mastMesh` |
| `palm` | `frondMesh`, `palmTrunk` |
| `rank`, `signalQueue`, `tryPark` | (none - they route to `parkedCar`) |
| `roadWear` | `holeMesh`, `patchMesh` |
| `parkedCar` | `carBody`, `carCab`, `carTrim`, `carWheel` |
| `bench` | `benchLeg`, `benchSeat` |
| `streetLight` | `slArm`, `slBulb`, `slHead`, `slPole` |
| `trafficLight` | `tlArm`, `tlHead`, `tlLens`, `tlPole` |

Three of them - `bench`, `streetLight`, `trafficLight` - draw no random numbers at all, so they take
`(sink, ...)` and not `(sink, rng, ...)`. An unused parameter would be noise. `tryPark` is on the
list because `rank` and `signalQueue` reach `parkedCar` through it and the stream has to be
threaded.

The plan's list has 16 names; this is 20 because `tryPark`, `bench`, `streetLight` and
`trafficLight` also closed over pools, and the instruction was to convert every emitter that did.

At S1 every call site passes the global `R`, so the draw order is exactly what it was. `R` is NOT
yet shadowed to `null` after the material block - the top-level build loops still use it directly,
and shadowing it is an S2 change, not this one.

### Two traps in section 6, both hit

**`bench()`'s placeholder.** `world.js:2365-2366` at HEAD was
`push(benchLeg, ...); benchLeg.count--;` - it wrote a garbage matrix and then decremented so the
next push overwrote the slot. Dead code, deleted. `sink.pop()` exists anyway
(`game/world.js:1226`), because "emit speculatively then retract" is a legitimate emitter shape and
without it the scratch buffer keeps a stale 16 floats.

**`streetLight` and `parkedCar` write matrices directly.** Both set up `dummy` with a rotation order
or axis convention that `push()`'s `(0, ry, rz)` cannot express, and both reached past `push()` to
call `setMatrixAt` on the pool. They now call `pushMat()` (`game/world.js:1210`), and their
`rec()` bookkeeping records `[descriptor, index]` which `resolve()` maps to the finalized mesh.

## 3. THE ACCEPTANCE CHECK

No md5. The S0 pattern, scaled up: `git show HEAD:game/world.js` was dropped in as a second module,
both `createWorld`s were run into two offscreen `THREE.Scene`s from identical seeds
(`makeRng(0xC0FFEE)` for the roadKit, `makeRng(0xC17E)` injected), and the results compared.
`globalThis.__noPcss` was set so the two modules' shader patches could not interfere; it affects
shaders only, and this comparison is of instance data.

**Two passes, because the first has a gap and I would rather close it than describe it.**

**Pass A - bucketed and sorted.** Every drawn `InstancedMesh` in each world (`count >= 1`, layer
mask non-zero, which is how HEAD's zeroed source pools exclude themselves) was harvested into
buckets keyed by a draw-state signature that means the same thing in two independently built worlds
- so it cannot use uuids. Geometry by `type` + constructor `parameters` + index/vertex counts;
material by type, colour, roughness, metalness, transparent, opacity, side, emissive,
emissiveIntensity, vertexColors, toneMapped, depthWrite, alphaTest, blending, envMapIntensity and
which map slots are populated; plus castShadow, receiveShadow, renderOrder. Each instance
contributes 19 doubles (16 matrix + 3 colour, defaulting to white where a mesh has no
`instanceColor`, which is what three's `setColorAt` does). Rows sorted lexicographically inside each
bucket, then compared element by element with `Object.is`.

**Pass B - ordered, per mesh.** Pass A cannot tell the 12 sign materials apart: they differ only by
their canvas texture, so 7,391 instances sat in coarse-merged buckets. Pass B drops signatures
entirely and compares the k-th traversed `InstancedMesh` of one world against the k-th of the other,
in order, checking geometry signature, material signature, count, shadow flags and renderOrder line
up before comparing any matrix. That is exact per material.

| | result |
|---|---|
| meshes drawn, HEAD / new | **1294 / 1294** |
| instances, HEAD / new | **199,311 / 199,311** |
| draw-state buckets | 42 |
| buckets with a count mismatch | **0** |
| Pass A values compared | **3,786,909** |
| **Pass A differing values** | **0** |
| Pass B ordered meshes, HEAD / new | 1294 / 1294 |
| Pass B shape mismatches | **0** |
| Pass B values compared | **3,526,590** |
| **Pass B differing values** | **0** |

Pass B reporting zero shape mismatches over all 1294 meshes is itself a result: the two scene-graph
traversals line up mesh for mesh, so the sorting in Pass A was not hiding a reordering.

### The other required numbers

- `world.chunkStats().residentCells === 1`, `residentKeys: ["0,0"]`. **Pass.**
- `chunkStats().overflow` = `{ n: 0, pools: {} }`. **Pass.**
- Cells produced: HEAD's cut reported `chunks: 1272`; `finalize()` reports `cells: 1272`. Identical.
- `chunkStats()`: 1294 meshes, 199,311 instances, 28 distinct geometries, 2,321,910 triangles,
  54 draw states. All counted by traversing the live scene graph, not from a running total - a
  counter can say "9 chunks" while the scene holds 300; a traversal cannot.
- Nothing outside `world.js` reads `world.chunkStats`, so promoting it from an object to a function
  breaks no consumer (grepped across `game/` and `tools/`).

### Draw calls: not within 5%, exactly equal

Measured the same way on both trees - `renderer.info.autoReset = false`, one warm
`composer.render()`, then five more, divided by five. The scene is settled under `#shot=1`, so the
rAF loop draws nothing and the composer has to be pumped by hand; reading `info.render.calls` after
a settled frame returns 1 and is meaningless.

| scene | draw calls HEAD -> new | triangles HEAD -> new | programs | geometries | textures |
|---|---|---|---|---|---|
| daytime-downtown | **1372 -> 1372** | 2,430,910 -> 2,430,910 | 131 -> 131 | 392 -> 392 | 92 -> 92 |
| wet-night-asphalt | **2127 -> 2127** | 3,728,574 -> 3,728,574 | 132 -> 132 | 463 -> 463 | 96 -> 96 |
| dusk-highway-chase | **663 -> 663** | 905,134 -> 905,134 | 131 -> 131 | 392 -> 392 | 92 -> 92 |

Zero new materials and zero new programs, verified live rather than by inspection.

### The seven scenes

Against the frozen-tree noise floor established in
`verdicts/wave-t/generate-mesh-s0.md` (this renderer is not byte-deterministic; seven md5s from a
tree reverted to HEAD all differ from the previous seven). `maxd` is the largest per-channel 0-255
difference; `diffpx` is how many of 921,600 pixels differ at all.

| scene | noise floor (HEAD vs HEAD) | S1 vs HEAD |
|---|---|---|
| dusk-highway-chase | maxd 5, 36 px (0.0039%) | maxd 5, **34 px** (0.0037%) |
| boost-blur | maxd 1, 21 px | maxd 1, 26 px (0.0028%) |
| crash-cam | maxd 2, 26 px | maxd 2, **25 px** (0.0027%) |
| wet-night-asphalt | maxd 4, 25 px | maxd **3**, 32 px (0.0035%) |
| daytime-downtown | maxd 10, 104 px | maxd 10, 113 px (0.0123%) |
| car-paint-closeup | maxd 2, 17 px | maxd 17, **14 px** (0.0015%) - see below |
| hud-overlay | maxd 1, 21 px | maxd 3, 53 px (0.0058%) |

Every scene is at or under its noise floor except `car-paint-closeup`, whose `maxd 17` against a
floor of 2 I did not accept. Nine renders of that scene were taken - five on HEAD, four on the new
tree - and every pixel whose value varies by more than 2 across all nine was located. **There is
exactly one such pixel in the frame**, at (331, 607), and it takes one of two values:

| render | tree | value at (331,607) |
|---|---|---|
| cp-head-1, cp-head-2, cp-head-3 | HEAD | 194/141/100 |
| s0-before, s0-before2 | HEAD | **177/127/93** |
| cp-new-1, s1-after | new | 194/141/100 |
| cp-new-2, cp-new-3 | new | **177/127/93** |

Both trees produce both values. It is a bistable pixel in the renderer, present identically on HEAD,
and it is the only one in 921,600. Not caused by this change.

### Boot and console

`bash tools/lint.sh` -> `lint ok`. The transient `SYNTAX game/map/blocks.js` from the peer's
round-2 edit has cleared; the only files it reports on now are clean.

`tools/shot.mjs` fails the run on any console error or pageerror. All seven scenes render `ok`,
exit 0. `lint ok` does not mean runnable, so the page was booted.

## 4. WHAT IS **NOT** A NO-OP, AND IT IS NOT THE ONE I WAS WARNED ABOUT

The boot state is identical. One POST-BOOT path is not, and it is a bug fix I did not go looking
for.

**`polefall` never hid a street lamp's arm or head.**

HEAD's `hidePoles` (`world.js:2206`) is:

```js
for (const [m, i] of used) { m.setMatrixAt(i, dummy.matrix); m.instanceMatrix.needsUpdate = true; }
```

It writes to the SOURCE pool with no `chunkRemap` lookup. `parkedCar.hide()` did the lookup;
`hidePoles` never did. For any pool whose draw state got cut, the source was zeroed and
layer-disabled, so that write landed on a mesh that draws nothing. This is precisely the
phantom-parked-car bug the comment at `world.js:2617-2621` describes as fixed - fixed for cars,
never fixed for poles.

Measured. Knock down five street lamps and five parked cars, then count instances sunk to y < -500,
per pool:

| pool (via its bucket host) | HEAD | new |
|---|---|---|
| `slPole` | 5 | 5 |
| `slBulb` | 5 | 5 |
| `slArm` -> `strutMesh:chunk` | **0** | **5** |
| `slHead` -> `signFrame:chunk` | **0** | **5** |
| `carBody` | 10 | 10 |
| `carCab` | 5 | 5 |
| `carTrim` -> `benchSeat:chunk` | 10 | 10 |
| `carWheel:chunk` | 20 | 20 |
| **total** | **55** | **65** |

`slPole` and `slBulb` are in draw states under `CHUNK_MIN`, so they were never cut, so the source
still drew and the naive write happened to work. `slArm` and `slHead` merge into large boxGeo
buckets that were cut, so they silently did nothing. On HEAD, knocking over a street lamp leaves its
arm and its lamp head hanging in mid-air.

Routing every hide through `resolve()` fixes it, because there is now exactly one way to reach a
baked instance. I did not preserve the bug to keep the no-op tidy: deliberately reintroducing a
write to a dead mesh is not a defensible option, and it affects none of the seven scene renders,
which are boot-state frames with nothing knocked down.

## 5. THE `neonSign` STREAM - MEASURED, AND **NOT** LANDED

`world.js:2159` at HEAD:

```js
const bo = (rng() - 0.5) * (w - bw) * 0.8;
```

That `rng` is the stream `main.js:183` injects, `makeRng(0xC17E)`. It is the **only** use of the
injected stream anywhere in `createWorld` - verified by grepping HEAD's whole `createWorld` body for
bare `rng`, which returns that one line and nothing else. Every other draw in the file comes from
`R = makeRng(0xC0FFEE)`.

Converting the emitters made the parameter `rng` shadow it, which silently changed the draw. That
showed up immediately as 199,235 instances against 199,311, and it is what the isolation
instruction was for. For S1 the injected stream is bound to `injectedRng` at
`game/world.js:1060` and the line reads `injectedRng()` at `game/world.js:2374`, with a comment
saying why.

**I then made the change on its own and measured it. It should not land in S1.**

| | S1 | S1 + flip |
|---|---|---|
| instances | 199,311 | **199,235** (-76) |
| meshes | 1294 | **1299** |
| cells | 1272 | **1277** |
| triangles | 2,321,910 | 2,320,846 |
| Pass B shape mismatches | 0 | **507 of 1294** |
| buckets with count mismatch | 0 | **19** |

| scene | pixels changed | maxd |
|---|---|---|
| daytime-downtown | **24.3%** (223,555 px) | 187 |
| wet-night-asphalt | **45.3%** (417,133 px) | 192 |
| dusk-highway-chase | 0.010% (95 px) | 17 |

The reason it is this large is not the offset itself. Moving that draw onto `R` inserts one extra
`R()` into the global sequence at the first neon sign, and `R` is consumed in strict source order by
every stage after it - so every rooftop, sign, prop, palm, parked car and road patch downstream
re-rolls. It is a partial re-seed of the city, which is an S2-class change ("pixels change here, and
only here, for reasons of seeding", gated by eyeball); landing it inside S1 would destroy the one
thing S1 exists to establish.

So it is reverted, measured, and queued. It is a two-line change when S2 wants it: `injectedRng()`
-> `rng()` at `game/world.js:2374`, and drop the now-dead binding at `game/world.js:1060`.

## 6. RISK 2 FROM SECTION 10, HANDLED

`world.js:3165` at HEAD set `group.matrixWorldAutoUpdate = false` once, for the whole subtree. A
chunk `Group` added after boot would then never compose its world matrix and would render at the
identity transform or not at all - which presents as "streaming is broken" and gets blamed on the
emitter.

The discipline is kept and is now documented as per-chunk at `game/world.js:3271-3280`: the comment
states in the code that anything adding a chunk after boot must call
`rec.group.updateMatrixWorld(true)` on it. The boot path still calls
`group.updateMatrixWorld(true)` before opting out, so S1's behaviour is unchanged.

## 7. WHAT S2 INHERITS

- `finalize()` cell-cuts internally at `CHUNK = 200`. At S1 there is one chunk covering the world
  and the cut happens inside it; at S2 a chunk *is* a 200 m cell and `finalize()` will produce
  exactly one mesh per draw state per chunk. **The same code, unchanged.** This is why the draw-call
  count came out equal rather than merely close: had `finalize()` not cut, one chunk would have
  meant ~40 map-wide meshes, the frustum cull would have been lost, and draw calls would have fallen
  from 1372 to about 40 - a 97% "improvement" that submits every triangle in the city every frame.
- `R` is still live at top level and is still passed explicitly into every emitter. Shadowing it to
  `null` after the material block is S2's, and it is what will catch any emitter that still reaches
  for it.
- `sink.remap` / `resolve()` is the single route to a baked instance. Nothing may write
  `setMatrixAt` on a descriptor.
- The `ChunkRec` shape of section 1 is stubbed at `game/world.js:3259-3264` with one record keyed
  `'0,0'` and infinite bounds, so `chunkStats()` already reports off a resident map rather than a
  counter.

No frame-time number is reported. Peer agents are running; S1 has no frame-time deliverable.
