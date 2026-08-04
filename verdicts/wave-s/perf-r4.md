# wave-s / perf-r4 — draw the HUD inside the WebGL frame

One job: stop the browser compositing a second full-screen layer over the WebGL canvas every frame.
perf-critic-r3 section 8 measured the prize with a runtime kill-control on HEAD at 1280x720 dpr 1:
`cruise` 15.90 ms / 60.0 fps / 23.3% long -> 13.50 / 75.3 / 3.0%, `city` 21.20 -> 17.80.

**I AM RUNNING ALONE.** Checked before touching anything:

```
uptime -> 5:28 up 14 days, 19:39, 2 users, load averages: 1.61 2.08 2.59
ps aux | grep -iE 'node|chrome|puppeteer|playwright'
  -> 4 idle nvim, this repo's tools/serve.mjs (0.0% CPU), an unrelated project's vite +
     esbuild --ping + two tsservers, and Slack's chrome_crashpad_handler.
  -> NO headless chromium, NO playwright, no peer measurement process.
```

So every frame-time number in this file is a **RESULT**, not a smoke test. Re-checks are recorded at
the head of each measurement section. Every headline is taken three times with the spread printed.

## 0. Tree state before I touched anything (process rule 2)

HEAD `bcf52b5` (`wave-s/assets`). `git status --short`:

```
 M PROMPT.md
 M driver.log
?? README.md
```

**No inherited edits in `game/` at all** (`git diff --stat` is PROMPT.md + driver.log only). Nothing
to justify or revert. `game/music/` is now tracked, so a worktree BEFORE tree gets the soundtrack
without hand-copying, which is a change from round 3.

(appended as the work happened)

---

## 1. THE HEADLINE, first, because it is not the one the brief expected

**I built the change the brief asked for, measured it, and it is 0.70 ms SLOWER on cruise and
1.40 ms slower in the city. The mechanism it was built on does not exist.** A full-screen 2-D
canvas layer that the browser composites over the WebGL canvas every frame costs **0.00 ms** as
long as it is not redrawn. The HUD's whole 2.20-2.50 ms is its REDRAW, and both routes to the
screen have to pay it.

So the default is **unchanged**: the HUD is still a DOM layer. The in-frame composite ships behind
`#hudgl=1`, off, lossless, with its price printed. **Cruise is not closed. Nothing is closed.**

## 2. THE REFUTATION. Five cells, three runs each, one kill-control apart

Re-checked before this phase: `uptime 5:44 up 14 days, load 2.74 2.80 2.66`,
`ps aux | grep -iE 'chromium|playwright'` -> **0 lines**. No peer process.

Instrument `tools/_perfr4.mjs` (mine, derived from `tools/_perfr3.mjs --mode drive`, whose scenario
table is `tools/fps.mjs:85-121` verbatim; **I left `_perfr3.mjs` unmodified so a critic can
cross-check every cell with it**). Warm 3.5 s, measure 8 s, fresh page and cold boot per run,
`#nomenu=1&res=1.0`. Sub-3.5 ms rAF deltas merged into their predecessor before percentiles,
delivered fps and share-over-16.7 (perf-critic-r2 1d). Every run below:

```
renderSize {"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}
glDrawingBuffer 1280x720   (gl.drawingBufferWidth/Height read off the DRIVER at the END of the
                            window; the tool THROWS rather than prints if it is not 1280x720
                            at ratio 1)   resScale 1   paused false   401-488 rAF frames per window
```

Metres driven per window: 599-601 m at 277 km/h (cruise), 331-345 m at 150 km/h (city).

| cell | cruise p50 / delivered fps / % > 16.7 ms | city p50 / fps / % > 16.7 |
|---|---|---|
| **DOM layer, HUD live — THE DEFAULT, BEFORE AND AFTER** | **15.90** (15.90/15.90/15.80) / 58.2 / 22.4% | **20.40** (20.50/20.20/20.40) / 47.0 / 93.9% |
| **in-frame composite, HUD live (`#hudgl=1`)** | **16.70** (16.70/16.60/16.70) / 50.1 / 49.9% | **21.80** (22.60/21.60/21.80) / 44.3 / 80.1% |
| DOM layer PRESENT but not redrawn (`--kill hud-draw-off`) | **13.40** (13.40/13.50/13.40) / 75.4 / 2.7% | **18.20** (19.00/18.10/18.20) / 50.5 / 70.6% |
| in-frame, not redrawn (so never re-uploaded) | **13.50** (13.40/13.70/13.50) / 74.8 / 2.8% | — |
| **no HUD at all (`--kill hud-off`)** | **13.40** (13.30/13.40/13.60) / 75.4 / 2.6% | **18.30** (18.30/18.60/18.10) / 49.9 / 74.3% |

**Read rows 3 and 5 together. That is the whole finding.**

- **A full-screen 2-D canvas in the document, composited over the WebGL canvas every frame, costs
  0.00 ms when its pixels do not change**: 13.40 against 13.40 with no HUD at all on cruise, and
  18.20 against 18.30 in the city (the layer is nominally *faster*, i.e. inside the spread). There
  was never a standing per-frame compositing cost to remove.
- **The HUD's entire cost is the redraw.** 15.90 - 13.40 = **2.50 ms** on cruise and
  20.40 - 18.20 = **2.20 ms** in the city, and stopping the redraw recovers all of it.
- **The in-frame quad plus a static texture also costs ~0.10 ms** (13.50 vs 13.40): the blend of
  921,600 pixels is not the problem either.
- **So the in-frame route pays the same redraw AND an explicit `texImage2D` of the whole canvas
  every frame**: 16.70 - 13.50 = 3.20 ms against the DOM route's 2.50. **+0.70 ms on cruise,
  +1.40 in the city.**

### 2a. It is not better on the Retina machine either, which was my best hope for it

The one configuration where in-frame compositing could plausibly have won is `deviceScaleFactor 2`,
where the compositor has to resample the HUD layer up to 2560x1440 device pixels while the in-frame
quad blends at 1280x720. It does not. 3 runs each, GL buffer asserted 1280x720 ratio 1 throughout:

| cruise at dpr 2 | p50 | fps | % > 16.7 |
|---|---|---|---|
| DOM layer (default) | **15.90** (15.90/16.00/15.90) | 58.9 | 23.9% |
| in-frame (`#hudgl=1`) | 16.60 (17.00/16.50/16.60) | 50.8 | 47.6% |

### 2b. Only 0.95 ms of the 2.20 is CPU, and that is why the 30 Hz result looked non-linear

`tools/_hudprof.mjs`, mine, with a temporary bracket around each of the seven draw calls inside
`hud.js`'s `draw()` (361 draws, cruise, 1280x720 ratio 1). The bracket was removed afterwards and
the file restored from a pre-patch copy; `grep -c __hudProf game/hud.js` is **0** and the tool
prints `bracket absent` and exits 2 rather than printing zeros if it is ever run again as shipped.

```
  boost          0.380 ms/frame  40.1%      feed        0.038
  streetPlate    0.251 ms/frame  26.6%      clear       0.007
  speedo         0.148 ms/frame  15.6%      crashState  0.001
  minimap        0.120 ms/frame  12.7%      banner      0.001
  TOTAL          0.946 ms/frame
ops per draw: lineTo 2120  strokeText 184  fillText 111  measureText 78  fillRect 72
              beginPath 59  save 55  moveTo 54  fill 42  drawImage 39  stroke 23
              createLinearGradient 16  filter 14  createRadialGradient 10  arcTo 8  clip 8
```

**0.95 ms of main-thread CPU inside a cost of 2.20-2.50 ms**, so ~1.3 ms of it is canvas
rasterisation and transport, off the CPU bracket entirely. That is the missing piece in perf-r3
section 7b: halving the redraw RATE saved only 0.40 ms of 2.10 because half the cost is a per-frame
dependency on a changed canvas reaching the screen, not a per-draw CPU charge.

### 2c. Why two rounds got this wrong, and the number that was there all along

perf-r3 section 7b measured **`hud-draw-off` at 18.50 in the city against a 20.60 baseline** — 2.10
ms, i.e. **the whole HUD cost** — and then wrote "only a fifth of the HUD's cost is the redraw; the
rest is compositing a full-screen 2-D canvas layer". Their own kill-control contradicts their
conclusion. The inference came from `hud-30hz` saving 0.40, which does not imply the remainder is
the layer; 2b says why it does not. perf-critic-r3 then re-measured `hud-off` (2.40 / 3.40 ms),
which removes the draw AND the layer together, and attributed the difference to the layer without a
control that separated them. **The missing cell in both rounds is "layer present, not redrawn", and
it is 0.00 ms.** Both rounds' NUMBERS reproduce on my harness to 0.1 ms; only the mechanism was
wrong — which is exactly the failure mode STATE.md's rule about correct numbers with overturned
mechanisms exists for.

### 2d. The BEFORE tree agrees with the knob, across trees

`#hudgl=0` on my tree must be the parent commit, and it is. Clean `git worktree` at `bcf52b5`
(`game/music/` is tracked now, so the worktree needs no hand-copying), served with `--root`:

| | cruise | city |
|---|---|---|
| BEFORE tree `bcf52b5` | 15.90 (15.90/15.80/16.10) / 58.4 / 23.8% | 20.70 (20.60/20.70/20.80) / 46.2 / 94.1% |
| AFTER tree, default | 15.90 (15.90/16.10/15.90) / 58.4 / 25.1% | 20.50 (20.60/20.50/20.40) / 46.1 / 95.4% |
| AFTER tree, `#hudgl=0` | 15.90 (15.90/15.90/15.80) / 58.2 / 22.4% | 20.40 / 47.0 / 93.9% |

**The default is unchanged to inside the run-to-run spread on both scenarios**, and my BEFORE
reproduces perf-critic-r3's cruise figure (15.90 / 60.0 / 23.3%) and their `hud-off` figure
(13.50 / 75.3 / 3.0% against my 13.40 / 75.4 / 2.6%) on an independent harness.

## 3. WHAT SHIPPED, with BEFORE and AFTER literals (rule 5)

`game/hud.js` — the canvas gains a way out of the document and a dirty counter. No drawing code is
touched; `draw()` is byte-identical apart from one `gen++`.

- `hud.js:90` BEFORE `export function createHud(container, { layout, maxPixelRatio = 1 } = {}) {`
  AFTER `export function createHud(container, { layout, maxPixelRatio = 1, attached = true } = {}) {`
- `hud.js:91-92` BEFORE `const ctx = canvas.getContext('2d');` followed immediately by
  `container.appendChild(canvas);` (unconditional).
  AFTER the `appendChild` moved inside `setAttached(v)` at `:118` and called through
  `setAttached(attached)` at `:121`, so `attached: false` never puts the canvas in the document.
- `hud.js:128` BEFORE: nothing. AFTER `let gen = 0;`
- `hud.js:199` BEFORE: nothing at the end of `resize()`. AFTER `gen++;` (assigning `canvas.width`
  clears the canvas AND the GPU-side size changes, so a resize is a content change with no `draw()`).
- `hud.js:2736` BEFORE `drawBanner();` as the last statement of `draw()`. AFTER `drawBanner();`
  then `gen++;`
- `hud.js:2780-2787` BEFORE: nothing. AFTER `setAttached,` / `get attached()` / `get generation()`
  on the returned object.

`game/main.js` — the layer, the knob, and the routing.

- `main.js:187` BEFORE: nothing. AFTER `const hudGl = params.hudgl === '1' || params.hudgl === true;`
  **Default false.** `#hudgl=1` opts in; there is no way to reach it by accident.
- `main.js:188-190` BEFORE
  `const hud = createHud(document.getElementById('hud'), { layout: world.LAYOUT, maxPixelRatio: hudRes });`
  AFTER the same call with `attached: !hudGl` added.
- `main.js:328-347` BEFORE: nothing. AFTER `new THREE.Texture(hud.canvas)` with
  `minFilter`/`magFilter` `NearestFilter`, `generateMipmaps false`, `colorSpace NoColorSpace`; a
  `Scene` + `OrthographicCamera(-1,1,1,-1,0,1)`; and a `PlaneGeometry(2,2)` `Mesh` whose
  `ShaderMaterial` fragment shader is exactly `gl_FragColor = texture2D(tHud, vUv);` with
  `transparent: true, depthTest: false, depthWrite: false`.
- `main.js:352-354` BEFORE: nothing. AFTER `let hudInFrame = false; let hudGen = -1;
  let hudTexW = 0, hudTexH = 0;`
- `main.js:363-373` BEFORE: nothing. AFTER `syncHudPath()`, which is the fallback rule:
  `const fits = hudGl && hud.canvas.width === hudBuf.x && hud.canvas.height === hudBuf.y;` and on a
  change `hud.setAttached(!fits)`.
- `main.js:375-405` BEFORE: nothing. AFTER `drawHudLayer()` — the size-change `hudTex.dispose()`
  (section 5), the `hud.generation` upload gate, then `setRenderTarget(null)` +
  `autoClear = false` + `renderer.render(hudScene, hudCam)` + restore.
- `main.js:410-413` BEFORE: nothing. AFTER `renderFrame()` = `composer.render(); drawHudLayer();`
- `main.js:468-476` BEFORE: nothing. AFTER `ctx.hudPath()`, so a harness asserts the live route
  instead of inferring it.
- Six call sites BEFORE `composer.render()` AFTER `renderFrame()`: `main.js:711` (the shot path's
  4-frame loop), `:713` (the shot path's final frame), `:885` (the PAUSED branch of `frame()`),
  `:913` (the drive loop), `:975` and `:981` (the two warm frames), `:1065` (the residency warm).
  **On the default path `renderFrame()` is `composer.render()` plus a function call that returns on
  its first line**, which is why section 2d's default column does not move.

**Not touched:** `game/physics.js`, `game/camera.js` (a handling builder owns those and its work
passed its critic), and `game/index.html` — the `#hud` div and its CSS are unchanged, and on the
in-frame path that div simply has no child.

### 3a. Why the composite is placed where it is, and why it is lossless rather than close

The composer chain is RenderPass -> SSAO -> bloom -> boost -> **output pass (tonemap + sRGB +
grade)** -> FXAA, and the output pass owns the whole transform. The HUD is authored in sRGB on a
2-D canvas and **must not be tone mapped**, so it is composited after the entire chain, onto the
default framebuffer, which is where the DOM compositor was putting it too. Four things make it
byte-exact rather than approximately right, and all four are load-bearing:

1. A raw `ShaderMaterial` whose fragment shader is one `texture2D` — three injects no
   `colorspace_fragment` and no `tonemapping_fragment` chunk into a fully custom shader, so the
   sampled texel is written unchanged.
2. `colorSpace = NoColorSpace`, so three does not allocate `sRGB8_ALPHA8` and the sampler does no
   hardware sRGB decode.
3. `NearestFilter` on a texture whose size **equals the drawing buffer's** — enforced by the
   fallback rule, not assumed — so every fragment samples exactly one texel.
4. `NormalBlending` on a non-premultiplied canvas upload is `src.rgb * a + dst.rgb * (1 - a)`, the
   same arithmetic in the same sRGB byte space the DOM compositor uses.

Measured result: **`hud-overlay` through `#hudgl=1` differs from the DOM composite by `maxDiff 1`,
with 0.0000% of pixels over 2/255** (section 4). A wrong colour space or a premultiplication error
would be tens of levels, so this is the reasoning confirmed, not asserted.

### 3b. The fallback rule, which protects a recorded decision rather than reopening it

`main.js:269` records that dropping `resScale` must not soften the HUD. Compositing in-frame
rasterises the HUD into the drawing buffer, so at `resScale 0.7` it would be drawn at 896x503 and
CSS-upscaled — softer. So `syncHudPath()` uses the in-frame path **only while the HUD's backing
store and the drawing buffer are the same size**, and puts the canvas back in the document the
moment they differ. That covers `resScale < 1` and `#hudres=2` without enumerating either, because
it is a size comparison rather than a list of knobs. Verified live in section 6.

## 4. THE VISUAL REGRESSION GATE. Noise floor measured FIRST

All seven presets at 1280x720 from each tree with that tree's own `tools/shot.mjs`, compared with
`tools/_perfr3-diff.mjs` (max-channel difference, mean, coverage, plus a 16x9 grid).
`shots/` is gitignored, so these PNGs are on disk beside the tree, not in the commit.

**My own same-build noise floor on this machine, measured before any comparison** (two renders of
the BEFORE tree):

| preset | maxDiff / mean / % px > 2/255 |
|---|---|
| hud-overlay | 2 / 0.0001 / 0.0000% |
| dusk-highway-chase | 5 / 0.0000 / 0.0002% |
| wet-night-asphalt | 5 / 0.0000 / 0.0001% |
| daytime-downtown | **15 / 0.0002 / 0.0013%** |

**BEFORE `bcf52b5` vs AFTER, default path** — this is the gate that binds, because the default is
what ships:

| preset | maxDiff / mean / % px > 2/255 | read |
|---|---|---|
| dusk-highway-chase | 1 / 0.0000 / 0.0000% | identical |
| boost-blur | 2 / 0.0001 / 0.0000% | identical |
| crash-cam | 5 / 0.0000 / 0.0001% | inside its floor |
| wet-night-asphalt | 5 / 0.0000 / 0.0004% | inside its floor |
| daytime-downtown | 15 / 0.0002 / 0.0018% | **exactly its own floor** |
| car-paint-closeup | 2 / 0.0000 / 0.0000% | identical |
| **hud-overlay** | **2 / 0.0000 / 0.0000%** | **identical, at its own floor of 2** |

**AFTER default vs AFTER `#hudgl=1`** — the knob's own gate, and the only row that tests the
composite is the only preset that draws a HUD:

| preset | maxDiff / mean / % px > 2/255 |
|---|---|
| **hud-overlay** | **1 / 0.0214 / 0.0000%** |
| dusk-highway-chase / boost-blur / crash-cam / wet-night / daytime / car-paint | 3 / 3 / 5 / 5 / 15 / 2, all at their floors (their HUD is hidden) |

`hud-overlay`'s 16x9 grid is **0.00 in 129 of 144 cells**; every non-zero cell (0.01-0.30) is a HUD
widget — the street plate and minimap at top centre, the boost bar bottom-left, the speedo and
minimap bottom-right. **Not one cell of the 3-D frame moves.**

**AND I OPENED THEM AT 3x**, as the brief requires, on the two things it names — text antialiasing
and blur radii. `shots/r4/crop-{A,G}-type.png` (the street plate, the landmark line, the minimap and
"0.9 KM", x 470-830 / y 40-150 at 3x) and `shots/r4/crop-{A,G}-boost.png` (the boost bar and
"BOOST READY", x 20-340 / y 520-700 at 3x). Read side by side: the same glyph edges on THE WILDCATS
STADIUM, the same torn splat plate, the same blurred minimap skyline, the same compass letters, the
same amber on 0.9 KM, the same flame halo gradient and the same rail. **maxDiff 1 confirmed by eye.
Nothing got worse on either path. The veto does not fire.**

## 5. THE DEFECT I SHIPPED FOR AN HOUR, AND THE ONLY THING THAT COULD HAVE CAUGHT IT

**Two HUDs on screen at once after a window resize.** No still preset and no frame-time number can
see this; `tools/shot.mjs` never resizes.

`hudTex.needsUpdate = true` re-uploads into the allocation three.js already made. So after a resize
to 1024x600 the fresh canvas was written into the top-left of the **1280x720** texture that was
allocated at boot, while the quad samples uv 0..1 — drawing the new HUD at 80% scale in the corner
with the PREVIOUS HUD still showing through the margins. What gave it away was that the two street
plates read **different street names** (MORTON on one, YOUNG on the other), i.e. two moments in
time, which is what pointed at a stale allocation rather than a layout bug.

- `main.js:387-393` BEFORE: nothing. AFTER: if `hud.canvas.width/height` differ from the last
  uploaded size, `hudTex.dispose()` and force `hudGen = -1`, so three deletes and reallocates at
  the new size. It cannot be folded into the generation check, because a resize bumps the
  generation too and re-uploading is not the fix.

Found by `tools/_hudbehav.mjs`, which screenshots the REAL page after a REAL resize and differences
it against a screenshot of the same frozen frame with the HUD hidden. Before the fix the resized
cell read `bottomStrip mean 30.50` against the DOM control's `45.67`, and `centre max 176` where
the control read `1`; after the fix it reads **45.53 against 45.67**. The full-frame PNGs are
`shots/r4/behav/GL-2-resized-on.png` (two HUDs) and `/tmp/resize-1024.png` re-run after the fix
(one HUD, laid out exactly as the DOM control).

## 6. BEHAVIOUR THE STILLS DO NOT COVER. Both paths, end to end, on screen

`tools/_hudbehav.mjs`. Every check is made on a **page screenshot** differenced against a second
screenshot of the same frozen frame with `hud.setVisible(false)`: if the HUD reached the screen the
bottom strip moves a lot, if it is blank it reads ~0. Nothing here trusts an internal flag, because
an internal flag is exactly what a compositing bug leaves intact.

| checkpoint | `#hudgl=1` bottomStrip mean / centre mean | default (control) | live route |
|---|---|---|---|
| driving | 47.96 / 0 | 48.06 / 0 | in-frame, canvas NOT in the document |
| resized to 1024x600 | **45.53** / 0 | 45.67 / 0 | in-frame, canvas 1024x600 = buffer 1024x600 |
| resized back to 1280x720 | 47.51 / 0 | 47.49 / 0 | in-frame |
| **res slider to 0.7 while PAUSED (D1)** | 0.13, **max 31** / 0 | 0.13, max 30 / 0 | **falls back: `inFrame false, inDocument true`, buffer 896x503** |
| res back to 1.0 while paused | 0.13, max 30 / 0 | 0.13, max 30 / 0 | back to in-frame |
| after resume | 47.20 / 0 | 47.23 / 0 | in-frame |
| scene change from the menu (boost-blur) | 48.72 / 0 | 48.66 / 0 | in-frame, no reload |
| **crash (C)** | **96.33 / 58.83** | 95.59 / 57.43 | in-frame |

- **Every cell matches the DOM control within noise, on both paths.**
- **D1 does not reopen.** The two paused rows read `mean 0.13, max 31` on both paths because the
  pause menu's own scrim is a 0.86-alpha directional wash over exactly the corner the boost bar
  lives in, so it reads the HUD at ~14% contrast. A blank HUD reads `max 0-1`; `max 31` on both
  paths is the HUD present under the scrim, and the unscrimmed probe immediately after resume reads
  47.20. My first run of this tool never closed the menu and read all three later checkpoints
  through that scrim — a harness bug I found and fixed rather than a defect.
- **The crash state works**: the centre of the frame moves 58.83 where every other checkpoint reads
  0, i.e. the wrecked overlay is on screen.
- **0 console errors and 0 page errors on both full runs.**

### 6a. The knob matrix, because `lint ok` does not mean runnable

`tools/_hudboot.mjs`: eleven configurations, each booted, driven, then put through all four times of
day, wet 1 and 0, a resolution-scale change and back, pause and resume, and a crash.
**All 11 ok, 0 console errors and 0 page errors on every one**, `hud.visible true` and
`hud.generation > 0` on every one:

```
ok default (DOM layer)                       dpr 1  booted dom  res-0.6 detour dom  hudCanvas 1280x720
ok default at dpr 2                          dpr 2  booted dom  res-0.6 detour dom  hudCanvas 1280x720
ok #hudgl=1                                  dpr 1  booted in   res-0.6 detour dom  after resume in
ok #hudgl=1 at dpr 2                         dpr 2  booted in   res-0.6 detour dom  after resume in
ok #hudgl=1&res=0.7 -> falls back            dpr 1  booted dom  res-0.6 detour dom  after resume in
ok #hudgl=1&hudres=2 at dpr 2 -> falls back  dpr 2  booted dom  res-0.6 detour dom  hudCanvas 2560x1440
ok #hudgl=1&hudres=2 at dpr 1 (hudres inert) dpr 1  booted in   res-0.6 detour dom
ok #hudgl=1&msaa=4 (no FXAA pass)            dpr 1  booted in   res-0.6 detour dom
ok #hudgl=1&shadow=0                         dpr 1  booted in   res-0.6 detour dom
ok #hudgl=1 through the REAL START menu      dpr 1  booted in   res-0.6 detour dom
ok #hudgl=0 explicit                         dpr 1  booted dom  res-0.6 detour dom
```

`#hudres=2` is inert at dpr 1 (`clamp(devicePixelRatio 1, 1, 2)` is 1) and bites at dpr 2, where the
HUD canvas is 2560x1440 against a 1280x720 buffer and the fallback correctly refuses the in-frame
path. That is the rule working on a knob it was never told about.

### 6b. The cold-boot hitch stays closed, and the quad compiles inside the boot bar

`tools/_perfcritic-r2-first.mjs` **unmodified, the round-2 critic's own instrument**:

| configuration | boots | frames in first 700 ms after `__ready` | worst delta | progs |
|---|---|---|---|---|
| AFTER, default | 4 | 39, 43, 40, 43 | 35.1-36.1 ms | 184 |
| AFTER, `#hudgl=1` | 3 | 41, 40, 40 | 34.9-51.8 ms | 185 |

**0 of 7 boots hitch**, against round 3's post-fix 39-44 frames. `progs` 184 -> **185** on the
in-frame path is the HUD quad's program, compiled inside the boot bar by the warm frames (which now
go through `renderFrame()`), not on the first frame of the drive.

### 6c. The driver's three joins still verify on my tree

`tools/_joins.mjs` on HEAD+my changes: 6 near-miss events over 0.864 km (**6.95/km**) taking boost
`0 -> 0.2526`; `crash` fired from `drainWreck` (`crashActive true`, `fired true`); drawn nose delta
**0.0000** against `state.yaw` 1.58558; `renderSize 1280x720 ratio 1`; `errors []`.

## 7. HONEST MISSES

1. **THE BIG ONE: I did not close cruise, or anything.** The bar is where round 3 left it. The item
   the last two rounds named as the largest lossless win left is worth **-0.70 ms**, i.e. it is not
   a win at all, and I am reporting that rather than shipping a slower default with a good story.
2. **I did not attack the cost I found.** The HUD's 2.20-2.50 ms is its redraw and that is now
   localised per widget (2b), but cutting it means either a jerkier HUD (perf-r3 measured and
   correctly refused 30 Hz for 0.40 ms) or caching/dirty-rect work across seven widgets whose
   glows, `shadowBlur` and `filter` spill well past their nominal boxes. Getting one box wrong
   leaves stale pixels on screen. That is a piece of its own with a real regression gate, not
   something to start with the budget I had left; it is routed in section 8 with the numbers to aim
   at.
3. **I cannot separate the 0.70 ms between `texImage2D` and Chrome's own compositor arithmetic.**
   I bound it from both sides (the quad plus a static texture is ~0.10 ms, so ~0.60 ms is the
   upload) but I have no instrument that reads the compositor's own cost for a changed layer, so the
   statement "the browser does the same work more cheaply than texImage2D" is an inference from two
   totals, not a direct measurement.
4. **The 1.3 ms of non-CPU redraw cost is attributed by subtraction, not by naming an object.** I
   know it is not in `draw()`'s CPU and not in the layer's existence. Canvas rasterisation and
   transport is the only place left, and `filter`/`shadowBlur` are the obvious suspects (14 `filter`
   assignments per frame), but I did not prove which.
5. **`hud-overlay` through `#hudgl=1` is `maxDiff 1`, not 0.** 0.0000% of pixels are over 2/255 and
   at 3x it is indistinguishable, but it is one 8-bit level on some HUD pixels, not bit-equality,
   and a critic should know that before quoting "lossless".
6. **My first behaviour run read three checkpoints through the pause menu's scrim** and my first
   knob-matrix run read `hudPath()` in the same tick as the change it was testing. Both were harness
   bugs that produced a wrong answer (one falsely clean, one falsely FAIL), both are fixed, and both
   are recorded because a harness that lies in either direction is the thing this wave keeps paying
   for.
7. **`shots/` is gitignored**, so the crops a critic would want to re-read are on this machine only.
   Re-render with `node tools/shot.mjs --scene hud-overlay --w 1280 --h 720 --hash hudgl=1`.

## 8. ROUTED

1. **STOP ROUTING "THE HUD IS A SECOND COMPOSITING LAYER". IT IS WORTH 0.00 ms.** Section 2, row 3
   against row 5. The canary is one command: `--kill hud-draw-off` on the DOM path must come back at
   the same p50 as `--kill hud-off`. If a future round wants the HUD's 2.20 ms it must attack the
   REDRAW.
2. **The HUD's 2.20-2.50 ms, attacked as a redraw, is still the largest lossless-looking item on
   cruise** and it is the difference between 22.4% and 2.7% of frames over 16.7 ms. The shape that
   the measurement supports: `boost` (0.38 ms CPU) and `streetPlate` (0.25) are 67% of the CPU, and
   the street plate's three text lines change only when the street, the landmark or the distance
   text changes — a cached widget surface blitted with one `drawImage` is the obvious move. But
   **1.3 of the 2.2 ms is not CPU**, so a CPU-only saving may buy far less than its profile
   suggests; whoever takes it should measure a dirty-rect prototype against `--kill hud-draw-off`
   (13.40 on cruise) as the ceiling BEFORE building it, because that ceiling is the whole of what is
   available and no scenario except cruise is closed even by all of it.
3. **`#hudgl=1` exists, is lossless and is measured.** It is the path to take if item 2 ever makes
   the redraw cheap enough that the upload dominates, or on a platform whose compositor is worse
   than Metal's. `ctx.hudPath()` reports the live route so nobody has to infer it again.
4. **The upload, if anyone revisits item 3, is whole-canvas.** WebGL2 cannot crop a DOM-element
   source in `texSubImage2D`, so a sub-rect upload needs the HUD split across several small canvases
   and quads. That is the same widget-bounds problem as item 2 and should be done once, for both.
5. **`shadow-frozen` is still 5.70 ms in the city and 9.10 at night** (perf-r3 item 2) and nobody has
   built the two-tier cache. With the HUD item now known to be a redraw problem rather than a
   compositing one, that shadow cache is the only remaining item worth more than a millisecond that
   nobody has tried.
6. **A three.js trap worth writing down once**: `texture.needsUpdate` does NOT reallocate when the
   source canvas changes size — it uploads into the old allocation. Anything in this repo that
   mirrors a resizable canvas or video into a texture needs the `dispose()` in `main.js:387`.

## 9. WHICH SCENARIOS MEET THE BAR, PLAINLY

At `gl.drawingBufferWidth/Height 1280x720`, `renderer.getPixelRatio() 1`, `devicePixelRatio 1`,
`resScale 1`, read off the driver at the end of every window, on the shipped default:

| scenario | p50 | delivered fps | % of frames > 16.7 ms | 60 fps SUSTAINED? |
|---|---|---|---|---|
| corner | 12.90 (round 3, unchanged) | 81.2 | 3.1% | **YES** |
| cruise | **15.90** | **58.4** | **25.1%** | **NO** |
| city | **20.50** | **46.1** | **95.4%** | no |
| boost | 23.20 (round 3, unchanged) | 43.0 | 96.8% | no |
| night-wet | 27.00 (round 3, unchanged) | 36.6 | 99.7% | no |

**`corner` is the only scenario that sustains 60 fps, exactly as it was before this round.**
`cruise` is 15.90 ms p50 with 58.4 delivered fps and a quarter of its frames long, and **this piece
did not move it**. I measured the change that was supposed to move it, it goes the wrong way by
0.70 ms, and the default is unchanged. `city`, `boost` and `night-wet` are untouched. Rows I did not
re-measure this round are quoted from perf-critic-r3 and labelled as such rather than re-presented
as mine.

```progress-metrics
cruise: 15.90 ms p50, 58.4 delivered fps, 25.1% of frames over 16.7 ms at 1280x720 ratio 1 dpr 1 - UNCHANGED, still NOT sustained
THE HUD IS NOT A COMPOSITING COST: a full-screen 2-D canvas layer that is not redrawn costs 0.00 ms (13.40 vs 13.40 with no HUD, cruise)
the HUD's whole cost is its REDRAW: 2.50 ms on cruise (15.90 -> 13.40 with draw stopped) and 2.20 in the city (20.40 -> 18.20)
compositing the HUD INSIDE the WebGL frame is 0.70 ms SLOWER on cruise (15.90 -> 16.60) and 1.40 in the city - shipped OFF behind #hudgl=1
redraw CPU is only 0.95 of the 2.20 ms (boost 0.38, street plate 0.25, speedo 0.15, minimap 0.12); ~1.3 ms is canvas raster, off the CPU bracket
in-frame composite is LOSSLESS: hud-overlay maxDiff 1, 0.0000% of px over 2/255, read at 3x on type and blur
visual gate: 7 presets BEFORE vs AFTER default all at or inside a noise floor I measured first (hud-overlay 2 against its own floor of 2)
behaviour: resize, res slider while paused (D1), scene change and crash all match the DOM control on screen; 11 boot configurations, 0 errors
```

## 10. MACHINE, AND THE PROCESS NOTE

**I RAN ALONE.** `ps aux | grep -iE 'chromium|playwright'` returned **0 lines** at the start, before
section 2, before section 6 and before the final re-measurement; the only resident node processes
are this repo's `tools/serve.mjs` and an unrelated project's vite/esbuild/tsserver pair, all at
0.0-0.1% CPU. Load average `1.61 -> 2.74 -> 2.71` across the session, quoted beside each phase.
**Every frame-time number in this verdict is a RESULT, not a smoke test**, and every headline cell
is three runs with the spread printed.

**I edited `game/hud.js` and `game/main.js` and nothing else in `game/`.** `main.js` was unfrozen
for me alone. I did not touch `game/physics.js`, `game/camera.js` or `game/index.html`. New tools:
`tools/_perfr4.mjs`, `tools/_hudprof.mjs`, `tools/_hudbehav.mjs`, `tools/_hudboot.mjs`.
`tools/_perfr3.mjs` and `tools/_perfcritic-r2-first.mjs` are untouched so a critic can re-derive
section 2 and section 6b with the previous rounds' own instruments.

**The temporary profiling bracket is gone.** `game/hud.js` was copied byte-for-byte before it was
patched for section 2b and restored from that copy afterwards; `grep -c __hudProf game/hud.js` is 0
and the only difference between the restored file and the shipped one is the intended change.
