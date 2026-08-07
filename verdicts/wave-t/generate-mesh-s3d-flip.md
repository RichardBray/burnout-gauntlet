# generate-mesh S3d, part 1 of 2 - THE FLIP

Wave T, task T3.
Briefs: `tools/WAVE-T-MAP-BRIEF.md`, `tools/WAVE-S-PLAY-BRIEF.md`, `tools/WAVE-T-GENERATE-MESH-PLAN.md:866-870`.
Run by the orchestrator (main agent), alone on the machine. No peer agents ran during any measurement
in this file.

## WHY S3d IS SPLIT IN TWO, AND THE SPLIT BUYS A CHECK RATHER THAN COSTING ONE

`WAVE-T-GENERATE-MESH-PLAN.md:866-870` gives S3d two jobs: flip the default to `graph`, and delete
the grid branch, the LAYOUT-derived generators and `roundedRect`.
Done in one commit those two are indistinguishable in the only instrument that can see them.
The frames legitimately change when the default flips, so a deletion bug that removes something the
graph path also needs lands inside a diff that is already 100% different and cannot be read.

Split, the second half becomes provable:

1. **flip** (this file) - `game/main.js` only, `game/world.js` untouched. The seven frames change,
   and the new frames become the baseline.
2. **cut** (next) - delete the grid branch and the dead generators. `game/world.js` only. **It must
   be pixel-identical to this commit's seven frames, at the same-tree noise floor.** That is a real
   assertion; the combined step had none.

`#map=grid` therefore SURVIVES S3d and is deleted at S5, which is where the plan already puts the
`#map` branch's removal anyway.

## THE CONSTANT TABLE. ONE ITEM.

Nothing numeric changed. The only edit is which branch of one predicate is the default.

| file:line | what | BEFORE | AFTER |
|---|---|---|---|
| `game/main.js:188` (was), `game/main.js:191` (now) | map-mode predicate | `if (/(?:^|[#&])map=graph(?:&|$)/.test(location.hash \|\| ''))` - graph is OPT-IN | `if (!/(?:^|[#&])map=grid(?:&|$)/.test(location.hash \|\| ''))` - grid is OPT-OUT |
| `game/main.js` mapDoc initial | `let mapDoc = null` | unchanged | unchanged |

`game/world.js` has **zero** diff in this commit. Verify with `git show --stat`.
`GRAPH = !!mapDoc` at `game/world.js:1197` is unchanged and still the single switch inside the
generator; it now simply receives a document by default.

Zero materials added - no `new THREE.*Material` call anywhere in the diff, because there is no
`world.js` diff.

## THE SEVEN GATE FRAMES SHOW A DIFFERENT CITY. STATING IT PLAINLY.

`shots/t-s3d/*.png`, 1920x1080, `node tools/shot.mjs --scene <id>`, all seven `ok`.

**Every one of the seven renders a different city from the S3c frames, and that is the wave landing,
not a regression.** No pixel delta against the grid frames is quoted here, because a delta between
two different cities is not a number that means anything. The instrument for this commit is the
picture, and all seven were looked at.

What the pictures show, honestly:

- `daytime-downtown` - **the S2 REGRESSION ROW IS SETTLED, AND IT IS SETTLED IN THE DIRECTION S2
  PREDICTED.** The complaint carried since S2 was that the grid frame's near third read flat and
  grey because that camera landed on a stretch with no near-field billboards. The graph city puts a
  full corner on the left wall - awning, glazed shopfront, neon fascia, a `WESTGATE` board above it -
  and a signed frontage the length of the right wall. The near field is now the strongest part of
  the frame. **No salt was re-rolled to achieve this**, which is the whole reason S2 refused to
  re-roll one: the content was replaced instead. `S_FRONT` at `game/world.js:1089` is untouched.
- `dusk-highway-chase` - a real motorway: barrier down the middle, lane markings, gantry, signed
  buildings either side receding into haze. **Open, minor: the three gantry boards are blank dark
  panels.** They are blank on the grid path too, so this is not new, but it is more visible here
  because the graph puts a gantry in shot.
- `wet-night-asphalt` - the best of the seven. Wet reflections carry legible `KINGSLEY` / `HALCYON`
  / `HARLOW MOTEL FREE PARKING` signage across a wide junction, lit windows at three depths, and a
  skyline with distinct tower silhouettes.
- `crash-cam` - the crash reads correctly against a lit shopfront wall; kerb, zebra, double yellow
  and guard railing all present and correctly placed relative to each other.
- `boost-blur` - correct, and it exposes the one honest weakness below.
- `hud-overlay` - correct, and it carries the declared minimap mismatch below.
- `car-paint-closeup` - car-only framing, unaffected by the map, rendered `ok`.

## THE TWO THINGS THIS COMMIT DECLARES RATHER THAN FIXES

1. **THE MINIMAP IS A 1.1 km GRID DRAWN OVER A 4 km CITY.** Visible bottom-right in `hud-overlay`:
   the minimap tiles a regular rectangular street grid and the district plate reads
   `Paradise City / HARBOUR TOWN`, while the world behind it is the digitised graph. The minimap
   still draws from `LAYOUT`. **This is `rewire`'s, exactly as `WAVE-T-GENERATE-MESH-PLAN.md:869`
   says it will be.** Do not fix it in the cut step; do not read it as a cut-step regression.
2. **THE FAR FIELD IS BARE.** In `boost-blur` and `dusk-highway-chase` the buildings stop and the
   ground beyond the road network reads as a flat khaki plain to a hard horizon. The graph's 78.81 km
   of centreline is a network with real gaps in it, unlike the grid's uniform tiling, so distance now
   has nothing in it. **This is the `skyline` piece and it is now visibly owed.** It was a
   speculative piece before this commit and is a measured one after it.

## THE GATE MEASUREMENTS THAT DO APPLY

**`#map=grid` STILL BOOTS AND IS UNCHANGED BY CONSTRUCTION.**
`node tools/_hangprobe.mjs --scene daytime-downtown --hash map=grid --at 20` ->
`READY in 2.3 s`, `{"err":"","ready":true,"game":true}`.
Pixel-stability of the grid path is not asserted with a render because it cannot have moved: the
diff does not touch `game/world.js`, `game/road.js` or any emitter, and the grid path's only input
is `mapDoc === null`, which `#map=grid` still produces. The opt-out regex is the thing that could
have been got wrong, and the boot above is what checks it.

**DEFAULT PATH BOOTS.**
`node tools/_hangprobe.mjs --scene daytime-downtown --at 20` (no hash) -> `READY in 4.2 s`,
`{"err":"","ready":true,"game":true}`.
Run because `lint ok` does not mean runnable - S3a's rule, followed here.
`bash tools/lint.sh` -> `lint ok`.

**THE DRIVE PROBE IS GREEN.** `node tools/_s3c-drive.mjs`, exit 0,
`S3C_PROBE_GREEN DRIVER_FINDINGS=7`, **0 WORLD failures**, `probeFailures: []`, `pageErrors: []`,
`page: graph`. The 7 DRIVER findings are all `fatal: false` and all are the already-owned
`followPath` wander debt recorded in `STATE.md` (Silver Lake 1129 off-tarmac driver samples, 28.482 m
lateral, driver trajectory touching block indices 520 and 495). **Nothing new appeared and nothing
got worse.** The probe pins `map=graph` explicitly so the flip does not change what it measures;
running it here proves the flip broke nothing it covers.

**COLD LOAD IS UNDER THE BAR ON THE GRAPH DEFAULT, MEASURED ALONE.**
`node tools/_loadtime.mjs` - and note this tool loads `#bootlog=1` with **no map parameter**
(`tools/_loadtime.mjs:39`), so from this commit it is measuring the GRAPH city, which is exactly
what makes the number worth quoting.

```
cold  median 4590 ms  (5126, 4590, 4588)
warm  median 4429 ms  (4429, 4598, 4407)
served 225 requests, 17.81 MB from disk
per-stage (cold run 1):
  boot sky 41ms   boot road 548ms   boot world 1562ms   boot car 178ms
  boot sim 84ms   boot post 31ms    boot warm 1611ms
```

**4590 ms against the 5.0 s bar.** Two honest qualifications, both of which cut against reading this
as the load-time problem being solved:

- **`STATE.md` records 12.6 s median on the GRID default and this run is 4590 ms on the GRAPH one.**
  The difference is not the map. It is that this run had the machine to itself and that one did not -
  its own recorded spread was 7.7-13.9 s, wider than the whole bar. **This number is not evidence
  that anything got faster; it is one measurement taken correctly.** `perf` still owns the bar and
  still has to run alone to settle it.
- **`boot world` at 1562 ms is the WHOLE map built eagerly**, which is the thing chunk contract rule
  1 forbids. `createBlocks` (351 ms) and `planPavement` (499 ms) run over all 4000 x 2861 m at boot,
  as `verdicts/wave-t/generate-mesh-s3a-kerbs.md` already recorded. **S4 residency is still fully
  owed and this pass does not reduce it.** The load bar holding today is not permission to skip it.

Frame time is NOT reported in this verdict. No frame-time measurement was taken, so none is claimed.

## WHAT THE NEXT STEP MUST DO

`S3d-cut`: delete the `if (!GRAPH)` grid branches in `game/world.js` (the gates at :1770, :2890,
:2896, :3055, :3663, :3673, :3683, :3692, :3713), the LAYOUT-derived generators they guard, and
`roundedRect` at `game/world.js:316` together with its call at `:4235`.

Two rules for it, both already paid for in this wave:

- **NEVER BULK-EDIT `world.js` BY PATTERN MATCH.** S3a lost a full revert of the file to a script
  that matched `GRAPH` inside `makeFrondTex` where it is not in scope, and `tools/lint.sh` said
  `lint ok` while the page hung at boot with no console error. Anchor on unique comments, print the
  line each edit guards, and boot the page.
- **THE ACCEPTANCE TEST IS PIXEL-IDENTITY AGAINST `shots/t-s3d/`**, at each scene's own same-tree
  noise floor, NOT against the grid frames. Note `wet-night-asphalt`'s same-tree floor is
  **maxd 29 at 0.0056%**, not maxd 4 - anything quoting the old figure will read its own noise as a
  regression (`verdicts/wave-t/generate-mesh-s3b-hotfix.md`).

`#map=grid` must still boot after the cut only if the cut leaves it; per the plan it does not, so the
cut is also where `#map=grid` stops working and S5 removes the flag itself.
