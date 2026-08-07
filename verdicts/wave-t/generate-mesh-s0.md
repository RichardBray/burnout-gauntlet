# wave T - `generate-mesh` S0. Prep only. No pixels moved.

S0 of `tools/WAVE-T-GENERATE-MESH-PLAN.md:819-825`.
Three deliverables, no behaviour change, no new material, no new shader program.
`game/world.js`, `game/map/*`, `game/physics.js` and `game/scenes.js` are untouched.

## 1. WHAT LANDED

| deliverable | where |
|---|---|
| `cellHash(a, b, salt)` | `game/util.js:41` |
| `roadKit.ribbonInto(sink, pts, nrm, halfW, y, uRepeat, vScale)` | `game/road.js:1878` |
| `roadKit.finishRibbon(sink, cls)` | `game/road.js:1919` |
| `roadKit.releaseHidden(obj)` | `game/road.js:1955` |
| `roadKit.buildRibbon` reimplemented as a wrapper over the two | `game/road.js:1976` |
| header docstring corrected | `game/road.js:1-14` |
| `addWetSmearBatch`'s bare `pop()` replaced by `releaseHidden(proto)` | `game/road.js:2136` |

## 2. CONSTANTS TOUCHED: NONE

No numeric constant in the tree changed value.
Both files' diffs are additions plus one mechanical extraction.
The one literal that moved *position* is the ribbon's U extent: it was hardcoded as `1` inside
`build()`'s `uv.push(0, v, 1, v)` at the old `road.js:1870`, and is now the `uRepeat` parameter at
`game/road.js:1900`, which `buildRibbon` passes as the literal `1` at `game/road.js:1995`.
BEFORE `1`. AFTER `1`. Same value, now nameable per edge, which is the point: the graph has 21
widths from 9.0 to 49.4 m and only two class specs exist (`road.js:1752-1754`).

Three specific BEFORE/AFTER pairs a critic should check by hand:

| thing | BEFORE | AFTER |
|---|---|---|
| `specs.city.widthM` | `20` (`game/road.js:1753`) | `20` (`game/road.js:1753`) - unchanged |
| `specs.highway.widthM` | `36` (`game/road.js:1754`) | `36` (`game/road.js:1754`) - unchanged |
| `buildRibbon` default `shoulder` | `1.6` (`road.js:1846` at HEAD) | `1.6` (`game/road.js:1976`) |
| shoulder ribbon vScale | `12` (`road.js:1887` at HEAD) | `12` (`game/road.js:2001`) |
| shoulder ribbon y offset | `y - 0.02` (`road.js:1887` at HEAD) | `y - 0.02` (`game/road.js:2001`) |
| road ribbon halfW | `spec.widthM / 2` (`road.js:1892` at HEAD) | `spec.widthM / 2` (`game/road.js:2002`) |

## 3. MATERIALS AND PROGRAMS: ZERO ADDED

Measured live under `wet-night-asphalt` at 1280x720 with `tools/probe.mjs`, on the stashed HEAD tree
and then on the working tree:

| | HEAD | after |
|---|---|---|
| `renderer.info.programs.length` | 132 | 132 |
| `Object.keys(roadKit.materials)` | `city,highway` | `city,highway` |
| `renderer.info.memory.geometries` | 463 | 463 |
| `renderer.info.memory.textures` | 96 | 96 |
| `roadKit.reflStats()` | `{enabled:true, renders:5, skipped:436, rt:"640x360"}` | `{enabled:true, renders:5, skipped:436, rt:"640x360"}` |

`reflStats()` is unchanged, field for field, including the render/skip counters.
`finishRibbon` asserts material identity rather than equality: verified in-page that
`group.children[1].material === roadKit.materials.city.mat` and
`group.children[0].material === roadKit.shoulderMat`, both `true`.

## 4. THE SEVEN RENDERS

`node tools/shot.mjs --scene <s> --w 1280 --h 720`.

**Byte-identity did NOT hold, and it cannot hold in this harness on this machine. The renderer is
not byte-deterministic across runs with a completely frozen tree.**
That is established, not asserted: `before2` is a second pass of all seven rendered from a tree
reverted to HEAD with `git checkout HEAD -- game/road.js game/util.js`, i.e. against source
byte-identical to `before1`. All seven md5s differ from `before1` anyway.

| scene | before1 (HEAD) | before2 (HEAD, frozen tree, 2nd run) | after (working tree) |
|---|---|---|---|
| dusk-highway-chase | `2759e013fe965e1c0823ab9da3a7e30b` | `8deffb93c66a7c49038c89707660b33e` | `3f180df9901da4884185f8973045e835` |
| boost-blur | `3f68e3c0b959339294038d3c06a6f1af` | `8f98a0a5b8ff35aebc058c7abf8f676a` | `1159f7d47d12b6a2e45783838774cc33` |
| crash-cam | `e31a01af6daa1f98fdc3a786b46236bb` | `7e13ef25c12b6b4f7d499a37fb185659` | `124aeaf342b82b5dc3e89b4c1d7cdfcd` |
| wet-night-asphalt | `3c76c20e6621252016c90e75bdce347c` | `b5075b1bb9f01b6d790ef8b971a71737` | `4bd358453c5b7c1fae5b85ce0700cac3` |
| daytime-downtown | `092dbd7138e5182fadf6a04fffbf2ae2` | `311b6e6eb15c3d391ffcb83547f6ce57` | `98b67e19564eb03487285a0ba6ad63da` |
| car-paint-closeup | `6f8237b15baaed49dd64ad8ca88fed7c` | `bd8684f7b94eb5476f210cf32a289798` | `ec9da6e5d423238ef8e29bf506c8ca6f` |
| hud-overlay | `9762fb377d439cf86e45f0c021d4c6ad` | `8fd541c6c4baf4f0983a3808815161ff` | `949c52dfceec4ce7f2168a3b8308658a` |

21 md5s, 21 distinct values. The md5 column is therefore worth nothing as a signal; it does not
distinguish "changed" from "did not change". A tighter control: `crash-cam` rendered twice
back-to-back off one unchanged tree gives `927987568f6f44b2d1dae4d93f63ae31` and
`73274145ecf68a6882f357ee1dc287a1`, 45 differing pixels at maxdiff 2.

So the honest test is the delta against the noise floor. `maxd` is the largest per-channel 0-255
difference anywhere in the frame; `diffpx` is how many of the 921,600 pixels differ at all.

| scene | noise: before1 vs before2 | change: before1 vs after | change: before2 vs after |
|---|---|---|---|
| dusk-highway-chase | maxd 5, 36 px (0.0039%) | maxd 6, 49 px (0.0053%) | maxd 6, 49 px |
| boost-blur | maxd 1, 21 px | maxd 1, 46 px | maxd 1, 59 px |
| crash-cam | maxd 2, 26 px | maxd 2, 30 px | maxd 2, **20 px** |
| wet-night-asphalt | maxd 4, 25 px | maxd 4, 35 px | maxd 3, 32 px |
| daytime-downtown | maxd 10, 104 px | maxd 10, **74 px** | maxd 7, **75 px** |
| car-paint-closeup | maxd 2, 17 px | maxd 2, **12 px** | maxd 1, **8 px** |
| hud-overlay | maxd 1, 21 px | maxd 3, 64 px | maxd 3, 55 px |

Every delta is the same order as the frozen-tree noise, and in three of seven scenes the
before-vs-after delta is *smaller* than the frozen-tree noise. Worst case anywhere: 6/255 on 0.005%
of pixels, on a scene whose own noise floor is 5/255.

`_px.mjs`'s region metrics report 0.00 on all of this, which is where the brief's
"render noise measured at 0.00 on every metric" comes from. That is a rounding property of those
metrics, not byte-identity.

## 5. THE PROOF THAT REPLACES BYTE-IDENTITY

Because the renderer cannot decide this, the refactor was proved exactly, outside the renderer,
against the thing that actually changed: the geometry.

`git show HEAD:game/road.js` was dropped in as a second module and both kits were constructed from
`makeRng(0xC0FFEE)`. Both `buildRibbon` implementations were then run over **the exact call set
`game/world.js:1178-1192` makes** - 6 X ribbons, 45 retracted Z ribbons, the highway, the slip road -
plus three shapes the grid never produces: a closed 5-point loop, a `shoulder: 0` highway, and a
curved `y: 0.5, shoulder: 7.25` ribbon.

**53 calls, 448 vertices, 238 triangles, and ZERO differing values.**

Compared with `Object.is` per element, so `-0` and `NaN` would both be caught:
`position`, `normal`, `uv`, the index array *and its concrete type* (`Uint16Array` either way),
`boundingSphere` centre and radius, `receiveShadow`, `castShadow`, `renderOrder`, the presence of the
`onBeforeRender` reflection hook, the material's type, child count, child order, and
`group.userData.length`.

This is a stronger statement than an identical md5 would have been: an md5 match proves one camera
saw no difference, whereas this proves the vertex buffers are bit-identical everywhere, including on
the curved and closed inputs no scene currently renders.

Distance accumulation is bit-identical by construction, not by luck: `THREE.Vector2.distanceTo` is
`Math.sqrt(dx*dx + dy*dy)`, which is what `ribbonInto` computes inline, and the normals are still
produced by the same `subVectors(next, prev).normalize()` in `buildRibbon` (`game/road.js:1988`) and
handed to `ribbonInto` rather than recomputed.

## 6. `cellHash` QUALITY

`game/util.js:41`, the mix specified at `tools/WAVE-T-GENERATE-MESH-PLAN.md:492-498`.
Pure, deterministic, no `Math.random`, no `Date`; returns `>>> 0`, so unsigned 32-bit.

Over a 100 x 100 lattice, `salt = 0`:

- **10,000 cells, 10,000 distinct hashes, 0 collisions.**
- Neighbour separation, 40,000 4-neighbour pairs (`+x`, `+z`, `+x+z`, `-x+z`): mean Hamming distance
  between the two hashes **16.002 of 32 bits** - textbook avalanche - min 5, max 27.
- Low bits specifically: 147 of the 40,000 neighbour pairs share all low 8 bits, against 156.3
  expected for a uniform hash. There is no structure in the low bits; they are as separated as
  random.
- Per-bit balance across the lattice: every one of the 32 output bits is set on between 0.4921 and
  0.5106 of cells.
- The property that actually matters is the seeded stream, not the hash: the closest first draw of
  `makeRng(cellHash(x, z, 0))()` between ANY 4-neighbour pair over the lattice is `2.014e-5`, and
  first draws are uniform (KS statistic 0.00828 over 10,000 samples; 0.0136 is the p=0.05 threshold).
  Control, seeding straight from `x*1000+z` with no hash: closest neighbour first draw `4.566e-7`,
  50x worse.
- Salt separates domains: `cellHash(3,7,0)` = 3847971156, `cellHash(3,7,0xB10C)` = 1675326454,
  `cellHash(3,7,0xED6E)` = 3715598821.
- Purity: `cellHash(12,-5,1)` = 2647353498 on every call.

A comment at `game/util.js:33-35` records that `hashNum` at `game/world.js:954` is a
`location.hash` parameter reader and an unrelated thing, and that neither name may be overloaded.

## 7. THE `refl.hidden` LEAK, CLOSED

`game/road.js:1608` declares `hidden: []`. It is pushed at three sites and, before this change, only
ever popped once, for one scratch prototype. It is walked twice per reflection render
(`game/road.js:1718` stashes `visible`, `game/road.js:1734` restores it). Streaming would have added
one entry per ribbon per chunk build forever and would have written `.visible` on disposed meshes -
risk 1 of `tools/WAVE-T-GENERATE-MESH-PLAN.md:887-895`.

`releaseHidden(obj)` (`game/road.js:1955`) takes a mesh or a whole `Group`, traverses it, and splices
out every matching entry, returning the count. Verified live under `wet-night-asphalt`:
`releaseHidden(group)` on a fresh `buildRibbon` group returns **2**, an immediate second call returns
**0**, and `releaseHidden(null)` returns **0**.

`addWetSmearBatch`'s `refl.hidden.pop()` became `kit.releaseHidden(proto)` at `game/road.js:2136`.
Same element removed today; correct even if a push is ever interleaved.

## 8. THE DOCSTRING THAT WAS WRONG

`road.js:2` at HEAD read:

```
// API: createRoadKit(rng, {renderer}) -> kit. kit.buildRibbon(points2D, {width, cls, y}) -> THREE.Mesh
```

Two live errors in one line. `buildRibbon` returns a `THREE.Group` holding up to two meshes
(`game/road.js:1997`, called once per ribbon at `:2001` and `:2002`), never a `Mesh`; and there is no `width` option - the destructure is
`{ cls, y, shoulder, closed }` and the width comes from `mats[cls].spec`. Corrected at
`game/road.js:1-14`, with the correction itself noted in the comment, per the project's
"do not trust a docstring" rule.

## 9. CHECKS RUN

- `bash tools/lint.sh` -> `lint ok` (the glob now covers `game/map/*.js`).
- `node tools/shot.mjs --scene wet-night-asphalt` -> `ok`, exit 0. `shot.mjs` fails the run on any
  console error or pageerror; there were none. `lint ok` does not mean runnable, so this was booted.
- `tools/probe.mjs` on the live page for the program count, material list, `reflStats()` and
  `releaseHidden` behaviour above.

No frame-time number is reported. Peer agents were running; S0 has no frame-time deliverable.

## 10. WHAT S1 INHERITS

- `ribbonInto` takes `pts` and `nrm` as either `THREE.Vector2[]` or `[x, z][]`; the form is decided
  once per call, not per vertex.
- The sink is four plain arrays, `{pos, nor, uv, idx}`, caller-owned, and indices are emitted
  relative to `sink.pos.length / 3` at entry, so appends compose. `ribbonInto` also writes
  `sink.length`, the centreline length of the last ribbon appended.
- `finishRibbon(sink, cls)` accepts `'city'`, `'highway'` or `'shoulder'`. Only the two carriageway
  classes get the `onBeforeRender` reflection hook, matching HEAD.
- No sink factory was added. S0 was scoped to three deliverables and adding a fourth export was not
  one of them.
