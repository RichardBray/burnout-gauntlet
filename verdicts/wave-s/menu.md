# wave-s/menu — the start menu and the Esc pause menu

Owner: menu builder. Owned files: `game/menu.js` only (CSS goes in an injected `<style>` inside
that module, because `game/index.html` is shared with peers).

Running CONCURRENTLY with three peers. Every frame-time figure in this verdict is a SMOKE TEST and
is labelled as such. Nothing here is tuned against one.

## The defect, as the user hit it

There was no way to pick a scene and the controls were undiscoverable: the user had to ask what
boost was bound to. `game/menu.js` was a documented stub whose `showStart()` set a boolean and drew
nothing, so `main.js:598-601` paused the game and opened a menu that did not exist. Booting without
`#nomenu=1` therefore gave a frozen first frame with no way forward at all.

## Plan, before any edit

1. Read the actual bindings out of `main.js` (keydown handler `down()` and the input mapping in
   `frame()`), transcribe them, then press each one in the browser to confirm.
2. Build one card renderer used by both menus so the START and PAUSE forms cannot drift apart.
   Difference between them is exactly one button (DRIVE vs RESUME) and the title line.
3. Own Esc inside this module, on `window` keydown, capture phase. Do not read the game's `keys`
   object: it is pointer-driven and has to work while W is held. `main.js` clears `keys` on
   `setPaused(true)` so a held W does not leak throttle into the paused frame.
4. Art direction: match the HUD's paper/marker family (`game/hud.js` INK/PAPER/AMBER + `torn()`
   jagged outlines, skewed cards, soft drop shadows) rather than inventing a third style. In DOM
   that means `clip-path` polygons with jitter for the torn edge, a small `skewX`, and ink shadows.
5. WebAudio: DRIVE must produce a real click event so `onStart()`'s `audio.start()` runs inside a
   user gesture. Verify `AudioContext.state` goes `suspended` -> `running`.

Explicitly NOT building falling rain (brief).

## Bindings transcribed from main.js (to be verified by pressing each)

| key | where | effect |
|---|---|---|
| `KeyW` / `ArrowUp` | main.js:541 | throttle +1 |
| `KeyS` / `ArrowDown` | main.js:541-543, 560 | throttle -1 (reverse), brake 0.6, brake lights |
| `KeyA` / `ArrowLeft` | main.js:550 | steer +1 (left) |
| `KeyD` / `ArrowRight` | main.js:550 | steer -1 (right) |
| `ShiftLeft` / `ShiftRight` | main.js:551 | boost |
| `Space` | main.js:552 | handbrake |
| `KeyR` | main.js:458 | reset car + traffic, chase cam |
| `KeyC` | main.js:464 | trigger crash |
| `Escape` | menu.js (this module) | pause / resume |

## Log

### Round 1 — build

Replaced the stub body. `game/menu.js` 32 lines -> full module. Structure:

- `injectStyle()` writes one `<style id="menu-style">` into `document.head`. No `index.html` edit.
- `torn(w, h, seed)` returns a `clip-path: polygon(...)` string, the DOM analogue of hud.js's
  `torn()`: perimeter samples with a deterministic hash jitter so the card edge is ink-on-paper
  rather than a CSS border. Same trick, same seedable hash, so the two surfaces read as one family.
- One `buildBody()` builds the four option rows plus the controls table; `showStart()` and
  `showPause()` only swap the title and the primary button. There is no second copy of the options.
- Live readout row updates from a `setInterval` at 4 Hz while open (NOT rAF: the menu must not add
  a per-frame callback to a build whose whole wave is about frame time).

### Round 2 — verification by playing

See "Measured / observed" below.

## Measured / observed

All from a real boot in headless chromium, ANGLE/Metal, viewport 1280x720,
`deviceScaleFactor: 1`, driven by playwright (`/tmp/menu-play.mjs`), no `#nomenu`, i.e. the
player's path. Screenshots in `shots/s/menu-*.png`.

### WebAudio, the requirement

| moment | `__audio.running` | `AudioContext.state` |
|---|---|---|
| after boot, before any click | `false` | no context exists yet (`null`) |
| after `click #bgmenu .go` (DRIVE) | `true` | **`running`** |

So the DRIVE button does produce a real, trusted click event, `onStart()` runs inside that
gesture, and `audio.start()`'s `ctx.resume()` takes. Note the honest caveat: `main.js:483`
also has a blanket `pointerdown -> audio.start()`, so the click would have unlocked audio even
without `onStart`. The load-bearing part is that a click now EXISTS on the boot path at all;
before this menu the first gesture was whatever key the player guessed.

### The play-through

- menu open at boot `true`, `isPaused()` `true` — start menu over a live paused first frame.
- DRIVE -> menu open `false`, `isPaused()` `false`.
- 2.5 s of W: `pos.x -400.00 -> -373.19`, speed 23.65 m/s (85 km/h). It drives.
- Esc **while W is held down**: menu open `true`, paused `true`. The menu's own Esc listener
  works with the game's keys held, as required.
- TIME OF DAY -> NIGHT with the menu open: `getTimeOfDay()` `dusk -> night`, and the frame
  behind the card changes (`shots/s/menu-pause-night.png`: stars, headlight cone, lit windows).
- ROAD SURFACE -> WET: `getWet()` `1`, frame behind changes
  (`shots/s/menu-pause-night-wet.png`: wet specular streaks and reflected lamp columns).
- RESOLUTION 1.0 -> 0.5: `renderSize()` `{w:1280,h:720,pixelRatio:1}` ->
  `{w:640,h:360,pixelRatio:0.5}`, and the row reads `640x360 (0.50)   window 1280x720`.
- Esc again: menu open `false`, paused `false`, speed 18.22 -> 29.42 m/s over 2 s of W. Still
  driveable, and night + wet persisted through the resume.
- Console/page errors across the whole run: **none**.

### Every binding, pressed for real (not read off the source)

| key | observed |
|---|---|
| W | speed 24.24 -> 29.45 m/s |
| ArrowUp | speed 21.51 -> 24.98 |
| SHIFT | see below |
| A | steer 0 -> +0.968 |
| D | steer +0.538 -> -0.970 |
| ArrowLeft | steer ~0 -> +0.982 |
| ArrowRight | steer +0.548 -> -0.978 |
| SPACE | steer collapses -0.539 -> -0.0006 and speed drops 14.81 -> 11.55: handbrake |
| S | speed 11.46 -> **-7.49**, i.e. brake then reverse |
| ArrowDown | speed -8.93 -> -11.97 (reverse, capped) |
| C | `crash.active` `false -> true` (`shots/s/menu-bind-crash.png`) |
| R | `crash.active` `true -> false`, speed 0 |
| ESC | handled in this file, verified above |

SHIFT needed its own run (`/tmp/menu-boost.mjs`), because `physics.js:111` gates boosting on
`input.throttle > 0`:

```
W only              {"s":41.62,"boost":1,    "boosting":false}
W + SHIFT           {"s":48.59,"boost":0.668,"boosting":true}
W, shift released   {"s":45.77,"boost":0.716,"boosting":false}
```

My first probe pressed SHIFT while coasting, saw `boosting:false`, and would have gone in the
report as "boost does not work". It was the probe that was wrong. The consequence for the UI is
that the label is not just `boost`: `game/menu.js` CONTROLS now reads
`'boost - hold with throttle'`, because a bare "boost" label sends the player to press SHIFT
while coasting and conclude it is broken.

### Frame time — SMOKE TESTS ONLY, three peer agents were running

Not a result, not tuned against, quoted only to show the readout is live and plausible.
Driving, `renderW 1280 / renderH 720 / pixelRatio 1 / devicePixelRatio 1 / resScale 1`:
`p50 47.4 ms (21.1 fps), p90 182.2, p99 222.7, over16_7 66.2%, n=77`. Paused with the menu
open at `resScale 0.5` (`renderW 640 / renderH 360 / pixelRatio 0.5`): `p50 23.6 ms, n=56`.
Both are in the same range as the wave baseline, and both are worthless as measurements.

## Regression gate

**This change cannot move a rendered frame.** It adds one DOM overlay and one injected
`<style>`; it touches no material, uniform, light or post value. And `main.js` returns from
`boot()` at line 444 in `#shot=1` mode, which is BEFORE `createMenu()` is called at line 582,
so the deterministic screenshot path never constructs the menu or injects its CSS. No preset
shot can differ, so per the brief's gate I state that rather than re-rendering the seven scenes.

## Two things I got wrong and fixed

1. **The card did not fit.** First build was 740 px tall in a 720 px window: `max-height: 94vh`
   plus `overflow-y: auto` meant the ESC row was scrolled below the fold, on a menu whose whole
   purpose is discoverability. Compacted (title 34 -> 27 px, DRIVE padding 15 -> 11 px, key rows
   28 -> 22 px, gap 5 -> 2 px, one-line hint) to ~625 px. It now fits with no scrollbar.
2. **The fps readout libelled the setting.** On open it read `0.5 fps p50 1995.7 ms n=2`,
   because the first rAF deltas after `frameStats.reset()` span the open itself. Gated the
   readout on `n >= 8`; it shows `fps - collecting` until then.

## Routed finding: a resize while PAUSED blanks the HUD canvas (NOT my file)

Dragging the resolution slider on the pause menu makes the HUD disappear until the game
resumes. It is not the menu's bug: reproduced with no menu involved at all
(`/tmp/menu-hudblank.mjs`, `#nomenu=1`, counting non-transparent pixels on `#hud canvas`):

```
driving        208691
paused         208739
paused + setResScale(0.5)      0
resumed        211155
```

Mechanism: `main.js` `resize()` calls `hud.resize(w, h)`, which reassigns `canvas.width` and so
clears the 2-D canvas, and the HUD is only ever redrawn from `hud.update()` inside `tick()` —
which the paused branch at `main.js:536` skips. Any window resize while paused does the same,
so this predates the menu.

Fix belongs in `main.js` (or `hud.js`), not here: `resize()` should repaint the HUD when
`paused` is true, e.g. `hud.snap({...})` with the same payload `tick()` builds, since `main.js`
already has `gearOf` and `physics.state` to hand. I deliberately did NOT work around it from
`menu.js`: the only way to do that from my file is to rebuild `tick()`'s HUD payload here,
including a copy of `gearOf`, and a duplicated gear formula that can drift from `main.js` is a
worse defect than a paused HUD that heals on resume.

## Not built, on purpose

Falling rain (brief: wet/dry covers the look, Paradise has no rain, nothing to judge it
against). No scene/preset picker beyond the four plumbed options, because `ctx` exposes no
scene switch and inventing one would have meant editing `scenes.js`, which I do not own.

